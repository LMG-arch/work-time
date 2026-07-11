// todos/todos.js — Todo CRUD logic (Bridge layer for Vue and legacy views)
// 已从经典 <script> src/todos.js 逐字节迁移为 ES 模块。
// 经 src/shims.js 把导出挂回 window.*，供尚未迁移的经典脚本
// （calendar.js / renderer.js）按原名继续调用。
// 逻辑与 src/todos.js 完全一致，仅做 ESM 包裹 + export，未做任何重构。

// 原经典脚本中 allTodos 为隐式全局（未用 let/const 声明）；
// ESM 严格模式下须显式声明为模块级变量以保持等价行为。
let allTodos;

export async function loadTodos() {
  allTodos = await window.calendarAPI.getTodos();
  window.allTodos = allTodos;
}

export function getTodosForDate(dateStr) {
  if (!dateStr) return [];
  const d = new Date(dateStr + 'T00:00:00');
  const weekday = d.getDay();
  return (window.allTodos || []).filter(t => {
    if (t.type === 'once') return t.date === dateStr;
    if (t.type === 'weekly') return (t.weekdays || []).includes(weekday);
    return false;
  });
}

export function isTodoDone(todo, dateStr) {
  if (todo.type === 'once') return !!todo.done;
  return !!(todo.weeklyDone && todo.weeklyDone[dateStr]);
}

export async function toggleTodoDone(todo, dateStr) {
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
    if (typeof window.renderCalendar === 'function') window.renderCalendar();
    window.__refreshCalendarGrid?.();
  } catch (e) {
    console.error('[Todo] toggleTodoDone failed:', e.message);
  }
}

// 传统 DOM 渲染 (供仍在使用 getElementById('todo-list') 的旧版页面使用)
export function renderTodoList(dateStr) {
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
      <span class="todo-text">${window.escapeHtml(todo.text)}${remindIcon}</span>
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
export function openTodoModal() { window.__openTodoModal?.(); }
export function openEditTodoModal(todo) { window.__openTodoModal?.(todo); }
export function closeTodoModal() { window.__closeTodoModal?.(); }
export function setupTodoModal() {} // 已迁移到 Vue
export function renderTodoView() {}  // 已迁移到 Vue

// 模块级状态导出（window.allTodos 已在本文件内自行同步，shims 无需再挂回）
export { allTodos };
