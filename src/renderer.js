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

const THEMES = [
  { id: 'default', name: '经典', color: '#333' },
  { id: 'dark',    name: '暗黑', color: '#1a1a2e' },
  { id: 'green',   name: '清新', color: '#43A047' },
  { id: 'pink',    name: '粉色', color: '#e91e63' },
  { id: 'purple',  name: '紫色', color: '#7e57c2' },
  { id: 'navy',    name: '商务', color: '#1565c0' },
];

// --- Date helpers ---

function formatDateCN(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const weekDay = WEEKDAYS_CN[d.getDay()];
  const parts = dateStr.split('-');
  return `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日 星期${weekDay}`;
}

function dateToStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year, month) {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

function updateMonthLabel() {
  document.getElementById('month-label').textContent = `${currentYear}年${currentMonth + 1}月`;
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
    const item = document.createElement('div');
    item.className = 'todo-item' + (done ? ' done' : '');
    item.innerHTML = `
      <span class="todo-check" data-id="${todo.id}">${done ? '✓' : ''}</span>
      <span class="todo-text">${todo.text}</span>
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

function openTodoModal() {
  const modal = document.getElementById('todo-modal');
  document.getElementById('todo-text-input').value = '';
  document.getElementById('todo-date-input').value = selectedDate || '';
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.type-btn[data-type="once"]').classList.add('active');
  document.getElementById('todo-once-row').style.display = '';
  document.getElementById('todo-weekly-row').style.display = 'none';
  document.querySelectorAll('.wd-btn').forEach(b => b.classList.remove('active'));
  modal.style.display = 'flex';
}

function closeTodoModal() {
  document.getElementById('todo-modal').style.display = 'none';
}

function setupTodoModal() {
  const modal = document.getElementById('todo-modal');
  const typeBtns = document.querySelectorAll('.type-btn');
  const wdBtns = document.querySelectorAll('.wd-btn');

  typeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      typeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('todo-once-row').style.display = btn.dataset.type === 'once' ? '' : 'none';
      document.getElementById('todo-weekly-row').style.display = btn.dataset.type === 'weekly' ? '' : 'none';
    });
  });

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
      const dateVal = document.getElementById('todo-date-input').value;
      if (!dateVal) { showToast('请选择日期'); return; }
      todo.date = dateVal;
      todo.done = false;
    } else {
      const days = [];
      wdBtns.forEach(b => { if (b.classList.contains('active')) days.push(parseInt(b.dataset.wd)); });
      if (days.length === 0) { showToast('请选择重复星期'); return; }
      todo.weekdays = days;
      todo.weeklyDone = {};
    }
    const saved = await window.calendarAPI.addTodo(todo);
    allTodos.push(saved);
    closeTodoModal();
    if (selectedDate) renderTodoList(selectedDate);
    renderCalendar();
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
      html += `<div class="todo-view-item${done ? ' done' : ''}" data-id="${todo.id}">
        <span class="todo-view-check" data-id="${todo.id}">${done ? '✓' : ''}</span>
        <div class="todo-view-info">
          <span class="todo-view-text">${todo.text}</span>
          <span class="todo-view-date">${todo.date || ''}</span>
        </div>
        <span class="todo-view-del" data-id="${todo.id}">&times;</span>
      </div>`;
    }
  }

  if (weeklyTodos.length > 0) {
    html += '<div class="todo-group-title">每周重复</div>';
    const wdNames = ['日', '一', '二', '三', '四', '五', '六'];
    for (const todo of weeklyTodos) {
      const days = (todo.weekdays || []).map(d => '周' + wdNames[d]).join('、');
      html += `<div class="todo-view-item" data-id="${todo.id}">
        <div class="todo-view-info">
          <span class="todo-view-text">${todo.text}</span>
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
      if (todo && todo.type === 'once') {
        await window.calendarAPI.updateTodo(todo.id, { done: !todo.done });
        todo.done = !todo.done;
        renderTodoView();
        renderCalendar();
      }
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

function getTodayStr() {
  const today = new Date();
  return dateToStr(today.getFullYear(), today.getMonth(), today.getDate());
}

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
      <div class="reminder-time">${r.time}</div>
      <div class="reminder-info">
        <span class="reminder-label">${r.label}</span>
        <span class="reminder-status">${statusText}</span>
      </div>
      <button class="reminder-confirm-btn ${btnClass}" data-id="${r.id}" ${btnDisabled ? 'disabled' : ''}>${btnText}</button>
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
      html += `<span class="history-record ${confirmed ? 'confirmed' : 'unconfirmed'}">${r.label} ${confirmed ? '✓' : '✗'}</span>`;
    }
    html += '</div>';
    item.innerHTML = html;
    historyContainer.appendChild(item);
  }

  if (!hasRecords) {
    historyContainer.innerHTML = '<div class="empty-tip">暂无打卡记录</div>';
  }
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
      <input type="time" class="setting-time-input" value="${r.time}" data-id="${r.id}">
      <input type="text" class="setting-label-input" value="${r.label}" data-id="${r.id}" maxlength="10">
      <label class="toggle-switch">
        <input type="checkbox" ${r.enabled ? 'checked' : ''} data-id="${r.id}">
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
  if (window.Capacitor) {
    try {
      const { LocalNotifications } = window.Capacitor.Plugins;
      if (!LocalNotifications) return;

      // Request permissions
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') return;

      // Cancel all existing scheduled notifications
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel({ notifications: pending.notifications });
      }

      // Schedule notifications for the next 7 days
      const notifications = [];
      let notifId = 1;
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
            channelId: 'clockin-reminders'
          });
        }
      }

      if (notifications.length > 0) {
        await LocalNotifications.schedule({ notifications });
      }
    } catch (e) {
      console.log('Capacitor notification scheduling error:', e);
    }
    return;
  }

  // Web browser notifications
  if (!('Notification' in window)) return;

  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }

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
    label.textContent = { work: '班', rest: '休', trip: '差' }[dayData.status] || '';
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
    chip.innerHTML = `<span class="tag-text">${tag}</span><span class="tag-remove" data-tag="${tag}">&times;</span>`;
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
  document.getElementById('todo-view').style.display = view === 'todo' ? '' : 'none';
  document.getElementById('clockin-view').style.display = view === 'clockin' ? '' : 'none';
  document.getElementById('settings-view').style.display = view === 'settings' ? '' : 'none';
  document.getElementById('stats-btn').textContent = view === 'stats' ? '📊 日历' : '📊 统计';
  document.getElementById('todo-btn').textContent = view === 'todo' ? '📋 日历' : '📋 待办';
  const clockinBtn = document.getElementById('clockin-btn');
  if (clockinBtn) clockinBtn.textContent = view === 'clockin' ? '⏰ 日历' : '⏰ 打卡';
  const settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) settingsBtn.textContent = view === 'settings' ? '⚙ 日历' : '⚙ 设置';
  if (view === 'stats') renderStats();
  if (view === 'todo') renderTodoView();
  if (view === 'clockin') renderClockinView();
  if (view === 'settings') renderSettingsView();
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
      html += `<div class="tag-stat-item"><span class="tag-chip static">${tag}</span><span class="tag-stat-count">${count}次</span></div>`;
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
        ${r.tags && r.tags.length > 0 ? `<div class="record-tags">${r.tags.map(t => `<span class="tag-chip static">${t}</span>`).join('')}</div>` : ''}
        ${r.note ? `<div class="record-note">${r.note}</div>` : ''}
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

