import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useCalendarStore = defineStore('calendar', () => {
  const currentYear = ref(new Date().getFullYear())
  const currentMonth = ref(new Date().getMonth())
  const selectedDate = ref(null)
  
  // 核心数据源：原 window.allData
  const daysData = ref({})

  // 初始化或重新加载所有数据
  async function loadData() {
    if (window.calendarAPI) {
      daysData.value = await window.calendarAPI.getAllData()
      window.allData = daysData.value
    }
  }

  async function loadTodos() {
    if (window.calendarAPI?.getTodos) {
      window.allTodos = await window.calendarAPI.getTodos()
    }
  }

  async function loadReminders() {
    if (window.calendarAPI?.getReminders) {
      window.allReminders = await window.calendarAPI.getReminders()
    }
  }

  async function refreshAll() {
    await loadData()
    await loadTodos()
    await loadReminders()
    if (window.calendarAPI?.getAllReminderRecords) {
      window.allReminderRecords = await window.calendarAPI.getAllReminderRecords()
    }
    window.__refreshCalendarGrid?.()
    window.__refreshReminderList?.()
    window.__refreshReminderHistory?.()
    window.__refreshTodoView?.()
  }

  // 获取特定日期的数据
  function getDayData(dateStr) {
    return daysData.value[dateStr] || { status: null, note: '', tags: [], color: '' }
  }

  // 保存数据并同步到 IPC
  async function saveDayData(dateStr, status, note, tags, color) {
    if (!dateStr) return

    // 1. 调用持久化 API
    if (window.calendarAPI) {
      await window.calendarAPI.saveDay(dateStr, status, note, tags, color)
    }

    // 2. 更新本地状态 (保持与 main.js 相同的墓碑逻辑以应对UI即时响应)
    if (!status && !note && (!tags || tags.length === 0) && !color) {
      daysData.value[dateStr] = { 
        status: null, note: '', tags: [], color: '', 
        deleted: true, updatedAt: new Date().toISOString() 
      }
    } else {
      daysData.value[dateStr] = { 
        status, note, tags: tags || [], color: color || '' 
      }
    }
  }

  // UI 导航交互
  function changeMonth(delta) {
    let newMonth = currentMonth.value + delta
    let newYear = currentYear.value

    if (newMonth < 0) {
      newMonth = 11
      newYear--
    } else if (newMonth > 11) {
      newMonth = 0
      newYear++
    }

    currentMonth.value = newMonth
    currentYear.value = newYear
    selectedDate.value = null
  }

  function goToday() {
    const today = new Date()
    currentYear.value = today.getFullYear()
    currentMonth.value = today.getMonth()
    selectedDate.value = null
  }

  function selectDate(dateStr) {
    // 切换取消选中
    if (selectedDate.value === dateStr) {
      selectedDate.value = null
    } else {
      selectedDate.value = dateStr
    }
  }

  // ── Backward compat: window.* sync ──
  if (!window.__refreshCalendarGrid) {
    window.__refreshCalendarGrid = () => {
      daysData.value = window.allData || {}
    }
  }

  // Sync Pinia → window.* so old JS can read current navigation state
  watch(currentYear, (v) => { window.currentYear = v }, { immediate: true })
  watch(currentMonth, (v) => { window.currentMonth = v }, { immediate: true })
  watch(selectedDate, (v) => { window.selectedDate = v }, { immediate: true })

  return {
    currentYear,
    currentMonth,
    selectedDate,
    daysData,
    loadData,
    loadTodos,
    loadReminders,
    refreshAll,
    getDayData,
    saveDayData,
    changeMonth,
    goToday,
    selectDate,
  }
})