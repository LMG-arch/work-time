<script setup>
import { ref, watch, computed } from 'vue'
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
// marked：用户在面板内完成一次「选择/标记」动作（状态/颜色/加标签/存备注）后通知父级，
// 由 CalendarView 收起内联展开面板，避免面板持续展开遮挡日历内容（v3.17.31）。
const emit = defineEmits(['marked'])

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

// 选择完成后的统一出口：刷新面板数据 + 折叠本面板的折叠区 + 通知父级收起展开层。
// 折叠区（出勤状态/备注）随之收起，用户下次点击日期格重新展开，交互闭环。
function onMarked() {
  updateData()
  statusOpen.value = false
  noteOpen.value = false
  emit('marked')
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

// ===== 出勤状态 / 备注折叠（v3.17.30）=====
// 默认收起仅显示标题+摘要；点击标题行展开/收起。折叠偏好跨日期保留，切换日期不跳动。
const statusOpen = ref(false)
const noteOpen = ref(false)

const STATUS_LABELS = { work: '上班', rest: '休息', trip: '出差', leave: '请假', annual: '年假', sick: '病假', personal: '事假' }
const statusSummary = computed(() => {
  const s = dayData.value?.status
  return s ? (STATUS_LABELS[s] || s) : '未标记'
})
const noteSummary = computed(() => {
  const n = (dayData.value?.note || '').trim()
  if (!n) return '空'
  return n.length > 14 ? n.slice(0, 14) + '…' : n
})

function toggleStatusSection() {
  statusOpen.value = !statusOpen.value
}
function toggleNoteSection() {
  noteOpen.value = !noteOpen.value
}
</script>

<template>
  <div v-if="selectedDate">
    <div id="detail-date" class="detail-date">{{ formatDateCN(selectedDate) }}</div>

    <!-- 出勤状态：默认收起，标题行显示当前状态摘要 -->
    <div class="detail-fold" :class="{ open: statusOpen }">
      <button type="button" class="detail-fold-head" :aria-expanded="statusOpen" @click="toggleStatusSection">
        <span class="detail-fold-title">出勤状态</span>
        <span class="detail-fold-summary" :class="'st-' + (dayData?.status || 'none')">{{ statusSummary }}</span>
        <span class="detail-fold-chevron" aria-hidden="true">›</span>
      </button>
      <div class="detail-fold-body" v-show="statusOpen">
        <StatusButtons :selectedDate="selectedDate" :currentStatus="dayData?.status" @update="onMarked" />
      </div>
    </div>

    <ColorPicker :selectedDate="selectedDate" :currentColor="dayData?.color || ''" @update="onMarked" />
    <TagEditor :selectedDate="selectedDate" :tags="dayData?.tags || []" @update="onMarked" />

    <!-- 备注：默认收起，标题行显示备注摘要 -->
    <div class="detail-fold" :class="{ open: noteOpen }">
      <button type="button" class="detail-fold-head" :aria-expanded="noteOpen" @click="toggleNoteSection">
        <span class="detail-fold-title">备注</span>
        <span class="detail-fold-summary">{{ noteSummary }}</span>
        <span class="detail-fold-chevron" aria-hidden="true">›</span>
      </button>
      <div class="detail-fold-body" v-show="noteOpen">
        <NoteEditor :selectedDate="selectedDate" :note="dayData?.note || ''" @update="onMarked" />
      </div>
    </div>

    <div class="todo-section">
      <div class="todo-header-row">
        <span class="todo-title">待办</span>
        <button class="todo-add-btn" @click="openAddTodo">+ 添加</button>
      </div>
      <TodoListApp :selectedDate="selectedDate" />
    </div>
  </div>
</template>
