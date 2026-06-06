let currentYear, currentMonth;
let selectedDate = null;
let allData = {};
let allTodos = [];
let currentView = 'calendar';
let todoFilter = 'all';
let holidayData = null;
let allReminders = [];
let allReminderRecords = {};
let reminderNotifTimer = null;

const WEEKDAYS_CN = ['日', '一', '二', '三', '四', '五', '六'];
const STATUS_LABELS = { work: '上班', rest: '休息', trip: '出差' };
const STATUS_CHARS = { work: '班', rest: '休', trip: '差' };

const THEMES = [
  { id: 'default', name: '经典', color: '#333' },
  { id: 'dark',    name: '暗黑', color: '#1a1a2e' },
  { id: 'green',   name: '清新', color: '#43A047' },
  { id: 'pink',    name: '粉色', color: '#e91e63' },
  { id: 'purple',  name: '紫色', color: '#7e57c2' },
  { id: 'navy',    name: '商务', color: '#1565c0' },
  { id: 'ocean',   name: '海洋', color: '#00838f' },
  { id: 'sunset',  name: '日落', color: '#e65100' },
  { id: 'rose',    name: '玫瑰金', color: '#b76e79' },
  { id: 'forest',  name: '森林', color: '#2e7d32' },
  { id: 'coffee',  name: '咖啡', color: '#5d4037' },
  { id: 'lavender',name: '薰衣草', color: '#9575cd' },
  { id: 'mint',    name: '薄荷', color: '#26a69a' },
  { id: 'slate',   name: '石板', color: '#546e7a' },
];

// --- Date helpers (defined in utils.js) ---

function updateMonthLabel() {
  const lunar = Lunar.getMonthLunarInfo(currentYear, currentMonth);
  document.getElementById('month-label').textContent = `${currentYear}年${currentMonth + 1}月`;
  document.getElementById('month-lunar-label').textContent = `${lunar.ganZhi}${lunar.animal}年 ${lunar.monthName}`;
}

function getDayData(dateStr) {
  return allData[dateStr] || { status: null, note: '', tags: [], color: '' };
}

// --- Todos ---

async function loadTodos() {
  allTodos = await window.calendarAPI.getTodos();
}

function getTodosForDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const weekday = d.getDay();
  return allTodos.filter(t => {
    if (t.type === 'once') return t.date === dateStr;
    if (t.type === 'weekly') return (t.weekdays || []).includes(weekday);
    return false;
  });
}

function isTodoDone(todo, dateStr) {
  if (todo.type === 'once') return !!todo.done;
  return !!(todo.weeklyDone && todo.weeklyDone[dateStr]);
}

async function toggleTodoDone(todo, dateStr) {
  if (todo.type === 'once') {
    await window.calendarAPI.updateTodo(todo.id, { done: !todo.done });
    todo.done = !todo.done;
  } else {
    const wd = todo.weeklyDone || {};
    wd[dateStr] = !wd[dateStr];
    await window.calendarAPI.updateTodo(todo.id, { weeklyDone: wd });
    todo.weeklyDone = wd;
  }
}

function renderTodoList(dateStr) {
  const container = document.getElementById('todo-list');
  container.innerHTML = '';
  const todos = getTodosForDate(dateStr);
  if (todos.length === 0) {
    container.innerHTML = '<div class="todo-empty">暂无待办</div>';
    return;
  }
  for (const todo of todos) {
    const done = isTodoDone(todo, dateStr);
    const remindIcon = todo.remind ? ' ⏰' : '';
    const item = document.createElement('div');
    item.className = 'todo-item' + (done ? ' done' : '');
    item.innerHTML = `
      <span class="todo-check" data-id="${todo.id}">${done ? '✓' : ''}</span>
      <span class="todo-text">${escapeHtml(todo.text)}${remindIcon}</span>
      <span class="todo-del" data-id="${todo.id}">&times;</span>
    `;
    container.appendChild(item);
  }
  container.querySelectorAll('.todo-check').forEach(btn => {
    btn.addEventListener('click', async () => {
      const todo = allTodos.find(t => t.id === btn.dataset.id);
      if (todo) {
        await toggleTodoDone(todo, dateStr);
        renderTodoList(dateStr);
        renderCalendar();
      }
    });
  });
  container.querySelectorAll('.todo-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      await window.calendarAPI.deleteTodo(btn.dataset.id);
      allTodos = allTodos.filter(t => t.id !== btn.dataset.id);
      renderTodoList(dateStr);
      renderCalendar();
      showToast('已删除待办');
    });
  });
}

// --- Todo Modal ---

function initLunarSelects() {
  const monthSel = document.getElementById('todo-lunar-month');
  const daySel = document.getElementById('todo-lunar-day');
  monthSel.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = Lunar.MonthCN[m - 1] + '月';
    monthSel.appendChild(opt);
  }
  updateLunarDays();
  monthSel.addEventListener('change', updateLunarDays);
}

function updateLunarDays() {
  const daySel = document.getElementById('todo-lunar-day');
  const month = parseInt(document.getElementById('todo-lunar-month').value);
  let maxDays = 30;
  daySel.innerHTML = '';
  for (let d = 1; d <= maxDays; d++) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = Lunar.dayCN(d);
    daySel.appendChild(opt);
  }
}

// 农历转公历：遍历当月每一天找到对应农历日期
function lunarToSolar(year, lunarMonth, lunarDay) {
  // 遍历全年找到匹配的农历日期
  for (let m = 0; m < 12; m++) {
    const dim = getDaysInMonth(year, m);
    for (let d = 1; d <= dim; d++) {
      const lunar = Lunar.solar2lunar(year, m, d);
      if (lunar.lunarMonth === lunarMonth && lunar.lunarDay === lunarDay && !lunar.isLeap) {
        return dateToStr(year, m, d);
      }
    }
  }
  return null;
}

function openTodoModal() {
  const modal = document.getElementById('todo-modal');
  document.getElementById('todo-text-input').value = '';
  document.getElementById('todo-date-input').value = selectedDate || '';
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.type-btn[data-type="once"]').classList.add('active');
  document.getElementById('todo-once-row').style.display = '';
  document.getElementById('todo-weekly-row').style.display = 'none';
  document.getElementById('todo-lunar-row').style.display = 'none';
  document.querySelectorAll('.wd-btn').forEach(b => b.classList.remove('active'));
  // Reset calendar type to solar
  document.querySelectorAll('.calendar-type-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.calendar-type-btn[data-caltype="solar"]').classList.add('active');
  // Reset remind fields
  document.getElementById('todo-remind-select').value = '';
  document.getElementById('todo-remind-time').value = '09:00';
  document.getElementById('todo-remind-time').style.display = 'none';
  // Show lunar hint for selected date
  updateLunarHint();
  modal.style.display = 'flex';
}

function closeTodoModal() {
  document.getElementById('todo-modal').style.display = 'none';
}

