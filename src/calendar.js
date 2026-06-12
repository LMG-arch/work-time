// calendar.js — Calendar grid, day details, navigation
// Uses globals from utils.js: escapeHtml, escapeAttr, dateToStr, getDaysInMonth, getFirstDayOfWeek, formatDateCN, getTodayStr, showToast, WEEKDAYS_CN, STATUS_LABELS, STATUS_CHARS
// Uses globals from renderer.js: currentYear, currentMonth, selectedDate, allData, allTodos, holidayData, currentView, renderStats, renderClockinView, getTodosForDate, isTodoDone, getClockinStatusForDate, renderTodoList

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

  // 标签自动补全
  let autocompleteEl = null;
  function getAllUsedTags() {
    const tagSet = new Set();
    for (const dateStr of Object.keys(allData)) {
      const d = allData[dateStr];
      if (d && d.tags) d.tags.forEach(t => tagSet.add(t));
    }
    return Array.from(tagSet);
  }

  function showAutocomplete(query) {
    hideAutocomplete();
    const allTags = getAllUsedTags();
    const currentTags = selectedDate ? (getDayData(selectedDate).tags || []) : [];
    const matches = allTags.filter(t =>
      t.includes(query) && !currentTags.includes(t)
    ).slice(0, 8);
    if (matches.length === 0) return;

    autocompleteEl = document.createElement('div');
    autocompleteEl.className = 'tag-autocomplete';
    for (const tag of matches) {
      const item = document.createElement('div');
      item.className = 'tag-autocomplete-item';
      item.textContent = tag;
      item.addEventListener('click', () => {
        addTag(tag);
        hideAutocomplete();
      });
      autocompleteEl.appendChild(item);
    }
    input.parentElement.style.position = 'relative';
    input.parentElement.appendChild(autocompleteEl);
  }

  function hideAutocomplete() {
    if (autocompleteEl) { autocompleteEl.remove(); autocompleteEl = null; }
  }

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
    hideAutocomplete();
  }

  input.addEventListener('input', () => {
    const val = input.value.trim();
    if (val.length > 0) showAutocomplete(val);
    else hideAutocomplete();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTag(input.value); }
    if (e.key === 'Escape') hideAutocomplete();
  });

  input.addEventListener('blur', () => {
    // Delay to allow click on autocomplete item
    setTimeout(hideAutocomplete, 200);
  });

  addBtn.addEventListener('click', () => addTag(input.value));
  document.querySelectorAll('.quick-tag').forEach(qt => {
    qt.addEventListener('click', () => addTag(qt.dataset.tag));
  });
}

// --- Data ---

async function loadAllData() {
  console.log('[loadAllData] Loading data...');
  allData = await window.calendarAPI.getAllData();
  console.log('[loadAllData] allData:', allData);
  console.log('[loadAllData] allData keys:', Object.keys(allData || {}));
  console.log('[loadAllData] allData length:', Object.keys(allData || {}).length);
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
