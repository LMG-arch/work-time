// calendar.js — 数据加载与节假日查询（v3.17.42 经典渲染层裁剪后）
//
// 渲染函数（renderCalendar/createDayCell/openDetailPanel 等）已随经典 .app 死壳
// 一并下线（v3.17.42 阶段 4）；日历 UI 由 Vue CalendarView.vue 全权负责。
// 本文件只保留仍被消费的三个函数：
//   - getHolidayInfo  ← StatsPage.vue 经 window.getHolidayInfo
//   - loadAllData     ← renderer.js 启动引导灌 window.allData 镜像
//   - loadHolidays    ← 同上，灌 window.holidayData 镜像

function getHolidayInfo(dateStr) {
  if (!holidayData) return null;
  // Full date match (specific holidays)
  if (holidayData.HOLIDAYS[dateStr]) return holidayData.HOLIDAYS[dateStr];
  // Fixed holiday match (month-day)
  const mmdd = dateStr.slice(5);
  if (holidayData.FIXED_HOLIDAYS[mmdd]) return { name: holidayData.FIXED_HOLIDAYS[mmdd], type: 'fixed' };
  return null;
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

// ===== ESM 导出：供 shims.js 挂回 window.* =====
export {
  getHolidayInfo,
  loadAllData,
  loadHolidays
};
