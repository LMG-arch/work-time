# v3.6.0: Todo 模块迁移为 Vue 组件 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 todos.js 中的待办渲染和弹窗逻辑迁移到 Vue SFC，行为零变更

**Architecture:** 创建独立 Vue 应用（非 #app 页面路由），挂载到预埋的 DOM 容器中。`vue-todos.js` 入口用 3 个 `createApp` 分别挂载 TodoList（日历面板）、TodoView（打卡页）、TodoModal（弹窗）。组件间通过 `window.*` 共享数据。

**Tech Stack:** Vue 3 (Composition API, SFC), existing calendarAPI, existing Lunar global

---

## 文件清单

| 文件 | 操作 |
|------|------|
| `src/vue-todos.js` | 新建 — 独立 Vue 应用入口 |
| `src/components/TodoItem.vue` | 新建 — 单条待办组件 |
| `src/components/TodoListApp.vue` | 新建 — 日历面板待办列表 |
| `src/components/TodoViewApp.vue` | 新建 — 打卡页待办视图 |
| `src/components/TodoModal.vue` | 新建 — 添加/编辑弹窗 |
| `src/index.html` | 修改 — 添加 3 个 Vue 挂载点，移除旧 todo-modal HTML |
| `src/renderer.js` | 修改 — 路由到 Vue 函数 |
| `src/todos.js` | 修改 — 移除被 Vue 替代的函数 |

### Task 1: 创建 TodoItem.vue

- [ ] **Step 1: 新建 src/components/TodoItem.vue**

```vue
<script setup>
import { computed } from 'vue'

const props = defineProps({
  todo: { type: Object, required: true },
  dateStr: { type: String, required: true },
  showDate: { type: Boolean, default: false },
})

const emit = defineEmits(['refresh'])

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
  const lunar = window.Lunar?.solar2lunar(d.getFullYear(), d.getMonth(), d.getDate())
  return lunar ? `${props.todo.date} ${lunar.full}` : props.todo.date
})

async function toggleDone() {
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
  if (typeof window.renderCalendar === 'function') window.renderCalendar()
}

async function deleteTodo() {
  try {
    await window.calendarAPI.deleteTodo(props.todo.id)
  } catch (e) {
    console.error('[TodoItem] delete IPC failed:', e.message)
    return
  }
  const idx = window.allTodos.findIndex(t => t.id === props.todo.id)
  if (idx >= 0) window.allTodos.splice(idx, 1)
  emit('refresh')
  if (typeof window.renderCalendar === 'function') window.renderCalendar()
  if (typeof window.showToast === 'function') window.showToast('已删除待办')
}

function openEdit() {
  if (typeof window.__openTodoModal === 'function') {
    window.__openTodoModal(props.todo)
  }
}
</script>

<template>
  <div class="todo-item" :class="{ done }">
    <span class="todo-check" @click="toggleDone">{{ done ? '✓' : '' }}</span>
    <div class="todo-view-info" v-if="showDate">
      <span class="todo-view-text">{{ todo.text }}<template v-if="remindLabel"><span style="font-size:11px;color:var(--text-secondary);">{{ remindLabel }}</span></template></span>
      <span class="todo-view-date">{{ dateDisplay }}</span>
    </div>
    <span class="todo-text" v-else>{{ todo.text }}<template v-if="remindLabel"><span style="font-size:11px;color:var(--text-secondary);">{{ remindLabel }}</span></template></span>
    <span class="todo-edit" title="编辑" @click="openEdit">✎</span>
    <span class="todo-del" @click="deleteTodo">&times;</span>
  </div>
</template>

<style scoped>
.todo-item { display:flex; align-items:center; gap:6px; padding:6px 0; border-bottom:1px solid var(--border,#e0e0e0); font-size:13px; }
.todo-text { flex:1; }
.todo-check { width:20px; height:20px; border:1px solid var(--border,#ccc); border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:12px; color:var(--accent); flex-shrink:0; }
.todo-check:hover { border-color:var(--accent); }
.todo-edit { cursor:pointer; font-size:14px; color:var(--text-secondary,#999); padding:2px; }
.todo-edit:hover { color:var(--accent); }
.todo-del { cursor:pointer; font-size:16px; color:#ccc; padding:2px; }
.todo-del:hover { color:#e53935; }
.done .todo-text { text-decoration:line-through; color:var(--text-secondary,#bbb); }
.done .todo-check { background:var(--accent,#333); border-color:var(--accent,#333); color:#fff; }
.todo-view-info { flex:1; display:flex; flex-direction:column; }
.todo-view-text { font-size:13px; }
.todo-view-date { font-size:11px; color:var(--text-secondary,#999); margin-top:2px; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TodoItem.vue
git commit -m "feat: add TodoItem.vue — single todo row with toggle/delete/edit"
```

