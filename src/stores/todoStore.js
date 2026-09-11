import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useTodoStore = defineStore('todo', () => {
  // v3.17.40 去 window 镜像：初始为空，数据由 loadTodos() 经原生桥加载；
  // window.allTodos 仅作为对经典层的过渡期发布（写入），不再被读取。
  const todos = ref([])
  const filter = ref('all')
  const editingTodo = ref(null)

  // Computed
  const onceTodos = computed(() => {
    return todos.value
      .filter(t => t.type === 'once')
      .filter(t => {
        if (filter.value === 'all') return true
        if (filter.value === 'done') return !!t.done
        return !t.done
      })
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  })

  const weeklyTodos = computed(() => {
    return todos.value.filter(t => t.type === 'weekly')
  })

  function getTodosByDate(dateStr) {
    return todos.value.filter(t => {
      if (t.type === 'once') return t.date === dateStr
      if (t.type === 'weekly') return true
      return false
    })
  }

  function isDone(todo, dateStr) {
    if (todo.type === 'once') return !!todo.done
    if (todo.type === 'weekly') {
      return todos.value.find(t => t.id === todo.id)?.weeklyDone?.[dateStr] || false
    }
    return false
  }

  // Actions
  // 过渡期兼容桥：经典层仍会直接改 window.allTodos，此处按旧约定采纳其值。
  // 待阶段 4 经典层下线后，本函数与 window.allTodos 发布一并移除。
  function refreshFromWindow() {
    if (Array.isArray(window.allTodos)) todos.value = window.allTodos
  }

  async function loadTodos() {
    if (window.calendarAPI?.getTodos) {
      todos.value = await window.calendarAPI.getTodos()
      window.allTodos = todos.value
    }
  }

  async function addTodo(todo) {
    if (window.calendarAPI?.addTodo) {
      await window.calendarAPI.addTodo(todo)
      await loadTodos()
    }
  }

  async function deleteTodo(id) {
    if (window.calendarAPI?.deleteTodo) {
      await window.calendarAPI.deleteTodo(id)
      todos.value = todos.value.filter(t => t.id !== id)
      window.allTodos = todos.value // 过渡期发布（经典层消费）
      window.__refreshCalendarGrid?.()
      window.__refreshTodoView?.()
    }
  }

  async function updateTodo(id, updates) {
    if (window.calendarAPI?.updateTodo) {
      await window.calendarAPI.updateTodo(id, updates)
      todos.value = await window.calendarAPI.getTodos()
      window.allTodos = todos.value // 过渡期发布（经典层消费）
      window.__refreshTodoView?.()
    }
  }

  function setFilter(f) {
    filter.value = f
  }

  function startEdit(todo) {
    editingTodo.value = todo
  }

  function cancelEdit() {
    editingTodo.value = null
  }

  // Backward compat
  if (!window.__refreshTodoView) {
    window.__refreshTodoView = refreshFromWindow
  }
  if (!window.__openTodoModal) {
    window.__openTodoModal = (todo) => {
      if (todo) startEdit(todo)
      else editingTodo.value = null
    }
  }

  return {
    todos,
    filter,
    editingTodo,
    onceTodos,
    weeklyTodos,
    getTodosByDate,
    isDone,
    refreshFromWindow,
    loadTodos,
    addTodo,
    deleteTodo,
    updateTodo,
    setFilter,
    startEdit,
    cancelEdit,
  }
})
