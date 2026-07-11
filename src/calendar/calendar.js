// calendar.js — Calendar grid, day details, navigation
// Uses globals from utils.js: escapeHtml, escapeAttr, dateToStr, getDaysInMonth, getFirstDayOfWeek, formatDateCN, getTodayStr, showToast, WEEKDAYS_CN, STATUS_LABELS, STATUS_CHARS
// Uses globals from renderer.js / window.*: currentYear, currentMonth, selectedDate, allData, allTodos, holidayData, currentView, renderClockinView, getTodosForDate, isTodoDone, getClockinStatusForDate, renderTodoList

function updateMonthLabel() {
  const lunar = Lunar.getMonthLunarInfo(currentYear, currentMonth);
  document.getElementById('month-label').textContent = `${currentYear}年${currentMonth + 1}月`;
  document.getElementById('month-lunar-label').textContent = `${lunar.ganZhi}${lunar.animal}年 ${lunar.monthName}`;
}

function getDayData(dateStr) {
  return allData[dateStr] || { status: null, note: '', tags: [], color: '' };
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

// --- Data ---

async function loadAllData() {
  allData = await window.calendarAPI.getAllData();
  window.allData = allData;
}

async function loadHolidays() {
  holidayData = await window.calendarAPI.getHolidays();
  window.holidayData = holidayData;
}

async function saveDay(date, status, note, tags, color) {
  await window.calendarAPI.saveDay(date, status, note, tags, color);
  if (!status && !note && (!tags || tags.length === 0) && !color) {
    // 保留 tombstone 标记，确保同步时能检测到删除
    allData[date] = { status: null, note: '', tags: [], color: '', deleted: true, updatedAt: new Date().toISOString() };
  } else {
    allData[date] = { status, note, tags: tags || [], color: color || '' };
  }
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

// --- Month change ---

async function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  syncToWindow();
  closeDetailPanel();
  await loadAllData();
  if (currentView === 'calendar') {
    renderCalendar();
    window.__refreshCalendarGrid?.();
  }
  else if (currentView === 'clockin') renderClockinView();
  // social/settings: only update label, don't re-render
  updateMonthLabel();
}

// ===== ESM 导出：供 shims.js 挂回 window.* =====
export {
  updateMonthLabel,
  getDayData,
  getHolidayInfo,
  renderCalendar,
  createDayCell,
  onDayClick,
  openDetailPanel,
  closeDetailPanel,
  loadAllData,
  loadHolidays,
  saveDay,
  saveCurrentDay,
  changeMonth
};
