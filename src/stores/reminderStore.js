import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useReminderStore = defineStore('reminder', () => {
  // v3.17.40 去 window 镜像：初始为空，数据由 loadReminders()/loadRecords() 经原生桥加载；
  // window.allReminders / window.allReminderRecords 仅作过渡期发布（经典层消费）。
  const reminders = ref([])
  const reminderRecords = ref({})
  const waterCount = ref(0)

  const todayStr = computed(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  const todayRecords = computed(() => reminderRecords.value[todayStr.value] || {})

  function getRecordsByDate(dateStr) {
    return reminderRecords.value[dateStr] || {}
  }

  // 过渡期兼容桥：经典层（renderer.js 通知确认回调等）会直接写 window 镜像后调用本函数，
  // 此处按旧约定采纳其值。待阶段 4 经典层下线后整体移除。
  function refreshFromWindow() {
    if (Array.isArray(window.allReminders)) reminders.value = window.allReminders
    if (window.allReminderRecords && typeof window.allReminderRecords === 'object') {
      reminderRecords.value = window.allReminderRecords
    }
  }

  function refreshReminderList() {
    if (Array.isArray(window.allReminders)) reminders.value = window.allReminders
  }

  function refreshReminderHistory() {
    if (window.allReminderRecords && typeof window.allReminderRecords === 'object') {
      reminderRecords.value = window.allReminderRecords
    }
  }

  async function loadReminders() {
    if (window.calendarAPI?.getReminders) {
      reminders.value = await window.calendarAPI.getReminders()
      window.allReminders = reminders.value
    }
  }

  async function loadRecords() {
    if (window.calendarAPI?.getAllReminderRecords) {
      reminderRecords.value = await window.calendarAPI.getAllReminderRecords()
      window.allReminderRecords = reminderRecords.value
    }
  }

  async function confirmReminder(dateStr, reminderId) {
    if (window.calendarAPI?.confirmReminder) {
      await window.calendarAPI.confirmReminder(dateStr, reminderId)
    }
    if (!reminderRecords.value[dateStr]) {
      reminderRecords.value[dateStr] = {}
    }
    reminderRecords.value[dateStr][reminderId] = { confirmed: true, at: new Date().toISOString() }
    // Sync back to window for old JS
    if (!window.allReminderRecords[dateStr]) window.allReminderRecords[dateStr] = {}
    window.allReminderRecords[dateStr][reminderId] = reminderRecords.value[dateStr][reminderId]
    window.__refreshCalendarGrid?.()
  }

  function getWaterCount(dateStr) {
    try {
      const records = window.__storage.get('water-records')
      if (records) return records[dateStr] || 0
    } catch { /* ignore */ }
    return 0
  }

  function setWaterCount(dateStr, count) {
    let records = {}
    try {
      const existing = window.__storage.get('water-records')
      if (existing) records = existing
    } catch { /* ignore */ }
    records[dateStr] = Math.max(0, count)
    const keys = Object.keys(records).sort()
    while (keys.length > 30) { delete records[keys.shift()] }
    window.__storage.set('water-records', records)
    waterCount.value = count
  }

  // Backward compat: refresh callbacks for old JS
  if (!window.__refreshReminderList) {
    window.__refreshReminderList = refreshReminderList
  }
  if (!window.__refreshReminderHistory) {
    window.__refreshReminderHistory = refreshReminderHistory
  }

  return {
    reminders,
    reminderRecords,
    waterCount,
    todayStr,
    todayRecords,
    getRecordsByDate,
    refreshFromWindow,
    loadReminders,
    loadRecords,
    confirmReminder,
    getWaterCount,
    setWaterCount,
  }
})
