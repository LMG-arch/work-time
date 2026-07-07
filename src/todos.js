// todos.js — Todo CRUD logic (Bridge layer for Vue and legacy views)

async function loadTodos() {
  allTodos = await window.calendarAPI.getTodos();
  window.allTodos = allTodos;
}

function getTodosForDate(dateStr) {
  if (!dateStr) return [];
  const d = new Date(dateStr + 'T00:00:00');
  const weekday = d.getDay();
  return (window.allTodos || []).filter(t => {
    if (t.type === 'once') return t.date === dateStr;
    if (t.type === 'weekly') return (t.weekdays || []).includes(weekday);
    return false;
  });
}

function isTodoDone(todo, dateStr) {
  if (todo.type === 'once') return !!todo.done;
  return !!(todo.weeklyDone && todo.weeklyDone[dateStr]);
}

async function toggleTodoDone(todo, dateStr) {
  try {
    if (todo.type === 'once') {
      const newState = !todo.done;
      await window.calendarAPI.updateTodo(todo.id, { done: newState });
      todo.done = newState;
    } else {
      const wd = todo.weeklyDone || {};
      wd[dateStr] = !wd[dateStr];
      await window.calendarAPI.updateTodo(todo.id, { weeklyDone: wd });
      todo.weeklyDone = wd;
    }
    // 通知 Vue 刷新
    window.__refreshTodoList?.(dateStr);
    window.__refreshTodoView?.();
    if (typeof renderCalendar === 'function') renderCalendar();
    window.__refreshCalendarGrid?.();
  } catch (e) {
    console.error('[Todo] toggleTodoDone failed:', e.message);
  }
}

// 传统 DOM 渲染 (供仍在使用 getElementById('todo-list') 的旧版页面使用)
function renderTodoList(dateStr) {
  const container = document.getElementById('todo-list');
  if (!container) return;
  container.innerHTML = '';
  const todos = getTodosForDate(dateStr);
  if (todos.length === 0) {
    container.innerHTML = '<div class="todo-empty">暂无待办</div>';
    return;
  }
  for (const todo of todos) {
    const done = isTodoDone(todo, dateStr);
    const remindIcon = todo.remind ? ' ⏰' : '';
    const item = document.createElement('div');
    item.className = 'todo-item' + (done ? ' done' : '');
    item.innerHTML = `
      <span class="todo-check" data-id="${todo.id}">${done ? '✓' : ''}</span>
      <span class="todo-text">${escapeHtml(todo.text)}${remindIcon}</span>
      <span class="todo-edit" data-id="${todo.id}" title="编辑">✎</span>
      <span class="todo-del" data-id="${todo.id}">&times;</span>
    `;
    container.appendChild(item);
  }
  
  container.querySelectorAll('.todo-check').forEach(btn => {
    btn.onclick = () => toggleTodoDone(allTodos.find(t => t.id === btn.dataset.id), dateStr).then(() => renderTodoList(dateStr));
  });
  
  container.querySelectorAll('.todo-del').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('确定删除？')) return;
      await window.calendarAPI.deleteTodo(btn.dataset.id);
      window.allTodos = window.allTodos.filter(t => t.id !== btn.dataset.id);
      renderTodoList(dateStr);
      window.__refreshCalendarGrid?.();
      window.__refreshTodoView?.();
    };
  });

  container.querySelectorAll('.todo-edit').forEach(btn => {
    btn.onclick = () => window.__openTodoModal?.(window.allTodos.find(t => t.id === btn.dataset.id));
  });
}

// 兼容性桥接
function openTodoModal() { window.__openTodoModal?.(); }
function openEditTodoModal(todo) { window.__openTodoModal?.(todo); }
function closeTodoModal() { window.__closeTodoModal?.(); }
function setupTodoModal() {} // 已迁移到 Vue
function renderTodoView() {}  // 已迁移到 Vue