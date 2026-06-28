<script setup>
import { computed } from 'vue'

const props = defineProps({
  todo: { type: Object, required: true },
  dateStr: { type: String, required: true },
  showDate: { type: Boolean, default: false },
})

const emit = defineEmits(['refresh'])

const done = computed(() => {
  if (props.todo.type === 'once') return !!props.todo.done
  return !!(props.todo.weeklyDone && props.todo.weeklyDone[props.dateStr])
})

const remindLabel = computed(() => {
  if (!props.todo.remind) return ''
  if (props.todo.remind === 'same') return ` ⏰${props.todo.remindTime || '09:00'}准时`
  if (props.todo.remind === '120') return ' ⏰提前2小时'
  if (props.todo.remind === '1440') return ' ⏰提前1天'
  return ` ⏰提前${props.todo.remind}分钟`
})

const dateDisplay = computed(() => {
  if (!props.todo.date) return ''
  const d = new Date(props.todo.date + 'T00:00:00')
  const lunar = window.Lunar?.solar2lunar(d.getFullYear(), d.getMonth(), d.getDate())
  return lunar ? `${props.todo.date} ${lunar.full}` : props.todo.date
})

async function toggleDone() {
  try {
    if (props.todo.type === 'once') {
      await window.calendarAPI.updateTodo(props.todo.id, { done: !props.todo.done })
      props.todo.done = !props.todo.done
    } else {
      const wd = props.todo.weeklyDone || {}
      wd[props.dateStr] = !wd[props.dateStr]
      await window.calendarAPI.updateTodo(props.todo.id, { weeklyDone: wd })
      props.todo.weeklyDone = wd
    }
  } catch (e) {
    console.error('[TodoItem] toggleDone IPC failed:', e.message)
  }
  emit('refresh')
  if (typeof window.renderCalendar === 'function') window.renderCalendar()
}

async function deleteTodo() {
  try {
    await window.calendarAPI.deleteTodo(props.todo.id)
  } catch (e) {
    console.error('[TodoItem] delete IPC failed:', e.message)
    return
  }
  const idx = window.allTodos.findIndex(t => t.id === props.todo.id)
  if (idx >= 0) window.allTodos.splice(idx, 1)
  emit('refresh')
  if (typeof window.renderCalendar === 'function') window.renderCalendar()
  if (typeof window.showToast === 'function') window.showToast('已删除待办')
}

function openEdit() {
  if (typeof window.__openTodoModal === 'function') {
    window.__openTodoModal(props.todo)
  }
}
</script>

<template>
  <div class="todo-item" :class="{ done }">
    <span class="todo-check" @click="toggleDone">{{ done ? '✓' : '' }}</span>
    <div class="todo-view-info" v-if="showDate">
      <span class="todo-view-text">{{ todo.text }}<template v-if="remindLabel"><span style="font-size:11px;color:var(--text-secondary);">{{ remindLabel }}</span></template></span>
      <span class="todo-view-date">{{ dateDisplay }}</span>
    </div>
    <span class="todo-text" v-else>{{ todo.text }}<template v-if="remindLabel"><span style="font-size:11px;color:var(--text-secondary);">{{ remindLabel }}</span></template></span>
    <span class="todo-edit" title="编辑" @click="openEdit">✎</span>
    <span class="todo-del" @click="deleteTodo">&times;</span>
  </div>
</template>

<style scoped>
.todo-item { display:flex; align-items:center; gap:6px; padding:6px 0; border-bottom:1px solid var(--border,#e0e0e0); font-size:13px; }
.todo-text { flex:1; }
.todo-check { width:20px; height:20px; border:1px solid var(--border,#ccc); border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:12px; color:var(--accent); flex-shrink:0; }
.todo-check:hover { border-color:var(--accent); }
.todo-edit { cursor:pointer; font-size:14px; color:var(--text-secondary,#999); padding:2px; }
.todo-edit:hover { color:var(--accent); }
.todo-del { cursor:pointer; font-size:16px; color:#ccc; padding:2px; }
.todo-del:hover { color:#e53935; }
.done .todo-text { text-decoration:line-through; color:var(--text-secondary,#bbb); }
.done .todo-check { background:var(--accent,#333); border-color:var(--accent,#333); color:#fff; }
.todo-view-info { flex:1; display:flex; flex-direction:column; }
.todo-view-text { font-size:13px; }
.todo-view-date { font-size:11px; color:var(--text-secondary,#999); margin-top:2px; }
</style>