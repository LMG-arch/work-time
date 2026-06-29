// reminders.js — Clock-in, reminders, notifications

async function loadReminders() {
  allReminders = await window.calendarAPI.getReminders();
}

// 生成不重复的通知 ID（Java int 范围：-2147483648 ~ 2147483647）
let _notifIdCounter = 0;
function generateNotifId() {
  _notifIdCounter = (_notifIdCounter + 1) % 1000000;
  const rand = crypto.getRandomValues(new Uint32Array(1))[0] % 1000;
  const raw = Math.floor(Date.now() / 1000) % 1000000 * 1000 + _notifIdCounter + rand;
  const id = raw % 2147483647;
  return id > 0 ? id : id + 2147483647;
}

async function loadReminderRecords() {
  allReminderRecords = await window.calendarAPI.getAllReminderRecords();
}

function getReminderRecordsForDate(dateStr) {
  return allReminderRecords[dateStr] || {};
}

function isReminderConfirmed(reminderId, dateStr) {
  const records = allReminderRecords[dateStr];
  return records && records[reminderId] && records[reminderId].confirmed;
}

// getTodayStr defined in utils.js

function renderClockinView() {
  updateMonthLabel();
  const todayStr = getTodayStr();
  document.getElementById('clockin-today-label').textContent = formatDateCN(todayStr);
  // 提醒列表由 ReminderList.vue 渲染
  window.__refreshReminderList?.();
  renderWaterTracker();
  // 打卡历史由 ReminderHistory.vue 渲染
  window.__refreshReminderHistory?.();
}

// 喝水记录
function getWaterCount(dateStr) {
  try {
    const raw = localStorage.getItem('water-records');
    if (raw) { const records = JSON.parse(raw); return records[dateStr] || 0; }
  } catch {}
  return 0;
}

function setWaterCount(dateStr, count) {
  let records = {};
  try {
    const raw = localStorage.getItem('water-records');
    if (raw) records = JSON.parse(raw);
  } catch {}
  records[dateStr] = Math.max(0, count);
  // 只保留最近30天的记录
  const keys = Object.keys(records).sort();
  while (keys.length > 30) { delete records[keys.shift()]; }
  localStorage.setItem('water-records', JSON.stringify(records));
}