### Task 2: 创建 TodoListApp.vue（日历面板待办列表）

- [ ] **Step 1: 新建 src/components/TodoListApp.vue**

```vue
<script setup>
import { ref, watch, computed } from 'vue'
import TodoItem from './TodoItem.vue'

const selectedDate = ref(null)
const todos = ref([])

// 暴露给 renderer.js 的刷新接口
window.__refreshTodoList = (dateStr) => {
  selectedDate.value = dateStr
  updateList()
}

function updateList() {
  if (!selectedDate.value) { todos.value = []; return }
  const ds = selectedDate.value
  const d = new Date(ds + 'T00:00:00')
  const weekday = d.getDay()
  const all = window.allTodos || []
  // cleanupWeeklyDone 由 renderer.js 定时调用
  todos.value = all.filter(t => {
    if (t.type === 'once') return t.date === ds
    if (t.type === 'weekly') return (t.weekdays || []).includes(weekday)
    return false
  })
}

function onRefresh() {
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TodoListApp.vue
git commit -m "feat: add TodoListApp.vue — calendar panel todo list"
```

### Task 3: 创建 TodoModal.vue（添加/编辑弹窗）

- [ ] **Step 1: 新建 src/components/TodoModal.vue**

这是最复杂的组件，覆盖所有弹窗字段和交互。

```vue
<script setup>
import { ref, computed, watch, onMounted } from 'vue'

const visible = ref(false)
const editingTodo = ref(null) // null = 添加模式, object = 编辑模式

const title = computed(() => editingTodo.value ? '编辑待办' : '添加待办')

// 表单字段
const text = ref('')
const type = ref('once')
const dateVal = ref('')
const lunarMonth = ref(1)
const lunarDay = ref(1)
const calType = ref('solar')
const weekdays = ref([])
const remind = ref('')
const remindTime = ref('09:00')

// 对外接口
window.__openTodoModal = (todo) => {
  if (todo) {
    // 编辑模式
    editingTodo.value = todo
    text.value = todo.text || ''
    type.value = todo.type || 'once'
    dateVal.value = todo.date || ''
    lunarMonth.value = todo.lunarMonth || 1
    lunarDay.value = todo.lunarDay || 1
    calType.value = todo.lunarMonth ? 'lunar' : 'solar'
    weekdays.value = todo.weekdays ? [...todo.weekdays] : []
    remind.value = todo.remind || ''
    remindTime.value = todo.remindTime || '09:00'
  } else {
    // 添加模式
    editingTodo.value = null
    text.value = ''
    type.value = 'once'
    dateVal.value = typeof window.selectedDate !== 'undefined' ? (window.selectedDate || '') : ''
    lunarMonth.value = 1
    lunarDay.value = 1
    calType.value = 'solar'
    weekdays.value = []
    remind.value = ''
    remindTime.value = '09:00'
  }
  visible.value = true
}
window.__closeTodoModal = () => { visible.value = false }

// 农历数据
const lunarMonths = computed(() => {
  return window.Lunar ? window.Lunar.MonthCN.map((name, i) => ({ value: i + 1, label: name + '月' })) : []
})
const lunarDays = computed(() => {
  const days = []
  for (let d = 1; d <= 30; d++) {
    const label = window.Lunar ? window.Lunar.dayCN(d) : String(d)
    days.push({ value: d, label })
  }
  return days
})

const lunarHint = computed(() => {
  if (!dateVal.value || !window.Lunar) return ''
  const parts = dateVal.value.split('-')
  const lunar = window.Lunar.solar2lunar(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
  return lunar ? lunar.full : ''
})

function lunarToSolar(lunarM, lunarD) {
  const year = new Date().getFullYear()
  for (let m = 0; m < 12; m++) {
    const dim = new Date(year, m + 1, 0).getDate()
    for (let d = 1; d <= dim; d++) {
      const lunar = window.Lunar.solar2lunar(year, m, d)
      if (lunar.lunarMonth === lunarM && lunar.lunarDay === lunarD && !lunar.isLeap) {
        return `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      }
    }
  }
  return null
}

function toggleWd(wd) {
  const idx = weekdays.value.indexOf(wd)
  if (idx >= 0) weekdays.value.splice(idx, 1)
  else weekdays.value.push(wd)
}

