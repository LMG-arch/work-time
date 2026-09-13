// notifications.js — 通知调度核心（S4.2 迁移，v3.17.43）
//
// 自 src/reminders/reminders.js 整体迁入（调度算法零改动）：
//   打卡预调度 / 待办预调度 / 测试通知 / 诊断 / 精确闹钟配额守门（safeSchedule）。
// reminders.js 自此只保留提醒数据函数（loadReminders / loadReminderRecords / isReminderConfirmed …）。
//
// 迁移同时修复 v3.17.42 经典层下线后的三类遗留（线上崩溃根因）：
//   1. 裸名依赖 shims 垫片：旧代码以裸名调用 isCapacitorPlatform()/dateToStr()/getTodayStr()/showToast()，
//      靠 shims 的 window.* 绑定解析；v3.17.42 精简垫片后 → ReferenceError
//      （线上表现：「未处理的 Promise 拒绝: isCapacitorPlatform is not defined」）。
//      现改为显式 import，彻底摆脱垫片依赖。
//   2. 死引用：renderCalendar()（v3.17.42 已删除）→ Vue 刷新钩子 __refreshCalendarGrid；
//      switchView('clockin') → window.__vueActivate('clockin')（App.vue 导航桥）。
//   3. 隐性全局：reminderNotifTimer 从未声明（ESM 严格模式下赋值即 ReferenceError，
//      Web 轮询实际从未生效）→ 改为模块级变量。
//
// 消费方零改动：renderer.js / ReminderSettings.vue / SettingsPage.vue 仍走 window.*
// （shims.js 重绑到本模块）；Android WorkManager 走 window.__WorkCalendarNotifications。

import { isCapacitorPlatform, dateToStr, getTodayStr, showToast } from '../utils.js';
import { isReminderConfirmed } from '../reminders/reminders.js';

// 生成不重复的通知 ID（Java int 范围：-2147483648 ~ 2147483647）
let _notifIdCounter = 0;
export function generateNotifId() {
  _notifIdCounter = (_notifIdCounter + 1) % 1000000;
  const rand = crypto.getRandomValues(new Uint32Array(1))[0] % 1000;
  const raw = Math.floor(Date.now() / 1000) % 1000000 * 1000 + _notifIdCounter + rand;
  const id = raw % 2147483647;
  return id > 0 ? id : id + 2147483647;
}

// 防止重复注册监听器
let _notifListenersRegistered = false;

// Web 轮询兜底定时器（模块级——旧实现为未声明裸名，ESM 严格模式下赋值即抛错）
let reminderNotifTimer = null;

// ⚠️ 关键约束：Android 13+ 对每个应用的「精确闹钟(exact alarm)」有 500 个并发硬上限，
// 超过后 AlarmManager.setExactAndAllowWhileIdle 会抛 IllegalStateException，
// 经 Capacitor Bridge 放大为致命崩溃（表现为"用两天就闪退"）。
// 以下两个常量把总量牢牢压在上限之下，并缩短排期窗口以留足安全余量。
const SCHEDULE_HORIZON_DAYS = 14;   // 排期窗口：14 天（App 每次前台恢复都会滚动重排，足够覆盖）
const MAX_TOTAL_ALARMS = 400;       // 精确闹钟总配额上限（打卡+待办共享），远低于系统 500 的硬限

// 按通知类型(kind)精准取消已调度的通知。
// ⚠️ 关键修复：getPending() 返回的 pending 对象【不含 channelId】字段
//（原生 LocalNotification.buildLocalNotificationPendingList 只回传 id/title/body/schedule/extra），
// 旧实现用 channelIds.includes(n.channelId) 过滤 → 永远匹配不到 → 取消彻底失效，
// 旧通知（含过期残留）长期堆积，Doze 延迟后或 App 激活时一次性集中弹出。
// 现改为 extra.kind（新调度）+ title 关键词（兼容旧版本已调度通知）双条件匹配。
async function cancelPendingByKind(kind, titleKeyword) {
  if (!isCapacitorPlatform()) return;
  try {
    const { LocalNotifications } = window.Capacitor.Plugins;
    if (!LocalNotifications) return;
    const pending = await LocalNotifications.getPending();
    const targets = (pending.notifications || []).filter(n => {
      const byKind = !!(n.extra && n.extra.kind === kind);
      const byTitle = !!(titleKeyword && n.title && String(n.title).indexOf(titleKeyword) !== -1);
      return byKind || byTitle;
    });
    if (targets.length > 0) {
      await LocalNotifications.cancel({ notifications: targets.map(t => ({ id: t.id })) });
      console.log(`[Notifications] cancelled ${targets.length} pending notifications (${kind})`);
    }
  } catch (e) { console.warn('[Notifications] cancel by kind error:', e.message); }
}