function renderWaterTracker() {
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

async function sendTestNotification() {
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
async function diagnoseNotifications() {
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


function getClockinStatusForDate(dateStr) {
  const enabled = allReminders.filter(r => r.enabled);
  if (enabled.length === 0) return null;
  const records = allReminderRecords[dateStr] || {};
  const confirmed = enabled.filter(r => records[r.id] && records[r.id].confirmed);
  if (confirmed.length === 0) return null;
  return { confirmed: confirmed.length, total: enabled.length };
}

// 防止重复注册监听器
let _notifListenersRegistered = false;

async function scheduleReminderNotifications() {
  if (reminderNotifTimer) clearInterval(reminderNotifTimer);

  const enabled = allReminders.filter(r => r.enabled);
  if (enabled.length === 0) return;

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
      // Android 16: SCHEDULE_EXACT_ALARM is revoked by default, must guide user to settings
      try {
        if (LocalNotifications.checkExactNotificationSetting) {
          const exactPerm = await LocalNotifications.checkExactNotificationSetting();
          console.log('[Notifications] Exact alarm permission:', exactPerm);
          if (exactPerm && exactPerm.exact_alarm !== 'granted') {
            // Show detailed guidance for Android 16
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

      // Cancel all existing scheduled notifications
      try {
        const pending = await LocalNotifications.getPending();
        if (pending.notifications && pending.notifications.length > 0) {
          await LocalNotifications.cancel({ notifications: pending.notifications });
        }
      } catch (cancelErr) {
        console.warn('[Notifications] Cancel pending error:', cancelErr.message);
      }

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

      // Schedule notifications for the next 30 days
      const notifications = [];
      const today = new Date();

      for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
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

      if (notifications.length > 0) {
        await LocalNotifications.schedule({ notifications });
        console.log('[Notifications] Scheduled', notifications.length, 'notifications for next 30 days');
      } else {
        console.log('[Notifications] All reminders already confirmed or past, nothing to schedule');
      }

      // 定期重新调度：应用从后台恢复时重新调度通知
      // 防止系统清除已调度的通知
      if (!window._notifRescheduleRegistered) {
        window._notifRescheduleRegistered = true;
        window._notifVisibilityHandler = () => {
          if (document.visibilityState === 'visible') {
            console.log('[Notifications] App resumed, rescheduling notifications');
            scheduleReminderNotifications();
            // 待办提醒也必须重新调度，否则系统清除后不会恢复
            if (typeof scheduleTodoReminders === 'function') scheduleTodoReminders();
          }
        };
        document.addEventListener('visibilitychange', window._notifVisibilityHandler);
      }
    } catch (e) {
      console.error('[Notifications] Capacitor scheduling error:', e);
      showToast('通知设置失败: ' + (e.message || '未知错误'));
    }
    // 不 return，继续执行下面的轮询兜底逻辑
  }

  // === 轮询兜底：Capacitor/Web 平台运行 ===
  // 每 30 秒检查一次，如果当前时间到了提醒时间，立即发通知
  // 预调度可能被系统延迟，轮询确保不会漏掉
  // Electron 端通知由主进程处理，不在此处轮询
  if (reminderNotifTimer) clearInterval(reminderNotifTimer);

  const isElectron = typeof window.calendarAPI?.saveReminders === 'function' && !isCapacitor;

  // Electron 端通知由主进程负责，渲染进程跳过轮询
  if (isElectron) {
    console.log('[Notifications] Electron detected, skipping renderer polling (handled by main process)');
    return;
  }

  // Android: 不暂停轮询，因为需要后台通知
  // Web: 页面不可见时暂停轮询，节省电池
  let reminderPollingPaused = false;
  if (!isCapacitor) {
    if (!window._reminderVisibilityHandler) {
      window._reminderVisibilityHandler = () => {
        reminderPollingPaused = document.visibilityState === 'hidden';
      };
      document.addEventListener('visibilitychange', window._reminderVisibilityHandler);
    }
    reminderPollingPaused = document.visibilityState === 'hidden';
  }

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

      // 防止同一分钟内重复通知：用 localStorage 标记
      const notifKey = `notif-sent-${r.id}-${todayStr}-${currentTime}`;
      if (localStorage.getItem(notifKey)) continue;
      localStorage.setItem(notifKey, '1');
      // 2 分钟后清除标记
      setTimeout(() => localStorage.removeItem(notifKey), 120000);

      const isCap = isCapacitorPlatform();
      if (isCap) {
        // Capacitor: 发即时本地通知
        try {
          const { LocalNotifications } = window.Capacitor.Plugins;
          if (LocalNotifications) {
            LocalNotifications.schedule({
              notifications: [{
                id: generateNotifId(),
                title: '上班日历 · 打卡提醒',
                body: `⏰ ${r.label} (${r.time})`,
                schedule: { at: new Date() },
                smallIcon: 'ic_launcher',
                channelId: 'clockin-reminders',
                sound: 'default',
                vibrate: true,
                actionTypeId: 'clockin-action',
                extra: { reminderId: r.id, date: todayStr }
              }]
            });
            console.log('[Polling] Sent instant notification for', r.label, currentTime);
          }
        } catch (e) {
          console.warn('[Polling] Capacitor notification error:', e.message);
        }
      } else if (isElectron) {
        // Electron: 由主进程负责通知，渲染进程跳过避免重复
        // main.js 的 scheduleReminders 已经在处理通知
      } else if ('Notification' in window && Notification.permission === 'granted') {
        // Web browser fallback
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

  // 请求 Web 通知权限（非 Electron、非 Capacitor 时需要）
  if (!isCapacitor && !isElectron && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// --- Todo Reminders ---

let todoRemindTimer = null;

function scheduleTodoReminders() {
  if (todoRemindTimer) clearInterval(todoRemindTimer);

  const isCapacitor = isCapacitorPlatform();

  // Capacitor Android: 使用预调度机制（和打卡通知相同）
  if (isCapacitor) {
    try {
      const { LocalNotifications } = window.Capacitor.Plugins;
      if (!LocalNotifications) {
        console.warn('[TodoRemind] LocalNotifications plugin not found');
        return;
      }

      // 预调度待办通知
      const todosWithRemind = allTodos.filter(t => t.remind && !t.done);
      if (todosWithRemind.length === 0) return;

      const notifications = [];
      const today = new Date();
      const todayStr = getTodayStr();

      // 调度未来 30 天的待办通知
      for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + dayOffset);
        const dateStr = dateToStr(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
        const weekday = targetDate.getDay();

        for (const todo of todosWithRemind) {
          // 确定目标日期
          let shouldSchedule = false;
          if (todo.type === 'once') {
            shouldSchedule = (todo.date === dateStr);
          } else if (todo.type === 'weekly') {
            shouldSchedule = (todo.weekdays || []).includes(weekday);
          }

          if (!shouldSchedule) continue;

          // 计算提醒时间
          let targetTime = todo.remindTime || '09:00';
          const [th, tm] = targetTime.split(':').map(Number);
          let remindMinutes = th * 60 + tm;
          if (todo.remind !== 'same') {
            remindMinutes -= parseInt(todo.remind) || 0;
          }
          if (remindMinutes < 0) remindMinutes = 0;

          const remindH = Math.floor(remindMinutes / 60);
          const remindM = remindMinutes % 60;

          const scheduleDate = new Date(targetDate);
          scheduleDate.setHours(remindH, remindM, 0, 0);

          // 跳过已过去的时间
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

      if (notifications.length > 0) {
        LocalNotifications.schedule({ notifications });
        console.log('[TodoRemind] Scheduled', notifications.length, 'todo notifications');
      }
    } catch (e) {
      console.error('[TodoRemind] Scheduling error:', e);
    }
    // 不 return，继续执行下面的轮询兜底逻辑（和打卡提醒一致）
  }

  // Web/Electron: 使用轮询机制
  let todoPollingPaused = false;
  if (!window._todoVisibilityHandler) {
    window._todoVisibilityHandler = () => {
      todoPollingPaused = document.visibilityState === 'hidden';
    };
    document.addEventListener('visibilitychange', window._todoVisibilityHandler);
  }
  todoPollingPaused = document.visibilityState === 'hidden';

  todoRemindTimer = setInterval(() => {
    if (todoPollingPaused) return;
    const todosWithRemind = allTodos.filter(t => t.remind && !t.done);
    if (todosWithRemind.length === 0) return;

    const now = new Date();
    const todayStr = getTodayStr();
    const currentHh = String(now.getHours()).padStart(2, '0');
    const currentMm = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${currentHh}:${currentMm}`;

    for (const todo of todosWithRemind) {
      if (todo.done) continue;

      let targetDate = null;
      let targetTime = todo.remindTime || '09:00';

      if (todo.type === 'once') {
        targetDate = todo.date;
      } else if (todo.type === 'weekly') {
        const weekday = now.getDay();
        if ((todo.weekdays || []).includes(weekday)) {
          targetDate = todayStr;
        }
      }

      if (!targetDate || targetDate !== todayStr) continue;

      const [th, tm] = targetTime.split(':').map(Number);
      let remindMinutes = th * 60 + tm;
      if (todo.remind !== 'same') {
        remindMinutes -= parseInt(todo.remind) || 0;
      }
      if (remindMinutes < 0) remindMinutes = 0;

      const remindH = Math.floor(remindMinutes / 60);
      const remindM = remindMinutes % 60;
      const remindTimeStr = `${String(remindH).padStart(2, '0')}:${String(remindM).padStart(2, '0')}`;

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
          console.warn('[TodoRemind] Web notification error:', e);
        }
      }
    }
  }, 30000);
}
