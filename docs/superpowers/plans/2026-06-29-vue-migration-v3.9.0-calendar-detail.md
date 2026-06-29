# v3.9.0: Calendar 详情面板迁移为 Vue 组件 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development

**Goal:** 将日历详情面板（状态按钮、颜色选择、标签编辑、备注）从 DOM 操作迁移到 Vue 组件

**Architecture:** 独立 Vue 应用 `vue-calendar.js`，挂载到 `#detail-panel-vue`。新组件替换 `#detail-panel` 内部内容。

## 文件清单

| 文件 | 操作 |
|------|------|
| `src/components/DetailPanel.vue` | 新建 — 详情面板容器 |
| `src/components/StatusButtons.vue` | 新建 — 7 状态按钮 |
| `src/components/ColorPicker.vue` | 新建 — 8 色选择 |
| `src/components/TagEditor.vue` | 新建 — 标签输入 + 快捷标签 |
| `src/components/NoteEditor.vue` | 新建 — 备注输入 |
| `src/vue-calendar.js` | 新建 — Vue 入口 |
| `src/index.html` | 修改 — 添加 `#detail-panel-vue` |
| `src/renderer.js` | 修改 — 路由到 Vue |
| `src/calendar.js` | 修改 — 清理旧代码 |

### Task 1: 创建 StatusButtons.vue

```vue
<script setup>
import { computed } from 'vue'

const props = defineProps({
  selectedDate: String,
  currentStatus: String
})
const emit = defineEmits(['update'])

const STATUS_LABELS = { work: '上班', rest: '休息', trip: '出差', leave: '请假', annual: '年假', sick: '病假', personal: '事假' }

async function setStatus(status) {
  const dayData = window.allData?.[props.selectedDate]
  const newStatus = (dayData?.status === status) ? '' : status
  await window.calendarAPI.saveDay(props.selectedDate, newStatus, dayData?.note || '', dayData?.tags || [], dayData?.color || '')
  if (!window.allData[props.selectedDate]) window.allData[props.selectedDate] = {}
  window.allData[props.selectedDate].status = newStatus || undefined
  window.renderCalendar?.()
  emit('update')
}
</script>
<template>
  <div class="status-row">
    <button v-for="(label, key) in STATUS_LABELS" :key="key"
      class="status-btn" :class="{ active: currentStatus === key }"
      :data-status="key" @click="setStatus(key)">{{ label }}</button>
  </div>
</template>
```

### Task 2: 创建 ColorPicker.vue

```vue
<script setup>
const props = defineProps({ selectedDate: String, currentColor: String })
const COLORS = [
  { color: '', title: '无颜色' },
  { color: '#ffcdd2', title: '红色' },
  { color: '#c8e6c9', title: '绿色' },
  { color: '#bbdefb', title: '蓝色' },
  { color: '#fff9c4', title: '黄色' },
  { color: '#e1bee7', title: '紫色' },
  { color: '#ffe0b2', title: '橙色' },
  { color: '#b2dfdb', title: '青色' },
]

async function setColor(color) {
  const d = window.allData?.[props.selectedDate] || {}
  await window.calendarAPI.saveDay(props.selectedDate, d.status || '', d.note || '', d.tags || [], color)
  if (!window.allData[props.selectedDate]) window.allData[props.selectedDate] = {}
  window.allData[props.selectedDate].color = color || undefined
  window.renderCalendar?.()
}
</script>
<template>
  <div class="color-row">
    <span class="color-label">标记颜色</span>
    <div class="color-options">
      <span v-for="c in COLORS" :key="c.color" class="color-dot"
        :class="{ active: currentColor === c.color }"
        :style="c.color ? { background: c.color } : {}"
        :title="c.title" @click="setColor(c.color)"></span>
    </div>
  </div>
</template>
```

### Task 3: 创建 TagEditor.vue