// 全局调度串行锁：打卡与待办两个调度器会先后触发，若并发各自读取 getPending 快照，
// 会同时以为配额充足而超发 → 仍会突破上限。用一个 Promise 链把所有 safeSchedule 串起来，
// 保证「读配额→调度」整体原子执行，两者真正共享 MAX_TOTAL_ALARMS 配额。
let _safeScheduleLock = Promise.resolve();

// 安全调度：绝不突破系统 500 精确闹钟上限的守门员。
// 1) 按触发时间升序 —— 配额不够时优先保留"最近要响"的通知，丢弃最远的；
// 2) 查询当前已挂起数量，动态算出可用配额（打卡+待办共享 MAX_TOTAL_ALARMS）；
// 3) 分批(每批50)调度，降低单次 IPC 压力，任一批失败也不影响已成功的批次。
function safeSchedule(LocalNotifications, notifications, label) {
  const run = async () => {
    if (!notifications || notifications.length === 0) return;
    // 按触发时间升序：优先保留最近的
    notifications.sort((a, b) => new Date(a.schedule.at) - new Date(b.schedule.at));

    let available = MAX_TOTAL_ALARMS;
    try {
      const pending = await LocalNotifications.getPending();
      const used = (pending && pending.notifications ? pending.notifications.length : 0);
      available = Math.max(0, MAX_TOTAL_ALARMS - used);
    } catch (e) {
      console.warn('[Notifications] getPending failed, using default budget:', e.message);
    }

    const toSchedule = notifications.slice(0, available);
    const dropped = notifications.length - toSchedule.length;

    for (let i = 0; i < toSchedule.length; i += 50) {
      const batch = toSchedule.slice(i, i + 50);
      try {
        await LocalNotifications.schedule({ notifications: batch });
      } catch (e) {
        // 双保险：即便触碰系统上限，也吞掉异常、停止后续批次，绝不让它冒泡成崩溃
        console.warn(`[Notifications] ${label} batch schedule failed (likely alarm limit), stopping:`, e.message);
        break;
      }
    }
    console.log(`[Notifications] ${label}: scheduled ${toSchedule.length}, dropped ${dropped} (budget ${available}/${MAX_TOTAL_ALARMS})`);
  };
  // 串行执行；无论前一次成功或失败都继续，避免锁被 rejected 卡死
  _safeScheduleLock = _safeScheduleLock.then(run, run);
  return _safeScheduleLock;
}

// 决定本次调度是否使用「精确闹钟」(exact:true)。
// 关键点：精确闹钟权限(Android 12+)未授予时若仍用 exact，setExactAndAllowWhileIdle 会抛异常；
// 故仅在权限为 granted（或旧系统 unknown/无需权限）时返回 true，否则退回 inexact（不崩溃）。
// inexact 闹钟会被系统 Doze 延迟并批量合并 → 表现为「攒一堆、用户打开 App 才一起弹」。
// 用 exact:true 才能让提醒在设定时刻精确、实时地响（含 Doze 期间）。
// 会话内缓存结果，且精确权限未授予时只弹一次引导，避免每次调度重复弹窗。
let _exactModeResolved = false;
let _exactModeValue = true;
// 原生插件返回的权限字符串只有 'granted' 或 'denied'（见 LocalNotificationsPlugin.getExactAlarmPermissionText），
// 不存在 'notGranted'。旧实现误判为 'notGranted' → 恒为 false → 权限未授予时既不降级也不引导，
// 原生兜底走 inexact 闹钟被 Doze 延迟合并，导致「到点不响、打开 App 才一起弹」。
const EXACT_DENIED = 'denied';
const EXACT_NOT_GRANTED = 'notGranted';

