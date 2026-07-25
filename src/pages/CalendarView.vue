<script setup>
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useCalendarStore } from '../stores/calendarStore.js'
import { useTodoStore } from '../stores/todoStore.js'
import { useReminderStore } from '../stores/reminderStore.js'
import { useAppStore } from '../stores/appStore.js'
import DetailPanel from '../components/DetailPanel.vue'
import { dailyLine } from '../data/poetry'
import { Lunar } from '../lunar.js'
import { useSwipe } from '../composables/useSwipe.js'
import { useLongPress } from '../composables/useLongPress.js'
import ActionSheet from '../components/ActionSheet.vue'

const calendarStore = useCalendarStore()
const todoStore = useTodoStore()
const reminderStore = useReminderStore()
const appStore = useAppStore()

// ── 触控手势：月滑动切换 + 长按快捷标记 ──
const swipeZone = ref(null)
const pendingDate = ref(null)
const suppressClick = ref(false)
const daySheetOpen = ref(false)
const daySheetDate = ref(null)

const { dx: gridDx, swiping: gridSwiping } = useSwipe(swipeZone, {
  direction: 'horizontal',
  threshold: 56,
  onLeft: () => nextMonth(),
  onRight: () => prevMonth(),
})

const gridStyle = computed(() =>
  gridSwiping.value
    ? { transform: `translateX(${gridDx.value * 0.32}px)`, transition: 'none' }
    : { transform: 'translateX(0)', transition: 'transform 0.25s ease' }
)

const { clear: clearLongPress } = useLongPress(swipeZone, {
  delay: 420,
  onStart: (e) => {
    suppressClick.value = false
    const cell = e.target && e.target.closest ? e.target.closest('.day-cell') : null
    pendingDate.value = cell ? cell.dataset.date : null
    if (!pendingDate.value) clearLongPress()
  },
  onLongPress: () => {
    if (!pendingDate.value) return
    suppressClick.value = true
    daySheetDate.value = pendingDate.value
    daySheetOpen.value = true
  },
})

const DAY_ACTIONS = [
  { label: '上班', value: 'work' },
  { label: '休息', value: 'rest' },
  { label: '出差', value: 'trip' },
  { label: '请假', value: 'leave' },
  { label: '年假', value: 'annual' },
  { label: '病假', value: 'sick' },
  { label: '事假', value: 'personal' },
  { label: '清除标记', value: '', danger: true },
]

async function onDayAction(action) {
  const ds = daySheetDate.value
  if (!ds) return
  const d = calendarStore.getDayData(ds)
  await calendarStore.saveDayData(ds, action.value || '', d.note || '', d.tags || [], d.color || '')
  window.renderCalendar?.()
  window.__refreshCalendarGrid?.()
  daySheetOpen.value = false
}

const dailyPoetic = ref(dailyLine())

