# v3.10.0: Calendar 日历格子 + 头部导航迁移为 Vue 组件

**Goal:** 将 calendar.js 的日历格子渲染 + 头部导航迁移到 Vue，走 `__vueActivate` 路由

**Architecture:** 单个 `CalendarView.vue` 页面组件，通过 `#app` 路由显示。替换 `#calendar-view` 全部内容。

### Task 1: 创建 CalendarView.vue

- [ ] **Step 1: 新建 `src/pages/CalendarView.vue`**

```vue
<script setup>
import { ref, computed, onMounted } from 'vue'

const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth())
const selectedDate = ref(null)

const DAYS_CN = ['日', '一', '二', '三', '四', '五', '六']

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

const prevMonth = computed(() => currentMonth.value === 0 ? 11 : currentMonth.value - 1)
const prevYear = computed(() => currentMonth.value === 0 ? currentYear.value - 1 : currentYear.value)
const nextMonth = computed(() => currentMonth.value === 11 ? 0 : currentMonth.value + 1)
const nextYear = computed(() => currentMonth.value === 11 ? currentYear.value + 1 : currentYear.value)

const prevDaysInMonth = computed(() => new Date(prevYear.value, prevMonth.value + 1, 0).getDate())

const calendarDays = computed(() => {
  const days = []
  // Previous month overflow
  for (let i = firstDay.value - 1; i >= 0; i--) {
    const day = prevDaysInMonth.value - i
    const ds = `${prevYear.value}-${String(prevMonth.value+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    days.push({ day, dateStr: ds, isOther: true })
  }
  // Current month
  for (let day = 1; day <= daysInMonth.value; day++) {
    const ds = `${currentYear.value}-${String(currentMonth.value+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    days.push({ day, dateStr: ds, isOther: false })
  }
  // Next month to fill last row
  const remaining = days.length % 7 === 0 ? 0 : 7 - (days.length % 7)
  for (let day = 1; day <= remaining; day++) {
    const ds = `${nextYear.value}-${String(nextMonth.value+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    days.push({ day, dateStr: ds, isOther: true })
  }
  return days
})

function getDayData(dateStr) { return window.allData?.[dateStr] || { status: null, note: '', tags: [], color: '' } }
function getHolidayInfo(dateStr) {
  if (!window.holidayData) return null
  if (window.holidayData.HOLIDAYS?.[dateStr]) return window.holidayData.HOLIDAYS[dateStr]
  const mmdd = dateStr.slice(5)
  if (window.holidayData.FIXED_HOLIDAYS?.[mmdd]) return { name: window.holidayData.FIXED_HOLIDAYS[mmdd], type: 'fixed' }
  return null
}
function getLunar(yr, mo, dy) {
  if (!window.Lunar) return { text: '', isFirstDay: false }
  return window.Lunar.solar2lunar(yr, mo - 1, dy)
}
function getTodosForDate(dateStr) {
  if (!window.allTodos) return []
  const d = new Date(dateStr + 'T00:00:00')
  const wd = d.getDay()
  return window.allTodos.filter(t => {
    if (t.type === 'once') return t.date === dateStr
    if (t.type === 'weekly') return (t.weekdays || []).includes(wd)
    return false
  })
}
function getClockinStatus(dateStr) {
  const enabled = (window.allReminders || []).filter(r => r.enabled)
  if (enabled.length === 0) return null
  const records = window.allReminderRecords?.[dateStr] || {}
  const confirmed = enabled.filter(r => records[r.id] && records[r.id].confirmed)
  if (confirmed.length === 0) return null
  return { confirmed: confirmed.length, total: enabled.length }
}
function getUndoneCount(dateStr) {
  return getTodosForDate(dateStr).filter(t => {
    if (t.type === 'once') return !t.done
    return !(t.weeklyDone?.[dateStr])
  }).length
}

const STATUS_CHARS = { work: '班', rest: '休', trip: '差', leave: '假', annual: '年', sick: '病', personal: '事' }

function selectDate(dateStr, isOther) {
  if (isOther) {
    const parts = dateStr.split('-')
    currentYear.value = parseInt(parts[0])
    currentMonth.value = parseInt(parts[1]) - 1
    selectedDate.value = null
    return
  }
  selectedDate.value = selectedDate.value === dateStr ? null : dateStr
  window.__vueDetailPanel?.(dateStr)
}

function prevMonthClick() {
  if (currentMonth.value === 0) { currentMonth.value = 11; currentYear.value-- }
  else currentMonth.value--
  selectedDate.value = null
}

function nextMonthClick() {
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
</script>

<template>
  <div class="calendar-view">
    <div class="calendar-header">
      <button class="nav-btn" @click="prevMonthClick">&lt;</button>
      <div class="month-label-group">
        <span class="month-label">{{ currentYear }}年{{ currentMonth + 1 }}月</span>
        <span class="month-lunar-label">{{ lunarInfo.ganZhi }}{{ lunarInfo.animal }}年 {{ lunarInfo.monthName }}</span>
      </div>
      <button class="nav-btn" @click="nextMonthClick">&gt;</button>
      <button class="today-btn" @click="goToday">今天</button>
    </div>
    <div class="weekday-row">
      <span v-for="d in DAYS_CN" :key="d">{{ d }}</span>
    </div>
    <div class="calendar-grid">
      <div v-for="(cd, idx) in calendarDays" :key="idx" class="day-cell"
        :class="{ 'other-month': cd.isOther, today: cd.dateStr === todayStr, selected: cd.dateStr === selectedDate }"
        :style="getDayData(cd.dateStr).color ? { background: getDayData(cd.dateStr).color } : {}"
        :data-date="cd.dateStr"
        @click="selectDate(cd.dateStr, cd.isOther)">
        <span class="day-num">{{ cd.day }}</span>
        <span class="lunar-label" :class="{ 'lunar-month': getLunar(currentYear, currentMonth + 1, cd.day).isFirstDay }">
          {{ getLunar(currentYear, currentMonth + 1, cd.day).text }}
        </span>
        <span v-if="getDayData(cd.dateStr).status && !cd.isOther" class="status-label">{{ STATUS_CHARS[getDayData(cd.dateStr).status] }}</span>
        <span v-if="getTodosForDate(cd.dateStr).length > 0 && !cd.isOther" class="todo-count">{{ getUndoneCount(cd.dateStr) || '' }}</span>
        <span v-if="getHolidayInfo(cd.dateStr) && !cd.isOther" class="holiday-label"
          :class="{ 'is-holiday-day': getHolidayInfo(cd.dateStr).type === 'holiday', 'is-workday-day': getHolidayInfo(cd.dateStr).type === 'workday' }">
          {{ getHolidayInfo(cd.dateStr).name }}
        </span>
      </div>
    </div>
    <div id="detail-panel" class="detail-panel" :class="{ open: selectedDate }">
      <div id="detail-panel-vue"></div>
      <div class="todo-section">
        <div class="todo-header-row">
          <span class="todo-title">待办</span>
          <button class="todo-add-btn" @click="window.__openTodoModal?.()">+ 添加待办</button>
        </div>
        <div id="todo-list-vue" class="todo-list"></div>
      </div>
    </div>
  </div>
</template>
```

### Task 2: 修改 App.vue 添加 calendar 路由

### Task 3: 修改 renderer.js 路由到 Vue

### Task 4: 清理 calendar.js 剩余代码

### Task 5: 版本发布