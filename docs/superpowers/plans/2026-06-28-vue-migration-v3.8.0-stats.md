# v3.8.0: Stats 模块迁移为 Vue 组件 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development

**Goal:** 将 stats.js 月度统计迁移到 Vue SFC，走 `__vueActivate` 页面路由模式

**Architecture:** 单个 Vue 页面组件 `StatsPage.vue`，通过 #app 路由显示。统计导出函数保留在 stats.js。

---

### Task 1: 创建 StatsPage.vue

- [ ] **Step 1: 新建 `src/pages/StatsPage.vue`**

```vue
<script setup>
import { ref, computed, onMounted } from 'vue'

const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth())

onMounted(() => {
  currentYear.value = window.currentYear || new Date().getFullYear()
  currentMonth.value = window.currentMonth || new Date().getMonth()
})

const allData = computed(() => window.allData || {})
const daysInMonth = computed(() => {
  return new Date(currentYear.value, currentMonth.value + 1, 0).getDate()
})

const stats = computed(() => {
  let workDays = 0, restDays = 0, tripDays = 0, leaveDays = 0, annualDays = 0, sickDays = 0, personalDays = 0, holidayCount = 0, workdayCount = 0
  const dayRecords = []
  const tagCounts = {}

  for (let day = 1; day <= daysInMonth.value; day++) {
    const ds = `${currentYear.value}-${String(currentMonth.value + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const d = allData.value[ds]
    const status = d ? d.status : null
    const note = d ? (d.note || '') : ''
    const tags = d ? (d.tags || []) : []
    const holiday = window.getHolidayInfo ? window.getHolidayInfo(ds) : null

    if (status === 'work') workDays++
    else if (status === 'rest') restDays++
    else if (status === 'trip') tripDays++
    else if (status === 'leave') leaveDays++
    else if (status === 'annual') annualDays++
    else if (status === 'sick') sickDays++
    else if (status === 'personal') personalDays++
    if (holiday && holiday.type === 'holiday') holidayCount++
    if (holiday && holiday.type === 'workday') workdayCount++

    for (const t of tags) tagCounts[t] = (tagCounts[t] || 0) + 1

    if (status || note || tags.length > 0 || holiday) {
      dayRecords.push({ day, dateStr: ds, status, note, tags, holiday })
    }
  }

  const totalRecorded = workDays + restDays + tripDays + leaveDays + annualDays + sickDays + personalDays
  const noStatus = daysInMonth.value - totalRecorded

  const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])

  return { workDays, restDays, tripDays, leaveDays, annualDays, sickDays, personalDays, noStatus, totalRecorded, dayRecords, sortedTags, holidayCount, workdayCount }
})

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const STATUS_LABELS = { work: '上班', rest: '休息', trip: '出差', leave: '请假', annual: '年假', sick: '病假', personal: '事假' }

function exportImage() {
  if (typeof window.exportStatsAsImage === 'function') {
    const s = stats.value
    window.exportStatsAsImage(s)
  }
}
</script>

<template>
  <div class="stats-content">
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
      <button class="settings-action-btn" style="font-size:11px;padding:4px 10px;" @click="exportImage">导出统计图片</button>
    </div>

    <div class="stats-cards">
      <div class="stat-card work"><div class="stat-num">{{ stats.workDays }}</div><div class="stat-label">上班</div></div>
      <div class="stat-card rest"><div class="stat-num">{{ stats.restDays }}</div><div class="stat-label">休息</div></div>
      <div class="stat-card trip"><div class="stat-num">{{ stats.tripDays }}</div><div class="stat-label">出差</div></div>
      <div v-if="stats.leaveDays > 0" class="stat-card leave"><div class="stat-num">{{ stats.leaveDays }}</div><div class="stat-label">请假</div></div>
      <div v-if="stats.annualDays > 0" class="stat-card annual"><div class="stat-num">{{ stats.annualDays }}</div><div class="stat-label">年假</div></div>
      <div v-if="stats.sickDays > 0" class="stat-card sick"><div class="stat-num">{{ stats.sickDays }}</div><div class="stat-label">病假</div></div>
      <div v-if="stats.personalDays > 0" class="stat-card personal"><div class="stat-num">{{ stats.personalDays }}</div><div class="stat-label">事假</div></div>
      <div class="stat-card total"><div class="stat-num">{{ stats.noStatus }}</div><div class="stat-label">未记录</div></div>
    </div>

    <div v-if="stats.holidayCount > 0 || stats.workdayCount > 0" class="ratio-section">
      <div class="theme-title">节假日信息</div>
      <div class="holiday-stats">
        <span v-if="stats.holidayCount" class="hs-item holiday-day">放假 {{ stats.holidayCount }} 天</span>
        <span v-if="stats.workdayCount" class="hs-item workday-day">调休上班 {{ stats.workdayCount }} 天</span>
      </div>
    </div>

    <div v-if="stats.totalRecorded > 0" class="ratio-section">
      <div class="ratio-bar">
        <div v-if="stats.workDays" class="ratio-seg work" :style="{ width: Math.round(stats.workDays/daysInMonth*100) + '%' }">{{ Math.round(stats.workDays/daysInMonth*100) }}%</div>
        <div v-if="stats.restDays" class="ratio-seg rest" :style="{ width: Math.round(stats.restDays/daysInMonth*100) + '%' }">{{ Math.round(stats.restDays/daysInMonth*100) }}%</div>
        <div v-if="stats.tripDays" class="ratio-seg trip" :style="{ width: Math.round(stats.tripDays/daysInMonth*100) + '%' }">{{ Math.round(stats.tripDays/daysInMonth*100) }}%</div>
      </div>
      <div class="ratio-legend">
        <span class="legend-item work">上班 {{ stats.workDays }}天</span>
        <span class="legend-item rest">休息 {{ stats.restDays }}天</span>
        <span class="legend-item trip">出差 {{ stats.tripDays }}天</span>
      </div>
    </div>

    <div v-if="stats.sortedTags.length > 0" class="ratio-section">
      <div class="theme-title">标签统计</div>
      <div class="tag-stats-list">
        <div v-for="[tag, count] in stats.sortedTags" :key="tag" class="tag-stat-item">
          <span class="tag-chip static">{{ tag }}</span>
          <span class="tag-stat-count">{{ count }}次</span>
        </div>
      </div>
    </div>

    <div v-if="stats.dayRecords.length > 0">
      <div class="records-title">本月记录 ({{ stats.dayRecords.length }}天)</div>
      <div class="records-list">
        <div v-for="r in stats.dayRecords" :key="r.day" class="record-item">
          <div class="record-head">
            <span class="record-date">{{ r.day }}日 周{{ WEEKDAYS[new Date(r.dateStr + 'T00:00:00').getDay()] }} <span v-if="r.holiday" :class="'record-holiday ' + r.holiday.type">{{ r.holiday.name }}</span></span>
            <span :class="'record-status ' + (r.status || 'none')">{{ STATUS_LABELS[r.status] || '未标记' }}</span>
          </div>
          <div v-if="r.tags && r.tags.length > 0" class="record-tags">
            <span v-for="t in r.tags" :key="t" class="tag-chip static">{{ t }}</span>
          </div>
          <div v-if="r.note" class="record-note">{{ r.note }}</div>
        </div>
      </div>
    </div>
    <div v-else class="empty-tip">本月暂无记录</div>
  </div>
