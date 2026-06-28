<script setup>
import { ref, computed } from 'vue'

const todayStr = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
})

const reminders = computed(() => window.allReminders || [])
const todayData = computed(() => (window.allData || {})[todayStr.value])
const records = computed(() => (window.allReminderRecords || {})[todayStr.value] || {})

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
  await window.calendarAPI.confirmReminder(todayStr.value, r.id)
  if (!window.allReminderRecords[todayStr.value]) window.allReminderRecords[todayStr.value] = {}
  window.allReminderRecords[todayStr.value][r.id] = { confirmed: true, at: new Date().toISOString() }
  window.renderCalendar?.()
  window.showToast?.('打卡成功 ✓')
}

window.__refreshReminderList = () => {}
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