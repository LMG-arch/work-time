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
  // 日历格子由 CalendarView.vue 渲染
  window.__refreshCalendarGrid?.();
}

function openDetailPanel(dateStr) {
  const panel = document.getElementById('detail-panel');
  panel.classList.add('open');
  window.__vueDetailPanel?.(dateStr);
  window.__refreshTodoList?.(dateStr);
}

function closeDetailPanel() {
  document.getElementById('detail-panel').classList.remove('open');
  selectedDate = null;
  document.querySelectorAll('.day-cell.selected').forEach(el => el.classList.remove('selected'));
}

// color picker 由 Vue ColorPicker 组件处理

// --- Month change ---

async function changeMonth(delta) {
  // 日历视图由 Vue 管理，委托给 CalendarView
  if (currentView === 'calendar') {
    if (delta < 0) window.__calendarPrevMonth?.();
    else window.__calendarNextMonth?.();
    closeDetailPanel();
    await loadAllData();
    return;
  }
  currentMonth += delta;
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  closeDetailPanel();
  await loadAllData();
  if (currentView === 'stats') renderStats();
  else if (currentView === 'clockin') renderClockinView();
  updateMonthLabel();
}
