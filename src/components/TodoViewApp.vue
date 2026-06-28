<script setup>
import { ref, computed } from 'vue'
import TodoItem from './TodoItem.vue'

const filter = ref('all')

window.__refreshTodoView = () => {}

const onceTodos = computed(() => {
  return (window.allTodos || []).filter(t => {
    if (t.type !== 'once') return false
    if (filter.value === 'all') return true
    if (filter.value === 'done') return !!t.done
    return !t.done
  }).sort((a, b) => (a.date || '').localeCompare(b.date || ''))
})

const weeklyTodos = computed(() => {
  return (window.allTodos || []).filter(t => t.type === 'weekly')
})

const todayStr = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
})

function filterBy(key) { filter.value = key }
function onItemRefresh() {
  window.__refreshTodoView = () => {}
}
</script>

<template>
  <div>
    <div class="todo-filter-bar">
      <span class="todo-filter-tab" :class="{ active: filter === 'all' }" @click="filterBy('all')">全部</span>
      <span class="todo-filter-tab" :class="{ active: filter === 'undone' }" @click="filterBy('undone')">未完成</span>
      <span class="todo-filter-tab" :class="{ active: filter === 'done' }" @click="filterBy('done')">已完成</span>
    </div>
    <div v-if="onceTodos.length === 0 && weeklyTodos.length === 0" class="empty-tip">暂无待办事项</div>
    <div class="todo-view-list" v-else>
      <template v-if="onceTodos.length > 0">
        <div class="todo-group-title">指定日期</div>
        <TodoItem
          v-for="todo in onceTodos"
          :key="todo.id"
          :todo="todo"
          :dateStr="todo.date"
          :showDate="true"
          @refresh="onItemRefresh"
        />
      </template>
      <template v-if="weeklyTodos.length > 0">
        <div class="todo-group-title">每周重复</div>
        <TodoItem
          v-for="todo in weeklyTodos"
          :key="todo.id"
          :todo="todo"
          :dateStr="todayStr"
          :showDate="true"
          @refresh="onItemRefresh"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.todo-filter-bar { display:flex; gap:0; margin-bottom:12px; background:var(--border,#e0e0e0); border-radius:8px; overflow:hidden; }
.todo-filter-tab { flex:1; text-align:center; padding:6px 0; font-size:12px; cursor:pointer; color:var(--text-secondary,#666); transition:all 0.15s; }
.todo-filter-tab.active { background:var(--accent,#333); color:#fff; font-weight:500; }
.empty-tip { text-align:center; color:var(--text-secondary,#999); padding:24px 0; font-size:13px; }
.todo-group-title { font-size:12px; font-weight:600; color:var(--text-secondary,#666); padding:8px 0 4px; text-transform:uppercase; letter-spacing:1px; }
</style>