async function resolveExactMode(LocalNotifications) {
  if (_exactModeResolved) return _exactModeValue;
  let useExact = true;
  try {
    if (LocalNotifications.checkExactNotificationSetting) {
      const exactPerm = await LocalNotifications.checkExactNotificationSetting();
      const state = exactPerm && exactPerm.exact_alarm;
      const denied = state === EXACT_DENIED || state === EXACT_NOT_GRANTED;
      if (denied) {
        if (!window._exactAlarmPrompted) {
          window._exactAlarmPrompted = true;
          const userConfirmed = confirm(
            '⚠️ 精确闹钟权限未开启\n\n' +
            '没有此权限，打卡/待办提醒会被系统延迟甚至攒批，"到时间不响、打开 App 才一起弹"！\n\n' +
            '点击"确定"前往系统设置开启"精确闹钟(Alarms & reminders)"权限后，重启应用即可准时响铃。'
          );
          if (userConfirmed && LocalNotifications.changeExactNotificationSetting) {
            await LocalNotifications.changeExactNotificationSetting();
          }
        }
        // 打开设置后权限不会立即生效，需用户手动开启并重启；本会话仍按未授予处理（退回 inexact）
        const recheck = await LocalNotifications.checkExactNotificationSetting().catch(() => null);
        const recheckState = recheck && recheck.exact_alarm;
        useExact = !(recheckState === EXACT_DENIED || recheckState === EXACT_NOT_GRANTED);
      }
    }
  } catch (e) {
    console.warn('[Notifications] Exact mode resolve error:', e.message);
    useExact = true;
  }
  _exactModeResolved = true;
  _exactModeValue = useExact;
  console.log('[Notifications] exact alarm mode =', useExact);
  return useExact;
}

export async function sendTestNotification() {
  const isCapacitor = isCapacitorPlatform();

  if (isCapacitor) {
    try {
      const { LocalNotifications } = window.Capacitor.Plugins;
      if (!LocalNotifications) {
        showToast('❌ 通知插件未加载，请运行 npx cap sync android');
        return;
      }

      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') {
        showToast('❌ 通知权限被拒绝，请在系统设置中开启');
        return;
      }

      // 检查精确闹钟权限
      if (LocalNotifications.checkExactNotificationSetting) {
        try {
          const exactPerm = await LocalNotifications.checkExactNotificationSetting();
          if (exactPerm && exactPerm.exact_alarm !== 'granted') {
            const userConfirmed = confirm('⚠️ 精确闹钟权限未开启\n\n没有此权限，通知会延迟15分钟！\n\n点击"确定"前往设置页面开启');
            if (userConfirmed && LocalNotifications.changeExactNotificationSetting) {
              await LocalNotifications.changeExactNotificationSetting();
              showToast('请在设置中开启精确闹钟权限后，再次测试');
              return;
            }
          }
        } catch (e) {
          console.warn('[Test] Exact alarm check error:', e.message);
        }
      }

      // 创建通知渠道
      try {
        await LocalNotifications.createChannel({
          id: 'clockin-reminders',
          name: '打卡提醒',
          description: '上班日历的打卡提醒',
          importance: 5,
          visibility: 1,
          sound: 'default',
          vibration: true
        });
      } catch (e) {
        console.warn('[Test] Channel creation warning:', e.message);
      }

      // 发送测试通知
      await LocalNotifications.schedule({
        notifications: [{
          id: generateNotifId(),
          title: '上班日历 · 测试通知',
          body: '🔔 如果你看到这条通知，说明通知功能正常！',
          schedule: { at: new Date(Date.now() + 1000) },
          smallIcon: 'ic_launcher',
          channelId: 'clockin-reminders',
          sound: 'default',
          vibrate: true
        }]
      });
      showToast('✅ 测试通知已发送，1秒后弹出');
    } catch (e) {
      console.error('[Test] Notification error:', e);
      showToast('❌ 通知发送失败: ' + (e.message || '未知错误'));
    }
  } else if (window.calendarAPI?.notifyTodo) {
    window.calendarAPI.notifyTodo('测试通知 - 如果你看到这条通知，说明通知功能正常！', '现在');
    showToast('测试通知已发送');
  } else if ('Notification' in window) {
    if (Notification.permission !== 'granted') await Notification.requestPermission();
    if (Notification.permission === 'granted') {
      new Notification('上班日历 · 测试通知', { body: '🔔 如果你看到这条通知，说明通知功能正常！' });
      showToast('测试通知已发送');
    } else {
      showToast('通知权限被拒绝');
    }
  } else {
    showToast('当前环境不支持通知');
  }
}

