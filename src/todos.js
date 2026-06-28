// todos.js — Todo data functions (Vue 组件已接手渲染和弹窗)

// 清理 weeklyDone 中超过 60 天的旧记录，防止数据无限增长
let _weeklyDoneLastCleanup = 0;
function cleanupWeeklyDone() {
  // 每小时清理一次，避免频繁遍历
  const now = Date.now();
  if (now - _weeklyDoneLastCleanup < 3600000) return;
  _weeklyDoneLastCleanup = now;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  for (const todo of allTodos) {
    if (todo.type === 'weekly' && todo.weeklyDone) {
      for (const dateStr of Object.keys(todo.weeklyDone)) {
        if (dateStr < cutoffStr) delete todo.weeklyDone[dateStr];
      }
    }
  }
}

async function loadTodos() {
  allTodos = await window.calendarAPI.getTodos();
}

function getTodosForDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const weekday = d.getDay();
  // 清理 weeklyDone 中超过 60 天的旧记录
  cleanupWeeklyDone();
  return allTodos.filter(t => {
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
      await window.calendarAPI.updateTodo(todo.id, { done: !todo.done });
      todo.done = !todo.done;
    } else {
      const wd = todo.weeklyDone || {};
      wd[dateStr] = !wd[dateStr];
      await window.calendarAPI.updateTodo(todo.id, { weeklyDone: wd });
      todo.weeklyDone = wd;
    }
  } catch (e) {
    console.error('[Todo] toggleTodoDone IPC failed:', e.message);
    // 回滚内存状态
    if (todo.type === 'once') todo.done = !todo.done;
    else if (todo.weeklyDone) todo.weeklyDone[dateStr] = !todo.weeklyDone[dateStr];
  }
}

// renderTodoList() — 已由 Vue TodoListApp 组件替代
// renderTodoView() — 已由 Vue TodoViewApp 组件替代
// openTodoModal / openEditTodoModal / closeTodoModal — 已由 Vue TodoModal 组件替代
// setupTodoModal / initLunarSelects / updateLunarDays / lunarToSolar / updateLunarHint — 已由 Vue 处理

