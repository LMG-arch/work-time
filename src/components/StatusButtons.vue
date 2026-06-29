<script setup>
const props = defineProps({
  selectedDate: String,
  currentStatus: String
})
const emit = defineEmits(['update'])

const STATUS_LABELS = { work: '上班', rest: '休息', trip: '出差', leave: '请假', annual: '年假', sick: '病假', personal: '事假' }

async function setStatus(status) {
  const dayData = window.allData?.[props.selectedDate]
  const newStatus = (dayData?.status === status) ? '' : status
  await window.calendarAPI.saveDay(props.selectedDate, newStatus, dayData?.note || '', dayData?.tags || [], dayData?.color || '')
  if (!window.allData[props.selectedDate]) window.allData[props.selectedDate] = {}
  window.allData[props.selectedDate].status = newStatus || undefined
  window.renderCalendar?.()
  emit('update')
}
</script>

<template>
  <div class="status-row">
    <button v-for="(label, key) in STATUS_LABELS" :key="key"
      class="status-btn" :class="{ active: currentStatus === key }"
      :data-status="key" @click="setStatus(key)">{{ label }}</button>
  </div>
</template>
