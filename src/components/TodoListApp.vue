<script setup>
import { ref } from 'vue'
import { useTodoStore } from '../stores/todoStore.js'
import TodoItem from './TodoItem.vue'

const todoStore = useTodoStore()

const selectedDate = ref(null)
const todos = ref([])

window.__refreshTodoList = (dateStr) => {
  selectedDate.value = dateStr
  updateList()
}

function updateList() {
  if (!selectedDate.value) { todos.value = []; return }
  const ds = selectedDate.value
  const d = new Date(ds + 'T00:00:00')
  const weekday = d.getDay()
  todos.value = todoStore.todos.filter(t => {
    if (t.type === 'once') return t.date === ds
    if (t.type === 'weekly') return (t.weekdays || []).includes(weekday)
    return false
  })
}

function onRefresh() {
  todoStore.refreshFromWindow()
  updateList()
}
</script>

<template>
  <div>
    <div v-if="todos.length === 0" class="todo-empty">暂无待办</div>
    <TodoItem
      v-for="todo in todos"
      :key="todo.id"
      :todo="todo"
      :dateStr="selectedDate"
      @refresh="onRefresh"
    />
  </div>
</template>

<style scoped>
.todo-empty { text-align:center; color:var(--text-secondary,#999); padding:16px 0; font-size:13px; }
</style>