async function confirm() {
  if (!text.value.trim()) { window.showToast?.('请输入待办内容'); return }
  const updates = { text: text.value.trim(), type: type.value }

  if (type.value === 'once') {
    if (calType.value === 'lunar') {
      const dateStr = lunarToSolar(lunarMonth.value, lunarDay.value)
      if (!dateStr) { window.showToast?.('找不到对应的公历日期'); return }
      updates.date = dateStr
      updates.lunarMonth = lunarMonth.value
      updates.lunarDay = lunarDay.value
    } else {
      if (!dateVal.value) { window.showToast?.('请选择日期'); return }
      updates.date = dateVal.value
      updates.lunarMonth = null
      updates.lunarDay = null
    }
    if (!editingTodo.value) updates.done = false
  } else {
    if (weekdays.value.length === 0) { window.showToast?.('请选择重复星期'); return }
    updates.weekdays = [...weekdays.value]
    updates.lunarMonth = null
    updates.lunarDay = null
  }

  if (remind.value) {
    updates.remind = remind.value
    updates.remindTime = remindTime.value
  } else {
    updates.remind = ''
    updates.remindTime = ''
  }

  try {
    if (editingTodo.value) {
      // 编辑模式
      if (type.value === 'weekly' && editingTodo.value.weeklyDone) {
        updates.weeklyDone = editingTodo.value.weeklyDone
      }
      await window.calendarAPI.updateTodo(editingTodo.value.id, updates)
      Object.assign(editingTodo.value, updates)
      window.showToast?.('待办已更新')
    } else {
      const saved = await window.calendarAPI.addTodo(updates)
      window.allTodos.push(saved)
      window.showToast?.('待办已添加')
    }
  } catch (e) {
    console.error('[TodoModal] confirm failed:', e.message)
    window.showToast?.('保存失败')
    return
  }

  visible.value = false
  // 刷新日历面板和打卡页的待办列表
  if (typeof window.__refreshTodoList === 'function') {
    window.__refreshTodoList(window.selectedDate)
  }
  if (typeof window.__refreshTodoView === 'function') {
    window.__refreshTodoView()
  }
  if (typeof window.renderCalendar === 'function') window.renderCalendar()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal" style="display:flex;" @click.self="visible = false">
      <div class="modal-content">
        <div class="modal-title">{{ title }}</div>
        <input v-model="text" type="text" placeholder="待办内容" maxlength="50" class="modal-input">

        <div class="modal-row">
          <span class="modal-label">类型</span>
          <div class="modal-type-btns">
            <button class="type-btn" :class="{ active: type === 'once' }" @click="type = 'once'">指定日期</button>
            <button class="type-btn" :class="{ active: type === 'weekly' }" @click="type = 'weekly'">每周重复</button>
          </div>
        </div>

        <template v-if="type === 'once'">
          <div v-if="calType === 'solar'" class="modal-row">
            <span class="modal-label">日期</span>
            <input v-model="dateVal" type="date" class="modal-date-input">
            <span v-if="lunarHint" class="todo-date-lunar-hint">{{ lunarHint }}</span>
          </div>
          <div v-else class="modal-row">
            <span class="modal-label">农历</span>
            <div class="lunar-date-picker">
              <select v-model="lunarMonth" class="lunar-select">
                <option v-for="m in lunarMonths" :key="m.value" :value="m.value">{{ m.label }}</option>
              </select>
              <select v-model="lunarDay" class="lunar-select">
                <option v-for="d in lunarDays" :key="d.value" :value="d.value">{{ d.label }}</option>
              </select>
            </div>
          </div>
          <div class="modal-row">
            <span class="modal-label">历法</span>
            <div class="modal-type-btns">
              <button class="calendar-type-btn" :class="{ active: calType === 'solar' }" @click="calType = 'solar'">公历</button>
              <button class="calendar-type-btn" :class="{ active: calType === 'lunar' }" @click="calType = 'lunar'">农历</button>
            </div>
          </div>
        </template>

        <div v-if="type === 'weekly'" class="modal-row">
          <span class="modal-label">重复</span>
          <div class="weekday-picker">
            <span v-for="wd in [1,2,3,4,5,6,0]" :key="wd" class="wd-btn" :class="{ active: weekdays.includes(wd) }" @click="toggleWd(wd)">{{ ['日','一','二','三','四','五','六'][wd] }}</span>
          </div>
        </div>

        <div class="modal-row">
          <span class="modal-label">提醒</span>
          <div class="todo-remind-picker">
            <select v-model="remind" class="lunar-select">
              <option value="">不提醒</option>
              <option value="same">准时提醒</option>
              <option value="5">提前5分钟</option>
              <option value="10">提前10分钟</option>
              <option value="15">提前15分钟</option>
              <option value="30">提前30分钟</option>
              <option value="60">提前1小时</option>
              <option value="120">提前2小时</option>
              <option value="1440">提前1天</option>
            </select>
            <input v-if="remind" v-model="remindTime" type="time" class="modal-date-input" value="09:00">
          </div>
        </div>

        <div class="modal-actions">
          <button class="modal-btn cancel" @click="visible = false">取消</button>
          <button class="modal-btn confirm" @click="confirm">确定</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
```

- [ ] **Step 2: 验证构建**

```bash
npx vite build 2>&1 | tail -5
```
预期：构建成功，无 Vue 编译错误

- [ ] **Step 3: Commit**

```bash
git add src/components/TodoModal.vue
git commit -m "feat: add TodoModal.vue — add/edit todo with all fields"
```

### Task 4: 创建 TodoViewApp.vue（打卡页待办视图）

- [ ] **Step 1: 新建 src/components/TodoViewApp.vue**

```vue
<script setup>
import { ref, computed } from 'vue'
import TodoItem from './TodoItem.vue'

const filter = ref('all')

// 暴露给 renderer.js
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
  // 触发重新计算
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
.todo-view-list { }
.todo-group-title { font-size:12px; font-weight:600; color:var(--text-secondary,#666); padding:8px 0 4px; text-transform:uppercase; letter-spacing:1px; }
</style>
```

- [ ] **Step 2: 验证构建**

```bash
npx vite build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/components/TodoViewApp.vue
git commit -m "feat: add TodoViewApp.vue — clockin page todo view with filter"
```

### Task 5: 创建 vue-todos.js 入口 + HTML 挂载点

- [ ] **Step 1: 新建 src/vue-todos.js**

```js
import { createApp } from 'vue'
import TodoListApp from './components/TodoListApp.vue'
import TodoViewApp from './components/TodoViewApp.vue'
import TodoModal from './components/TodoModal.vue'

// 日历面板待办列表
createApp(TodoListApp).mount('#todo-list-vue')

// 打卡页待办视图
createApp(TodoViewApp).mount('#todo-view-vue')

// 待办弹窗（Teleport 到 body，控制显示/隐藏）
createApp(TodoModal).mount('#todo-modal-vue')
```

- [ ] **Step 2: 修改 src/index.html — 添加挂载点**

在 `#todo-list` 之后添加 `#todo-list-vue`，并移除旧 todo-modal HTML：

```diff
           <div id="todo-list" class="todo-list"></div>
+          <div id="todo-list-vue" class="todo-list"></div>
```

```diff
           <div id="todo-view-content" class="todo-view-content"></div>
+          <div id="todo-view-vue" class="todo-view-content"></div>
```

```diff
     <!-- Add Todo Modal -->
-    <div id="todo-modal" class="modal">...
-    </div>
+    <div id="todo-modal-vue"></div>
```

在 `</body>` 前添加脚本加载：

```diff
+  <script type="module" src="./vue-todos.js"></script>
   <script src="renderer.js"></script>
 </body>
```

- [ ] **Step 3: 更新 copy-legacy-assets 插件配置**

在 `vite.config.js` 的 `FILES` 列表中添加 `'vue-todos.js'`，或者在 `copyLegacyAssets` 插件中添加处理。注意：`vue-todos.js` 是一个 ES module 入口文件，会被 Vite 处理并打包到输出的 bundle 中。所以不需要复制它。

但实际上，由于 `vue-todos.js` 是 `<script type="module" src="./vue-todos.js">`，Vite 会像处理 vue-main.js 一样将它打包到输出中，不会保留为单独的脚本文件。所以不需要添加到 copy-legacy-assets。

验证：
```bash
npx vite build 2>&1 | tail -5
grep -c 'todo-list-vue\|todo-view-vue\|todo-modal-vue' dist/index.html
```
预期：构建成功，dist/index.html 中包含所有挂载点

- [ ] **Step 4: Commit**

```bash
git add src/vue-todos.js src/index.html
git commit -m "feat: add vue-todos.js entry and HTML mount points"
```

### Task 6: 修改 renderer.js — 路由到 Vue

- [ ] **Step 1: 修改 renderer.js**

```diff
   if (currentView === 'calendar' && selectedDate) {
-    renderTodoList(selectedDate);
+    window.__refreshTodoList?.(selectedDate);
   }
 
   // ...
-  document.getElementById('todo-add-btn').addEventListener('click', openTodoModal);
+  document.getElementById('todo-add-btn').addEventListener('click', () => window.__openTodoModal?.());
 
   // 键盘快捷键
   if (e.key === 't' && !e.ctrlKey && !e.metaKey) {
-    openTodoModal();
+    window.__openTodoModal?.();
     e.preventDefault();
   }
 
   // ...
   if (typeof setupColorPicker === 'function') setupColorPicker();
   if (typeof setupTagInputs === 'function') setupTagInputs();
-  if (typeof setupTodoModal === 'function') setupTodoModal();
   if (typeof setupPostImagePicker === 'function') setupPostImagePicker();
 
   // ...
   try {
     if (typeof initSocial === 'function') await initSocial();
   } catch (e) { console.error('[Init] initSocial failed:', e.message); }
 
   // 在 refreshAllData 中也添加 __refreshTodoList 调用
   function refreshAllData() {
     // ...
     if (currentView === 'calendar' && selectedDate) {
-      renderTodoList(selectedDate);
+      window.__refreshTodoList?.(selectedDate);
     }
   }
 
   // renderTodoView 在 switchView('clockin') 中调用 — 现在由 Vue 自动渲染
   // 不需要修改 switchView，因为 #todo-view-vue 已经存在于 DOM 中，Vue 自动渲染空内容直到 allTodos 变化
```

- [ ] **Step 2: 验证语法**

```bash
node -c src/renderer.js
```

预期：语法检查通过

- [ ] **Step 3: Commit**

```bash
git add src/renderer.js
git commit -m "fix: route todo operations to Vue components"
```

### Task 7: 清理 todos.js 被替代的函数

- [ ] **Step 1: 从 todos.js 移除以下函数**

移除（这些已由 Vue 组件替代）：
- `renderTodoList()` — 由 TodoListApp.vue 替代
- `renderTodoView()` — 由 TodoViewApp.vue 替代
- `openTodoModal()` — 由 TodoModal.vue + `window.__openTodoModal` 替代
- `openEditTodoModal()` — 同上
- `closeTodoModal()` — 由 `window.__closeTodoModal` 替代
- `setupTodoModal()` — Vue 模板自动处理
- `initLunarSelects()` — 内联到 TodoModal.vue
- `updateLunarDays()` — 同上
- `lunarToSolar()` — 同上
- `updateLunarHint()` — 同上

保留：
- `loadTodos()` — 仍然被 renderer.js 调用
- `getTodosForDate()` — 保留（可能被其他模块引用）
- `isTodoDone()` — 保留（可能被其他模块引用）
- `toggleTodoDone()` — 保留（可能被其他模块引用）
- `cleanupWeeklyDone()` — 保留

- [ ] **Step 2: 验证构建**

```bash
npx vite build 2>&1 | tail -5
```

预期：构建成功

- [ ] **Step 3: Commit**

```bash
git add src/todos.js
git commit -m "refactor: remove dead todo functions (replaced by Vue components)"
```

### Task 8: 验证 v3.6.0 全流程

- [ ] **Step 1: 生产构建**

```bash
npm run build 2>&1 | tail -5
```

预期：构建成功，无错误

- [ ] **Step 2: 验证挂载点**

```bash
grep -E 'todo-list-vue|todo-view-vue|todo-modal-vue' dist/index.html
```

预期：3 个挂载点都存在

- [ ] **Step 3: 版本发布**

```bash
# 更新 package.json → 3.6.0
# 更新 version.json → 3.6.0, versionCode +1
# 更新 README.md 更新日志
git add package.json version.json README.md
git commit -m "feat: v3.6.0 — migrate todos to Vue components"
git tag v3.6.0
git push && git push --tags
```

## 功能验证表

| 功能 | 验证方法 |
|------|---------|
| 日历面板待办列表 | 选中日期 → 查看待办列表显示 |
| 勾选完成 | 点击圆圈 ✓ → 文字划线 |
| 删除待办 | 点击 × → 移除 |
| 编辑待办 | 点击 ✎ → 弹窗填充已有数据 |
| 添加待办 | 点击 "+ 添加待办" → 弹窗 |
| 类型切换 | once/weekly → 切换日期/周选择 |
| 农历日期 | 选择"农历" → 月/日下拉框 |
| 周重复 | 选择每周重复 → 勾选星期 |
| 提醒设置 | 选择提醒时间 → 时间输入框 |
| 打卡页待办视图 | 切换到打卡页 → 待办列表+筛选 |
| 键盘 T 键 | 按 T → 弹窗 |
| 日历格子同步 | 完成待办 → 日历格子刷新 |