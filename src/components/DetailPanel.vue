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
  if (!selectedDate.value) { dayData.value = {}; return }
  dayData.value = calendarStore.getDayData(selectedDate.value)
}

function openAddTodo() { window.__openTodoModal?.() }

// Bridge mode: traditional view calls this to set the date
window.__vueDetailPanel = (dateStr) => {
  selectedDate.value = dateStr
  updateData()
}

// Prop mode: CalendarView passes selectedDate directly（含 null = 收起面板）
watch(() => props.selectedDate, (newVal) => {
  selectedDate.value = newVal
  if (newVal) updateData()
}, { immediate: true })

watch(selectedDate, updateData)
</script>

<template>
  <div v-if="selectedDate">
    <div id="detail-date" class="detail-date">{{ formatDateCN(selectedDate) }}</div>
    <StatusButtons :selectedDate="selectedDate" :currentStatus="dayData?.status" @update="updateData" />
    <ColorPicker :selectedDate="selectedDate" :currentColor="dayData?.color || ''" @update="updateData" />
    <TagEditor :selectedDate="selectedDate" :tags="dayData?.tags || []" @update="updateData" />
    <NoteEditor :selectedDate="selectedDate" :note="dayData?.note || ''" @update="updateData" />
    <div class="todo-section">
      <div class="todo-header-row">
        <span class="todo-title">待办</span>
        <button class="todo-add-btn" @click="openAddTodo">+ 添加</button>
      </div>
      <TodoListApp :selectedDate="selectedDate" />
    </div>
  </div>
</template>