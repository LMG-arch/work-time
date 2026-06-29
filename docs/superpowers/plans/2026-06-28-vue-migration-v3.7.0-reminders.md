# v3.7.0: Reminder 模块迁移为 Vue 组件 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 将 reminders.js 中的打卡提醒列表、设置弹窗和打卡历史迁移到 Vue SFC，行为零变更

**Architecture:** 独立 Vue 应用（`vue-reminders.js`），3 个 `createApp` 分别挂载到 `#reminder-list-vue`、`#reminder-history-vue`、`#reminder-settings-vue`。通知调度逻辑（scheduleReminderNotifications）、喝水记录、工具函数保留在 reminders.js。

**Tech Stack:** Vue 3, existing reminders data via window.allReminders/window.allReminderRecords

---

## 文件清单

| 文件 | 操作 |
|------|------|
| `src/components/ReminderList.vue` | 新建 — 今日提醒卡片列表 |
| `src/components/ReminderHistory.vue` | 新建 — 7 天打卡历史 |
| `src/components/ReminderSettings.vue` | 新建 — 提醒设置弹窗 |
| `src/vue-reminders.js` | 新建 — 独立 Vue 应用入口 |
| `src/index.html` | 修改 — 添加挂载点 |
| `src/renderer.js` | 修改 — 路由到 Vue |
| `src/reminders.js` | 修改 — 移除被替代的函数 |

## 挂载点

```html
<!-- 替换 clockin-today-reminders 的内容 -->
<div id="reminder-list-vue" class="clockin-today-reminders"></div>

<!-- 替换 clockin-history 的内容 -->
<div id="reminder-history-vue" class="clockin-history"></div>

<!-- 替换 reminder-modal 的内容 -->
<div id="reminder-settings-vue"></div>
```

### Task 1: 创建 ReminderList.vue

- [ ] **Step 1: 新建 src/components/ReminderList.vue**

```vue
<script setup>
import { ref, computed } from 'vue'

const todayStr = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
})

const reminders = computed(() => window.allReminders || [])
const todayData = computed(() => (window.allData || {})[todayStr.value])
const records = computed(() => (window.allReminderRecords || {})[todayStr.value] || {})

const nonWorkStatuses = ['rest', 'leave', 'annual', 'sick', 'personal']
const isRestDay = computed(() => todayData.value && nonWorkStatuses.includes(todayData.value.status))
const restDayLabel = computed(() => {
  if (!isRestDay.value) return ''
  const labels = { rest: '休息', leave: '请假', annual: '年假', sick: '病假', personal: '事假' }
  return labels[todayData.value.status] || '休息'
})

const currentTime = computed(() => {
  const now = new Date()
  return String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0')
})

function getCardStatus(r) {
  if (records.value[r.id]?.confirmed) return 'confirmed'
  if (currentTime.value >= r.time) return 'pending'
  return 'waiting'
}

async function confirmReminder(r) {
  await window.calendarAPI.confirmReminder(todayStr.value, r.id)
  if (!window.allReminderRecords[todayStr.value]) window.allReminderRecords[todayStr.value] = {}
  window.allReminderRecords[todayStr.value][r.id] = { confirmed: true, at: new Date().toISOString() }
  window.renderCalendar?.()
  window.showToast?.('打卡成功 ✓')
}

// 暴露刷新接口
window.__refreshReminderList = () => {}
</script>

<template>
  <div>
    <!-- 休息日提示 -->
    <div v-if="isRestDay" class="rest-day-skip">😴 今天是{{ restDayLabel }}日，不需要打卡</div>

    <!-- 提醒卡片 -->
    <template v-else>
      <div v-for="r in reminders.filter(r => r.enabled)" :key="r.id" class="reminder-card" :class="{ confirmed: getCardStatus(r) === 'confirmed' }">
        <div class="reminder-time">{{ r.time }}</div>
        <div class="reminder-info">
          <span class="reminder-label">{{ r.label }}</span>
          <span class="reminder-status">
            {{ getCardStatus(r) === 'confirmed' ? '已确认打卡' : getCardStatus(r) === 'pending' ? '待确认' : '未到时间' }}
          </span>
        </div>
        <button
          class="reminder-confirm-btn"
          :class="getCardStatus(r)"
          :disabled="getCardStatus(r) !== 'pending'"
          @click="confirmReminder(r)"
        >
          {{ getCardStatus(r) === 'confirmed' ? '✓ 已打卡' : getCardStatus(r) === 'pending' ? '确认打卡' : '等待中' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.rest-day-skip { text-align:center; padding:20px; color:var(--text-secondary,#888); font-size:14px; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ReminderList.vue
git commit -m "feat: add ReminderList.vue — today's reminder cards"
```

### Task 2: 创建 ReminderHistory.vue

- [ ] **Step 1: 新建 src/components/ReminderHistory.vue**

