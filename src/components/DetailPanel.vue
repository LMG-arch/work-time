<script setup>
import { ref, watch } from 'vue'
import { useCalendarStore } from '../stores/calendarStore.js'
import StatusButtons from './StatusButtons.vue'
import ColorPicker from './ColorPicker.vue'
import TagEditor from './TagEditor.vue'
import NoteEditor from './NoteEditor.vue'
import TodoListApp from './TodoListApp.vue'

const calendarStore = useCalendarStore()

const props = defineProps({
  selectedDate: { type: String, default: null }
})

const internalDate = ref(null)
const dayData = ref({})

// Support both prop-driven (Vue CalendarView) and bridge-driven (traditional view)
const selectedDate = ref(props.selectedDate)

function formatDateCN(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const parts = dateStr.split('-')
  return `${parseInt(parts[0])}年${parseInt(parts[1])}月${parseInt(parts[2])}日 ${weekdays[d.getDay()]}`
}

function updateData() {
  dayData.value = calendarStore.getDayData(selectedDate.value)
}

// Bridge mode: traditional view calls this to set the date
window.__vueDetailPanel = (dateStr) => {
  selectedDate.value = dateStr
  updateData()
}

// Prop mode: CalendarView passes selectedDate directly
watch(() => props.selectedDate, (newVal) => {
  if (newVal) {
    selectedDate.value = newVal
    updateData()
  }
}, { immediate: true })

watch(selectedDate, updateData)
</script>

<template>
  <div v-if="selectedDate">
    <div id="detail-date" class="detail-date">{{ formatDateCN(selectedDate) }}</div>
    <StatusButtons :selectedDate="selectedDate" :currentStatus="dayData?.status" @update="updateData" />
    <ColorPicker :selectedDate="selectedDate" :currentColor="dayData?.color || ''" />
    <TagEditor :selectedDate="selectedDate" :tags="dayData?.tags || []" />
    <NoteEditor :selectedDate="selectedDate" :note="dayData?.note || ''" />
    <div class="todo-section">
      <div class="todo-header-row">
        <span class="todo-title">待办</span>
      </div>
      <TodoListApp />
    </div>
  </div>
</template>