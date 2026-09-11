// todos/todos.js — Todo 数据内核（v3.17.42 经典渲染层裁剪后）
//
// 渲染函数（renderTodoList 等）已随经典 .app 死壳一并下线（阶段 4）；
// 待办 UI 由 Vue TodoModal / ClockinPage 全权负责。
// 本文件只保留仍被消费的数据函数：
//   - loadTodos       ← renderer.js 启动引导灌 window.allTodos 镜像
//   - getTodosForDate ← reminders.js 打卡状态计算
//   - isTodoDone      ← 同上

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

// 模块级状态导出（window.allTodos 已在本文件内自行同步，shims 无需再挂回）
export { allTodos };
