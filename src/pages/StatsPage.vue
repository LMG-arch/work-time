<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCalendarStore } from '../stores/calendarStore.js'
import { useAppStore } from '../stores/appStore.js'
import { useTodoStore } from '../stores/todoStore.js'
import { useReminderStore } from '../stores/reminderStore.js'
import EmptyIllustration from '../components/EmptyIllustration.vue'
import StatsRing from '../components/StatsRing.vue'
import WeeklyArea from '../components/WeeklyArea.vue'

const calendarStore = useCalendarStore()
const appStore = useAppStore()
const todoStore = useTodoStore()
const reminderStore = useReminderStore()

const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth())

const refreshCount = ref(0)
window.__refreshStats = () => { refreshCount.value++ }

// 月份切换：允许查看任意历史 / 未来月份
const now = new Date()
const isCurrentMonth = computed(() =>
  currentYear.value === now.getFullYear() && currentMonth.value === now.getMonth()
)
const isFuture = computed(() =>
  currentYear.value > now.getFullYear() ||
  (currentYear.value === now.getFullYear() && currentMonth.value > now.getMonth())
)
function prevMonth() {
  let m = currentMonth.value - 1, y = currentYear.value
  if (m < 0) { m = 11; y-- }
  currentMonth.value = m; currentYear.value = y
}
function nextMonth() {
  let m = currentMonth.value + 1, y = currentYear.value
  if (m > 11) { m = 0; y++ }
  currentMonth.value = m; currentYear.value = y
}
function goCurrentMonth() {
  currentYear.value = now.getFullYear()
  currentMonth.value = now.getMonth()
}

onMounted(async () => {
  currentYear.value = window.currentYear || new Date().getFullYear()
  currentMonth.value = window.currentMonth || new Date().getMonth()
  try {
    await calendarStore.loadData()
    await todoStore.loadTodos()
    await reminderStore.loadReminders()
    await reminderStore.loadRecords()
  } catch (e) { /* ignore */ }
})

const allData = computed(() => {
  refreshCount.value
  return calendarStore.daysData
})
const daysInMonth = computed(() => {
  return new Date(currentYear.value, currentMonth.value + 1, 0).getDate()
})

