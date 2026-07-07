<script setup>
import { useCalendarStore } from '../stores/calendarStore.js'

const props = defineProps({ selectedDate: String, currentColor: String })
const calendarStore = useCalendarStore()

const COLORS = [
  { color: '', title: '无颜色' },
  { color: '#ffcdd2', title: '红色' },
  { color: '#c8e6c9', title: '绿色' },
  { color: '#bbdefb', title: '蓝色' },
  { color: '#fff9c4', title: '黄色' },
  { color: '#e1bee7', title: '紫色' },
  { color: '#ffe0b2', title: '橙色' },
  { color: '#b2dfdb', title: '青色' },
]

async function setColor(color) {
  const d = calendarStore.getDayData(props.selectedDate)
  await calendarStore.saveDayData(props.selectedDate, d.status || '', d.note || '', d.tags || [], color)
  window.renderCalendar?.()
  window.__refreshCalendarGrid?.()
}
</script>

<template>
  <div class="color-row">
    <span class="color-label">标记颜色</span>
    <div class="color-options">
      <span v-for="c in COLORS" :key="c.color" class="color-dot"
        :class="{ active: currentColor === c.color }"
        :style="c.color ? { background: c.color } : {}"
        :title="c.title" @click="setColor(c.color)"></span>
    </div>
  </div>
</template>
