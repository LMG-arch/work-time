import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useTodoStore = defineStore('todo', () => {
  const todos = ref(window.allTodos || [])
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
      return window.allTodos?.find(t => t.id === todo.id)?.weeklyDone?.[dateStr] || false
    }
    return false
  }

  // Actions
  function refreshFromWindow() {
    todos.value = window.allTodos || []
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
      window.allTodos = window.allTodos.filter(t => t.id !== id)
      refreshFromWindow()
      window.__refreshCalendarGrid?.()
      window.__refreshTodoView?.()
    }
  }

  async function toggleDone(todo, dateStr) {
    if (window.calendarAPI?.toggleTodoDone) {
      await window.calendarAPI.toggleTodoDone(todo.id, dateStr)
      // Refresh from window after persistence
      refreshFromWindow()
      window.__refreshTodoView?.()
      window.__refreshCalendarGrid?.()
    }
  }

  async function updateTodo(id, updates) {
    if (window.calendarAPI?.updateTodo) {
      await window.calendarAPI.updateTodo(id, updates)
      window.allTodos = await window.calendarAPI.getTodos()
      refreshFromWindow()
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
    toggleDone,
    updateTodo,
    setFilter,
    startEdit,
    cancelEdit,
  }
})
