<script setup>
import { ref, computed } from 'vue'
import { useTodoStore } from '../stores/todoStore.js'
import { Lunar } from '../lunar.js'
import { useSwipe } from '../composables/useSwipe.js'
import { useLongPress } from '../composables/useLongPress.js'
import ActionSheet from './ActionSheet.vue'

const todoStore = useTodoStore()

const props = defineProps({
  todo: { type: Object, required: true },
  dateStr: { type: String, required: true },
  showDate: { type: Boolean, default: false },
})

const emit = defineEmits(['refresh'])

const itemEl = ref(null)
const suppressClick = ref(false)
const sheetOpen = ref(false)

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
  const lunar = Lunar?.solar2lunar(d.getFullYear(), d.getMonth(), d.getDate())
  return lunar ? `${props.todo.date} ${lunar.full}` : props.todo.date
})

// ── 左滑删除（跟手位移）──
const { dx: itemDx, swiping: itemSwiping } = useSwipe(itemEl, {
  direction: 'horizontal',
  threshold: 60,
  onLeft: () => deleteTodo(true),
})

const innerStyle = computed(() => {
  if (itemSwiping.value) {
    const x = Math.max(-120, Math.min(0, itemDx.value))
    return { transform: `translateX(${x}px)`, transition: 'none' }
  }
  return { transform: 'translateX(0)', transition: 'transform 0.22s ease' }
})

// ── 长按操作菜单 ──
const { clear: clearLongPress } = useLongPress(itemEl, {
  delay: 420,
  onStart: () => { suppressClick.value = false },
  onLongPress: () => {
    suppressClick.value = true
    sheetOpen.value = true
  },
})

const todoActions = [
  { label: '完成 / 取消完成', value: 'toggle' },
  { label: '编辑', value: 'edit' },
  { label: '删除', value: 'delete', danger: true },
]

async function toggleDone() {
  if (suppressClick.value) { suppressClick.value = false; return }
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
  await todoStore.loadTodos()
  if (typeof window.renderCalendar === 'function') window.renderCalendar()
  window.__refreshCalendarGrid?.()
}

async function deleteTodo(skipConfirm) {
  if (suppressClick.value) { suppressClick.value = false; return }
  if (!skipConfirm && !confirm('确定删除该待办？')) return
  try {
    const result = await window.calendarAPI.deleteTodo(props.todo.id)
    if (result && result.success) {
      emit('refresh')
      await todoStore.loadTodos()
      if (typeof window.renderCalendar === 'function') window.renderCalendar()
      window.__refreshCalendarGrid?.()
      if (typeof window.showToast === 'function') window.showToast('已删除待办')
    }
  } catch (e) {
    console.error('[TodoItem] delete IPC failed:', e.message)
    if (typeof window.showToast === 'function') window.showToast('删除失败，请重试')
  }
}

function openEdit() {
  if (suppressClick.value) { suppressClick.value = false; return }
  window.__openTodoModal(props.todo)
}

function onTodoAction(a) {
  sheetOpen.value = false
  if (a.value === 'toggle') toggleDone()
  else if (a.value === 'edit') openEdit()
  else if (a.value === 'delete') deleteTodo(true)
}
</script>

<template>
  <div class="todo-item" :class="{ done }" ref="itemEl">
    <div class="todo-swipe-delete" aria-hidden="true">
      <span class="swipe-del-icon">🗑</span>
      <span class="swipe-del-text">删除</span>
    </div>
    <div class="todo-item-inner" :style="innerStyle">
      <span class="todo-check" @click="toggleDone">{{ done ? '✓' : '' }}</span>
      <div class="todo-view-info" v-if="showDate">
        <span class="todo-view-text">{{ todo.text }}<template v-if="remindLabel"><span style="font-size:11px;color:var(--text-secondary);">{{ remindLabel }}</span></template></span>
        <span class="todo-view-date">{{ dateDisplay }}</span>
      </div>
      <span class="todo-text" v-else>{{ todo.text }}<template v-if="remindLabel"><span style="font-size:11px;color:var(--text-secondary);">{{ remindLabel }}</span></template></span>
      <span class="todo-edit" title="编辑" @click="openEdit">✎</span>
      <span class="todo-del" @click="deleteTodo">×</span>
    </div>

    <ActionSheet
      :open="sheetOpen"
      title="待办操作"
      :actions="todoActions"
      @select="onTodoAction"
      @update:open="v => sheetOpen = v"
    />
  </div>
</template>

<style scoped>
.todo-item {
  position: relative;
  overflow: hidden;
  touch-action: pan-y;
}
.todo-swipe-delete {
  position: absolute;
  top: 0; right: 0; bottom: 0;
  width: 84px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: #e53935;
  color: #fff;
}
.swipe-del-icon { font-size: 18px; line-height: 1; }
.swipe-del-text { font-size: 12px; }
.todo-item-inner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border, #e0e0e0);
  font-size: 13px;
  background: var(--card, #fff);
  will-change: transform;
}
.todo-text { flex: 1; }
.todo-check { width: 24px; height: 24px; border: 1px solid var(--border, #ccc); border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 13px; color: var(--accent); flex-shrink: 0; }
.todo-check:hover { border-color: var(--accent); }
.todo-edit { cursor: pointer; font-size: 14px; color: var(--text-secondary, #999); padding: 2px 4px; }
.todo-edit:hover { color: var(--accent); }
.todo-del { cursor: pointer; font-size: 18px; color: #ccc; padding: 2px 4px; min-width: 24px; text-align: center; }
.todo-del:hover { color: #e53935; }
.done .todo-text { text-decoration: line-through; color: var(--text-secondary, #bbb); }
.done .todo-check { background: var(--accent, #333); border-color: var(--accent, #333); color: #fff; }
.todo-view-info { flex: 1; display: flex; flex-direction: column; }
.todo-view-text { font-size: 13px; }
.todo-view-date { font-size: 11px; color: var(--text-secondary, #999); margin-top: 2px; }
</style>