function updateLunarHint() {
  const dateVal = document.getElementById('todo-date-input').value;
  const hint = document.getElementById('todo-date-lunar-hint');
  if (dateVal) {
    const parts = dateVal.split('-');
    const lunar = Lunar.solar2lunar(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    hint.textContent = lunar.full;
  } else {
    hint.textContent = '';
  }
}

function setupTodoModal() {
  const modal = document.getElementById('todo-modal');
  const typeBtns = document.querySelectorAll('.type-btn');
  const wdBtns = document.querySelectorAll('.wd-btn');

  initLunarSelects();

  // Toggle remind time visibility based on selection
  const remindSelect = document.getElementById('todo-remind-select');
  const remindTimeRow = document.getElementById('todo-remind-time');
  remindSelect.addEventListener('change', () => {
    remindTimeRow.style.display = remindSelect.value ? '' : 'none';
  });

  typeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      typeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('todo-once-row').style.display = btn.dataset.type === 'once' ? '' : 'none';
      document.getElementById('todo-lunar-row').style.display = (btn.dataset.type === 'once' && document.querySelector('.calendar-type-btn[data-caltype="lunar"]').classList.contains('active')) ? '' : 'none';
      document.getElementById('todo-weekly-row').style.display = btn.dataset.type === 'weekly' ? '' : 'none';
    });
  });

  // Calendar type toggle (solar/lunar)
  document.querySelectorAll('.calendar-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.calendar-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const isLunar = btn.dataset.caltype === 'lunar';
      document.getElementById('todo-once-row').style.display = isLunar ? 'none' : '';
      document.getElementById('todo-lunar-row').style.display = isLunar ? '' : 'none';
    });
  });

  // Update lunar hint when date changes
  document.getElementById('todo-date-input').addEventListener('change', updateLunarHint);

  wdBtns.forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('active'));
  });

  document.getElementById('todo-modal-cancel').addEventListener('click', closeTodoModal);

  document.getElementById('todo-modal-confirm').addEventListener('click', async () => {
    const text = document.getElementById('todo-text-input').value.trim();
    if (!text) { showToast('请输入待办内容'); return; }
    const type = document.querySelector('.type-btn.active').dataset.type;
    const todo = { text, type };
    if (type === 'once') {
      const isLunar = document.querySelector('.calendar-type-btn[data-caltype="lunar"]').classList.contains('active');
      if (isLunar) {
        const lunarMonth = parseInt(document.getElementById('todo-lunar-month').value);
        const lunarDay = parseInt(document.getElementById('todo-lunar-day').value);
        const dateVal = lunarToSolar(currentYear, lunarMonth, lunarDay);
        if (!dateVal) { showToast('找不到对应的公历日期'); return; }
        todo.date = dateVal;
        todo.lunarMonth = lunarMonth;
        todo.lunarDay = lunarDay;
      } else {
        const dateVal = document.getElementById('todo-date-input').value;
        if (!dateVal) { showToast('请选择日期'); return; }
        todo.date = dateVal;
      }
      todo.done = false;
    } else {
      const days = [];
      wdBtns.forEach(b => { if (b.classList.contains('active')) days.push(parseInt(b.dataset.wd)); });
      if (days.length === 0) { showToast('请选择重复星期'); return; }
      todo.weekdays = days;
      todo.weeklyDone = {};
    }
    // Save remind settings
    const remindSelect = document.getElementById('todo-remind-select').value;
    const remindTime = document.getElementById('todo-remind-time').value;
    if (remindSelect) {
      todo.remind = remindSelect; // '' | 'same' | '5' | '10' | '15' | '30' | '60'
      todo.remindTime = remindTime; // e.g. '09:00'
      todo.reminded = false; // track if already notified
    }
    const saved = await window.calendarAPI.addTodo(todo);
    allTodos.push(saved);
    closeTodoModal();
    if (selectedDate) renderTodoList(selectedDate);
    renderCalendar();
    scheduleTodoReminders();
    showToast('待办已添加');
  });
}

// --- Todo View ---

function renderTodoView() {
  updateMonthLabel();
  const container = document.getElementById('todo-view-content');
  if (allTodos.length === 0) {
    container.innerHTML = '<div class="empty-tip">暂无待办事项</div>';
    return;
  }

  const filters = [
    { key: 'all', label: '全部' },
    { key: 'undone', label: '未完成' },
    { key: 'done', label: '已完成' },
  ];
  let html = '<div class="todo-filter-bar">';
  for (const f of filters) {
    html += `<span class="todo-filter-tab${todoFilter === f.key ? ' active' : ''}" data-filter="${f.key}">${f.label}</span>`;
  }
  html += '</div>';

  html += '<div class="todo-view-list">';
  const onceTodos = allTodos.filter(t => t.type === 'once' && (todoFilter === 'all' || (todoFilter === 'done' ? !!t.done : !t.done)));
  const weeklyTodos = allTodos.filter(t => t.type === 'weekly');

  if (onceTodos.length > 0) {
    html += '<div class="todo-group-title">指定日期</div>';
    for (const todo of onceTodos.sort((a, b) => (a.date || '').localeCompare(b.date || ''))) {
      const done = !!todo.done;
      let dateDisplay = todo.date || '';
      if (todo.date) {
        const parts = todo.date.split('-');
        const lunar = Lunar.solar2lunar(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        dateDisplay = `${todo.date} ${lunar.full}`;
      }
      const remindLabel = todo.remind ? (todo.remind === 'same' ? ` ⏰${todo.remindTime}准时` : ` ⏰提前${todo.remind === '120' ? '2小时' : todo.remind === '1440' ? '1天' : todo.remind + '分钟'}`) : '';
      html += `<div class="todo-view-item${done ? ' done' : ''}" data-id="${todo.id}">
        <span class="todo-view-check" data-id="${todo.id}">${done ? '✓' : ''}</span>
        <div class="todo-view-info">
          <span class="todo-view-text">${escapeHtml(todo.text)}</span>
          <span class="todo-view-date">${dateDisplay}${remindLabel}</span>
        </div>
        <span class="todo-view-del" data-id="${todo.id}">&times;</span>
      </div>`;
    }
  }

  if (weeklyTodos.length > 0) {
    html += '<div class="todo-group-title">每周重复</div>';
    const wdNames = WEEKDAYS_CN;
    for (const todo of weeklyTodos) {
      const days = (todo.weekdays || []).map(d => '周' + wdNames[d]).join('、');
      const todayStr = getTodayStr();
      const todayDone = todo.weeklyDone && todo.weeklyDone[todayStr];
      const remindLabel = todo.remind ? (todo.remind === 'same' ? ` ⏰${todo.remindTime}准时` : ` ⏰提前${todo.remind === '120' ? '2小时' : todo.remind === '1440' ? '1天' : todo.remind + '分钟'}`) : '';
      html += `<div class="todo-view-item${todayDone ? ' done' : ''}" data-id="${todo.id}">
        <span class="todo-view-check" data-id="${todo.id}" data-type="weekly">${todayDone ? '✓' : ''}</span>
        <div class="todo-view-info">
          <span class="todo-view-text">${escapeHtml(todo.text)}${remindLabel}</span>
          <span class="todo-view-date">${days}</span>
        </div>
        <span class="todo-view-del" data-id="${todo.id}">&times;</span>
      </div>`;
    }
  }

  html += '</div>';
  container.innerHTML = html;

  container.querySelectorAll('.todo-view-check').forEach(btn => {
    btn.addEventListener('click', async () => {
      const todo = allTodos.find(t => t.id === btn.dataset.id);
      if (!todo) return;
      if (todo.type === 'once') {
        await window.calendarAPI.updateTodo(todo.id, { done: !todo.done });
        todo.done = !todo.done;
      } else if (todo.type === 'weekly') {
        const todayStr = getTodayStr();
        const wd = todo.weeklyDone || {};
        wd[todayStr] = !wd[todayStr];
        await window.calendarAPI.updateTodo(todo.id, { weeklyDone: wd });
        todo.weeklyDone = wd;
      }
      renderTodoView();
      renderCalendar();
    });
  });

  container.querySelectorAll('.todo-view-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      await window.calendarAPI.deleteTodo(btn.dataset.id);
      allTodos = allTodos.filter(t => t.id !== btn.dataset.id);
      renderTodoView();
      renderCalendar();
      showToast('已删除待办');
    });
  });

  container.querySelectorAll('.todo-filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      todoFilter = tab.dataset.filter;
      renderTodoView();
    });
  });
}

