// reminders.js — Clock-in, reminders, notifications

async function loadReminders() {
  allReminders = await window.calendarAPI.getReminders();
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

  // Today's reminders
  const container = document.getElementById('clockin-today-reminders');
  container.innerHTML = '';

  // 检查今天是否标记为休息日
  const todayData = allData[todayStr];
  if (todayData && todayData.status === 'rest') {
    container.innerHTML = '<div class="rest-day-skip">😴 今天是休息日，不需要打卡</div>';
    renderClockinHistory();
    return;
  }

  const now = new Date();
  const currentTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

  for (const r of allReminders) {
    if (!r.enabled) continue;
    const confirmed = isReminderConfirmed(r.id, todayStr);
    const isPast = currentTime >= r.time;

    const card = document.createElement('div');
    card.className = 'reminder-card' + (confirmed ? ' confirmed' : '');

    let statusText, btnClass, btnText, btnDisabled;
    if (confirmed) {
      statusText = '已确认打卡';
      btnClass = 'confirmed';
      btnText = '✓ 已打卡';
      btnDisabled = true;
    } else if (isPast) {
      statusText = '待确认';
      btnClass = 'pending';
      btnText = '确认打卡';
      btnDisabled = false;
    } else {
      statusText = '未到时间';
      btnClass = 'waiting';
      btnText = '等待中';
      btnDisabled = true;
    }

    card.innerHTML = `
      <div class="reminder-time">${escapeHtml(r.time)}</div>
      <div class="reminder-info">
        <span class="reminder-label">${escapeHtml(r.label)}</span>
        <span class="reminder-status">${escapeHtml(statusText)}</span>
      </div>
      <button class="reminder-confirm-btn ${escapeHtml(btnClass)}" data-id="${escapeAttr(r.id)}" ${btnDisabled ? 'disabled' : ''}>${escapeHtml(btnText)}</button>
    `;
    container.appendChild(card);
  }

  // Bind confirm buttons
  container.querySelectorAll('.reminder-confirm-btn.pending').forEach(btn => {
    btn.addEventListener('click', async () => {
      const rid = btn.dataset.id;
      await window.calendarAPI.confirmReminder(todayStr, rid);
      if (!allReminderRecords[todayStr]) allReminderRecords[todayStr] = {};
      allReminderRecords[todayStr][rid] = { confirmed: true, at: new Date().toISOString() };
      renderClockinView();
      renderCalendar();
      showToast('打卡成功 ✓');
    });
  });

  // 喝水记录
  renderWaterTracker();

  // History
  renderClockinHistory();
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

function renderClockinHistory() {
  const historyContainer = document.getElementById('clockin-history');
  historyContainer.innerHTML = '';

  // Get last 7 days
  const days = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(dateToStr(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  let hasRecords = false;
  for (const dateStr of days) {
    const records = allReminderRecords[dateStr];
    if (!records || Object.keys(records).length === 0) continue;
    hasRecords = true;

    const d = new Date(dateStr + 'T00:00:00');
    const weekday = WEEKDAYS_CN[d.getDay()];
    const parts = dateStr.split('-');

    const item = document.createElement('div');
    item.className = 'history-item';

    let html = `<div class="history-date">${parseInt(parts[1])}月${parseInt(parts[2])}日 周${weekday}</div><div class="history-records">`;
    for (const r of allReminders) {
      if (!r.enabled) continue;
      const confirmed = records[r.id] && records[r.id].confirmed;
      html += `<span class="history-record ${confirmed ? 'confirmed' : 'unconfirmed'}">${escapeHtml(r.label)} ${confirmed ? '✓' : '✗'}</span>`;
    }
    html += '</div>';
    item.innerHTML = html;
    historyContainer.appendChild(item);
  }

  if (!hasRecords) {
    historyContainer.innerHTML = '<div class="empty-tip">暂无打卡记录</div>';
  }

  // Render todo section below clockin
  renderTodoView();
}

function renderReminderSettings() {
  const list = document.getElementById('reminder-settings-list');
  list.innerHTML = '';

  for (const r of allReminders) {
    const item = document.createElement('div');
    item.className = 'reminder-setting-item';
    const sound = r.sound !== false;
    const vibrate = r.vibrate !== false;
    item.innerHTML = `
      <input type="time" class="setting-time-input" value="${escapeAttr(r.time)}" data-id="${escapeAttr(r.id)}">
      <input type="text" class="setting-label-input" value="${escapeAttr(r.label)}" data-id="${escapeAttr(r.id)}" maxlength="10">
      <div style="display:flex;gap:8px;align-items:center;">
        <label style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:2px;" title="声音">
          <input type="checkbox" class="setting-sound-check" data-id="${escapeAttr(r.id)}" ${sound ? 'checked' : ''} style="width:12px;height:12px;">🔔
        </label>
        <label style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:2px;" title="震动">
          <input type="checkbox" class="setting-vibrate-check" data-id="${escapeAttr(r.id)}" ${vibrate ? 'checked' : ''} style="width:12px;height:12px;">📳
        </label>
        <label class="toggle-switch">
          <input type="checkbox" ${r.enabled ? 'checked' : ''} data-id="${escapeAttr(r.id)}">
          <span class="toggle-slider"></span>
        </label>
      </div>
    `;
    list.appendChild(item);
  }
}

function openReminderSettings() {
  renderReminderSettings();
  document.getElementById('reminder-modal').style.display = 'flex';
}

function closeReminderSettings() {
  document.getElementById('reminder-modal').style.display = 'none';
}

async function sendTestNotification() {
  const isCapacitor = isCapacitorPlatform();
  if (isCapacitor) {
    try {
      const { LocalNotifications } = window.Capacitor.Plugins;
      if (!LocalNotifications) { showToast('通知插件未加载'); return; }
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') { showToast('请在系统设置中开启通知权限'); return; }
      await LocalNotifications.schedule({
        notifications: [{
          id: 999999,
          title: '上班日历 · 测试通知',
          body: '🔔 如果你看到这条通知，说明通知功能正常！',
          schedule: { at: new Date(Date.now() + 1000) },
          smallIcon: 'ic_launcher',
          channelId: 'clockin-reminders',
          sound: 'default',
          vibrate: true
        }]
      });
      showToast('测试通知已发送，1秒后弹出');
    } catch (e) {
      showToast('通知发送失败: ' + e.message);
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

async function saveReminderSettings() {
  const items = document.querySelectorAll('.reminder-setting-item');
  const updated = [];
  items.forEach(item => {
    const timeInput = item.querySelector('.setting-time-input');
    const labelInput = item.querySelector('.setting-label-input');
    const toggle = item.querySelector('.toggle-switch input[type="checkbox"]');
    const soundCheck = item.querySelector('.setting-sound-check');
    const vibrateCheck = item.querySelector('.setting-vibrate-check');
    updated.push({
      id: timeInput.dataset.id,
      label: labelInput.value.trim() || '打卡',
      time: timeInput.value,
      enabled: toggle.checked,
      sound: soundCheck ? soundCheck.checked : true,
      vibrate: vibrateCheck ? vibrateCheck.checked : true
    });
  });
  allReminders = updated;
  await window.calendarAPI.saveReminders(updated);
  closeReminderSettings();
  renderClockinView();
  scheduleReminderNotifications();
  scheduleTodoReminders();
  showToast('提醒设置已保存');
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

      // Request permissions
      let perm;
      try {
        perm = await LocalNotifications.requestPermissions();
      } catch (permErr) {
        console.warn('[Notifications] Permission request failed:', permErr.message);
        showToast('请在系统设置中允许通知权限');
        return;
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
            showToast('⚠️ 请开启"精确闹钟"权限，否则提醒会延迟15分钟！');
            if (LocalNotifications.changeExactNotificationSetting) {
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

      // 检查今天是否是休息日，如果是则跳过当天的打卡提醒
      const todayStr = getTodayStr();
      const todayData = allData[todayStr];
      const isRestDay = todayData && todayData.status === 'rest';

      // Schedule notifications for the next 30 days
      const notifications = [];
      let notifId = Math.floor(Date.now() / 1000) % 1000000;
      const today = new Date();

      for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + dayOffset);
        const dateStr = dateToStr(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

        // 检查目标日期是否是休息日
        const dayData = allData[dateStr];
        if (dayData && dayData.status === 'rest') continue;

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
            id: notifId++,
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
    } catch (e) {
      console.error('[Notifications] Capacitor scheduling error:', e);
      showToast('通知设置失败: ' + (e.message || '未知错误'));
    }
    return;
  }

  // Web browser notifications (Electron renderer / browser)
  if (!('Notification' in window)) return;

  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Electron main process handles notifications via IPC
  // Web/Capacitor: use browser Notification API as fallback
  const isElectron = typeof window.calendarAPI?.saveReminders === 'function' && !isCapacitor;
  if (isElectron) return;

  // Fallback: use Web Notification in browser
  if (Notification.permission !== 'granted') return;

  reminderNotifTimer = setInterval(() => {
    if (Notification.permission !== 'granted') return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${hh}:${mm}`;
    const todayStr = getTodayStr();

    for (const r of enabled) {
      if (r.time !== currentTime) continue;
      if (isReminderConfirmed(r.id, todayStr)) continue;

      try {
        const notif = new Notification('上班日历 · 打卡提醒', {
          body: `⏰ ${r.label} (${r.time})`,
          icon: 'assets/icon.png',
          tag: 'reminder-' + r.id,
          requireInteraction: true
        });

        notif.onclick = () => {
          window.focus();
          switchView('clockin');
        };
      } catch (notifErr) {
        console.warn('[Notifications] Web notification error:', notifErr.message);
      }
    }
  }, 10000);
}

// --- Todo Reminders ---

let todoRemindTimer = null;

function scheduleTodoReminders() {
  if (todoRemindTimer) clearInterval(todoRemindTimer);

  // Check every 30 seconds
  todoRemindTimer = setInterval(() => {
    const todosWithRemind = allTodos.filter(t => t.remind && !t.done);
    if (todosWithRemind.length === 0) return;

    const now = new Date();
    const todayStr = getTodayStr();
    const currentHh = String(now.getHours()).padStart(2, '0');
    const currentMm = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${currentHh}:${currentMm}`;

    for (const todo of todosWithRemind) {
      if (todo.done) continue;

      // Determine the target date and time for this todo
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

      // Calculate the remind time
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

      // Check if already reminded for this date
      const remindKey = `todo-reminded-${todo.id}-${todayStr}`;
      if (localStorage.getItem(remindKey)) continue;

      // Mark as reminded
      localStorage.setItem(remindKey, '1');

      // Send notification
      const isCap = isCapacitorPlatform();
      if (isCap) {
        try {
          const { LocalNotifications } = window.Capacitor.Plugins;
          if (LocalNotifications) {
            LocalNotifications.schedule({
              notifications: [{
                id: Math.floor(Date.now() / 1000) % 1000000 + 500000,
                title: '上班日历 · 待办提醒',
                body: `📋 ${todo.text} (${targetTime})`,
                schedule: { at: new Date() },
                smallIcon: 'ic_launcher',
                channelId: 'todo-reminders',
                sound: 'default',
                vibrate: true
              }]
            });
          }
        } catch (e) {
          console.warn('[TodoRemind] Capacitor notification error:', e);
        }
      } else if (window.calendarAPI?.notifyTodo) {
        // Electron: notify via main process (single notification path)
        window.calendarAPI.notifyTodo(todo.text, targetTime);
      } else if ('Notification' in window && Notification.permission === 'granted') {
        // Pure web browser fallback (not Electron, not Capacitor)
        try {
          const notif = new Notification('上班日历 · 待办提醒', {
            body: `📋 ${todo.text} (${targetTime})`,
            icon: 'assets/icon.png',
            tag: 'todo-' + todo.id,
            requireInteraction: true
          });
          notif.onclick = () => {
            window.focus();
            switchView('clockin');
          };
        } catch (e) {
          console.warn('[TodoRemind] Web notification error:', e);
        }
      }
    }
  }, 10000);
}
