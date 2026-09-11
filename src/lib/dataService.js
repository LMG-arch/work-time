/**
 * dataService.js — Vue 侧单一数据刷新入口（v3.17.41 重构阶段 4 起点）
 *
 * 职责：从原生桥（window.calendarAPI）重新拉取全部数据 → 写入各 Pinia store
 *      → 触发纯重渲染钩子 → 发布 window 镜像（过渡期供尚未下线的经典层消费，阶段 4 末移除）。
 *
 * 设计要点：
 * - 数据"刷新"是显式动作：同步/下载/导入/恢复后调用本模块；日历网格的
 *   __refreshCalendarGrid 只做重渲染，不再隐式读 window.allData。
 * - 本模块是 Vue 层唯一的 window.calendarAPI 编排点（组件不再直接拼装多次请求）。
 */
import { useCalendarStore } from '../stores/calendarStore.js'
import { useTodoStore } from '../stores/todoStore.js'
import { useReminderStore } from '../stores/reminderStore.js'

/** 拉取节假日/农历数据（过渡期同时发布 window.holidayData） */
export async function loadHolidays() {
  if (!window.calendarAPI?.getHolidays) return null
  const holidays = await window.calendarAPI.getHolidays()
  window.holidayData = holidays
  return holidays
}

/** 全量刷新：数据 → store，再触发各视图纯重渲染钩子 */
export async function refreshAllData() {
  const calendar = useCalendarStore()
  const todo = useTodoStore()
  const reminder = useReminderStore()

  await calendar.loadData()
  await todo.loadTodos()
  await reminder.loadReminders()
  await reminder.loadRecords()
  await loadHolidays()

  // 纯重渲染（不再附带数据请求）
  window.__refreshCalendarGrid?.()
  window.__refreshReminderList?.()
  window.__refreshReminderHistory?.()
  window.__refreshTodoView?.()
  window.__refreshStats?.()
  try { window.__lifeRefreshArchive?.() } catch (e) { /* 生活工作台未挂载时忽略 */ }
}

/** 仅刷新上班数据（日历/待办/打卡），用于保存后按需增量刷新 */
export async function refreshCalendarData() {
  const calendar = useCalendarStore()
  await calendar.loadData()
  window.__refreshCalendarGrid?.()
}

// 诊断出口（与项目既有 window.__* 约定一致）：控制台可执行
//   await __dataService.refreshAllData()  手动全量刷新，便于排查"同步后不刷新"类问题
if (typeof window !== 'undefined') {
  window.__dataService = { refreshAllData, refreshCalendarData, loadHolidays }
}