// 诊断通知状态
export async function diagnoseNotifications() {
  const isCapacitor = isCapacitorPlatform();
  const results = [];

  if (isCapacitor) {
    const { LocalNotifications } = window.Capacitor.Plugins;

    // 1. 检查插件是否加载
    if (!LocalNotifications) {
      results.push('❌ LocalNotifications 插件未加载');
      results.push('   解决: 运行 npx cap sync android');
    } else {
      results.push('✅ LocalNotifications 插件已加载');

      // 2. 检查通知权限
      try {
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display === 'granted') {
          results.push('✅ 通知权限已授予');
        } else {
          results.push('❌ 通知权限未授予');
          results.push('   解决: 在系统设置中开启通知权限');
        }
      } catch (e) {
        results.push('❌ 检查通知权限失败: ' + e.message);
      }

      // 3. 检查精确闹钟权限
      try {
        if (LocalNotifications.checkExactNotificationSetting) {
          const exactPerm = await LocalNotifications.checkExactNotificationSetting();
          if (exactPerm && exactPerm.exact_alarm === 'granted') {
            results.push('✅ 精确闹钟权限已授予');
          } else {
            results.push('❌ 精确闹钟权限未授予');
            results.push('   解决: 在设置中开启"精确闹钟"权限');
            results.push('   路径: 设置 → 应用 → 上班日历 → 精确闹钟');
          }
        }
      } catch (e) {
        results.push('❌ 检查精确闹钟权限失败: ' + e.message);
      }

      // 4. 检查通知渠道
      try {
        const channels = await LocalNotifications.listChannels();
        if (channels && channels.channels) {
          const clockinChannel = channels.channels.find(ch => ch.id === 'clockin-reminders');
          if (clockinChannel) {
            results.push('✅ 通知渠道已创建');
          } else {
            results.push('⚠️ 通知渠道未创建，将在下次调度时创建');
          }
        }
      } catch (e) {
        results.push('⚠️ 检查通知渠道失败: ' + e.message);
      }

      // 5. 检查待发送的通知
      try {
        const pending = await LocalNotifications.getPending();
        if (pending && pending.notifications) {
          results.push(`📋 待发送通知数量: ${pending.notifications.length}`);
        }
      } catch (e) {
        results.push('⚠️ 检查待发送通知失败: ' + e.message);
      }
    }
  } else {
    results.push('ℹ️ 当前不是 Android 环境');
  }

  // 显示诊断结果
  alert('通知诊断结果:\n\n' + results.join('\n'));
}