```vue
<script setup>
import { computed } from 'vue'

const WEEKDAYS = ['日','一','二','三','四','五','六']

const last7Days = computed(() => {
  const days = []
  const today = new Date()
  for (let i = 0; i < 7; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const y = d.getFullYear()
    const m = String(d.getMonth()+1).padStart(2,'0')
    const day = String(d.getDate()).padStart(2,'0')
    days.push({ dateStr: `${y}-${m}-${day}`, month: parseInt(m), day: parseInt(day), weekday: WEEKDAYS[d.getDay()] })
  }
  return days
})

const reminders = computed(() => window.allReminders || [])
const allRecords = computed(() => window.allReminderRecords || {})

const hasRecords = computed(() => {
  return last7Days.value.some(d => {
    const records = allRecords.value[d.dateStr]
    return records && Object.keys(records).length > 0
  })
})

window.__refreshReminderHistory = () => {}
</script>

<template>
  <div>
    <div v-if="!hasRecords" class="empty-tip">暂无打卡记录</div>
    <div v-for="d in last7Days" :key="d.dateStr" class="history-item">
      <template v-if="allRecords[d.dateStr] && Object.keys(allRecords[d.dateStr]).length > 0">
        <div class="history-date">{{ d.month }}月{{ d.day }}日 周{{ d.weekday }}</div>
        <div class="history-records">
          <span v-for="r in reminders.filter(r => r.enabled)" :key="r.id"
            class="history-record"
            :class="allRecords[d.dateStr][r.id]?.confirmed ? 'confirmed' : 'unconfirmed'"
          >
            {{ r.label }} {{ allRecords[d.dateStr][r.id]?.confirmed ? '✓' : '✗' }}
          </span>
        </div>
      </template>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ReminderHistory.vue
git commit -m "feat: add ReminderHistory.vue — 7-day clockin history"
```

### Task 3: 创建 ReminderSettings.vue

- [ ] **Step 1: 新建 src/components/ReminderSettings.vue**

```vue
<script setup>
import { ref, computed } from 'vue'

const visible = ref(false)
const items = ref([])

window.__openReminderSettings = () => {
  items.value = (window.allReminders || []).map(r => ({
    id: r.id,
    label: r.label,
    time: r.time,
    enabled: r.enabled,
    sound: r.sound !== false,
    vibrate: r.vibrate !== false,
  }))
  visible.value = true
}
window.__closeReminderSettings = () => { visible.value = false }

async function save() {
  const updated = items.value.map(i => ({
    id: i.id,
    label: i.label.trim() || '打卡',
    time: i.time,
    enabled: i.enabled,
    sound: i.sound,
    vibrate: i.vibrate,
  }))
  window.allReminders = updated
  await window.calendarAPI.saveReminders(updated)
  visible.value = false
  window.__refreshReminderList?.()
  if (typeof window.scheduleReminderNotifications === 'function') window.scheduleReminderNotifications()
  if (typeof window.scheduleTodoReminders === 'function') window.scheduleTodoReminders()
  window.showToast?.('提醒设置已保存')
}

async function sendTest() {
  if (typeof window.sendTestNotification === 'function') {
    await window.sendTestNotification()
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal" style="display:flex;" @click.self="visible = false">
      <div class="modal-content">
        <div class="modal-title">打卡提醒设置</div>
        <div class="reminder-settings-list">
          <div v-for="(item, idx) in items" :key="item.id" class="reminder-setting-item">
            <input type="time" v-model="item.time" class="setting-time-input">
            <input type="text" v-model="item.label" class="setting-label-input" maxlength="10">
            <div style="display:flex;gap:8px;align-items:center;">
              <label style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:2px;" title="声音">
                <input type="checkbox" v-model="item.sound" style="width:12px;height:12px;">🔔
              </label>
              <label style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:2px;" title="震动">
                <input type="checkbox" v-model="item.vibrate" style="width:12px;height:12px;">📳
              </label>
              <label class="toggle-switch">
                <input type="checkbox" v-model="item.enabled">
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="modal-btn" style="background:var(--accent);color:#fff;" @click="sendTest">测试通知</button>
          <button class="modal-btn cancel" @click="visible = false">取消</button>
          <button class="modal-btn confirm" @click="save">保存</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.reminder-settings-list { max-height:400px; overflow-y:auto; }
.reminder-setting-item { display:flex; align-items:center; gap:8px; padding:10px 0; border-bottom:1px solid var(--border,#e0e0e0); flex-wrap:wrap; }
.setting-time-input { width:90px; padding:4px 8px; border:1px solid var(--border,#e0e0e0); border-radius:6px; font-size:14px; background:var(--bg,#fff); color:var(--text,#333); }
.setting-label-input { flex:1; min-width:80px; padding:4px 8px; border:1px solid var(--border,#e0e0e0); border-radius:6px; font-size:13px; background:var(--bg,#fff); color:var(--text,#333); }
</style>
```

- [ ] **Step 2: 验证构建**

```bash
npx vite build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ReminderSettings.vue
git commit -m "feat: add ReminderSettings.vue — reminder settings modal"
```

