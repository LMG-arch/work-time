<script setup>
import { computed } from 'vue'
import { useReminderStore } from '../stores/reminderStore.js'
import { useCalendarStore } from '../stores/calendarStore.js'

const reminderStore = useReminderStore()
const calendarStore = useCalendarStore()

const todayStr = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
})

const reminders = computed(() => reminderStore.reminders)
const todayData = computed(() => calendarStore.getDayData(todayStr.value))
const records = computed(() => reminderStore.getRecordsByDate(todayStr.value))

const nonWorkStatuses = ['rest', 'leave', 'annual', 'sick', 'personal']
const isRestDay = computed(() => todayData.value && nonWorkStatuses.includes(todayData.value.status))
const restDayLabel = computed(() => {
  if (!isRestDay.value) return ''
  const labels = { rest: '休息', leave: '请假', annual: '年假', sick: '病假', personal: '事假' }
  return labels[todayData.value.status] || '休息'
})

const currentTime = computed(() => {
  const now = new Date()
  return String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0')
})

function getCardStatus(r) {
  if (records.value[r.id]?.confirmed) return 'confirmed'
  if (currentTime.value >= r.time) return 'pending'
  return 'waiting'
}

async function confirmReminder(r) {
  await reminderStore.confirmReminder(todayStr.value, r.id)
  window.renderCalendar?.()
  window.__refreshCalendarGrid?.()
  window.showToast?.('打卡成功 ✓')
  // 招牌瞬间 #1：打卡成功派发花瓣庆祝（days 可按连续天数递增，这里默认轻量）
  window.dispatchEvent(new CustomEvent('calendar:celebrate', { detail: { days: 1 } }))
}

// backward compat
window.__refreshReminderList = () => reminderStore.refreshFromWindow()
</script>

<template>
  <div>
    <div v-if="isRestDay" class="rest-day-skip">😴 今天是{{ restDayLabel }}日，不需要打卡</div>

    <template v-else>
      <div v-for="r in reminders.filter(r => r.enabled)" :key="r.id" class="reminder-card" :class="{ confirmed: getCardStatus(r) === 'confirmed' }">
        <div class="reminder-time">{{ r.time }}</div>
        <div class="reminder-info">
          <span class="reminder-label">{{ r.label }}</span>
          <span class="reminder-status">
            {{ getCardStatus(r) === 'confirmed' ? '已确认打卡' : getCardStatus(r) === 'pending' ? '待确认' : '未到时间' }}
          </span>
        </div>
        <button
          class="reminder-confirm-btn"
          :class="getCardStatus(r)"
          :disabled="getCardStatus(r) !== 'pending'"
          @click="confirmReminder(r)"
        >
          {{ getCardStatus(r) === 'confirmed' ? '✓ 已打卡' : getCardStatus(r) === 'pending' ? '确认打卡' : '等待中' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.rest-day-skip { text-align:center; padding:20px; color:var(--text-secondary,#888); font-size:14px; }
</style>
