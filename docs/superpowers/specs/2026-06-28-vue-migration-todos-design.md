# v3.6.0: 待办模块迁移为 Vue 组件

## 范围

迁移 `src/todos.js` 全部功能到 Vue SFC，行为零变更。

**迁移功能：**
- 日历详情面板待办列表
- 打卡页待办视图（含筛选）
- 添加/编辑待办弹窗（文字、类型、日期/每周重复、农历、提醒设置）
- 完成状态切换（一次性 + 每周重复）
- 删除待办
- `loadTodos()` 保留在 renderer.js（被多处调用）

**不做：**
- 功能变更
- 其他模块迁移
- 改动数据层

## 与 SettingsPage 迁移的关键区别

SettingsPage 是一个**完整页面**，由 `switchView` 路由控制显示/隐藏。  
待办是**嵌入在其他页面中的子组件**：

- `TodoList` → 嵌入日历详情面板 `#detail-panel` 内的 `#todo-list`
- `TodoModal` → 弹窗，从两个位置触发（日历面板、打卡页）
- `TodoView` → 嵌入打卡页 `#clockin-view` 内的 `#todo-view-content`

**所以不能走 __vueActivate/__vueDeactivate 页面路由模式。**

## 嵌入方案：独立 Vue 挂载点

在现有 DOM 中预埋两个 Vue 容器，使用独立的 `createApp` 挂载：

```html
<!-- 日历详情面板内 -->
<div id="todo-list-vue" class="todo-list"></div>

<!-- 打卡页待办视图内 -->
<div id="todo-view-vue"></div>
```

**不**使用 `#app` 的 Vue 实例，而是为待办模块创建独立的微型 Vue 应用：

```
vue-todos.js  ← 新文件：Vue 待办应用入口
  ├─ 挂载 TodoListApp.vue 到 #todo-list-vue
  └─ 挂载 TodoViewApp.vue 到 #todo-view-vue
```

每个微型应用是一个独立的 `createApp`，组件内部通过 `window` 共享数据。

## 组件结构

```
src/
├── vue-todos.js               # 独立 Vue 应用入口（createApp × 2）
├── components/
│   ├── TodoListApp.vue        # 日历面板待办列表容器（挂载到 #todo-list-vue）
│   ├── TodoViewApp.vue        # 打卡页待办视图容器（挂载到 #todo-view-vue）
│   ├── TodoItem.vue           # 单条待办行（勾选+文字+编辑+删除按钮）
│   └── TodoModal.vue          # 添加/编辑弹窗（Teleport 到 body）
```

## 数据流

```
加载:  renderer.js loadTodos() → window.allTodos 填充
       Vue 组件通过 window.allTodos 读取（reactive 包装或 watch 轮询）

渲染:  watchEffect 或 onMounted → 读取 allTodos → 渲染列表

操作:  勾选/删除/编辑 → calendarAPI.updateTodo/deleteTodo
       → 更新 window.allTodos 对应项
       → 调用 renderCalendar() 刷新日历格子的完成状态
       → 自身重新渲染

弹窗:  添加/编辑 → calendarAPI.addTodo/updateTodo
       → push 到 window.allTodos / 更新对应项
       → 关闭弹窗 → 重新渲染列表 → renderCalendar()

通知:  完成/删除操作后调用 window.renderCalendar()
       （通过 window 调用 renderer.js 的全局函数）
```

## TodoModal 共享策略

`TodoModal.vue` 是一个独立的弹窗组件，不从属于 TodoListApp 或 TodoViewApp：

- 挂载到独立的 DOM 容器 `#todo-modal-vue`
- 通过全局 `window.__openTodoModal(todo?)` 和 `window.__closeTodoModal()` 控制
- 这样不管是日历面板的 "添加待办" 按钮，还是打卡页的 "添加待办" 按钮，都调用同一个全局函数

## 组件职责

### TodoListApp.vue
- 监听 `selectedDate`（通过 `window` 全局变量，或通过 `watch` + 事件）
- 调用 `getTodosForDate(dateStr)` 过滤待办
- 渲染 `TodoItem` 列表
- 空状态显示 "暂无待办"

### TodoViewApp.vue
- 渲染筛选栏（全部/未完成/已完成）
- 按类型分组：指定日期 / 每周重复
- 每组渲染 TodoItem 列表
- 显示每项的日期/周几信息
- 空状态显示 "暂无待办事项"

### TodoItem.vue
- Props: `todo`, `dateStr`, `showDate`, `showEdit`
- 勾选框 → 调用 `toggleTodoDone(todo, dateStr)`
- 文字 + 提醒图标显示
- 编辑按钮 → 调用 `window.__openTodoModal(todo)`
- 删除按钮 → 调用 `calendarAPI.deleteTodo`，移除列表项

### TodoModal.vue
- 添加/编辑双模式（通过传入 todo 参数区分）
- 字段：文字、类型(once/weekly)、日期、农历、周重复、提醒时间
- 农历选择器（复用 Lunar 全局对象）
- 确认 → 调用 `calendarAPI.addTodo` 或 `calendarAPI.updateTodo`
- 关闭 → 清理状态

## 原有的函数去向

| todos.js 函数 | 去向 |
|--------------|------|
| `loadTodos()` | 保留在 renderer.js（多处调用） |
| `getTodosForDate()` | 逻辑内联到 TodoListApp.vue |
| `isTodoDone()` | 逻辑内联到 TodoItem.vue |
| `toggleTodoDone()` | 逻辑内联到 TodoItem.vue |
| `renderTodoList()` | 删除，由 TodoListApp.vue 替代 |
| `renderTodoView()` | 删除，由 TodoViewApp.vue 替代 |
| `openTodoModal()` | 删除，由 Vue 弹窗替代 |
| `openEditTodoModal()` | 删除，由 Vue 弹窗替代 |
| `closeTodoModal()` | 删除 |
| `initLunarSelects()` | 内联到 TodoModal.vue |
| `updateLunarDays()` | 内联到 TodoModal.vue |
| `lunarToSolar()` | 内联到 TodoModal.vue |
| `updateLunarHint()` | 内联到 TodoModal.vue |
| `setupTodoModal()` | 删除，Vue 模板替代事件绑定 |
| `cleanupWeeklyDone()` | 保留在 todos.js（仍被 getTodosForDate 调用） |

## renderer.js 修改

```diff
-  if (currentView === 'calendar' && selectedDate) renderTodoList(selectedDate);
+  if (currentView === 'calendar' && selectedDate) window.__refreshTodoList?.(selectedDate);

  // 按钮事件
-  document.getElementById('todo-add-btn').addEventListener('click', openTodoModal);
+  document.getElementById('todo-add-btn').addEventListener('click', () => window.__openTodoModal?.());

  // 打卡页
-  renderTodoView()  // clockin 视图
+  // 由 Vue 自动渲染

  // 键盘快捷键
  if (e.key === 't' && !e.ctrlKey && !e.metaKey) {
-    openTodoModal();
+    window.__openTodoModal?.();
  }

-  if (typeof setupTodoModal === 'function') setupTodoModal();
+  // 删除 — Vue 模板已处理
```

## 验收标准

1. 日历面板待办列表外观和功能与之前完全一致
2. 打卡页待办视图外观和功能与之前完全一致
3. 添加/编辑弹窗所有字段和交互与之前完全一致
4. 完成/删除操作后日历格子状态同步刷新
5. 农历日期选择正常
6. 待办提醒设置和显示正常
7. 键盘快捷键 `T` 打开弹窗
8. 空状态显示正确