const stats = computed(() => {
  let workDays = 0, restDays = 0, tripDays = 0, leaveDays = 0, annualDays = 0, sickDays = 0, personalDays = 0, holidayCount = 0, workdayCount = 0
  const dayRecords = []
  const tagCounts = {}

  for (let day = 1; day <= daysInMonth.value; day++) {
    const ds = `${currentYear.value}-${String(currentMonth.value + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const d = allData.value[ds]
    const status = d ? d.status : null
    const note = d ? (d.note || '') : ''
    const tags = d ? (d.tags || []) : []
    const holiday = window.getHolidayInfo ? window.getHolidayInfo(ds) : null

    if (status === 'work') workDays++
    else if (status === 'rest') restDays++
    else if (status === 'trip') tripDays++
    else if (status === 'leave') leaveDays++
    else if (status === 'annual') annualDays++
    else if (status === 'sick') sickDays++
    else if (status === 'personal') personalDays++
    if (holiday && holiday.type === 'holiday') holidayCount++
    if (holiday && holiday.type === 'workday') workdayCount++

    for (const t of tags) tagCounts[t] = (tagCounts[t] || 0) + 1

    if (status || note || tags.length > 0 || holiday) {
      dayRecords.push({ day, dateStr: ds, status, note, tags, holiday })
    }
  }

  const totalRecorded = workDays + restDays + tripDays + leaveDays + annualDays + sickDays + personalDays
  const noStatus = daysInMonth.value - totalRecorded

  const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])

  return { workDays, restDays, tripDays, leaveDays, annualDays, sickDays, personalDays, noStatus, totalRecorded, dayRecords, sortedTags, holidayCount, workdayCount }
})

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const STATUS_LABELS = { work: '上班', rest: '休息', trip: '出差', leave: '请假', annual: '年假', sick: '病假', personal: '事假' }

// 忙闲密度：与日历热力同源，用于面积图（待办 + 备注 + 标签 + 打卡）。
function busyScoreForDate(dateStr) {
  let s = 0
  const d = allData.value[dateStr]
  if (d) {
    if (d.note) s += 1
    if (d.tags && d.tags.length) s += d.tags.length * 0.5
    if (d.status) s += 0.5
  }
  const todos = (todoStore.todos || []).filter((t) => {
    if (t.type === 'once') return t.date === dateStr
    if (t.type === 'weekly') {
      const wd = new Date(dateStr + 'T00:00:00').getDay()
      return (t.weekdays || []).includes(wd)
    }
    return false
  })
  s += todos.length
  const rec = reminderStore.getRecordsByDate(dateStr)
  const enabled = (reminderStore.reminders || []).filter((r) => r.enabled)
  if (enabled.length && enabled.some((r) => rec[r.id] && rec[r.id].confirmed)) s += 1
  return s
}

const busySeries = computed(() => {
  const arr = []
  for (let day = 1; day <= daysInMonth.value; day++) {
    const ds = `${currentYear.value}-${String(currentMonth.value + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    arr.push({ day, score: busyScoreForDate(ds) })
  }
  return arr
})

// 周网格边界：每月 1 日与各周一对应的「日」序号，供面积图对齐真实周边界（而非等距切分）。
const weekBoundaries = computed(() => {
  const firstDow = new Date(currentYear.value, currentMonth.value, 1).getDay()
  const bounds = []
  for (let d = 1; d <= daysInMonth.value; d++) {
    if (d === 1 || (firstDow + d - 1) % 7 === 1) bounds.push(d)
  }
  return bounds
})

const ringSegments = computed(() => [
  { label: '上班', value: stats.value.workDays, color: 'var(--work)' },
  { label: '休息', value: stats.value.restDays, color: 'var(--rest)' },
  { label: '出差', value: stats.value.tripDays, color: 'var(--trip)' },
  { label: '请假', value: stats.value.leaveDays, color: 'var(--leave)' },
  { label: '年假', value: stats.value.annualDays, color: 'var(--annual)' },
  { label: '病假', value: stats.value.sickDays, color: 'var(--sick)' },
  { label: '事假', value: stats.value.personalDays, color: 'var(--personal)' },
])
const ringTotal = computed(() => stats.value.totalRecorded)

function exportImage() {
  if (typeof window.exportStatsAsImage === 'function') {
    window.exportStatsAsImage(stats.value, currentYear.value, currentMonth.value)
  }
}
</script>

<template>
  <div class="stats-content">
    <div class="stats-nav">
      <button class="nav-btn" @click="prevMonth" aria-label="上个月">‹</button>
      <div class="stats-nav-center">
        <span class="month-label">{{ currentYear }}年{{ currentMonth + 1 }}月</span>
        <span v-if="!isCurrentMonth" class="stats-nav-tag" :class="{ future: isFuture }">{{ isFuture ? '未来' : '历史' }}</span>
      </div>
      <button class="nav-btn" @click="nextMonth" aria-label="下个月">›</button>
      <button v-if="!isCurrentMonth" class="today-btn" @click="goCurrentMonth">本月</button>
    </div>

    <div class="stats-toolbar">
      <button class="settings-action-btn btn-xs" @click="exportImage">导出统计图片</button>
    </div>

    <div class="stats-cards">
      <div class="stat-card work" data-tilt data-tilt-max="6" data-tilt-lift="6"><div class="stat-num">{{ stats.workDays }}</div><div class="stat-label">上班</div></div>
      <div class="stat-card rest" data-tilt data-tilt-max="6" data-tilt-lift="6"><div class="stat-num">{{ stats.restDays }}</div><div class="stat-label">休息</div></div>
      <div class="stat-card trip" data-tilt data-tilt-max="6" data-tilt-lift="6"><div class="stat-num">{{ stats.tripDays }}</div><div class="stat-label">出差</div></div>
      <div v-if="stats.leaveDays > 0" class="stat-card leave" data-tilt data-tilt-max="6" data-tilt-lift="6"><div class="stat-num">{{ stats.leaveDays }}</div><div class="stat-label">请假</div></div>
      <div v-if="stats.annualDays > 0" class="stat-card annual" data-tilt data-tilt-max="6" data-tilt-lift="6"><div class="stat-num">{{ stats.annualDays }}</div><div class="stat-label">年假</div></div>
      <div v-if="stats.sickDays > 0" class="stat-card sick" data-tilt data-tilt-max="6" data-tilt-lift="6"><div class="stat-num">{{ stats.sickDays }}</div><div class="stat-label">病假</div></div>
      <div v-if="stats.personalDays > 0" class="stat-card personal" data-tilt data-tilt-max="6" data-tilt-lift="6"><div class="stat-num">{{ stats.personalDays }}</div><div class="stat-label">事假</div></div>
      <div class="stat-card total" data-tilt data-tilt-max="6" data-tilt-lift="6"><div class="stat-num">{{ stats.noStatus }}</div><div class="stat-label">未记录</div></div>
    </div>

    <div v-if="ringTotal > 0" class="overview-section">
      <div class="theme-title">{{ currentYear }}年{{ currentMonth + 1 }}月 概览</div>
      <div class="overview-grid">
        <div class="overview-ring">
          <StatsRing :segments="ringSegments" :center-value="ringTotal" center-label="已记录天" />
          <div class="ring-legend">
            <span v-for="s in ringSegments.filter((x) => x.value > 0)" :key="s.label" class="ring-legend-item">
              <i class="dot" :style="{ background: s.color }"></i>{{ s.label }} {{ s.value }}
            </span>
          </div>
        </div>
        <div class="overview-area">
          <div class="area-caption">每日忙闲密度 · 按周</div>
          <WeeklyArea :series="busySeries" :week-boundaries="weekBoundaries" />
        </div>
      </div>
    </div>

    <div v-if="stats.holidayCount > 0 || stats.workdayCount > 0" class="ratio-section">
      <div class="theme-title">节假日信息</div>
      <div class="holiday-stats">
        <span v-if="stats.holidayCount" class="hs-item holiday-day">放假 {{ stats.holidayCount }} 天</span>
        <span v-if="stats.workdayCount" class="hs-item workday-day">调休上班 {{ stats.workdayCount }} 天</span>
      </div>
    </div>

    <div v-if="stats.totalRecorded > 0" class="ratio-section">
      <div class="ratio-bar">
        <div v-if="stats.workDays" class="ratio-seg work" :style="{ width: Math.round(stats.workDays/daysInMonth*100) + '%' }">{{ Math.round(stats.workDays/daysInMonth*100) }}%</div>
        <div v-if="stats.restDays" class="ratio-seg rest" :style="{ width: Math.round(stats.restDays/daysInMonth*100) + '%' }">{{ Math.round(stats.restDays/daysInMonth*100) }}%</div>
        <div v-if="stats.tripDays" class="ratio-seg trip" :style="{ width: Math.round(stats.tripDays/daysInMonth*100) + '%' }">{{ Math.round(stats.tripDays/daysInMonth*100) }}%</div>
        <div v-if="stats.leaveDays" class="ratio-seg leave" :style="{ width: Math.round(stats.leaveDays/daysInMonth*100) + '%' }">{{ Math.round(stats.leaveDays/daysInMonth*100) }}%</div>
        <div v-if="stats.annualDays" class="ratio-seg annual" :style="{ width: Math.round(stats.annualDays/daysInMonth*100) + '%' }">{{ Math.round(stats.annualDays/daysInMonth*100) }}%</div>
        <div v-if="stats.sickDays" class="ratio-seg sick" :style="{ width: Math.round(stats.sickDays/daysInMonth*100) + '%' }">{{ Math.round(stats.sickDays/daysInMonth*100) }}%</div>
        <div v-if="stats.personalDays" class="ratio-seg personal" :style="{ width: Math.round(stats.personalDays/daysInMonth*100) + '%' }">{{ Math.round(stats.personalDays/daysInMonth*100) }}%</div>
      </div>
      <div class="ratio-legend">
        <span class="legend-item work">上班 {{ stats.workDays }}天</span>
        <span class="legend-item rest">休息 {{ stats.restDays }}天</span>
        <span class="legend-item trip">出差 {{ stats.tripDays }}天</span>
        <span v-if="stats.leaveDays" class="legend-item leave">请假 {{ stats.leaveDays }}天</span>
        <span v-if="stats.annualDays" class="legend-item annual">年假 {{ stats.annualDays }}天</span>
        <span v-if="stats.sickDays" class="legend-item sick">病假 {{ stats.sickDays }}天</span>
        <span v-if="stats.personalDays" class="legend-item personal">事假 {{ stats.personalDays }}天</span>
      </div>
    </div>

    <div v-if="stats.sortedTags.length > 0" class="ratio-section">
      <div class="theme-title">标签统计</div>
      <div class="tag-stats-list">
        <div v-for="([tag, count], i) in stats.sortedTags" :key="tag" class="tag-stat-item" :style="{ '--i': i }">
          <span class="tag-chip static">{{ tag }}</span>
          <span class="tag-stat-count">{{ count }}次</span>
        </div>
      </div>
    </div>

    <div v-if="stats.dayRecords.length > 0">
      <div class="records-title">{{ currentYear }}年{{ currentMonth + 1 }}月记录 ({{ stats.dayRecords.length }}天)</div>
      <div class="records-list">
        <div v-for="(r, i) in stats.dayRecords" :key="r.day" class="record-item" :style="{ '--i': i }">
          <div class="record-head">
            <span class="record-date">{{ r.day }}日 周{{ WEEKDAYS[new Date(r.dateStr + 'T00:00:00').getDay()] }} <span v-if="r.holiday" :class="'record-holiday ' + r.holiday.type">{{ r.holiday.name }}</span></span>
            <span :class="'record-status ' + (r.status || 'none')">{{ STATUS_LABELS[r.status] || '未标记' }}</span>
          </div>
          <div v-if="r.tags && r.tags.length > 0" class="record-tags">
            <span v-for="t in r.tags" :key="t" class="tag-chip static">{{ t }}</span>
          </div>
          <div v-if="r.note" class="record-note">{{ r.note }}</div>
        </div>
      </div>
    </div>
    <div v-else class="empty-tip"><EmptyIllustration variant="star" label="该月暂无记录" :size="108" /></div>
  </div>
</template>

<style scoped>
.stats-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 4px 2px;
}
.stats-nav .nav-btn {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  font-size: 18px;
}
.stats-nav-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
}
.stats-nav .month-label {
  flex: none;
}
.stats-nav-tag {
  flex-shrink: 0;
  font-size: 11px;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--hover);
  color: var(--text3);
  font-weight: 600;
}
.stats-nav-tag.future {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
}
@media (max-width: 480px) {
  .stats-nav { gap: 6px; }
  .stats-nav-tag { display: none; }
}
</style>