### Task 4: vue-reminders.js 入口 + HTML 挂载点

- [ ] **Step 1: 新建 src/vue-reminders.js**

```js
import { createApp } from 'vue'
import ReminderList from './components/ReminderList.vue'
import ReminderHistory from './components/ReminderHistory.vue'
import ReminderSettings from './components/ReminderSettings.vue'

createApp(ReminderList).mount('#reminder-list-vue')
createApp(ReminderHistory).mount('#reminder-history-vue')
createApp(ReminderSettings).mount('#reminder-settings-vue')
```

- [ ] **Step 2: 修改 src/index.html**

a) 在 `#clockin-today-reminders` 中添加 `#reminder-list-vue`：
```diff
-<div id="clockin-today-reminders" class="clockin-today-reminders"></div>
+<div id="reminder-list-vue" class="clockin-today-reminders"></div>
```

b) 在 `#clockin-history` 中添加 `#reminder-history-vue`：
```diff
-<div id="clockin-history" class="clockin-history"></div>
+<div id="reminder-history-vue" class="clockin-history"></div>
```

c) 替换 `#reminder-modal` 为 `#reminder-settings-vue`：
```diff
-<div id="reminder-modal" class="modal">...</div>
+<div id="reminder-settings-vue"></div>
```

d) 在 `</body>` 前添加：
```diff
+<script type="module" src="./vue-reminders.js"></script>
```

- [ ] **Step 3: 验证构建**

```bash
npx vite build 2>&1 | tail -5
grep -E 'reminder-list-vue|reminder-history-vue|reminder-settings-vue' dist/index.html
```

- [ ] **Step 4: Commit**

```bash
git add src/vue-reminders.js src/index.html
git commit -m "feat: add vue-reminders.js entry and HTML mount points"
```

### Task 5: 修改 renderer.js

- [ ] **Step 1: 修改 renderer.js**

```diff
 function renderClockinView() {
   updateMonthLabel();
   const todayStr = getTodayStr();
   document.getElementById('clockin-today-label').textContent = formatDateCN(todayStr);
 
-  // Today's reminders (由 Vue 替代)
-  // renderWaterTracker 保留
+  // Vue 组件自动渲染提醒列表
+  window.__refreshReminderList?.();
 
   renderWaterTracker();
-  renderClockinHistory();
+  window.__refreshReminderHistory?.();
 
   // Todo section (由 Vue 替代)
-  renderTodoView();
+  // TodoViewApp.vue 自动渲染
 }
```

```diff
-  document.getElementById('clockin-settings-btn').addEventListener('click', openReminderSettings);
+  document.getElementById('clockin-settings-btn').addEventListener('click', () => window.__openReminderSettings?.());
```

移除：
```diff
-  document.getElementById('reminder-modal-cancel').addEventListener('click', closeReminderSettings);
-  document.getElementById('reminder-modal-save').addEventListener('click', saveReminderSettings);
-  document.getElementById('reminder-test-btn').addEventListener('click', sendTestNotification);
```

- [ ] **Step 2: 验证语法**

```bash
node -c src/renderer.js
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer.js
git commit -m "fix: route reminder operations to Vue components"
```

### Task 6: 清理 reminders.js 被替代的函数

- [ ] **Step 1: 移除以下函数（已由 Vue 替代）**

- `renderClockinView()` 中的提醒卡片部分 — 保留函数主体但去掉 reminders/history 相关行
- `renderReminderSettings()` — 已由 ReminderSettings.vue 替代
- `openReminderSettings()` — 已由 `window.__openReminderSettings` 替代
- `closeReminderSettings()` — 已由 Vue 内部处理
- `saveReminderSettings()` — 已由 ReminderSettings.vue 替代
- `renderClockinHistory()` — 已由 ReminderHistory.vue 替代

保留：
- `loadReminders()` / `loadReminderRecords()` — 数据加载
- `getReminderRecordsForDate()` / `isReminderConfirmed()` — 被 calendar.js 调用
- `getClockinStatusForDate()` — 被 calendar.js 调用
- `generateNotifId()` — 被 scheduleReminderNotifications 调用
- `scheduleReminderNotifications()` / `scheduleTodoReminders()` — 通知调度逻辑
- `sendTestNotification()` / `diagnoseNotifications()` — 工具函数
- `renderWaterTracker()` / `getWaterCount()` / `setWaterCount()` — 喝水记录
- 相关全局变量和辅助函数

- [ ] **Step 2: 验证构建**

```bash
npx vite build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/reminders.js
git commit -m "refactor: remove dead reminder functions (replaced by Vue)"
```

### Task 7: 验证 v3.7.0 全流程

- [ ] **Step 1: 生产构建**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 2: 版本发布**

```bash
# package.json → 3.7.0
# version.json → 3.7.0, versionCode+1
# README.md → changelog
git add -A && git commit -m "feat: v3.7.0 — migrate reminders to Vue components"
git tag v3.7.0 && git push && git push --tags
```