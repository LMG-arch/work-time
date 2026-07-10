<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCalendarStore } from '../stores/calendarStore.js'
import { useTodoStore } from '../stores/todoStore.js'
import { useReminderStore } from '../stores/reminderStore.js'
import { useAppStore } from '../stores/appStore.js'
import DetailPanel from '../components/DetailPanel.vue'

const calendarStore = useCalendarStore()
const todoStore = useTodoStore()
const reminderStore = useReminderStore()
const appStore = useAppStore()

const refreshCount = ref(0)
const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth())
const selectedDate = ref(null)

window.__refreshCalendarGrid = () => { refreshCount.value++ }
window.__calendarGoToday = goToday
window.__calendarPrevMonth = prevMonth
window.__calendarNextMonth = nextMonth

window.__calendarSyncDate = (year, month, selected) => {
  if (year !== undefined) currentYear.value = year
  if (month !== undefined) currentMonth.value = month
  if (selected !== undefined) selectedDate.value = selected
  refreshCount.value++
}

const DAYS_CN = ['一', '二', '三', '四', '五', '六', '日']

const todayStr = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
})

const lunarInfo = computed(() => {
  if (!window.Lunar) return { ganZhi: '', animal: '', monthName: '' }
  return window.Lunar.getMonthLunarInfo(currentYear.value, currentMonth.value)
})

const daysInMonth = computed(() => new Date(currentYear.value, currentMonth.value + 1, 0).getDate())
const firstDay = computed(() => {
  const d = new Date(currentYear.value, currentMonth.value, 1)
  const day = d.getDay()
  return day === 0 ? 6 : day - 1
})

const prevMonthVal = computed(() => currentMonth.value === 0 ? 11 : currentMonth.value - 1)
const prevYearVal = computed(() => currentMonth.value === 0 ? currentYear.value - 1 : currentYear.value)
const nextMonthVal = computed(() => currentMonth.value === 11 ? 0 : currentMonth.value + 1)
const nextYearVal = computed(() => currentMonth.value === 11 ? currentYear.value + 1 : currentYear.value)

const prevDaysInMonth = computed(() => new Date(prevYearVal.value, prevMonthVal.value + 1, 0).getDate())

