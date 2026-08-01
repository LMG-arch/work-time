// reminders.js — Clock-in, reminders, notifications

export async function loadReminders() {
  allReminders = await window.calendarAPI.getReminders();
  window.allReminders = allReminders;
}

// 生成不重复的通知 ID（Java int 范围：-2147483648 ~ 2147483647）
let _notifIdCounter = 0;
export function generateNotifId() {
  _notifIdCounter = (_notifIdCounter + 1) % 1000000;
  const rand = crypto.getRandomValues(new Uint32Array(1))[0] % 1000;
  const raw = Math.floor(Date.now() / 1000) % 1000000 * 1000 + _notifIdCounter + rand;
  const id = raw % 2147483647;
  return id > 0 ? id : id + 2147483647;
}

export async function loadReminderRecords() {
  allReminderRecords = await window.calendarAPI.getAllReminderRecords();
  window.allReminderRecords = allReminderRecords;
}

export function getReminderRecordsForDate(dateStr) {
  return allReminderRecords[dateStr] || {};
}

export function isReminderConfirmed(reminderId, dateStr) {
  const records = allReminderRecords[dateStr];
  return records && records[reminderId] && records[reminderId].confirmed;
}

// getTodayStr defined in utils.js

// 合并后：仅处理非 Vue 部分（today-label, water-tracker），
// 其余由 Vue 组件 ReminderList / ReminderHistory 接管
export function renderClockinView() {
  updateMonthLabel();
  const todayStr = getTodayStr();
  const label = document.getElementById('clockin-today-label');
  if (label) label.textContent = formatDateCN(todayStr);
  renderWaterTracker();
  window.__refreshReminderList?.();
  window.__refreshReminderHistory?.();
}

// 初始化重新调度监听器 (顶层注册，防重)
if (!window._notifRescheduleRegistered) {
  window._notifRescheduleRegistered = true;
  window._notifVisibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      console.log('[Notifications] App resumed, rescheduling notifications');
      if (typeof scheduleReminderNotifications === 'function') scheduleReminderNotifications();
      if (typeof scheduleTodoReminders === 'function') scheduleTodoReminders();
    }
  };
  document.addEventListener('visibilitychange', window._notifVisibilityHandler);
}

// 喝水记录
export function getWaterCount(dateStr) {
  try {
    const records = window.__storage.get('water-records');
    if (records) return records[dateStr] || 0;
  } catch (e) { console.warn('[Water] Failed to parse records:', e.message); }
  return 0;
}

export function setWaterCount(dateStr, count) {
  let records = {};
  try {
    const existing = window.__storage.get('water-records');
    if (existing) records = existing;
  } catch (e) { console.warn('[Water] Failed to parse records:', e.message); }
  records[dateStr] = Math.max(0, count);
  // 只保留最近30天的记录
  const keys = Object.keys(records).sort();
  while (keys.length > 30) { delete records[keys.shift()]; }
  window.__storage.set('water-records', records);
}