</template>
```

- [ ] **Step 2: 验证构建**

```bash
npx vite build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/StatsPage.vue
git commit -m "feat: add StatsPage.vue — monthly statistics view"
```

### Task 2: 修改 App.vue 添加 stats 路由

- [ ] **Step 1: 在 `src/components/App.vue` 添加 StatsPage 路由**

```diff
 <script setup>
 import { ref } from 'vue'
 import SettingsPage from '../pages/SettingsPage.vue'
+import StatsPage from '../pages/StatsPage.vue'

 const activePage = ref(null)

 window.__vueActivate = (page) => { activePage.value = page }
 window.__vueDeactivate = () => { activePage.value = null }
 </script>

 <template>
   <SettingsPage v-if="activePage === 'settings'" />
+  <StatsPage v-if="activePage === 'stats'" />
 </template>
```

- [ ] **Step 2: 验证构建**

```bash
npx vite build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/components/App.vue
git commit -m "feat: add StatsPage route to App.vue"
```

### Task 3: 修改 renderer.js 路由

- [ ] **Step 1: 修改 `switchView` 添加 stats 到 Vue 路由**

```diff
 function switchView(view) {
   // 非 Vue 页面
+  const VUE_PAGES = ['settings', 'stats']
+  if (VUE_PAGES.includes(view)) {
+    document.getElementById('page-container').style.display = 'none'
+    document.getElementById('app').style.display = 'block'
+    window.__vueActivate?.(view)
+    return
+  }
   // ... 现有逻辑
 }
```

Wait - I need to check the current state of switchView in renderer.js after v3.5.0 changes and v3.6.0/v3.7.0 changes. Let me read it.

Actually, I'll let the implementer subagent handle this - they'll read the current file and apply the right changes.

- [ ] **Step 4: 验证构建**

```bash
npx vite build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer.js
git commit -m "fix: route stats page to Vue component"
```

### Task 4: 清理 stats.js

- [ ] **Step 1: 移除 `renderStats()` 函数（已由 StatsPage.vue 替代）**

保留 `exportStatsAsImage()` 函数（仍从 StatsPage.vue 调用）。

```diff
 // stats.js — Monthly statistics view
-
-function renderStats() {
-  // ... 整个函数移除
-}
 
 // 导出统计为图片
 async function exportStatsAsImage(stats) {
   // ... 保留不变
 }
```

- [ ] **Step 2: 更新 renderer.js 中的引用**

将 `if (view === 'stats') renderStats()` 移除（Vue 已处理），检查其他引用。

- [ ] **Step 3: 验证构建**

```bash
npx vite build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/stats.js src/renderer.js
git commit -m "refactor: remove renderStats (replaced by StatsPage.vue)"
```

### Task 5: 版本发布 v3.8.0

- [ ] **Step 1: 版本号更新**

```bash
# package.json → 3.8.0
# version.json → 3.8.0, versionCode+1
# README.md → changelog
```

- [ ] **Step 2: 发布**

```bash
git add -A && git commit -m "chore: bump v3.8.0 — migrate stats to Vue"
git tag v3.8.0 && git push && git push --tags
```