const calendarDays = computed(() => {
  const days = []
  refreshCount.value
  for (let i = firstDay.value - 1; i >= 0; i--) {
    const day = prevDaysInMonth.value - i
    const ds = `${prevYearVal.value}-${String(prevMonthVal.value+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    days.push({ day, dateStr: ds, isOther: true })
  }
  for (let day = 1; day <= daysInMonth.value; day++) {
    const ds = `${currentYear.value}-${String(currentMonth.value+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    days.push({ day, dateStr: ds, isOther: false })
  }
  const remaining = days.length % 7 === 0 ? 0 : 7 - (days.length % 7)
  for (let day = 1; day <= remaining; day++) {
    const ds = `${nextYearVal.value}-${String(nextMonthVal.value+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    days.push({ day, dateStr: ds, isOther: true })
  }
  return days
})

function dayData(dateStr) { return calendarStore.getDayData(dateStr) }
function holidayInfo(dateStr) {
  if (!window.holidayData) return null
  if (window.holidayData.HOLIDAYS?.[dateStr]) return window.holidayData.HOLIDAYS[dateStr]
  const mmdd = dateStr.slice(5)
  if (window.holidayData.FIXED_HOLIDAYS?.[mmdd]) return { name: window.holidayData.FIXED_HOLIDAYS[mmdd], type: 'fixed' }
  return null
}
function lunar(yr, mo, dy) {
  if (!window.Lunar) return { text: '', isFirstDay: false }
  return window.Lunar.solar2lunar(yr, mo - 1, dy)
}
function todosForDate(dateStr) {
  if (!todoStore.todos) return []
  const d = new Date(dateStr + 'T00:00:00')
  const wd = d.getDay()
  return todoStore.todos.filter(t => {
    if (t.type === 'once') return t.date === dateStr
    if (t.type === 'weekly') return (t.weekdays || []).includes(wd)
    return false
  })
}
function undoneCount(dateStr) {
  return todosForDate(dateStr).filter(t => {
    if (t.type === 'once') return !t.done
    return !(t.weeklyDone?.[dateStr])
  }).length
}
function clockinStatus(dateStr) {
  const enabled = (reminderStore.reminders || []).filter(r => r.enabled)
  if (enabled.length === 0) return null
  const records = reminderStore.getRecordsByDate(dateStr)
  const confirmed = enabled.filter(r => records[r.id] && records[r.id].confirmed)
  return confirmed.length > 0 ? { confirmed: confirmed.length, total: enabled.length } : null
}
function hasClockin(dateStr) { return !!clockinStatus(dateStr) }

const STATUS_CHARS = { work: '班', rest: '休', trip: '差', leave: '假', annual: '年', sick: '病', personal: '事' }

function selectDate(dateStr, isOther) {
  if (isOther) {
    const p = dateStr.split('-')
    currentYear.value = parseInt(p[0])
    currentMonth.value = parseInt(p[1]) - 1
    selectedDate.value = null
    return
  }
  if (selectedDate.value === dateStr) {
    selectedDate.value = null
    return
  }
  selectedDate.value = dateStr
  window.__vueDetailPanel?.(dateStr)
}

function prevMonth() {
  if (currentMonth.value === 0) { currentMonth.value = 11; currentYear.value-- }
  else currentMonth.value--
  selectedDate.value = null
}
function nextMonth() {
  if (currentMonth.value === 11) { currentMonth.value = 0; currentYear.value++ }
  else currentMonth.value++
  selectedDate.value = null
}
function goToday() {
  const d = new Date()
  currentYear.value = d.getFullYear()
  currentMonth.value = d.getMonth()
  selectedDate.value = null
}

// 挂载时从持久层加载数据到 Pinia store。
// 若不加载，daysData 初始为 {}，日历网格只会渲染日期、不渲染用户数据（状态/备注/标签/待办角标全部空白）。
onMounted(async () => {
  try {
    await calendarStore.loadData()
    await todoStore.loadTodos()
    await reminderStore.loadReminders()
    await reminderStore.loadRecords()
  } catch (e) {
    console.error('[CalendarView] 初始数据加载失败:', e.message)
  }
})
</script>

<template>
  <div class="calendar-view" style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
    <div class="calendar-header">
      <button class="nav-btn" @click="prevMonth">&lt;</button>
      <div class="month-label-group">
        <span class="month-label">{{ currentYear }}年{{ currentMonth + 1 }}月</span>
        <span v-if="lunarInfo.ganZhi" class="month-lunar-label">{{ lunarInfo.ganZhi }}{{ lunarInfo.animal }}年 {{ lunarInfo.monthName }}</span>
      </div>
      <button class="nav-btn" @click="nextMonth">&gt;</button>
      <button class="today-btn" @click="goToday">今天</button>
    </div>

    <div class="weekday-row">
      <span v-for="d in DAYS_CN" :key="d">{{ d }}</span>
    </div>

    <div class="calendar-grid" style="flex-shrink:0;">
      <div v-for="(cd, idx) in calendarDays" :key="idx"
        class="day-cell" :class="{ 'other-month': cd.isOther, today: cd.dateStr === todayStr, selected: cd.dateStr === selectedDate, 'has-note': dayData(cd.dateStr).note, 'has-tag': dayData(cd.dateStr).tags?.length > 0, 'has-todo': todosForDate(cd.dateStr).length > 0 }"
        :style="dayData(cd.dateStr).color ? { background: dayData(cd.dateStr).color } : {}"
        :data-date="cd.dateStr" @click="selectDate(cd.dateStr, cd.isOther)">
        <span class="day-num">{{ cd.day }}</span>
        <span class="lunar-label" :class="{ 'lunar-month': lunar(currentYear, currentMonth + 1, cd.day).isFirstDay }">{{ lunar(currentYear, currentMonth + 1, cd.day).text }}</span>
        <span v-if="dayData(cd.dateStr).status && !cd.isOther" class="status-label">{{ STATUS_CHARS[dayData(cd.dateStr).status] }}</span>
        <span v-if="todosForDate(cd.dateStr).length > 0 && !cd.isOther" class="todo-count">{{ undoneCount(cd.dateStr) || '' }}</span>
        <span v-if="holidayInfo(cd.dateStr) && !cd.isOther" class="holiday-label" :class="{ 'is-holiday-day': holidayInfo(cd.dateStr).type === 'holiday', 'is-workday-day': holidayInfo(cd.dateStr).type === 'workday' }">{{ holidayInfo(cd.dateStr).name }}</span>
        <div v-if="hasClockin(cd.dateStr) && !cd.isOther" class="clockin-dot"></div>
      </div>
    </div>

    <div style="flex:1;overflow-y:auto;overflow-x:hidden;">
      <DetailPanel :selectedDate="selectedDate" />
    </div>
  </div>
</template>