// --- Toast ---

function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.querySelector('.app').appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

// --- Month change ---

async function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  closeDetailPanel();
  await Promise.all([loadAllData(), loadTodos(), loadReminderRecords()]);
  if (currentView === 'calendar') renderCalendar();
  else if (currentView === 'stats') renderStats();
  else if (currentView === 'todo') renderTodoView();
  else renderClockinView();
}

// --- Event listeners ---

function setupEventListeners() {
  document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
  document.getElementById('next-month').addEventListener('click', () => changeMonth(1));

  document.getElementById('today-btn').addEventListener('click', async () => {
    const today = new Date();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();
    closeDetailPanel();
    await Promise.all([loadAllData(), loadTodos(), loadReminderRecords()]);
    if (currentView === 'calendar') renderCalendar();
    else if (currentView === 'stats') renderStats();
    else if (currentView === 'todo') renderTodoView();
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
          label.textContent = { work: '班', rest: '休', trip: '差' }[newStatus] || '';
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

  // Stats toggle
  document.getElementById('stats-btn').addEventListener('click', () => {
    switchView(currentView === 'calendar' ? 'stats' : 'calendar');
  });

  // Todo toggle
  document.getElementById('todo-btn').addEventListener('click', () => {
    switchView(currentView === 'calendar' ? 'todo' : 'calendar');
  });

  // Clock-in view
  document.getElementById('clockin-btn').addEventListener('click', () => {
    switchView(currentView === 'calendar' ? 'clockin' : 'calendar');
  });

  // Settings view
  document.getElementById('settings-btn').addEventListener('click', () => {
    switchView(currentView === 'calendar' ? 'settings' : 'calendar');
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
      else if (currentView === 'todo') renderTodoView();
      else if (currentView === 'clockin') renderClockinView();
      else renderSettingsView();
      showToast('导入成功');
    } else if (result.error) {
      showToast('导入失败: ' + result.error);
    }
  });

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