export async function scheduleReminderNotifications() {
  if (reminderNotifTimer) clearInterval(reminderNotifTimer);

  const enabled = (window.allReminders || []).filter(r => r && r.enabled);
  if (enabled.length === 0) {
    // 修复：禁用全部提醒后也必须取消已调度的打卡通知，否则旧通知照常"幽灵弹出"
    await cancelPendingByKind('clockin', '打卡提醒');
    return;
  }

  // Capacitor Android local notifications
  const isCapacitor = isCapacitorPlatform();
  if (isCapacitor) {
    try {
      const { LocalNotifications } = window.Capacitor.Plugins;
      if (!LocalNotifications) {
        console.warn('[Notifications] Capacitor LocalNotifications plugin not found. Run: npx cap sync android');
        return;
      }

      // Check permissions first, only request if not granted
      let perm;
      try {
        perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') {
          perm = await LocalNotifications.requestPermissions();
        }
      } catch (permErr) {
        console.warn('[Notifications] Permission check/request failed:', permErr.message);
        try { perm = await LocalNotifications.requestPermissions(); } catch { perm = { display: 'denied' }; }
      }
      if (perm.display !== 'granted') {
        console.warn('[Notifications] Permission denied:', perm.display);
        showToast('请在系统设置中开启通知权限，否则无法收到打卡提醒');
        return;
      }

      // 决定精确闹钟模式：精确权限未授予时退回 inexact（不崩溃），
      // 否则用 exact:true 让系统精确实时触发（Doze 下也能响，根治「攒一批再一起弹」）。
      const useExact = await resolveExactMode(LocalNotifications);

      // Register action type for clock-in confirmation (only once)
      try {
        await LocalNotifications.registerActionTypes({
          types: [{
            id: 'clockin-action',
            actions: [{ id: 'confirm', title: '✓ 已打卡' }]
          }]
        });
      } catch (typeErr) {
        console.warn('[Notifications] Register action type error:', typeErr.message);
      }

      // Register listeners only once to prevent duplicates
      if (!_notifListenersRegistered) {
        _notifListenersRegistered = true;

        LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
          const extra = event.notification?.extra || {};
          if (extra.reminderId && extra.date) {
            // Auto-confirm the reminder
            if (window.calendarAPI?.confirmReminder) {
              window.calendarAPI.confirmReminder(extra.date, extra.reminderId);
            }
            if (!window.allReminderRecords) window.allReminderRecords = {};
            if (!window.allReminderRecords[extra.date]) window.allReminderRecords[extra.date] = {};
            window.allReminderRecords[extra.date][extra.reminderId] = { confirmed: true, at: new Date().toISOString() };
            showToast('打卡成功 ✓');
            // v3.17.43：经典 currentView/renderCalendar 已下线，改用 Vue 刷新钩子（本身幂等）
            window.__refreshReminderList?.();
            window.__refreshReminderHistory?.();
            window.__refreshCalendarGrid?.();
          }
        });

        LocalNotifications.addListener('localNotificationReceived', (event) => {
          console.log('[Notifications] Received in foreground:', event);
        });
      }

      // Cancel existing clock-in notifications（只取消打卡类，避免误伤待办提醒）
      await cancelPendingByKind('clockin', '打卡提醒');

      // Create notification channels (Android 8+)
      try {
        await LocalNotifications.createChannel({
          id: 'clockin-reminders',
          name: '打卡提醒（有声）',
          description: '上班日历的打卡签到提醒（带声音和震动）',
          importance: 5,
          visibility: 1,
          sound: 'default',
          vibration: true,
          vibrationPattern: [0, 500, 200, 500, 200, 500],
          light: true,
          lightColor: '#FF0000'
        });
        await LocalNotifications.createChannel({
          id: 'clockin-silent',
          name: '打卡提醒（静音）',
          description: '上班日历的打卡签到提醒（无声音）',
          importance: 4,
          visibility: 1,
          sound: null,
          vibration: false
        });
        await LocalNotifications.createChannel({
          id: 'todo-reminders',
          name: '待办提醒',
          description: '上班日历的待办事项提醒',
          importance: 5,
          visibility: 1,
          sound: 'default',
          vibration: true,
          vibrationPattern: [0, 300, 200, 300],
          light: true,
          lightColor: '#0000FF'
        });
      } catch (channelErr) {
        console.warn('[Notifications] Create channel error:', channelErr.message);
      }

      // 非工作日状态列表，这些日期跳过打卡通知
      const nonWorkStatuses = ['rest', 'leave', 'annual', 'sick', 'personal'];

      // 排期窗口内滚动预调度（窗口 = SCHEDULE_HORIZON_DAYS，见文件顶部常量说明）
      const notifications = [];
      const today = new Date();

      for (let dayOffset = 0; dayOffset < SCHEDULE_HORIZON_DAYS; dayOffset++) {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + dayOffset);
        const dateStr = dateToStr(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

        // 检查目标日期是否是非工作日
        const dayData = (window.allData || {})[dateStr];
        if (dayData && nonWorkStatuses.includes(dayData.status)) continue;

        for (const r of enabled) {
          // Skip if already confirmed
          if (isReminderConfirmed(r.id, dateStr)) continue;

          const [hh, mm] = r.time.split(':');
          const scheduleDate = new Date(targetDate);
          scheduleDate.setHours(parseInt(hh), parseInt(mm), 0, 0);

          // Skip if already past
          if (scheduleDate <= new Date()) continue;

          const withSound = r.sound !== false;
          const withVibrate = r.vibrate !== false;
          notifications.push({
            id: generateNotifId(),
            title: '上班日历 · 打卡提醒',
            body: `⏰ ${r.label} (${r.time})`,
            schedule: { at: scheduleDate, allowWhileIdle: true, exact: useExact },
            smallIcon: 'ic_launcher',
            largeIcon: 'ic_launcher_round',
            extra: { reminderId: r.id, date: dateStr, kind: 'clockin' },
            channelId: withSound ? 'clockin-reminders' : 'clockin-silent',
            actionTypeId: 'clockin-action',
            sound: withSound ? 'default' : null,
            vibrate: withVibrate
          });
        }
      }

      // 经安全调度：绝不突破系统精确闹钟上限（打卡与待办共享 MAX_TOTAL_ALARMS 配额）
      await safeSchedule(LocalNotifications, notifications, 'clock-in');
    } catch (e) {
      console.error('[Notifications] Capacitor scheduling error:', e);
      showToast('通知设置失败: ' + (e.message || '未知错误'));
    }
  }

  // === 轮询兜底：仅 Web 平台运行 ===
  // Capacitor 环境已经使用了可靠的预调度，跳过轮询以防重复通知并节省电量
  if (isCapacitor) {
    console.log('[Notifications] Capacitor detected, skipping renderer polling (using system scheduling)');
    return;
  }

  // 使用 syncRead 检测真正的 Electron 环境 (Electron 主进程负责通知)
  const isElectron = typeof window.calendarAPI?.syncRead === 'function';
  if (isElectron) {
    console.log('[Notifications] Electron detected, skipping renderer polling (handled by main process)');
    return;
  }

  if (reminderNotifTimer) clearInterval(reminderNotifTimer);

  // Web: 页面不可见时暂停轮询，节省电池
  let reminderPollingPaused = false;
  if (!window._reminderVisibilityHandler_Internal) {
    window._reminderVisibilityHandler_Internal = () => {
      reminderPollingPaused = document.visibilityState === 'hidden';
    };
    document.addEventListener('visibilitychange', window._reminderVisibilityHandler_Internal);
  }
  reminderPollingPaused = document.visibilityState === 'hidden';

  reminderNotifTimer = setInterval(() => {
    if (reminderPollingPaused) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${hh}:${mm}`;
    const todayStr = getTodayStr();

    for (const r of enabled) {
      if (r.time !== currentTime) continue;
      if (isReminderConfirmed(r.id, todayStr)) continue;

      // 防止同一分钟内重复通知
      const notifKey = `notif-sent-${r.id}-${todayStr}-${currentTime}`;
      if (localStorage.getItem(notifKey)) continue;
      localStorage.setItem(notifKey, '1');
      setTimeout(() => localStorage.removeItem(notifKey), 120000);

      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          const notif = new Notification('上班日历 · 打卡提醒', {
            body: `⏰ ${r.label} (${r.time})`,
            icon: 'assets/icon.png',
            tag: 'reminder-' + r.id,
            requireInteraction: true
          });
          notif.onclick = () => { window.focus(); window.__vueActivate?.('clockin'); };
        } catch (e) {
          console.warn('[Polling] Web notification error:', e.message);
        }
      }
    }
  }, 30000);

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// --- Todo Reminders ---

let todoRemindTimer = null;

export async function scheduleTodoReminders() {
  if (todoRemindTimer) clearInterval(todoRemindTimer);

  const isCapacitor = isCapacitorPlatform();

  // Capacitor Android: 使用预调度机制
  if (isCapacitor) {
    try {
      const { LocalNotifications } = window.Capacitor.Plugins;
      if (!LocalNotifications) return;
      // 与打卡共用同一精确闹钟判定，确保待办提醒也实时、精确触发
      const useExact = await resolveExactMode(LocalNotifications);

      const todosWithRemind = (window.allTodos || []).filter(t => t && t.remind && !t.done);
      // 修复：调度前先【await】取消旧的待办通知，避免重复叠加与配额泄漏；无待办时也清除。
      // 必须 await —— 否则取消与新调度并发竞争，旧闹钟未释放就叠加新的，长期累积会突破系统上限。
      await cancelPendingByKind('todo', '待办提醒');
      if (todosWithRemind.length === 0) return;

      const notifications = [];
      const today = new Date();

      for (let dayOffset = 0; dayOffset < SCHEDULE_HORIZON_DAYS; dayOffset++) {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + dayOffset);
        const dateStr = dateToStr(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
        const weekday = targetDate.getDay();

        for (const todo of todosWithRemind) {
          let shouldSchedule = false;
          if (todo.type === 'once') {
            shouldSchedule = (todo.date === dateStr);
          } else if (todo.type === 'weekly') {
            shouldSchedule = (todo.weekdays || []).includes(weekday);
          }

          if (!shouldSchedule) continue;

          let targetTime = todo.remindTime || '09:00';
          const [th, tm] = targetTime.split(':').map(Number);
          let remindMinutes = th * 60 + tm;
          if (todo.remind !== 'same') {
            remindMinutes -= parseInt(todo.remind) || 0;
          }
          if (remindMinutes < 0) remindMinutes = 0;

          const scheduleDate = new Date(targetDate);
          scheduleDate.setHours(Math.floor(remindMinutes / 60), remindMinutes % 60, 0, 0);

          if (scheduleDate <= new Date()) continue;

          notifications.push({
            id: generateNotifId(),
            title: '上班日历 · 待办提醒',
            body: `📋 ${todo.text} (${targetTime})`,
            schedule: { at: scheduleDate, allowWhileIdle: true, exact: useExact },
            smallIcon: 'ic_launcher',
            channelId: 'todo-reminders',
            extra: { kind: 'todo', todoId: todo.id },
            sound: 'default',
            vibrate: true
          });
        }
      }

      // 经安全调度：与打卡共享 MAX_TOTAL_ALARMS 配额，绝不突破系统精确闹钟上限
      await safeSchedule(LocalNotifications, notifications, 'todo');
    } catch (e) {
      console.error('[TodoRemind] Scheduling error:', e);
    }
  }

  // Capacitor 环境跳过轮询
  if (isCapacitor) return;

  // Web/Electron: 使用轮询机制
  let todoPollingPaused = false;
  if (!window._todoVisibilityHandler_Internal) {
    window._todoVisibilityHandler_Internal = () => {
      todoPollingPaused = document.visibilityState === 'hidden';
    };
    document.addEventListener('visibilitychange', window._todoVisibilityHandler_Internal);
  }
  todoPollingPaused = document.visibilityState === 'hidden';

  todoRemindTimer = setInterval(() => {
    if (todoPollingPaused) return;
    const todosWithRemind = (window.allTodos || []).filter(t => t && t.remind && !t.done);
    if (todosWithRemind.length === 0) return;

    const now = new Date();
    const todayStr = getTodayStr();
    const currentTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

    for (const todo of todosWithRemind) {
      if (todo.done) continue;

      let appliesToday = false;
      if (todo.type === 'once' && todo.date === todayStr) appliesToday = true;
      else if (todo.type === 'weekly' && (todo.weekdays || []).includes(now.getDay())) appliesToday = true;

      if (!appliesToday) continue;

      let targetTime = todo.remindTime || '09:00';
      const [th, tm] = targetTime.split(':').map(Number);
      let remindMinutes = th * 60 + tm;
      if (todo.remind !== 'same') {
        remindMinutes -= parseInt(todo.remind) || 0;
      }
      if (remindMinutes < 0) remindMinutes = 0;
      const remindTimeStr = `${String(Math.floor(remindMinutes / 60)).padStart(2, '0')}:${String(remindMinutes % 60).padStart(2, '0')}`;

      if (remindTimeStr !== currentTime) continue;

      const remindKey = `todo-reminded-${todo.id}-${todayStr}`;
      if (localStorage.getItem(remindKey)) continue;
      localStorage.setItem(remindKey, '1');

      if (window.calendarAPI?.notifyTodo) {
        window.calendarAPI.notifyTodo(todo.text, targetTime);
      } else if ('Notification' in window && Notification.permission === 'granted') {
        try {
          const notif = new Notification('上班日历 · 待办提醒', {
            body: `📋 ${todo.text} (${targetTime})`,
            icon: 'assets/icon.png',
            tag: 'todo-' + todo.id,
            requireInteraction: true
          });
          notif.onclick = () => { window.focus(); window.__vueActivate?.('clockin'); };
        } catch (e) {
          console.warn('[TodoRemind] Web notification error:', e.message);
        }
      }
    }
  }, 30000);
}

// ===== 前台恢复重新调度（自 reminders.js 顶层迁入）=====
// 应用从后台恢复时滚动重排，覆盖「排期窗口滑走」与「系统清理过期闹钟」两种情况。
if (!window._notifRescheduleRegistered) {
  window._notifRescheduleRegistered = true;
  window._notifVisibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      console.log('[Notifications] App resumed, rescheduling notifications');
      scheduleReminderNotifications().catch(e => console.warn('[Notifications] reschedule clock-in failed:', e?.message));
      scheduleTodoReminders().catch(e => console.warn('[Notifications] reschedule todo failed:', e?.message));
    }
  };
  document.addEventListener('visibilitychange', window._notifVisibilityHandler);
}

// 暴露给全局 window 命名空间，供 Android WorkManager Worker 通过 bridge.eval 调用
window.__WorkCalendarNotifications = {
  scheduleReminderNotifications,
  scheduleTodoReminders
};