export function renderWaterTracker() {
  const container = document.getElementById('water-tracker');
  if (!container) return;
  const todayStr = getTodayStr();
  const count = getWaterCount(todayStr);
  const goal = 8; // 目标8杯
  const progress = Math.min(count / goal, 1);

  let cupsHtml = '';
  for (let i = 0; i < goal; i++) {
    cupsHtml += `<span class="water-cup${i < count ? ' filled' : ''}" data-idx="${i}">💧</span>`;
  }

  container.innerHTML = `
    <div class="water-header">
      <span class="water-title">💧 喝水记录</span>
      <span class="water-count">${count}/${goal} 杯</span>
    </div>
    <div class="water-progress-bar">
      <div class="water-progress-fill" style="width:${progress * 100}%"></div>
    </div>
    <div class="water-cups">${cupsHtml}</div>
    <div class="water-actions">
      <button class="water-btn water-minus" ${count <= 0 ? 'disabled' : ''}>−</button>
      <button class="water-btn water-plus" ${count >= goal ? 'disabled' : ''}>+</button>
    </div>
    ${count >= goal ? '<div class="water-goal-reached">🎉 今日喝水目标已达成！</div>' : ''}
  `;

  container.querySelector('.water-minus').addEventListener('click', () => {
    setWaterCount(todayStr, count - 1);
    renderWaterTracker();
  });
  container.querySelector('.water-plus').addEventListener('click', () => {
    setWaterCount(todayStr, count + 1);
    renderWaterTracker();
  });
  container.querySelectorAll('.water-cup').forEach(cup => {
    cup.addEventListener('click', () => {
      const idx = parseInt(cup.dataset.idx);
      // 点击已填充的杯子取消到最后一个，点击空杯子填充到该位置
      if (idx < count) {
        setWaterCount(todayStr, idx);
      } else {
        setWaterCount(todayStr, idx + 1);
      }
      renderWaterTracker();
    });
  });
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
            results.push('   路径: 设置 → 应用 → 上班日历 → 精确闹��');
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

export function getClockinStatusForDate(dateStr) {
  const enabled = allReminders.filter(r => r.enabled);
  if (enabled.length === 0) return null;
  const records = allReminderRecords[dateStr] || {};
  const confirmed = enabled.filter(r => records[r.id] && records[r.id].confirmed);
  if (confirmed.length === 0) return null;
  return { confirmed: confirmed.length, total: enabled.length };
}

// 防止重复注册监听器
let _notifListenersRegistered = false;

// ⚠️ 关键约束：Android 13+ 对每个应用的「精确闹钟(exact alarm)」有 500 个并发硬上限，
// 超过后 AlarmManager.setExactAndAllowWhileIdle 会抛 IllegalStateException，
// 经 Capacitor Bridge 放大为致命崩溃（表现为"用两天就闪退"）。
// 以下两个常量把总量牢牢压在上限之下，并缩短排期窗口以留足安全余量。
const SCHEDULE_HORIZON_DAYS = 14;   // 排期窗口：14 天（App 每次前台恢复都会滚动重排，足够覆盖）
const MAX_TOTAL_ALARMS = 400;       // 精确闹钟总配额上限（打卡+待办共享），远低于系统 500 的硬限

// 按 channelId 精准取消指定类型的已调度通知。
// 修复两类「幽灵通知」：原先打卡/待办通知要么全取消（误伤对方）、要么不取消（残留），
// 改为按 channel 只取消本类型，互不干扰。
async function cancelPendingByChannels(channelIds) {
  if (!isCapacitorPlatform()) return;
  try {
    const { LocalNotifications } = window.Capacitor.Plugins;
    if (!LocalNotifications) return;
    const pending = await LocalNotifications.getPending();
    const targets = (pending.notifications || []).filter(n => channelIds.includes(n.channelId));
    if (targets.length > 0) await LocalNotifications.cancel({ notifications: targets });
  } catch (e) { console.warn('[Notifications] cancel by channel error:', e.message); }
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

export async function scheduleReminderNotifications() {
  if (reminderNotifTimer) clearInterval(reminderNotifTimer);

  const enabled = allReminders.filter(r => r.enabled);
  if (enabled.length === 0) {
    // 修复：禁用全部提醒后也必须取消已调度的打卡通知，否则旧通知照常"幽灵弹出"
    await cancelPendingByChannels(['clockin-reminders', 'clockin-silent']);
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

      // Check exact alarm permission (Android 12+) — without this, alarms are delayed ~15min
      try {
        if (LocalNotifications.checkExactNotificationSetting) {
          const exactPerm = await LocalNotifications.checkExactNotificationSetting();
          if (exactPerm && exactPerm.exact_alarm !== 'granted') {
            const userConfirmed = confirm(
              '⚠️ 精确闹钟权限未开启\n\n' +
              '没有此权限，打卡提醒会延迟15分钟！\n\n' +
              '点击"确定"前往设置页面开启：\n' +
              '1. 找到"精确闹钟"或"Alarms & reminders"\n' +
              '2. 开启"上班日历"的权限'
            );
            if (userConfirmed && LocalNotifications.changeExactNotificationSetting) {
              await LocalNotifications.changeExactNotificationSetting();
            }
          }
        }
      } catch (exactErr) {
        console.warn('[Notifications] Exact alarm check error:', exactErr.message);
      }

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
            if (!allReminderRecords[extra.date]) allReminderRecords[extra.date] = {};
            allReminderRecords[extra.date][extra.reminderId] = { confirmed: true, at: new Date().toISOString() };
            showToast('打卡成功 ✓');
            if (typeof currentView !== 'undefined' && currentView === 'clockin') renderClockinView();
            if (typeof renderCalendar === 'function') renderCalendar();
          }
        });

        LocalNotifications.addListener('localNotificationReceived', (event) => {
          console.log('[Notifications] Received in foreground:', event);
        });
      }

      // Cancel existing clock-in notifications（只取消打卡类，避免误伤待办提醒）
      await cancelPendingByChannels(['clockin-reminders', 'clockin-silent']);

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
        const dayData = allData[dateStr];
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
            schedule: { at: scheduleDate, allowWhileIdle: true },
            smallIcon: 'ic_launcher',
            largeIcon: 'ic_launcher_round',
            extra: { reminderId: r.id, date: dateStr },
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
          notif.onclick = () => { window.focus(); switchView('clockin'); };
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

      const todosWithRemind = allTodos.filter(t => t.remind && !t.done);
      // 修复：调度前先【await】取消旧的待办通知，避免重复叠加与配额泄漏；无待办时也清除。
      // 必须 await —— 否则取消与新调度并发竞争，旧闹钟未释放就叠加新的，长期累积会突破系统上限。
      await cancelPendingByChannels(['todo-reminders']);
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
            schedule: { at: scheduleDate, allowWhileIdle: true },
            smallIcon: 'ic_launcher',
            channelId: 'todo-reminders',
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
    const todosWithRemind = allTodos.filter(t => t.remind && !t.done);
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
          notif.onclick = () => { window.focus(); switchView('clockin'); };
        } catch (e) {
          console.warn('[TodoRemind] Web notification error:', e.message);
        }
      }
    }
  }, 30000);
}
