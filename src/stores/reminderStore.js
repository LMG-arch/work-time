import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useReminderStore = defineStore('reminder', () => {
  const reminders = ref(window.allReminders || [])
  const reminderRecords = ref(window.allReminderRecords || {})
  const waterCount = ref(0)

  const todayStr = computed(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  const todayRecords = computed(() => reminderRecords.value[todayStr.value] || {})

  function getRecordsByDate(dateStr) {
    return reminderRecords.value[dateStr] || {}
  }

  function refreshFromWindow() {
    reminders.value = window.allReminders || []
    reminderRecords.value = window.allReminderRecords || {}
  }

  function refreshReminderList() {
    reminders.value = window.allReminders || []
  }

  function refreshReminderHistory() {
    reminderRecords.value = window.allReminderRecords || {}
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
      const raw = localStorage.getItem('water-records')
      if (raw) {
        const records = JSON.parse(raw)
        return records[dateStr] || 0
      }
    } catch { /* ignore */ }
    return 0
  }

  function setWaterCount(dateStr, count) {
    let records = {}
    try {
      const raw = localStorage.getItem('water-records')
      if (raw) records = JSON.parse(raw)
    } catch { /* ignore */ }
    records[dateStr] = Math.max(0, count)
    const keys = Object.keys(records).sort()
    while (keys.length > 30) { delete records[keys.shift()] }
    localStorage.setItem('water-records', JSON.stringify(records))
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