```vue
<script setup>
import { ref, computed } from 'vue'
const props = defineProps({ selectedDate: String, tags: { type: Array, default: () => [] } })
const tagInput = ref('')

const QUICK_TAGS = ['加班','迟到','早退','会议','培训','请假','远程','外勤']

function addTag(tag) {
  const trimmed = (tag || tagInput.value).trim()
  if (!trimmed || props.tags.includes(trimmed)) { tagInput.value = ''; return }
  const newTags = [...props.tags, trimmed]
  saveTags(newTags)
  tagInput.value = ''
}
function removeTag(tag) {
  saveTags(props.tags.filter(t => t !== tag))
}
async function saveTags(newTags) {
  const d = window.allData?.[props.selectedDate] || {}
  await window.calendarAPI.saveDay(props.selectedDate, d.status || '', d.note || '', newTags, d.color || '')
  if (!window.allData[props.selectedDate]) window.allData[props.selectedDate] = {}
  window.allData[props.selectedDate].tags = [...newTags]
  window.renderCalendar?.()
}
</script>
<template>
  <div class="tag-section">
    <div class="tag-list">
      <span v-for="t in tags" :key="t" class="tag-item">{{ t }}<span class="tag-remove" @click="removeTag(t)">&times;</span></span>
    </div>
    <div class="tag-input-row">
      <input v-model="tagInput" type="text" placeholder="添加标签，回车确认" maxlength="10" @keydown.enter="addTag()">
      <button class="tag-add-btn" @click="addTag()">+</button>
    </div>
    <div class="tag-quick">
      <span v-for="qt in QUICK_TAGS" :key="qt" class="quick-tag" @click="addTag(qt)">{{ qt }}</span>
    </div>
  </div>
</template>
```

### Task 4: 创建 NoteEditor.vue

```vue
<script setup>
import { ref, watch } from 'vue'
const props = defineProps({ selectedDate: String, note: String })
const noteText = ref(props.note || '')
watch(() => props.note, (v) => { noteText.value = v || '' })
watch(() => props.selectedDate, () => { noteText.value = props.note || '' })

async function saveNote() {
  const d = window.allData?.[props.selectedDate] || {}
  await window.calendarAPI.saveDay(props.selectedDate, d.status || '', noteText.value, d.tags || [], d.color || '')
  if (!window.allData[props.selectedDate]) window.allData[props.selectedDate] = {}
  window.allData[props.selectedDate].note = noteText.value
  window.showToast?.('备注已保存')
}
</script>
<template>
  <div class="note-section">
    <textarea v-model="noteText" placeholder="备注今天做了什么..." rows="3"></textarea>
    <button class="save-btn" @click="saveNote">保存</button>
  </div>
</template>
```

### Task 5: 创建 DetailPanel.vue (容器)

```vue
<script setup>
import { ref, watch } from 'vue'
import StatusButtons from './StatusButtons.vue'
import ColorPicker from './ColorPicker.vue'
import TagEditor from './TagEditor.vue'
import NoteEditor from './NoteEditor.vue'

const selectedDate = ref(null)
const dayData = ref({})

window.__vueDetailPanel = (dateStr) => {
  selectedDate.value = dateStr
  dayData.value = window.allData?.[dateStr] || {}
}

watch(selectedDate, () => {
  dayData.value = window.allData?.[selectedDate.value] || {}
})
</script>
<template>
  <div v-if="selectedDate" id="detail-panel" class="detail-panel">
    <div id="detail-date" class="detail-date">{{ selectedDate }}</div>
    <StatusButtons :selectedDate :currentStatus="dayData?.status" />
    <ColorPicker :selectedDate :currentColor="dayData?.color || ''" />
    <TagEditor :selectedDate :tags="dayData?.tags || []" />
    <div class="todo-section"><div class="todo-header-row"><span class="todo-title">待办</span></div><div id="todo-list-vue" class="todo-list"></div></div>
    <NoteEditor :selectedDate :note="dayData?.note || ''" />
  </div>
</template>
```

### Task 6: vue-calendar.js 入口 + HTML 挂载点

```js
import { createApp } from 'vue'
import DetailPanel from './components/DetailPanel.vue'
createApp(DetailPanel).mount('#detail-panel-vue')
```

HTML: 在 `#detail-panel` 前或后添加 `<div id="detail-panel-vue"></div>`，将原 `#detail-panel` 内容移入 Vue

### Task 7: 修改 renderer.js + 清理 calendar.js 中的详情面板代码

renderer.js: 在 showDetailPanel 中用 `window.__vueDetailPanel?.(dateStr)` 替代现有 DOM 操作

calendar.js: 移除详情面板渲染相关代码（状态事件绑定、颜色点击、标签输入、保存备注等）

### Task 8: 版本发布 v3.9.0