const refreshCount = ref(0)
// 使用 store 的导航状态而非组件本地 ref（Pinia 单例，跨页面切换保留）：
// 1) 修复切页后日历重置回当月、丢失选中日期（#12）
// 2) store 的 watch 会把这些值同步到 window.*，且 TodoModal 读
//    calendarStore.selectedDate 作为默认日期（修复 #4 从日历添加待办日期为空）。
const { currentYear, currentMonth, selectedDate } = storeToRefs(calendarStore)

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
  if (!Lunar) return { ganZhi: '', animal: '', monthName: '' }
  return Lunar.getMonthLunarInfo(currentYear.value, currentMonth.value)
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
  if (!Lunar) return { text: '', isFirstDay: false }
  return Lunar.solar2lunar(yr, mo - 1, dy)
}
// 补位格（前/后月）必须用 dateStr 的真实年月日算农历，
// 原先统一传当前年月，导致 6 月 30 日格显示 7 月 30 日农历、31 日落入 30 天月时进位错误。
function lunarForCell(cd) {
  const [y, m, d] = cd.dateStr.split('-')
  return lunar(+y, +m, +d)
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

// 忙闲密度：综合 待办/备注/标签/打卡 估算当日“繁忙度”，用于月历热力叠色。
function busyScore(dateStr) {
  let s = 0
  const d = dayData(dateStr)
  if (d.note) s += 1
  if (d.tags && d.tags.length) s += d.tags.length * 0.5
  if (d.status) s += 0.5
  s += todosForDate(dateStr).length
  if (hasClockin(dateStr)) s += 1
  return s
}
function busyLevel(dateStr) {
  const s = busyScore(dateStr)
  if (s <= 0) return 0
  if (s <= 1.5) return 1
  if (s <= 3.5) return 2
  if (s <= 6) return 3
  return 4
}

const STATUS_CHARS = { work: '班', rest: '休', trip: '差', leave: '假', annual: '年', sick: '病', personal: '事' }

// 状态淡底色映射（用户未自定义 color 时，按状态给日格极淡背景辅助辨识）
const STATUS_BG_MAP = {
  work: 'rgba(76,175,80,0.10)',
  rest: 'rgba(66,165,245,0.10)',
  trip: 'rgba(255,152,0,0.10)',
  leave: 'rgba(156,39,176,0.08)',
  annual: 'rgba(0,188,212,0.08)',
  sick: 'rgba(245,124,0,0.08)',
  personal: 'rgba(141,110,99,0.08)',
}

function statusBg(dateStr) {
  const d = dayData(dateStr)
  if (!d.status) return {}
  return { background: STATUS_BG_MAP[d.status] || '' }
}

function selectDate(dateStr, isOther) {
  if (suppressClick.value) { suppressClick.value = false; return }
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
    <div class="calendar-swipe" ref="swipeZone">
    <div class="calendar-header">
      <button class="nav-btn" @click="prevMonth">&lt;</button>
      <div class="month-label-group">
        <span class="month-label">{{ currentYear }}年{{ currentMonth + 1 }}月</span>
        <span v-if="lunarInfo.ganZhi" class="month-lunar-label">{{ lunarInfo.ganZhi }}{{ lunarInfo.animal }}年 {{ lunarInfo.monthName }}</span>
      </div>
      <button class="nav-btn" @click="nextMonth">&gt;</button>
      <button class="today-btn" @click="goToday">今天</button>
    </div>

    <div class="daily-poetic">{{ dailyPoetic }}</div>

    <div class="weekday-row">
      <span v-for="d in DAYS_CN" :key="d">{{ d }}</span>
    </div>

    <div class="calendar-grid" :style="gridStyle">
      <div v-for="(cd, idx) in calendarDays" :key="idx"
        class="day-cell" data-tilt data-tilt-max="5" data-tilt-lift="0" :class="{ 'other-month': cd.isOther, today: cd.dateStr === todayStr, selected: cd.dateStr === selectedDate, 'has-note': dayData(cd.dateStr).note, 'has-tag': dayData(cd.dateStr).tags?.length > 0, 'has-todo': todosForDate(cd.dateStr).length > 0, 'is-past': !cd.isOther && cd.dateStr < todayStr }"
        :style="dayData(cd.dateStr).color ? { background: dayData(cd.dateStr).color } : statusBg(cd.dateStr)"
        :data-date="cd.dateStr" :data-status="dayData(cd.dateStr).status" :data-busy="cd.isOther ? 0 : busyLevel(cd.dateStr)" @click="selectDate(cd.dateStr, cd.isOther)">
        <div class="busy-heat" aria-hidden="true"></div>
        <span class="day-num">{{ cd.day }}</span>
        <span class="lunar-label" :class="{ 'lunar-month': lunar(currentYear, currentMonth + 1, cd.day).isFirstDay }">{{ lunar(currentYear, currentMonth + 1, cd.day).text }}</span>
        <span v-if="dayData(cd.dateStr).status && !cd.isOther" class="status-label">{{ STATUS_CHARS[dayData(cd.dateStr).status] }}</span>
        <span v-if="todosForDate(cd.dateStr).length > 0 && !cd.isOther" class="todo-count">{{ undoneCount(cd.dateStr) || '' }}</span>
        <span v-if="holidayInfo(cd.dateStr) && !cd.isOther" class="holiday-label" :class="{ 'is-holiday-day': holidayInfo(cd.dateStr).type === 'holiday', 'is-workday-day': holidayInfo(cd.dateStr).type === 'workday' }">{{ holidayInfo(cd.dateStr).name }}</span>
        <div v-if="hasClockin(cd.dateStr) && !cd.isOther" class="clockin-dot"></div>
      </div>
    </div>

    <div class="busy-legend" aria-label="忙闲色阶说明">
      <span class="busy-legend-label">忙闲</span>
      <span class="busy-legend-scale" aria-hidden="true">
        <i class="busy-legend-cell" data-busy="1"></i>
        <i class="busy-legend-cell" data-busy="2"></i>
        <i class="busy-legend-cell" data-busy="3"></i>
        <i class="busy-legend-cell" data-busy="4"></i>
      </span>
      <span class="busy-legend-text">色越深越忙</span>
    </div>
    </div><!-- /calendar-swipe -->

    <div style="flex:1;overflow-y:auto;overflow-x:hidden;">
      <DetailPanel :selectedDate="selectedDate" />
    </div>

    <ActionSheet
      :open="daySheetOpen"
      title="快速标记"
      :actions="DAY_ACTIONS"
      @select="onDayAction"
      @update:open="v => daySheetOpen = v"
    />
  </div>
</template>
