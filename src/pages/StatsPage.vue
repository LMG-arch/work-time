<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCalendarStore } from '../stores/calendarStore.js'
import { useAppStore } from '../stores/appStore.js'

const calendarStore = useCalendarStore()
const appStore = useAppStore()

const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth())

const refreshCount = ref(0)
window.__refreshStats = () => { refreshCount.value++ }

onMounted(() => {
  currentYear.value = window.currentYear || new Date().getFullYear()
  currentMonth.value = window.currentMonth || new Date().getMonth()
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

function exportImage() {
  if (typeof window.exportStatsAsImage === 'function') {
    const s = stats.value
    window.exportStatsAsImage(s)
  }
}
</script>

<template>
  <div class="stats-content">
    <div class="stats-toolbar">
      <button class="settings-action-btn btn-xs" @click="exportImage">导出统计图片</button>
    </div>

    <div class="stats-cards">
      <div class="stat-card work"><div class="stat-num">{{ stats.workDays }}</div><div class="stat-label">上班</div></div>
      <div class="stat-card rest"><div class="stat-num">{{ stats.restDays }}</div><div class="stat-label">休息</div></div>
      <div class="stat-card trip"><div class="stat-num">{{ stats.tripDays }}</div><div class="stat-label">出差</div></div>
      <div v-if="stats.leaveDays > 0" class="stat-card leave"><div class="stat-num">{{ stats.leaveDays }}</div><div class="stat-label">请假</div></div>
      <div v-if="stats.annualDays > 0" class="stat-card annual"><div class="stat-num">{{ stats.annualDays }}</div><div class="stat-label">年假</div></div>
      <div v-if="stats.sickDays > 0" class="stat-card sick"><div class="stat-num">{{ stats.sickDays }}</div><div class="stat-label">病假</div></div>
      <div v-if="stats.personalDays > 0" class="stat-card personal"><div class="stat-num">{{ stats.personalDays }}</div><div class="stat-label">事假</div></div>
      <div class="stat-card total"><div class="stat-num">{{ stats.noStatus }}</div><div class="stat-label">未记录</div></div>
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
      <div class="records-title">本月记录 ({{ stats.dayRecords.length }}天)</div>
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
    <div v-else class="empty-tip">本月暂无记录</div>
  </div>
</template>
