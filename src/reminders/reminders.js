// reminders.js — 提醒数据层（v3.17.43 S4.2 精简）
//
// 通知调度核心已迁至 src/lib/notifications.js：
//   scheduleReminderNotifications / scheduleTodoReminders / sendTestNotification / diagnoseNotifications
//   + 配额守门 safeSchedule / cancelPendingByKind / resolveExactMode / generateNotifId。
// 本文件只保留提醒数据的读取与查询（被 notifications.js 与 Vue 组件消费）。

export async function loadReminders() {
  window.allReminders = await window.calendarAPI.getReminders();
}

export async function loadReminderRecords() {
  window.allReminderRecords = await window.calendarAPI.getAllReminderRecords();
}

export function getReminderRecordsForDate(dateStr) {
  return (window.allReminderRecords || {})[dateStr] || {};
}

export function isReminderConfirmed(reminderId, dateStr) {
  const records = (window.allReminderRecords || {})[dateStr];
  return records && records[reminderId] && records[reminderId].confirmed;
}

export function getClockinStatusForDate(dateStr) {
  const enabled = (window.allReminders || []).filter(r => r && r.enabled);
  if (enabled.length === 0) return null;
  const records = (window.allReminderRecords || {})[dateStr] || {};
  const confirmed = enabled.filter(r => records[r.id] && records[r.id].confirmed);
  if (confirmed.length === 0) return null;
  return { confirmed: confirmed.length, total: enabled.length };
}
