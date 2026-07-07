<script setup>
import { computed } from 'vue'
import { useReminderStore } from '../stores/reminderStore.js'

const reminderStore = useReminderStore()

const WEEKDAYS = ['日','一','二','三','四','五','六']

const last7Days = computed(() => {
  const days = []
  const today = new Date()
  for (let i = 0; i < 7; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const y = d.getFullYear()
    const m = String(d.getMonth()+1).padStart(2,'0')
    const day = String(d.getDate()).padStart(2,'0')
    days.push({ dateStr: `${y}-${m}-${day}`, month: parseInt(m), day: parseInt(day), weekday: WEEKDAYS[d.getDay()] })
  }
  return days
})

const reminders = computed(() => reminderStore.reminders)
const allRecords = computed(() => reminderStore.reminderRecords)

const hasRecords = computed(() => {
  return last7Days.value.some(d => {
    const records = allRecords.value[d.dateStr]
    return records && Object.keys(records).length > 0
  })
})

window.__refreshReminderHistory = () => reminderStore.refreshFromWindow()
</script>

<template>
  <div>
    <div v-if="!hasRecords" class="empty-tip">暂无打卡记录</div>
    <div v-for="d in last7Days" :key="d.dateStr" class="history-item">
      <template v-if="allRecords[d.dateStr] && Object.keys(allRecords[d.dateStr]).length > 0">
        <div class="history-date">{{ d.month }}月{{ d.day }}日 周{{ d.weekday }}</div>
        <div class="history-records">
          <span v-for="r in reminders.filter(r => r.enabled)" :key="r.id"
            class="history-record"
            :class="allRecords[d.dateStr][r.id]?.confirmed ? 'confirmed' : 'unconfirmed'"
          >
            {{ r.label }} {{ allRecords[d.dateStr][r.id]?.confirmed ? '✓' : '✗' }}
          </span>
        </div>
      </template>
    </div>
  </div>
</template>