// --- Reminders ---

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

  // History
  renderClockinHistory();
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

function renderSettingsView() {
  // Theme grid
  const grid = document.getElementById('settings-theme-grid');
  const currentTheme = document.body.dataset.theme || 'default';
  grid.innerHTML = '';
  for (const t of THEMES) {
    const opt = document.createElement('div');
    opt.className = 'theme-opt' + (currentTheme === t.id ? ' active' : '');
    opt.dataset.theme = t.id;
    opt.innerHTML = `<div class="theme-dot" style="background:${t.color}"></div><span>${t.name}</span>`;
    opt.addEventListener('click', () => {
      setTheme(t.id);
      grid.querySelectorAll('.theme-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
    });
    grid.appendChild(opt);
  }

  // Supabase config
  const config = getSupabaseConfig();
  const urlInput = document.getElementById('supabase-url-input');
  const keyInput = document.getElementById('supabase-key-input');
  if (urlInput) urlInput.value = config.url || '';
  if (keyInput) keyInput.value = config.key || '';

  // Auto-launch button
  updateAutoLaunchBtn();
}

function renderReminderSettings() {
  const list = document.getElementById('reminder-settings-list');
  list.innerHTML = '';

  for (const r of allReminders) {
    const item = document.createElement('div');
    item.className = 'reminder-setting-item';
    item.innerHTML = `
      <input type="time" class="setting-time-input" value="${escapeAttr(r.time)}" data-id="${escapeAttr(r.id)}">
      <input type="text" class="setting-label-input" value="${escapeAttr(r.label)}" data-id="${escapeAttr(r.id)}" maxlength="10">
      <label class="toggle-switch">
        <input type="checkbox" ${r.enabled ? 'checked' : ''} data-id="${escapeAttr(r.id)}">
        <span class="toggle-slider"></span>
      </label>
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

async function saveReminderSettings() {
  const items = document.querySelectorAll('.reminder-setting-item');
  const updated = [];
  items.forEach(item => {
    const timeInput = item.querySelector('.setting-time-input');
    const labelInput = item.querySelector('.setting-label-input');
    const toggle = item.querySelector('input[type="checkbox"]');
    updated.push({
      id: timeInput.dataset.id,
      label: labelInput.value.trim() || '打卡',
      time: timeInput.value,
      enabled: toggle.checked
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

      // Cancel all existing scheduled notifications
      try {
        const pending = await LocalNotifications.getPending();
        if (pending.notifications && pending.notifications.length > 0) {
          await LocalNotifications.cancel({ notifications: pending.notifications });
        }
      } catch (cancelErr) {
        console.warn('[Notifications] Cancel pending error:', cancelErr.message);
      }

      // Create notification channel (Android 8+)
      try {
        await LocalNotifications.createChannel({
          id: 'clockin-reminders',
          name: '打卡提醒',
          description: '上班日历的打卡签到提醒',
          importance: 5, // High
          visibility: 1, // Public
          sound: 'default',
          vibration: true,
          light: true
        });
      } catch (channelErr) {
        console.warn('[Notifications] Create channel error:', channelErr.message);
      }

      // Schedule notifications for the next 7 days
      const notifications = [];
      let notifId = Date.now() % 10000; // Use timestamp to avoid ID conflicts
      const today = new Date();

      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + dayOffset);
        const dateStr = dateToStr(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

        for (const r of enabled) {
          // Skip if already confirmed
          if (isReminderConfirmed(r.id, dateStr)) continue;

          const [hh, mm] = r.time.split(':');
          const scheduleDate = new Date(targetDate);
          scheduleDate.setHours(parseInt(hh), parseInt(mm), 0, 0);

          // Skip if already past
          if (scheduleDate <= new Date()) continue;

          notifications.push({
            id: notifId++,
            title: '上班日历 · 打卡提醒',
            body: `⏰ ${r.label} (${r.time})`,
            schedule: { at: scheduleDate, allowWhileIdle: true },
            smallIcon: 'ic_launcher',
            largeIcon: 'ic_launcher_round',
            extra: { reminderId: r.id, date: dateStr },
            channelId: 'clockin-reminders',
            actionTypeId: 'clockin-action'
          });
        }
      }

      if (notifications.length > 0) {
        await LocalNotifications.schedule({ notifications });
        console.log('[Notifications] Scheduled', notifications.length, 'notifications for next 7 days');
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
  }, 30000);
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
                id: Date.now() % 100000,
                title: '上班日历 · 待办提醒',
                body: `📋 ${todo.text} (${targetTime})`,
                schedule: { at: new Date() },
                smallIcon: 'ic_launcher',
                channelId: 'clockin-reminders'
              }]
            });
          }
        } catch (e) {
          console.warn('[TodoRemind] Capacitor notification error:', e);
        }
      } else if ('Notification' in window && Notification.permission === 'granted') {
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

      // Also notify Electron main process
      if (window.calendarAPI?.notifyTodo) {
        window.calendarAPI.notifyTodo(todo.text, targetTime);
      }
    }
  }, 30000);
}

// --- Holidays ---

function getHolidayInfo(dateStr) {
  if (!holidayData) return null;
  // Full date match (specific holidays)
  if (holidayData.HOLIDAYS[dateStr]) return holidayData.HOLIDAYS[dateStr];
  // Fixed holiday match (month-day)
  const mmdd = dateStr.slice(5);
  if (holidayData.FIXED_HOLIDAYS[mmdd]) return { name: holidayData.FIXED_HOLIDAYS[mmdd], type: 'fixed' };
  return null;
}

// --- Calendar ---

function renderCalendar() {
  updateMonthLabel();
  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  const today = new Date();
  const todayStr = dateToStr(today.getFullYear(), today.getMonth(), today.getDate());
  const firstDay = getFirstDayOfWeek(currentYear, currentMonth);
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);

  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);

  for (let i = firstDay - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    grid.appendChild(createDayCell(day, dateToStr(prevYear, prevMonth, day), true));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = dateToStr(currentYear, currentMonth, day);
    const cell = createDayCell(day, dateStr, false);
    if (dateStr === todayStr) cell.classList.add('today');
    if (dateStr === selectedDate) cell.classList.add('selected');
    grid.appendChild(cell);
  }

  const remaining = grid.children.length % 7 === 0 ? 0 : 7 - (grid.children.length % 7);
  const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
  const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
  for (let day = 1; day <= remaining; day++) {
    grid.appendChild(createDayCell(day, dateToStr(nextYear, nextMonth, day), true));
  }
}

function createDayCell(day, dateStr, isOtherMonth) {
  const cell = document.createElement('div');
  cell.className = 'day-cell' + (isOtherMonth ? ' other-month' : '');
  cell.dataset.date = dateStr;

  const num = document.createElement('span');
  num.className = 'day-num';
  num.textContent = day;
  cell.appendChild(num);

  // 农历标签
  const parts = dateStr.split('-');
  const lunar = Lunar.solar2lunar(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const lunarLabel = document.createElement('span');
  lunarLabel.className = 'lunar-label' + (lunar.isFirstDay ? ' lunar-month' : '');
  lunarLabel.textContent = lunar.text;
  cell.appendChild(lunarLabel);

  const dayData = allData[dateStr];
  const holiday = getHolidayInfo(dateStr);

  // Custom color
  if (dayData && dayData.color) {
    cell.style.background = dayData.color;
  }

  // Status label
  if (dayData && dayData.status) {
    cell.dataset.status = dayData.status;
    const label = document.createElement('span');
    label.className = 'status-label';
    label.textContent = STATUS_CHARS[dayData.status] || '';
    cell.appendChild(label);
  }

  // Note indicator
  if (dayData && dayData.note) cell.classList.add('has-note');

  // Tag indicator
  if (dayData && dayData.tags && dayData.tags.length > 0) cell.classList.add('has-tag');

  // Todo indicator
  const todosForDay = getTodosForDate(dateStr);
  if (todosForDay.length > 0) {
    cell.classList.add('has-todo');
    const todoCount = document.createElement('span');
    todoCount.className = 'todo-count';
    const undone = todosForDay.filter(t => !isTodoDone(t, dateStr)).length;
    todoCount.textContent = undone > 0 ? undone : '';
    cell.appendChild(todoCount);
  }

  // Clock-in indicator
  const clockinStatus = getClockinStatusForDate(dateStr);
  if (clockinStatus && !isOtherMonth) {
    cell.classList.add('has-clockin');
  }

  // Holiday label
  if (holiday && !isOtherMonth) {
    cell.classList.add('has-holiday');
    if (holiday.type === 'holiday') cell.classList.add('is-holiday-day');
    if (holiday.type === 'workday') cell.classList.add('is-workday-day');
    const hLabel = document.createElement('span');
    hLabel.className = 'holiday-label';
    hLabel.textContent = holiday.name;
    cell.appendChild(hLabel);
  }

  cell.addEventListener('click', () => onDayClick(dateStr, isOtherMonth));
  return cell;
}

function onDayClick(dateStr, isOtherMonth) {
  if (isOtherMonth) {
    const parts = dateStr.split('-');
    currentYear = parseInt(parts[0]);
    currentMonth = parseInt(parts[1]) - 1;
    selectedDate = dateStr;
    renderCalendar();
    return;
  }
  // Toggle: click same day again to close detail panel
  if (selectedDate === dateStr && document.getElementById('detail-panel').classList.contains('open')) {
    closeDetailPanel();
    return;
  }
  selectedDate = dateStr;
  document.querySelectorAll('.day-cell.selected').forEach(el => el.classList.remove('selected'));
  const cell = document.querySelector(`.day-cell[data-date="${dateStr}"]`);
  if (cell) cell.classList.add('selected');
  openDetailPanel(dateStr);
}

function openDetailPanel(dateStr) {
  const panel = document.getElementById('detail-panel');
  const dayData = getDayData(dateStr);
  const holiday = getHolidayInfo(dateStr);

  let dateText = formatDateCN(dateStr);
  if (holiday) dateText += ` · ${holiday.name}`;
  document.getElementById('detail-date').textContent = dateText;

  // Status buttons
  document.querySelectorAll('.status-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === dayData.status);
  });

  // Color
  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.classList.toggle('active', (dot.dataset.color || '') === (dayData.color || ''));
  });

  // Tags
  renderTagList(dayData.tags || []);

  // Note
  document.getElementById('note-input').value = dayData.note || '';

  // Todos
  renderTodoList(dateStr);

  panel.classList.add('open');
}

function closeDetailPanel() {
  document.getElementById('detail-panel').classList.remove('open');
  selectedDate = null;
  document.querySelectorAll('.day-cell.selected').forEach(el => el.classList.remove('selected'));
}

// --- Color picker ---

function setupColorPicker() {
  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', async () => {
      if (!selectedDate) return;
      const color = dot.dataset.color || '';
      await saveCurrentDay(null, null, null, color);

      document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
      dot.classList.add('active');

      const cell = document.querySelector(`.day-cell[data-date="${selectedDate}"]`);
      if (cell) {
        if (color) cell.style.background = color;
        else cell.style.background = '';
      }
    });
  });
}

// --- Tags ---

function renderTagList(tags) {
  const list = document.getElementById('tag-list');
  list.innerHTML = '';
  for (const tag of tags) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = `<span class="tag-text">${escapeHtml(tag)}</span><span class="tag-remove" data-tag="${escapeAttr(tag)}">&times;</span>`;
    list.appendChild(chip);
  }
  list.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tagToRemove = btn.dataset.tag;
      const dayData = getDayData(selectedDate);
      const newTags = (dayData.tags || []).filter(t => t !== tagToRemove);
      await saveCurrentDay(null, null, newTags);
      renderTagList(newTags);
      updateCellTagIndicator(selectedDate, newTags);
    });
  });
}

function updateCellTagIndicator(dateStr, tags) {
  const cell = document.querySelector(`.day-cell[data-date="${dateStr}"]`);
  if (cell) cell.classList.toggle('has-tag', tags && tags.length > 0);
}

function setupTagInputs() {
  const input = document.getElementById('tag-input');
  const addBtn = document.getElementById('tag-add-btn');

  async function addTag(text) {
    const tag = text.trim();
    if (!tag || !selectedDate) return;
    const dayData = getDayData(selectedDate);
    const tags = dayData.tags || [];
    if (tags.includes(tag)) { showToast('标签已存在'); return; }
    if (tags.length >= 8) { showToast('最多 8 个标签'); return; }
    const newTags = [...tags, tag];
    await saveCurrentDay(null, null, newTags);
    renderTagList(newTags);
    updateCellTagIndicator(selectedDate, newTags);
    input.value = '';
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTag(input.value); }
  });
  addBtn.addEventListener('click', () => addTag(input.value));
  document.querySelectorAll('.quick-tag').forEach(qt => {
    qt.addEventListener('click', () => addTag(qt.dataset.tag));
  });
}

// --- Data ---

async function loadAllData() {
  allData = await window.calendarAPI.getAllData();
}

async function loadHolidays() {
  holidayData = await window.calendarAPI.getHolidays();
}

async function saveDay(date, status, note, tags, color) {
  await window.calendarAPI.saveDay(date, status, note, tags, color);
  if (!status && !note && (!tags || tags.length === 0) && !color) delete allData[date];
  else allData[date] = { status, note, tags: tags || [], color: color || '' };
}

async function saveCurrentDay(status, note, tags, color) {
  if (!selectedDate) return;
  const dayData = getDayData(selectedDate);
  const s = status !== null && status !== undefined ? status : dayData.status;
  const n = note !== null && note !== undefined ? note : dayData.note;
  const t = tags !== null && tags !== undefined ? tags : (dayData.tags || []);
  const c = color !== null && color !== undefined ? color : (dayData.color || '');
  await saveDay(selectedDate, s, n, t, c);
}

// --- View switching ---

function switchView(view) {
  currentView = view;
  document.getElementById('calendar-view').style.display = view === 'calendar' ? '' : 'none';
  document.getElementById('stats-view').style.display = view === 'stats' ? '' : 'none';
  document.getElementById('clockin-view').style.display = view === 'clockin' ? '' : 'none';
  document.getElementById('settings-view').style.display = view === 'settings' ? '' : 'none';
  document.getElementById('social-view').style.display = view === 'social' ? '' : 'none';
  // Update active state for toolbar buttons
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
  const activeMap = { calendar: 'home-btn', stats: 'stats-btn', clockin: 'clockin-btn', settings: 'settings-btn', social: 'social-btn' };
  const activeBtn = document.getElementById(activeMap[view]);
  if (activeBtn) activeBtn.classList.add('active');
  if (view === 'stats') renderStats();
  if (view === 'clockin') renderClockinView();
  if (view === 'settings') renderSettingsView();
  if (view === 'social') renderSocialView();
}

// --- Stats ---

function renderStats() {
  updateMonthLabel();
  const container = document.getElementById('stats-content');
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);

  let workDays = 0, restDays = 0, tripDays = 0, holidayCount = 0, workdayCount = 0;
  const dayRecords = [];
  const tagCounts = {};

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = dateToStr(currentYear, currentMonth, day);
    const d = allData[dateStr];
    const status = d ? d.status : null;
    const note = d ? (d.note || '') : '';
    const tags = d ? (d.tags || []) : [];
    const holiday = getHolidayInfo(dateStr);

    if (status === 'work') workDays++;
    else if (status === 'rest') restDays++;
    else if (status === 'trip') tripDays++;
    if (holiday && holiday.type === 'holiday') holidayCount++;
    if (holiday && holiday.type === 'workday') workdayCount++;

    for (const t of tags) { tagCounts[t] = (tagCounts[t] || 0) + 1; }

    if (status || note || tags.length > 0 || holiday) {
      dayRecords.push({ day, dateStr, status, note, tags, holiday });
    }
  }

  const totalRecorded = workDays + restDays + tripDays;
  const noStatus = daysInMonth - totalRecorded;
  const workPct = daysInMonth ? Math.round(workDays / daysInMonth * 100) : 0;
  const restPct = daysInMonth ? Math.round(restDays / daysInMonth * 100) : 0;
  const tripPct = daysInMonth ? Math.round(tripDays / daysInMonth * 100) : 0;

  let html = '';

  // Summary cards
  html += `<div class="stats-cards">
    <div class="stat-card work"><div class="stat-num">${workDays}</div><div class="stat-label">上班</div></div>
    <div class="stat-card rest"><div class="stat-num">${restDays}</div><div class="stat-label">休息</div></div>
    <div class="stat-card trip"><div class="stat-num">${tripDays}</div><div class="stat-label">出差</div></div>
    <div class="stat-card total"><div class="stat-num">${noStatus}</div><div class="stat-label">未记录</div></div>
  </div>`;

  // Holiday stats
  if (holidayCount > 0 || workdayCount > 0) {
    html += `<div class="ratio-section">
      <div class="theme-title">节假日信息</div>
      <div class="holiday-stats">
        ${holidayCount ? `<span class="hs-item holiday-day">放假 ${holidayCount} 天</span>` : ''}
        ${workdayCount ? `<span class="hs-item workday-day">调休上班 ${workdayCount} 天</span>` : ''}
      </div>
    </div>`;
  }

  // Ratio bar
  if (totalRecorded > 0) {
    html += `<div class="ratio-section">
      <div class="ratio-bar">
        ${workDays ? `<div class="ratio-seg work" style="width:${workPct}%">${workPct}%</div>` : ''}
        ${restDays ? `<div class="ratio-seg rest" style="width:${restPct}%">${restPct}%</div>` : ''}
        ${tripDays ? `<div class="ratio-seg trip" style="width:${tripPct}%">${tripPct}%</div>` : ''}
      </div>
      <div class="ratio-legend">
        <span class="legend-item work">上班 ${workDays}天</span>
        <span class="legend-item rest">休息 ${restDays}天</span>
        <span class="legend-item trip">出差 ${tripDays}天</span>
      </div>
    </div>`;
  }

  // Tag stats
  const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  if (sortedTags.length > 0) {
    html += `<div class="ratio-section">
      <div class="theme-title">标签统计</div>
      <div class="tag-stats-list">`;
    for (const [tag, count] of sortedTags) {
      html += `<div class="tag-stat-item"><span class="tag-chip static">${escapeHtml(tag)}</span><span class="tag-stat-count">${count}次</span></div>`;
    }
    html += '</div></div>';
  }

  // Day-by-day list
  if (dayRecords.length > 0) {
    html += `<div class="records-title">本月记录 (${dayRecords.length}天)</div>`;
    html += '<div class="records-list">';
    for (const r of dayRecords) {
      const d = new Date(r.dateStr + 'T00:00:00');
      const weekday = WEEKDAYS_CN[d.getDay()];
      const statusText = STATUS_LABELS[r.status] || '未标记';
      const statusClass = r.status || 'none';
      const holidayTag = r.holiday ? `<span class="record-holiday ${r.holiday.type}">${r.holiday.name}</span>` : '';
      html += `<div class="record-item">
        <div class="record-head">
          <span class="record-date">${r.day}日 周${weekday} ${holidayTag}</span>
          <span class="record-status ${statusClass}">${statusText}</span>
        </div>
        ${r.tags && r.tags.length > 0 ? `<div class="record-tags">${r.tags.map(t => `<span class="tag-chip static">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        ${r.note ? `<div class="record-note">${escapeHtml(r.note)}</div>` : ''}
      </div>`;
    }
    html += '</div>';
  } else {
    html += '<div class="empty-tip">本月暂无记录</div>';
  }

  container.innerHTML = html;
}

// --- Theme ---

function setTheme(themeId) {
  document.body.dataset.theme = themeId;
  localStorage.setItem('calendar-theme', themeId);
}

function loadTheme() {
  const saved = localStorage.getItem('calendar-theme') || 'default';
  document.body.dataset.theme = saved;
}

// --- Toast (defined in utils.js) ---
}

// --- Month change ---

async function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  closeDetailPanel();
  await loadAllData();
  if (currentView === 'calendar') renderCalendar();
  else if (currentView === 'stats') renderStats();
  else if (currentView === 'clockin') renderClockinView();
  // social/settings: only update label, don't re-render
  updateMonthLabel();
}

// --- Event listeners ---

function setupEventListeners() {
  // Touch swipe for month navigation
  let touchStartX = 0;
  let touchStartY = 0;
  const calendarView = document.getElementById('calendar-view');
  calendarView.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  calendarView.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0) changeMonth(-1);
      else changeMonth(1);
    }
  }, { passive: true });

  document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
  document.getElementById('next-month').addEventListener('click', () => changeMonth(1));

  document.getElementById('today-btn').addEventListener('click', async () => {
    const today = new Date();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();
    closeDetailPanel();
    await loadAllData();
    if (currentView === 'calendar') renderCalendar();
    else if (currentView === 'stats') renderStats();
    else renderClockinView();
  });

  // Status buttons
  document.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!selectedDate) return;
      const newStatus = btn.classList.contains('active') ? null : btn.dataset.status;
      await saveCurrentDay(newStatus, null, null, null);

      document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
      if (newStatus) btn.classList.add('active');

      const cell = document.querySelector(`.day-cell[data-date="${selectedDate}"]`);
      if (cell) {
        const oldLabel = cell.querySelector('.status-label');
        if (oldLabel) oldLabel.remove();
        if (newStatus) {
          cell.dataset.status = newStatus;
          const label = document.createElement('span');
          label.className = 'status-label';
          label.textContent = STATUS_CHARS[newStatus] || '';
          cell.appendChild(label);
        } else {
          delete cell.dataset.status;
        }
      }
    });
  });

  // Save note
  document.getElementById('save-note-btn').addEventListener('click', async () => {
    if (!selectedDate) return;
    const note = document.getElementById('note-input').value.trim();
    await saveCurrentDay(null, note, null, null);

    const cell = document.querySelector(`.day-cell[data-date="${selectedDate}"]`);
    if (cell) cell.classList.toggle('has-note', !!note);

    const saveBtn = document.getElementById('save-note-btn');
    saveBtn.textContent = '已保存';
    saveBtn.classList.add('saved');
    setTimeout(() => { saveBtn.textContent = '保存'; saveBtn.classList.remove('saved'); }, 1200);
  });

  // Color picker
  setupColorPicker();

  // Tags
  setupTagInputs();

  // Stats view - direct navigation
  // Home / Calendar - direct navigation
  document.getElementById('home-btn').addEventListener('click', () => {
    switchView('calendar');
  });

  // Stats view - direct navigation
  document.getElementById('stats-btn').addEventListener('click', () => {
    switchView('stats');
  });

  // Clock-in view - direct navigation (todo is now part of clockin)
  document.getElementById('clockin-btn').addEventListener('click', () => {
    switchView('clockin');
  });

  // Settings view - direct navigation
  document.getElementById('settings-btn').addEventListener('click', () => {
    switchView('settings');
  });

  // Add todo button in detail panel
  document.getElementById('todo-add-btn').addEventListener('click', openTodoModal);

  // Todo modal
  setupTodoModal();

  // Export (in settings view)
  document.getElementById('export-btn').addEventListener('click', async () => {
    const result = await window.calendarAPI.exportData();
    if (result.success) showToast('导出成功');
  });

  // Import (in settings view)
  document.getElementById('import-btn').addEventListener('click', async () => {
    const result = await window.calendarAPI.importData();
    if (result.success) {
      await Promise.all([loadAllData(), loadTodos(), loadReminders(), loadReminderRecords()]);
      if (currentView === 'calendar') renderCalendar();
      else if (currentView === 'stats') renderStats();
      else if (currentView === 'clockin') renderClockinView();
      else renderSettingsView();
      showToast('导入成功');
    } else if (result.error) {
      showToast('导入失败: ' + result.error);
    }
  });

  // Social view - direct navigation
  document.getElementById('social-btn').addEventListener('click', () => {
    switchView('social');
  });

  document.getElementById('post-modal-cancel').addEventListener('click', closePostModal);
  document.getElementById('post-modal-submit').addEventListener('click', submitPost);
  setupPostImagePicker();

  // Supabase config
  document.getElementById('supabase-save-btn').addEventListener('click', () => {
    const url = document.getElementById('supabase-url-input').value.trim();
    const key = document.getElementById('supabase-key-input').value.trim();
    if (!url || !key) { showToast('请填写完整配置'); return; }
    saveSupabaseConfig(url, key);
    sb = initSupabase();
    showToast('配置已保存');
  });

  document.getElementById('supabase-test-btn').addEventListener('click', async () => {
    const url = document.getElementById('supabase-url-input').value.trim();
    const key = document.getElementById('supabase-key-input').value.trim();
    if (!url || !key) { showToast('请先填写配置'); return; }
    saveSupabaseConfig(url, key);

    const results = [];
    const log = (ok, msg) => results.push(ok ? '✅ ' + msg : '❌ ' + msg);

    // Step 1: CDN library
    if (!window.supabase || !window.supabase.createClient) {
      log(false, 'Supabase JS 库未加载');
      showDiag(results.join('\n'));
      return;
    }
    log(true, 'Supabase JS 库已加载');

    // Step 2: Create client
    sb = initSupabase();
    if (!sb) {
      log(false, '创建客户端失败');
      showDiag(results.join('\n'));
      return;
    }
    log(true, '客户端创建成功');

    // Step 3: Anonymous auth
    try {
      const { data: authData, error: authError } = await sb.auth.signInAnonymously();
      if (authError) {
        log(false, '匿名登录失败: ' + authError.message);
        log(false, '→ 请到 Supabase Dashboard → Authentication → Providers → 开启 Anonymous Sign-In');
      } else {
        log(true, '匿名登录成功');
        // Try to get display_id
        try {
          const { data: prof } = await sb.from('profiles').select('display_id').eq('id', authData.user.id).maybeSingle();
          if (prof && prof.display_id) log(true, '你的数字ID: ' + prof.display_id);
        } catch {}
      }
    } catch (e) {
      log(false, '匿名登录异常: ' + e.message);
    }

    // Step 4: Query profiles table
    try {
      const { data, error } = await sb.from('profiles').select('id').limit(1);
      if (error) {
        if (error.code === '42P01') {
          log(false, 'profiles 表不存在');
          log(false, '→ 请到 Supabase SQL Editor 执行 supabase-setup.sql');
        } else {
          log(false, '查询 profiles 失败: ' + error.message + ' (code: ' + error.code + ')');
        }
      } else {
        log(true, 'profiles 表可访问 (共 ' + (data ? data.length : 0) + ' 条)');
      }
    } catch (e) {
      log(false, '查询异常: ' + e.message);
    }

    // Step 5: Test insert (dry run - try to read posts)
    try {
      const { error } = await sb.from('posts').select('id').limit(1);
      if (error) {
        log(false, 'posts 表不可用: ' + error.message);
      } else {
        log(true, 'posts 表可访问');
      }
    } catch (e) {
      log(false, 'posts 表异常: ' + e.message);
    }

    showDiag(results.join('\n'));
  });

  function showDiag(message) {
    const existing = document.getElementById('diag-panel');
    if (existing) existing.remove();
    const panel = document.createElement('div');
    panel.id = 'diag-panel';
    panel.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;max-width:420px;width:90%;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.2);font-size:13px;white-space:pre-line;line-height:1.8;color:var(--text);';
    panel.innerHTML = '<div style="font-size:15px;font-weight:600;margin-bottom:12px;">🔍 诊断结果</div><div>' + escapeHtml(message).replace(/\n/g, '<br>') + '</div>' +
      '<button id="diag-close" style="margin-top:16px;width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--card);cursor:pointer;font-size:13px;">关闭</button>';
    document.body.appendChild(panel);
    document.getElementById('diag-close').addEventListener('click', () => panel.remove());
  }

  // Clear Supabase data (admin only - moves ALL data to recycle bin)
  (async () => {
    const clearBtn = document.getElementById('supabase-clear-btn');
    const clearHint = clearBtn?.nextElementSibling;
    if (await isAdmin()) {
      clearBtn.addEventListener('click', async () => {
        if (!confirm('⚠️ 即将重置服务器上所有用户的云端数据！\n\n数据会移入回收站，可从回收站恢复。\n\n继续吗？')) return;
        if (!confirm('再次确认：真的要重置全部数据吗？')) return;
        showToast('正在重置...');
        const result = await clearAllSocialData();
        if (result.error) {
          showToast('重置失败: ' + result.error);
        } else {
          showToast('全部数据已移入回收站 ✓');
          updateTrashStats();
        }
      });

      // Add recycle bin section
      const container = clearBtn.parentElement;
      const trashSection = document.createElement('div');
      trashSection.id = 'trash-section';
      trashSection.style.cssText = 'margin-top:12px;border-top:1px solid var(--border);padding-top:12px;';
      trashSection.innerHTML = `
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;">🗑️ 回收站</div>
        <div id="trash-stats" class="settings-hint" style="margin-bottom:8px;">加载中...</div>
        <div style="display:flex;gap:8px;">
          <button id="trash-restore-btn" class="settings-action-btn" style="flex:1;">恢复全部数据</button>
          <button id="trash-empty-btn" class="settings-action-btn" style="flex:1;color:#e53935;border-color:#e53935;">清空回收站</button>
        </div>
      `;
      container.appendChild(trashSection);

      async function updateTrashStats() {
        const statsEl = document.getElementById('trash-stats');
        if (!statsEl) return;
        const stats = await getTrashStats();
        if (!stats || stats.total === 0) {
          statsEl.textContent = '回收站为空';
          return;
        }
        const parts = [];
        if (stats.profiles) parts.push(`${stats.profiles} 个用户`);
        if (stats.posts) parts.push(`${stats.posts} 条动态`);
        if (stats.comments) parts.push(`${stats.comments} 条评论`);
        if (stats.likes) parts.push(`${stats.likes} 个点赞`);
        if (stats.friendships) parts.push(`${stats.friendships} 条好友关系`);
        statsEl.textContent = `共 ${stats.total} 条数据：${parts.join('、')}`;
      }
      updateTrashStats();

      document.getElementById('trash-restore-btn').addEventListener('click', async () => {
        if (!confirm('确定从回收站恢复所有数据？')) return;
        showToast('正在恢复...');
        const result = await restoreAllData();
        if (result.error) {
          showToast('恢复失败: ' + result.error);
        } else {
          showToast('数据已全部恢复 ✓');
          updateTrashStats();
        }
      });

      document.getElementById('trash-empty-btn').addEventListener('click', async () => {
        if (!confirm('⚠️ 清空回收站后数据将永久删除，无法恢复！\n\n确定继续？')) return;
        if (!confirm('再次确认：真的要永久删除吗？')) return;
        showToast('正在清空...');
        const result = await emptyTrash();
        if (result.error) {
          showToast('清空失败: ' + result.error);
        } else {
          showToast('回收站已清空');
          updateTrashStats();
        }
      });
    } else {
      if (clearBtn) clearBtn.style.display = 'none';
      if (clearHint) clearHint.style.display = 'none';
    }
  })();

  // Clock-in settings
  document.getElementById('clockin-settings-btn').addEventListener('click', openReminderSettings);
  document.getElementById('reminder-modal-cancel').addEventListener('click', closeReminderSettings);
  document.getElementById('reminder-modal-save').addEventListener('click', saveReminderSettings);

  // Auto-launch toggle (in settings view)
  const autoLaunchBtn = document.getElementById('auto-launch-btn');
  autoLaunchBtn.addEventListener('click', async () => {
    const current = await window.calendarAPI.getAutoLaunch();
    await window.calendarAPI.setAutoLaunch(!current);
    updateAutoLaunchBtn();
    showToast(current ? '已关闭开机自启' : '已开启开机自启');
  });

  // ===== Data Sync Settings =====
  (async () => {
    const syncToggleBtn = document.getElementById('sync-toggle-btn');
    const syncNowBtn = document.getElementById('sync-now-btn');

    const config = getSupabaseConfig();
    if (!config.url || !config.key) {
      syncToggleBtn.disabled = true;
      syncNowBtn.disabled = true;
      syncToggleBtn.textContent = '需先配置服务';
      return;
    }
    if (!sb) sb = initSupabase();

    function updateSyncToggleBtn() {
      const enabled = isSyncEnabled();
      syncToggleBtn.textContent = enabled ? '自动同步：开启' : '自动同步：关闭';
      syncToggleBtn.style.borderColor = enabled ? 'var(--accent)' : '';
      syncToggleBtn.style.color = enabled ? 'var(--accent)' : '';
    }
    updateSyncToggleBtn();

    syncToggleBtn.addEventListener('click', () => {
      const next = !isSyncEnabled();
      setSyncEnabled(next);
      updateSyncToggleBtn();
      showToast(next ? '已开启自动同步' : '已关闭自动同步');
      if (next) {
        syncCalendarData().then(r => {
          if (r.error) showToast('同步失败: ' + r.error);
          else showToast('同步完成 ✓');
        });
      }
    });

    syncNowBtn.addEventListener('click', async () => {
      syncNowBtn.disabled = true;
      syncNowBtn.textContent = '同步中...';
      try {
        const result = await syncCalendarData();
        if (result.error) showToast('同步失败: ' + result.error);
        else {
          showToast('同步完成 ✓');
          if (typeof allData !== 'undefined') allData = await window.calendarAPI.getAllData();
          if (typeof allTodos !== 'undefined') allTodos = await window.calendarAPI.getTodos();
          if (typeof allReminders !== 'undefined') allReminders = await window.calendarAPI.getReminders();
        }
      } finally {
        syncNowBtn.disabled = false;
        syncNowBtn.textContent = '立即同步';
      }
    });
  })();

  // ===== Account Registration / Login =====
  (async () => {
    const loggedOut = document.getElementById('account-logged-out');
    const loggedIn = document.getElementById('account-logged-in');
    const regUsername = document.getElementById('reg-username');
    const regPassword = document.getElementById('reg-password');
    const regBtn = document.getElementById('reg-btn');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const authStatus = document.getElementById('auth-status');

    const config = getSupabaseConfig();
    if (!config.url || !config.key) return;
    if (!sb) sb = initSupabase();

    async function updateAccountUI() {
      const savedUsername = getSavedUsername();
      const user = await getCurrentUser();
      if (user && savedUsername) {
        // Logged in with account
        loggedOut.style.display = 'none';
        loggedIn.style.display = '';
        const profile = await getProfile(user.id);
        const nickname = profile ? profile.nickname : savedUsername;
        const displayId = profile ? profile.display_id : '-';
        document.getElementById('account-avatar').textContent = nickname[0];
        document.getElementById('account-nickname').textContent = nickname;
        document.getElementById('account-id').textContent = `ID: ${displayId} | ${savedUsername}`;
      } else {
        // Logged out or anonymous
        loggedOut.style.display = '';
        loggedIn.style.display = 'none';
        regUsername.value = '';
        regPassword.value = '';
        authStatus.textContent = '';
      }
    }
    updateAccountUI();

    regBtn.addEventListener('click', async () => {
      const username = regUsername.value.trim();
      const password = regPassword.value;
      regBtn.disabled = true;
      authStatus.textContent = '注册中...';
      try {
        const result = await registerAccount(username, password);
        if (result.error) {
          authStatus.textContent = result.error;
          authStatus.style.color = '#e53935';
        } else {
          // Create profile immediately so display_id is assigned
          await getMyProfile();
          authStatus.textContent = '注册成功！';
          authStatus.style.color = '';
          regUsername.value = '';
          regPassword.value = '';
          updateAccountUI();
        }
      } finally {
        regBtn.disabled = false;
      }
    });

    loginBtn.addEventListener('click', async () => {
      const username = regUsername.value.trim();
      const password = regPassword.value;
      loginBtn.disabled = true;
      authStatus.textContent = '登录中...';
      try {
        const result = await loginAccount(username, password);
        if (result.error) {
          authStatus.textContent = result.error;
          authStatus.style.color = '#e53935';
        } else {
          authStatus.textContent = '登录成功！';
          authStatus.style.color = '';
          regUsername.value = '';
          regPassword.value = '';
          updateAccountUI();
          // Always try to sync after login
          try {
            await syncCalendarData();
            if (typeof allData !== 'undefined') allData = await window.calendarAPI.getAllData();
            if (typeof allTodos !== 'undefined') allTodos = await window.calendarAPI.getTodos();
            if (typeof allReminders !== 'undefined') allReminders = await window.calendarAPI.getReminders();
          } catch (e) {
            console.log('[Login] Sync after login failed:', e.message);
          }
        }
      } finally {
        loginBtn.disabled = false;
      }
    });

    logoutBtn.addEventListener('click', async () => {
      if (!confirm('确定退出登录？')) return;
      await logoutAccount();
      updateAccountUI();
      showToast('已退出登录');
    });
  })();

  // ===== Collapsible Theme Section =====
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const grid = document.getElementById('settings-theme-grid');
    const arrow = document.querySelector('#theme-toggle .collapse-arrow');
    const isOpen = grid.style.display !== 'none';
    grid.style.display = isOpen ? 'none' : '';
    arrow.classList.toggle('open', !isOpen);
  });

  // ===== Nav Bar Settings =====
  (function() {
    const NAV_ITEMS_KEY = 'calendar-nav-items';
    const allNavItems = [
      { id: 'home', label: '日历', always: true },
      { id: 'clockin', label: '打卡' },
      { id: 'social', label: '好友' },
      { id: 'stats', label: '统计' },
      { id: 'settings', label: '设置', always: true }
    ];

    function getNavItems() {
      try {
        const raw = localStorage.getItem(NAV_ITEMS_KEY);
        if (raw) return JSON.parse(raw);
      } catch {}
      return allNavItems.map(n => n.id);
    }

    function saveNavItems(items) {
      localStorage.setItem(NAV_ITEMS_KEY, JSON.stringify(items));
    }

    function applyNavItems() {
      const enabled = getNavItems();
      allNavItems.forEach(item => {
        const btn = document.getElementById(item.id + '-btn');
        if (btn) btn.style.display = enabled.includes(item.id) ? '' : 'none';
      });
      // Ensure at least home is visible
      const homeBtn = document.getElementById('home-btn');
      if (homeBtn) homeBtn.style.display = '';
    }

    // Toggle collapsible
    document.getElementById('nav-toggle').addEventListener('click', () => {
      const content = document.getElementById('nav-settings-content');
      const arrow = document.querySelector('#nav-toggle .collapse-arrow');
      const isOpen = content.style.display !== 'none';
      content.style.display = isOpen ? 'none' : '';
      arrow.classList.toggle('open', !isOpen);
    });

    // Render toggle list
    const list = document.getElementById('nav-items-list');
    const enabled = getNavItems();
    allNavItems.forEach(item => {
      const row = document.createElement('div');
      row.className = 'nav-item-row';
      const label = document.createElement('span');
      label.className = 'nav-item-label';
      label.textContent = item.label;
      if (item.always) {
        label.textContent += '（固定）';
        label.style.color = 'var(--text3)';
      }
      const toggle = document.createElement('button');
      toggle.className = 'nav-item-toggle' + (enabled.includes(item.id) ? ' on' : '');
      if (item.always) {
        toggle.disabled = true;
        toggle.style.opacity = '0.5';
      }
      toggle.addEventListener('click', () => {
        let items = getNavItems();
        if (items.includes(item.id)) {
          items = items.filter(i => i !== item.id);
          toggle.classList.remove('on');
        } else {
          items.push(item.id);
          toggle.classList.add('on');
        }
        saveNavItems(items);
        applyNavItems();
      });
      row.appendChild(label);
      row.appendChild(toggle);
      list.appendChild(row);
    });

    applyNavItems();
  })();

  // Close modals on backdrop click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft') changeMonth(-1);
    if (e.key === 'ArrowRight') changeMonth(1);
    if (e.key === 't' && !e.ctrlKey && !e.metaKey) { openTodoModal(); e.preventDefault(); }
    if (e.key === 'Escape') {
      closeDetailPanel();
      closeTodoModal();
      closePostModal();
      closeReminderSettings();
    }
  });
}

async function updateAutoLaunchBtn() {
  const enabled = await window.calendarAPI.getAutoLaunch();
  const btn = document.getElementById('auto-launch-btn');
  if (!btn) return;
  btn.classList.toggle('toggle-active', enabled);
  btn.textContent = enabled ? '✓ 开机自启已开启' : '开机自启';
}

// --- Init ---

document.addEventListener('DOMContentLoaded', async () => {
  loadTheme();
  const today = new Date();
  currentYear = today.getFullYear();
  currentMonth = today.getMonth();
  await Promise.all([loadAllData(), loadHolidays(), loadTodos(), loadReminders(), loadReminderRecords()]);
  renderCalendar();
  setupEventListeners();
  scheduleReminderNotifications();
  scheduleTodoReminders();

  // Init social (Supabase)
  if (typeof initSocial === 'function') initSocial();

  // Listen for reminder confirmations from Electron main process
  if (window.calendarAPI.onReminderConfirmed) {
    window.calendarAPI.onReminderConfirmed(async (data) => {
      if (!allReminderRecords[data.date]) allReminderRecords[data.date] = {};
      allReminderRecords[data.date][data.reminderId] = { confirmed: true, at: new Date().toISOString() };
      if (currentView === 'clockin') renderClockinView();
      renderCalendar();
      showToast('打卡成功 ✓');
    });
  }

  // Hide auto-launch on mobile (not applicable)
  if (window.Capacitor || !navigator.userAgent.includes('Electron')) {
    const autoBtn = document.getElementById('auto-launch-btn');
    if (autoBtn) autoBtn.parentElement.style.display = 'none';
  }
});
