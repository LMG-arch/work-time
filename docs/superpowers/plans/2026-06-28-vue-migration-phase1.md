# Phase 1: Vue + Reka UI 迁移实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 Vite + Vue 3 + Reka UI 工具链，渐进式将设置页迁移为 Vue 组件

**Architecture:** 在三进程 Electron 架构（main/preload/renderer）基础上叠加 Vite 作为渲染进程构建工具，Vue SFC 与现有 JS 通过独立的 DOM 容器 (`#app` vs `#page-container`) 共存。renderer.js 的页面路由分派决定谁渲染当前页面。数据层不变，继续通过 contextBridge (`calendarAPI`) 与主进程通信。

**Tech Stack:** Vite 6, Vue 3 (Composition API, SFC), Reka UI (Switch only), Electron 35, Capacitor 8

---

## 里程碑及文件结构

### v3.4.0 — 工具链搭建（不改变任何 UI 行为）

| 文件 | 操作 |
|------|------|
| `package.json` | 修改 — 添加依赖和 scripts |
| `vite.config.js` | 新建 |
| `src/vue-main.js` | 新建 |
| `src/components/App.vue` | 新建 |
| `src/index.html` | 修改 — 添加 #app + vue-main.js |
| `main.js` | 修改 — 开发模式 loadURL |
| `capacitor.config.json` | 修改 — webDir 指向 dist |

### v3.5.0 — 设置页迁移为 Vue 组件

| 文件 | 操作 |
|------|------|
| `src/components/SettingsToggle.vue` | 新建 — Reka UI Switch 封装 |
| `src/components/SettingsSection.vue` | 新建 — 设置分组容器 |
| `src/pages/SettingsPage.vue` | 新建 — 完整设置页（替代 settings.js 功能） |
| `src/components/App.vue` | 修改 — 添加 SettingsPage 路由 |
| `src/renderer.js` | 修改 — settings 路由指向 Vue |
| `src/index.html` | 修改 — 移除 settings-view 静态 HTML |

---

## Milestone: v3.4.0 — 工具链搭建

### Task 1: 安装依赖

- [ ] **Step 1: 安装 Vite + Vue + Reka UI 依赖**

```bash
npm install --save-dev vite @vitejs/plugin-vue
npm install vue@3 reka-ui
npm install concurrently wait-on --save-dev
```

- [ ] **Step 2: 验证安装**

Run: `node -e "require('vite'); console.log('Vite OK')"`
Expected: `Vite OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add Vite + Vue + Reka UI dependencies"
```

### Task 2: 创建 Vite 配置

- [ ] **Step 1: 新建 vite.config.js**

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  root: 'src',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
})
```

**关键点：** `root: 'src'` 让 Vite 以 `src/` 为根，所有现有脚本的 `./renderer.js` 等路径无需修改；`base: './'` 确保 file:// 协议可用。

- [ ] **Step 2: 验证 Vite 配置可加载**

```bash
npx vite --help
```

Expected: Vite help output (no errors)

- [ ] **Step 3: Commit**

```bash
git add vite.config.js
git commit -m "chore: add Vite configuration (root: src, base: ./)"
```

### Task 3: 创建 Vue 应用骨架

- [ ] **Step 1: 新建 src/vue-main.js**

```js
import { createApp } from 'vue'
import App from './components/App.vue'

const app = createApp(App)
app.mount('#app')
```

- [ ] **Step 2: 新建 src/components/App.vue**

```vue
<script setup>
import { ref } from 'vue'

// 由 renderer.js 通过 window.__vueActivate 控制显示哪个页面
const activePage = ref(null)

// 暴露给 renderer.js 的全局函数
window.__vueActivate = (page) => { activePage.value = page }
window.__vueDeactivate = () => { activePage.value = null }

// v3.4.0: App.vue 不包含任何页面组件，仅作为 Vue 挂载验证
// 后续版本在此添加 <SettingsPage /> 等
</script>

<template>
  <!-- 空壳 — v3.4.0 不做任何 UI 渲染 -->
</template>
```

- [ ] **Step 3: 验证 Vue 文件语法**

```bash
npx vite build 2>&1 | head -20
```

Expected: 构建成功，输出 dist/index.html

- [ ] **Step 4: Commit**

```bash
git add src/vue-main.js src/components/App.vue
git commit -m "feat: add Vue app skeleton with mount point"
```

### Task 4: 修改 index.html

- [ ] **Step 1: 在 src/index.html 中添加 Vue 挂载点和入口脚本**

```diff
   <title>上班日历</title>
   <link rel="stylesheet" href="styles.css">
   <link rel="stylesheet" href="social.css">
+  <script type="module" src="./vue-main.js"></script>
 </head>
 <body>
+  <div id="app" style="display:none"></div>
   <div class="app">
```

**注意：** `#app` 放在 `body` 下、`.app` 同级。`display:none` 确保 Vue 挂载但不显示（v3.4.0 不需要它可见）。

- [ ] **Step 2: 验证 HTML 语法**

Run: `npx vite build 2>&1`
Expected: 构建成功，dist/index.html 包含 #app

- [ ] **Step 3: Commit**

```bash
git add src/index.html
git commit -m "feat: add Vue mount point and script to index.html"
```

### Task 5: 修改 main.js — Electron 加载 Vite

- [ ] **Step 1: 修改 createWindow 函数**

```diff
 function createWindow() {
   Menu.setApplicationMenu(null);
 
   // Security: set CSP to block inline scripts and external resources
   session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
     callback({
       responseHeaders: {
         ...details.responseHeaders,
         'Content-Security-Policy': [
-          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co https://*.supabase.io wss://*.supabase.co wss://*.supabase.io https://raw.githubusercontent.com; font-src 'self' data:; object-src 'none'; base-uri 'self';"
+          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co https://*.supabase.io wss://*.supabase.co wss://*.supabase.io https://raw.githubusercontent.com; font-src 'self' data:; object-src 'none'; base-uri 'self';"
         ]
       }
     });
   });
 
   win = new BrowserWindow({
     width: 420,
     height: 620,
     resizable: true,
     minWidth: 380,
     minHeight: 500,
     webPreferences: {
       preload: path.join(__dirname, 'preload.js'),
       contextIsolation: true,
       nodeIntegration: false
     }
   });
 
-  win.loadFile(path.join(__dirname, 'src', 'index.html'));
+  const isDev = !app.isPackaged;
+  if (isDev) {
+    win.loadURL('http://localhost:5173');
+    win.webContents.openDevTools();
+  } else {
+    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
+  }
 
   // Minimize to tray instead of closing
   win.on('close', (e) => {
```

**注意 CSP 变更：** 添加 `'unsafe-inline'` 到 `script-src`。Vite 开发模式使用内联脚本注入模块，生产模式输出独立文件。如果在生产构建中不需要，可在后续优化 CSP。

- [ ] **Step 2: 验证语法**

```bash
node -c main.js
```

Expected: 无语法错误

- [ ] **Step 3: Commit**

```bash
git add main.js
git commit -m "feat: support Vite dev server (loadURL) and production dist build"
```

### Task 6: 更新 capacitor.config.json

- [ ] **Step 1: 修改 webDir**

```diff
 {
   "appId": "com.workcalendar.app",
   "appName": "上班日历",
-  "webDir": "src",
+  "webDir": "dist",
   "server": {
     "androidScheme": "https"
   },
```

- [ ] **Step 2: Commit**

```bash
git add capacitor.config.json
git commit -m "chore: update Capacitor webDir to dist"
```

### Task 7: 更新 package.json scripts

- [ ] **Step 1: 修改 scripts**

```diff
 {
   "name": "work-calendar",
   "version": "3.4.0",
   "scripts": {
-    "start": "electron .",
+    "dev": "concurrently -k \"vite\" \"wait-on http://localhost:5173 && electron .\"",
+    "dev:vite": "vite",
+    "dev:electron": "wait-on http://localhost:5173 && electron .",
+    "build": "vite build",
+    "start": "electron .",
     "pack": "npm run build && electron-packager . WorkCalendar --platform=win32 --arch=x64 --out=dist-electron --overwrite --ignore=\"android|dist|docs|\\.git|\\.claude|.*\\.apk|启动.*|README\\.md|CHANGELOG.*|node_modules/@capacitor|node_modules/@nicolo-ribaudo|node_modules/capacitor\" && node set-icon.js && node scripts/clean-locales.js"
   },
```

**注意：** `-k` 参数表示一个任务退出时杀死另一个，避免 Vite 或 Electron 退出后另一个仍在运行。

- [ ] **Step 2: 验证 scripts**

```bash
node -e "const p = require('./package.json'); console.log(Object.keys(p.scripts).join(', '))"
```

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add dev/build scripts with Vite + Electron integration"
```

### Task 8: 验证 v3.4.0 全流程

- [ ] **Step 1: 验证 Vite 构建**

```bash
npm run build
ls dist/
```

Expected: dist/ 包含 index.html + 资源，无报错

- [ ] **Step 2: 构建后在本地打开验证**

```bash
npx serve dist  # 手动验证构建产出可访问
```

- [ ] **Step 3: 提交版本变更并发布**

```bash
# 更新 version.json
# 更新 README.md 更新日志
# 更新 android/app/build.gradle versionCode +1
git add -A
git commit -m "chore: bump v3.4.0 — Vue toolchain foundation"
git tag v3.4.0
git push && git push --tags
```

---

## Milestone: v3.5.0 — 设置页迁移

### Task 1: 创建 SettingsToggle.vue（Reka UI Switch 封装）

- [ ] **Step 1: 新建 src/components/SettingsToggle.vue**

```vue
<script setup>
import { SwitchRoot, SwitchThumb } from 'reka-ui'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <SwitchRoot
    :checked="modelValue"
    :disabled="disabled"
    class="settings-switch-root"
    @update:checked="emit('update:modelValue', $event)"
  >
    <SwitchThumb class="settings-switch-thumb" />
  </SwitchRoot>
</template>

<style scoped>
.settings-switch-root {
  width: 44px;
  height: 24px;
  background: var(--border, #ccc);
  border-radius: 12px;
  position: relative;
  border: none;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}
.settings-switch-root[data-state="checked"] {
  background: var(--accent, #333);
}
.settings-switch-root:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.settings-switch-thumb {
  display: block;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.settings-switch-root[data-state="checked"] .settings-switch-thumb {
  transform: translateX(20px);
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SettingsToggle.vue
git commit -m "feat: add Reka UI Switch wrapper component"
```

### Task 2: 创建 SettingsSection.vue（设置分组容器）

- [ ] **Step 1: 新建 src/components/SettingsSection.vue**

```vue
<script setup>
defineProps({
  title: { type: String, required: true },
  collapsible: { type: Boolean, default: false },
})
import { ref } from 'vue'
const open = ref(true)
</script>

<template>
  <div class="settings-group">
    <div
      v-if="collapsible"
      class="settings-group-title settings-collapsible"
      @click="open = !open"
    >
      {{ title }} <span class="collapse-arrow" :class="{ open }">▾</span>
    </div>
    <div v-else class="settings-group-title">{{ title }}</div>
    <div v-show="!collapsible || open">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.settings-group {
  background: var(--card, #fff);
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
}
.settings-group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, #666);
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.settings-collapsible {
  cursor: pointer;
  user-select: none;
}
.collapse-arrow {
  display: inline-block;
  transition: transform 0.2s;
  font-size: 12px;
}
.collapse-arrow.open {
  transform: rotate(180deg);
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SettingsSection.vue
git commit -m "feat: add settings section container component"
```

### Task 3: 创建 SettingsPage.vue（完整设置页）

这是最核心的任务。SettingsPage.vue 必须完全覆盖现有 settings.js + renderer.js 中所有设置相关的功能和交互。

- [ ] **Step 1: 新建 src/pages/SettingsPage.vue**

**代码说明：** SettingsPage.vue 使用 CalendarAPI（来自 preload.js 的 contextBridge）与主进程通信，与之前的 settings.js 使用完全相同的 IPC 通道。

```vue
<script setup>
import { ref, onMounted } from 'vue'
import SettingsToggle from '../components/SettingsToggle.vue'
import SettingsSection from '../components/SettingsSection.vue'

// ===== 全局依赖（通过 window 访问现有模块函数）=====
// 这些函数来自现有的 JS 模块（supabase.js, utils.js 等），保持不变
const getSupabaseConfig = window.getSupabaseConfig
const saveSupabaseConfig = window.saveSupabaseConfig
const initSupabase = window.initSupabase
const getSavedUsername = window.getSavedUsername
const getCurrentUser = window.getCurrentUser
const getMyProfile = window.getMyProfile
const registerAccount = window.registerAccount
const loginAccount = window.loginAccount
const logoutAccount = window.logoutAccount
const uploadAvatar = window.uploadAvatar
const isSyncEnabled = window.isSyncEnabled
const setSyncEnabled = window.setSyncEnabled
const syncCalendarData = window.syncCalendarData
const pushToCloud = window.pushToCloud
const pullFromCloud = window.pullFromCloud
const isAdmin = window.isAdmin
const resetSelected = window.resetSelected
const getTrashStats = window.getTrashStats
const getTrashSizes = window.getTrashSizes
const restoreSelected = window.restoreSelected
const emptySelected = window.emptySelected
const isCapacitorPlatform = window.isCapacitorPlatform
const showToast = window.showToast
const escapeHtml = window.escapeHtml

// ===== 主题 =====
const THEMES = window.THEMES || [
  { id: 'default', name: '经典', color: '#333' },
  { id: 'dark', name: '暗黑', color: '#1a1a2e' },
  { id: 'green', name: '清新', color: '#43A047' },
  { id: 'pink', name: '粉色', color: '#e91e63' },
  { id: 'purple', name: '紫色', color: '#7e57c2' },
  { id: 'navy', name: '商务', color: '#1565c0' },
  { id: 'ocean', name: '海洋', color: '#00838f' },
  { id: 'sunset', name: '日落', color: '#e65100' },
  { id: 'rose', name: '玫瑰金', color: '#b76e79' },
  { id: 'forest', name: '森林', color: '#2e7d32' },
  { id: 'coffee', name: '咖啡', color: '#5d4037' },
  { id: 'lavender', name: '薰衣草', color: '#9575cd' },
  { id: 'mint', name: '薄荷', color: '#26a69a' },
  { id: 'slate', name: '石板', color: '#546e7a' },
]
const currentTheme = ref(document.body.dataset.theme || 'default')

function setTheme(themeId) {
  currentTheme.value = themeId
  document.body.dataset.theme = themeId
  localStorage.setItem('calendar-theme', themeId)
}

// ===== 账号状态 =====
const isLoggedIn = ref(false)
const nickname = ref('')
const displayId = ref('')
const username = ref('')
const avatarUrl = ref('')
const regUsername = ref('')
const regPassword = ref('')
const authStatus = ref('')
const isSubmitting = ref(false)

async function updateAccountUI() {
  const savedUsername = getSavedUsername()
  const user = await getCurrentUser()
  if (user && savedUsername) {
    isLoggedIn.value = true
    username.value = savedUsername
    const profile = await getMyProfile()
    nickname.value = profile ? profile.nickname : savedUsername
    displayId.value = profile ? profile.display_id : '-'
    if (profile && profile.avatar) {
      avatarUrl.value = profile.avatar
    } else {
      avatarUrl.value = ''
    }
  } else {
    isLoggedIn.value = false
    regUsername.value = ''
    regPassword.value = ''
    authStatus.value = ''
  }
}

async function handleRegister() {
  if (!regUsername.value.trim() || !regPassword.value) return
  isSubmitting.value = true
  authStatus.value = '注册中...'
  try {
    const result = await registerAccount(regUsername.value.trim(), regPassword.value)
    if (result.error) {
      authStatus.value = result.error
    } else {
      await getMyProfile()
      authStatus.value = '注册成功！'
      regUsername.value = ''
      regPassword.value = ''
      await updateAccountUI()
    }
  } finally {
    isSubmitting.value = false
  }
}

async function handleLogin() {
  if (!regUsername.value.trim() || !regPassword.value) return
  isSubmitting.value = true
  authStatus.value = '登录中...'
  try {
    const result = await loginAccount(regUsername.value.trim(), regPassword.value)
    if (result.error) {
      authStatus.value = result.error
    } else {
      authStatus.value = '登录成功！'
      regUsername.value = ''
      regPassword.value = ''
      await updateAccountUI()
      try { await syncCalendarData(); await refreshAllData() } catch {}
    }
  } finally {
    isSubmitting.value = false
  }
}

async function handleLogout() {
  if (!confirm('确定退出登录？')) return
  isSubmitting.value = true
  await logoutAccount()
  await updateAccountUI()
  showToast('已退出登录')
  isSubmitting.value = false
}

async function handleAvatarUpload(e) {
  const file = e.target.files[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) { showToast('图片不能超过5MB'); e.target.value = ''; return }
  showToast('正在上传头像...')
  const result = await uploadAvatar(file)
  if (result.error) {
    showToast('上传失败: ' + result.error)
  } else {
    avatarUrl.value = result.url
    showToast('头像已更新 ✓')
  }
  e.target.value = ''
}

// ===== Supabase 配置 =====
const supabaseUrl = ref('')
const supabaseKey = ref('')

function loadSupabaseConfig() {
  const config = getSupabaseConfig()
  supabaseUrl.value = config.url || ''
  supabaseKey.value = config.key || ''
}

function saveSupabase() {
  if (!supabaseUrl.value.trim() || !supabaseKey.value.trim()) {
    showToast('请填写完整配置')
    return
  }
  saveSupabaseConfig(supabaseUrl.value.trim(), supabaseKey.value.trim())
  window.sb = initSupabase()
  showToast('配置已保存')
}

async function testSupabase() {
  if (!supabaseUrl.value.trim() || !supabaseKey.value.trim()) {
    showToast('请填写完整配置')
    return
  }
  saveSupabaseConfig(supabaseUrl.value.trim(), supabaseKey.value.trim())
  window.sb = initSupabase()
  const results = []
  function log(ok, msg) { results.push((ok ? '✓ ' : '✗ ') + msg) }
  log(true, '配置已保存')

  try {
    const { error } = await window.sb.auth.getSession()
    if (error) log(false, '会话失败: ' + error.message)
    else log(true, '会话接口正常')
  } catch (e) { log(false, '会话异常: ' + e.message) }

  try {
    const { data, error: authErr } = await window.sb.auth.signInAnonymously()
    if (authErr) log(false, '匿名登录失败: ' + authErr.message)
    else {
      log(true, '匿名登录成功: ' + data.user.id.slice(0, 8) + '...')
      try {
        const { data: prof } = await window.sb.from('profiles').select('display_id').eq('id', data.user.id).maybeSingle()
        if (prof && prof.display_id) log(true, '数字ID: ' + prof.display_id)
      } catch {}
    }
  } catch (e) { log(false, '匿名登录异常: ' + e.message) }

  try {
    const { data, error } = await window.sb.from('profiles').select('id').limit(1)
    if (error) {
      if (error.code === '42P01') log(false, 'profiles 表不存在 → 请执行 supabase-setup.sql')
      else log(false, '查询失败: ' + error.message)
    } else log(true, 'profiles 表可访问')
  } catch (e) { log(false, '查询异常: ' + e.message) }

  try {
    const { error } = await window.sb.from('posts').select('id').limit(1)
    if (error) log(false, 'posts 表不可用: ' + error.message)
    else log(true, 'posts 表可访问')
  } catch (e) { log(false, 'posts 表异常: ' + e.message) }

  showDiag(results.join('\n'))
}

function showDiag(message) {
  const existing = document.getElementById('diag-panel')
  if (existing) existing.remove()
  const panel = document.createElement('div')
  panel.id = 'diag-panel'
  panel.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;max-width:420px;width:90%;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.2);font-size:13px;white-space:pre-line;line-height:1.8;color:var(--text);'
  panel.innerHTML = '<div style="font-size:15px;font-weight:600;margin-bottom:12px;">🔍 诊断结果</div><div>' + escapeHtml(message).replace(/\n/g, '<br>') + '</div>' +
    '<button id="diag-close" style="margin-top:16px;width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--card);cursor:pointer;font-size:13px;">关闭</button>'
  document.body.appendChild(panel)
  document.getElementById('diag-close').addEventListener('click', () => panel.remove())
}

// ===== 数据同步 =====
const syncEnabled = ref(false)
const isSyncing = ref(false)

function updateSyncState() {
  syncEnabled.value = isSyncEnabled()
}

async function toggleSync() {
  const next = !syncEnabled.value
  setSyncEnabled(next)
  syncEnabled.value = next
  showToast(next ? '已开启自动同步' : '已关闭自动同步')
  if (next) {
    isSyncing.value = true
    const r = await syncCalendarData()
    if (r.error) showToast('同步失败: ' + r.error)
    else { showToast('同步完成 ✓'); await refreshAllData() }
    isSyncing.value = false
  }
}

async function syncNow() {
  isSyncing.value = true
  try {
    const r = await syncCalendarData()
    if (r.error) showToast('同步失败: ' + r.error)
    else { showToast('同步完成 ✓'); await refreshAllData() }
  } finally { isSyncing.value = false }
}

async function pushToCloudHandler() {
  if (!confirm('上传本地数据将覆盖云端数据，确定继续？')) return
  isSyncing.value = true
  try {
    const r = await pushToCloud()
    if (r.error) showToast('上传失败: ' + r.error)
    else showToast('本地数据已上传到云端 ✓')
  } finally { isSyncing.value = false }
}

async function pullFromCloudHandler() {
  if (!confirm('下载云端数据将覆盖本地数据，确定继续？')) return
  isSyncing.value = true
  try {
    const r = await pullFromCloud()
    if (r.error) showToast('下载失败: ' + r.error)
    else { showToast('云端数据已下载到本地 ✓'); await refreshAllData() }
  } finally { isSyncing.value = false }
}

// ===== 管理员功能（回收站）=====
const isUserAdmin = ref(false)

async function checkAdmin() {
  isUserAdmin.value = await isAdmin()
  if (isUserAdmin.value) {
    await updateTrashStats()
  }
}

const trashStats = ref(null)
const trashSizes = ref(null)
const TABLES = [
  { key: 'posts', label: '动态' },
  { key: 'comments', label: '评论' },
  { key: 'likes', label: '点赞' },
  { key: 'friendships', label: '好友关系' },
  { key: 'profiles', label: '用户' },
]
const selectedTables = ref([])

async function updateTrashStats() {
  const [stats, sizes] = await Promise.all([getTrashStats(), getTrashSizes()])
  trashStats.value = stats
  trashSizes.value = sizes
}

function getSelectedTables() {
  return selectedTables.value.length > 0 ? selectedTables.value : TABLES.map(t => t.key)
}

async function clearData() {
  const label = selectedTables.value.length > 0
    ? selectedTables.value.map(k => TABLES.find(t => t.key === k)?.label || k).join('、')
    : '全部'
  if (!confirm(`⚠️ 即将清除：${label}\n\n数据移入回收站，可恢复。继续吗？`)) return
  if (!confirm('再次确认？')) return
  showToast('正在清除...')
  const r = await resetSelected(getSelectedTables())
  if (r.error) showToast('清除失败: ' + r.error)
  else { showToast('数据已移入回收站 ✓'); await updateTrashStats() }
}

async function restoreData() {
  const label = getSelectedTables().length > 0 ? '' : '全部'
  if (!confirm(`确定从回收站恢复数据？`)) return
  showToast('正在恢复...')
  const r = await restoreSelected(getSelectedTables())
  if (r.error) showToast('恢复失败: ' + r.error)
  else { showToast('数据已恢复 ✓'); await refreshAllData(); await updateTrashStats() }
}

async function emptyTrash() {
  if (!confirm('⚠️ 数据将永久删除，无法恢复！确定继续？')) return
  if (!confirm('再次确认？')) return
  showToast('正在清空...')
  const r = await emptySelected(getSelectedTables())
  if (r.error) showToast('清空失败: ' + r.error)
  else { showToast('回收站已清空'); await updateTrashStats() }
}

// ===== 自动启动（仅在 Electron 中显示）=====
const autoLaunchEnabled = ref(false)

async function updateAutoLaunchState() {
  if (!window.calendarAPI?.getAutoLaunch) return
  autoLaunchEnabled.value = await window.calendarAPI.getAutoLaunch()
}

async function toggleAutoLaunch() {
  const current = await window.calendarAPI.getAutoLaunch()
  await window.calendarAPI.setAutoLaunch(!current)
  autoLaunchEnabled.value = !current
  showToast(current ? '已关闭开机自启' : '已开启开机自启')
}

// ===== 安卓权限（仅 Capacitor 平台显示）=====
const isAndroid = ref(false)
const permStatuses = ref({})

async function checkAndroidPermissions() {
  if (!isCapacitorPlatform()) return
  isAndroid.value = true
  // 通过 window.Capacitor 检查
  try {
    const { LocalNotifications } = window.Capacitor.Plugins
    if (LocalNotifications) {
      const perm = await LocalNotifications.checkPermissions()
      permStatuses.value.notification = perm.display === 'granted'
      if (LocalNotifications.checkExactNotificationSetting) {
        try {
          const exact = await LocalNotifications.checkExactNotificationSetting()
          permStatuses.value['exact-alarm'] = exact.exact_alarm === 'granted'
        } catch { permStatuses.value['exact-alarm'] = false }
      }
    }
  } catch {}
  // 不能通过 API 检查的标记为 null（"建议开启"）
  permStatuses.value.overlay = null
  permStatuses.value.battery = null
  permStatuses.value.install = null
}

async function openAppSettings() {
  try {
    const { App } = window.Capacitor.Plugins
    const appId = 'com.workcalendar.app'
    if (App?.openUrl) {
      try { await App.openUrl({ url: `package:${appId}` }); return } catch {}
    }
    try { window.open(`intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;package=${appId};end`, '_system'); return } catch {}
    try { window.open(`market://details?id=${appId}`, '_system'); return } catch {}
    showToast('请手动前往：系统设置 > 应用管理 > 上班日历 > 权限')
  } catch (e) {
    showToast('请手动前往：系统设置 > 应用管理 > 上班日历 > 权限')
  }
}

async function diagnoseNotifications() {
  if (typeof window.diagnoseNotifications === 'function') {
    await window.diagnoseNotifications()
  } else {
    showToast('诊断功能未加载')
  }
}

const perms = [
  { name: '通知权限', desc: '打卡提醒和待办提醒', key: 'notification' },
  { name: '精确闹钟', desc: '准时提醒不延迟', key: 'exact-alarm' },
  { name: '后台弹出界面', desc: '后台收到通知时显示', key: 'overlay' },
  { name: '电池优化', desc: '关闭省电限制，确保后台通知正常', key: 'battery' },
  { name: '安装应用', desc: '应用内更新下载安装', key: 'install' },
]

function getPermStatus(key) {
  const val = permStatuses.value[key]
  if (val === null) return { text: '建议开启', cls: 'warn' }
  if (val) return { text: '✓ 已开启', cls: 'ok' }
  return { text: '未开启', cls: 'bad' }
}

// ===== 导航栏设置 =====
const NAV_ITEMS_KEY = 'calendar-nav-items'
const allNavItems = [
  { id: 'home', label: '日历', always: true },
  { id: 'clockin', label: '打卡' },
  { id: 'social', label: '好友' },
  { id: 'stats', label: '统计' },
  { id: 'settings', label: '设置', always: true },
]
const navEnabled = ref(getNavItems())

function getNavItems() {
  try { const raw = localStorage.getItem(NAV_ITEMS_KEY); if (raw) return JSON.parse(raw) } catch {}
  return allNavItems.map(n => n.id)
}
function saveNavItems(items) {
  localStorage.setItem(NAV_ITEMS_KEY, JSON.stringify(items))
  navEnabled.value = items
  // 同步到现有 renderer.js 的导航栏
  allNavItems.forEach(item => {
    const btn = document.getElementById(item.id + '-btn')
    if (btn) btn.style.display = items.includes(item.id) ? '' : 'none'
  })
}
function toggleNavItem(itemId) {
  let items = [...navEnabled.value]
  if (items.includes(itemId)) {
    items = items.filter(i => i !== itemId)
  } else {
    items.push(itemId)
  }
  saveNavItems(items)
}
function isNavEnabled(itemId) {
  return navEnabled.value.includes(itemId)
}

// ===== 数据导出/导入 =====
async function exportData() {
  await window.calendarAPI.exportData()
  showToast('数据已导出')
}

async function importData() {
  const result = await window.calendarAPI.importData()
  if (result.success) {
    await refreshAllData()
    showToast('数据已导入')
  } else if (result.error) {
    showToast('导入失败: ' + result.error)
  }
}

// ===== 检查更新 =====
function checkUpdate() {
  if (typeof window.manualCheckUpdate === 'function') {
    window.manualCheckUpdate()
  }
}

// ===== 设置页激活/失活 =====
onMounted(async () => {
  await updateAccountUI()
  loadSupabaseConfig()
  await updateAutoLaunchState()
  updateSyncState()
  await checkAdmin()
  await checkAndroidPermissions()
})

// 外部刷新设置页的入口
window.__refreshSettingsData = async () => {
  await updateAccountUI()
  loadSupabaseConfig()
  await updateAutoLaunchState()
  updateSyncState()
  await checkAdmin()
  await updateTrashStats()
}
</script>

<template>
  <div class="settings-scroll">
    <!-- ===== 账号 ===== -->
    <SettingsSection title="账号">
      <div v-if="!isLoggedIn">
        <div class="settings-hint" style="margin-bottom:8px;">注册账号后数据不会丢失，换设备可登录恢复</div>
        <div class="settings-field">
          <label>用户名</label>
          <input v-model="regUsername" class="settings-input" placeholder="设置用户名" maxlength="20">
        </div>
        <div class="settings-field">
          <label>密码</label>
          <input v-model="regPassword" class="settings-input" type="password" placeholder="设置密码" maxlength="32">
        </div>
        <div class="settings-btn-row">
          <button class="settings-action-btn" :disabled="isSubmitting" @click="handleRegister">注册</button>
          <button class="settings-action-btn" :disabled="isSubmitting" @click="handleLogin">登录</button>
        </div>
        <div v-if="authStatus" class="settings-hint" style="margin-top:4px;">{{ authStatus }}</div>
      </div>
      <div v-else>
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="position:relative;width:40px;height:40px;cursor:pointer;" title="点击更换头像">
            <template v-if="avatarUrl">
              <img :src="avatarUrl" style="width:40px;height:40px;object-fit:cover;border-radius:50%;">
            </template>
            <div v-else class="post-avatar avatar-placeholder" style="width:40px;height:40px;font-size:18px;">{{ nickname[0] }}</div>
            <input type="file" accept="image/*" style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:pointer;" @change="handleAvatarUpload">
          </div>
          <div>
            <div style="font-weight:600;">{{ nickname }}</div>
            <div class="settings-hint" style="margin:0;">ID: {{ displayId }} | {{ username }}</div>
          </div>
        </div>
        <button class="settings-action-btn full" style="margin-top:8px;" :disabled="isSubmitting" @click="handleLogout">退出登录</button>
      </div>
    </SettingsSection>

    <!-- ===== 数据管理 ===== -->
    <SettingsSection title="数据管理">
      <div class="settings-btn-row">
        <button class="settings-action-btn" @click="exportData">导出数据</button>
        <button class="settings-action-btn" @click="importData">导入数据</button>
      </div>
    </SettingsSection>

    <!-- ===== 好友圈服务配置 ===== -->
    <SettingsSection title="好友圈服务配置">
      <div class="settings-hint">在 <a href="https://supabase.com" target="_blank">supabase.com</a> 免费注册，创建项目后填入以下信息</div>
      <div class="settings-field">
        <label>Project URL</label>
        <input v-model="supabaseUrl" class="settings-input" placeholder="https://xxx.supabase.co">
      </div>
      <div class="settings-field">
        <label>Anon Key</label>
        <input v-model="supabaseKey" class="settings-input" type="password" placeholder="sb_publishable_xxx 或 eyJxxx">
      </div>
      <div class="settings-btn-row">
        <button class="settings-action-btn" @click="saveSupabase">保存配置</button>
        <button class="settings-action-btn" @click="testSupabase">测试连接</button>
      </div>
      <div class="settings-hint" style="margin-top:8px;">
        首次配置后需在 Supabase SQL Editor 执行 <b>supabase-setup.sql</b> 创建数据表
      </div>

      <!-- 管理员功能 -->
      <template v-if="isUserAdmin">
        <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;">
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px;">勾选数据类型（不勾选 = 全部）</div>
          <div style="display:flex;flex-wrap:wrap;gap:2px 10px;">
            <label v-for="t in TABLES" :key="t.key" style="font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;">
              <input type="checkbox" :value="t.key" v-model="selectedTables" style="width:14px;height:14px;">
              {{ t.label }}
              <span style="color:var(--text3);font-size:11px;">
                {{ trashSizes?.[t.key]?.total_size || '' }}
                {{ trashSizes?.[t.key]?.count > 0 ? `(回收站${trashSizes[t.key].count}条)` : '' }}
              </span>
            </label>
          </div>
          <button class="settings-action-btn" style="margin-top:8px;color:#e53935;border-color:#e53935;" @click="clearData">清除云端数据</button>
          <div class="settings-hint" style="margin-top:4px;">⚠️ 管理员功能：重置全部数据（移入回收站，可恢复），不影响配置</div>
        </div>

        <!-- 回收站 -->
        <div v-if="isUserAdmin" style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;">
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;">🗑️ 回收站</div>
          <div class="settings-hint" style="margin-bottom:8px;">
            <template v-if="!trashStats || trashStats.total === 0">回收站为空</template>
            <template v-else>
              共 {{ trashStats.total }} 条：
              <template v-if="trashStats.profiles">{{ trashStats.profiles }} 个用户、</template>
              <template v-if="trashStats.posts">{{ trashStats.posts }} 条动态、</template>
              <template v-if="trashStats.comments">{{ trashStats.comments }} 条评论、</template>
              <template v-if="trashStats.likes">{{ trashStats.likes }} 个点赞、</template>
              <template v-if="trashStats.friendships">{{ trashStats.friendships }} 条好友关系</template>
            </template>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="settings-action-btn" style="flex:1;" @click="restoreData">恢复数据</button>
            <button class="settings-action-btn" style="flex:1;color:#e53935;border-color:#e53935;" @click="emptyTrash">清空回收站</button>
          </div>
        </div>
      </template>
    </SettingsSection>

    <!-- ===== 数据同步 ===== -->
    <SettingsSection title="数据同步">
      <div class="settings-hint">登录同一账号即可多端同步，数据变更自动上传云端</div>
      <div class="settings-btn-row" style="margin-top:8px;">
        <button
          class="settings-action-btn"
          :style="syncEnabled ? {borderColor:'var(--accent)',color:'var(--accent)'} : {}"
          @click="toggleSync"
        >
          自动同步：{{ syncEnabled ? '开启' : '关闭' }}
        </button>
        <button class="settings-action-btn" :disabled="isSyncing" @click="syncNow">
          {{ isSyncing ? '同步中...' : '立即同步' }}
        </button>
      </div>
      <div class="settings-btn-row" style="margin-top:8px;">
        <button class="settings-action-btn" :disabled="isSyncing" @click="pushToCloudHandler">↑ 上传本地数据</button>
        <button class="settings-action-btn" :disabled="isSyncing" @click="pullFromCloudHandler">↓ 下载云端数据</button>
      </div>
      <div class="settings-hint" style="margin-top:4px;font-size:11px;color:#999;">上传：本地覆盖云端 | 下载：云端覆盖本地</div>
    </SettingsSection>

    <!-- ===== 主题风格 ===== -->
    <SettingsSection title="主题风格" collapsible>
      <div class="theme-grid">
        <div
          v-for="t in THEMES"
          :key="t.id"
          class="theme-opt"
          :class="{ active: currentTheme === t.id }"
          @click="setTheme(t.id)"
        >
          <div class="theme-dot" :style="{ background: t.color }"></div>
          <span>{{ t.name }}</span>
        </div>
      </div>
    </SettingsSection>

    <!-- ===== 导航栏设置 ===== -->
    <SettingsSection title="导航栏设置" collapsible>
      <div class="settings-hint" style="margin-bottom:8px;">选择底部导航栏显示的功能</div>
      <div>
        <div v-for="item in allNavItems" :key="item.id" class="nav-item-row">
          <span class="nav-item-label">
            {{ item.label }}
            <template v-if="item.always"><span style="color:var(--text3);">（固定）</span></template>
          </span>
          <button
            class="nav-item-toggle"
            :class="{ on: isNavEnabled(item.id) }"
            :disabled="item.always"
            :style="item.always ? {opacity:0.5} : {}"
            @click="toggleNavItem(item.id)"
          ></button>
        </div>
      </div>
    </SettingsSection>

    <!-- ===== 安卓权限 ===== -->
    <SettingsSection v-if="isAndroid" title="安卓权限" collapsible>
      <div class="settings-hint" style="margin-bottom:8px;">以下权限影响通知和更新功能，建议全部开启</div>
      <div>
        <div v-for="p in perms" :key="p.key" class="perm-item">
          <div>
            <div style="font-size:13px;font-weight:500;">{{ p.name }}</div>
            <div style="font-size:11px;color:var(--text-secondary);">{{ p.desc }}</div>
          </div>
          <span
            class="perm-status"
            :class="getPermStatus(p.key).cls"
          >{{ getPermStatus(p.key).text }}</span>
        </div>
      </div>
      <button class="settings-action-btn full" style="margin-top:8px;" @click="openAppSettings">前往系统设置</button>
      <button class="settings-action-btn full" style="margin-top:8px;background:#2196F3;" @click="diagnoseNotifications">🔍 诊断通知问题</button>
    </SettingsSection>

    <!-- ===== 其他 ===== -->
    <SettingsSection title="其他">
      <button class="settings-action-btn full" :class="{ 'toggle-active': autoLaunchEnabled }" @click="toggleAutoLaunch">
        {{ autoLaunchEnabled ? '✓ 开机自启已开启' : '开机自启' }}
      </button>
      <button class="settings-action-btn full" style="margin-top:8px;" @click="checkUpdate">检查更新</button>
    </SettingsSection>

    <!-- 底部间距 -->
    <div style="height:24px;"></div>
  </div>
</template>

<style scoped>
.settings-scroll {
  overflow-y: auto;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
}
/* ===== 复用现有 settings.css 中的样式类 ===== */
/* 以下样式与 src/styles.css 中的对应类保持视觉一致 */
.settings-hint {
  font-size: 12px;
  color: var(--text-secondary, #888);
  line-height: 1.5;
}
.settings-field {
  margin-bottom: 12px;
}
.settings-field label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary, #666);
  margin-bottom: 4px;
}
.settings-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 8px;
  background: var(--bg, #fff);
  color: var(--text, #333);
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
}
.settings-input:focus {
  border-color: var(--accent, #333);
}
.settings-btn-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.settings-action-btn {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 8px;
  background: var(--card, #fff);
  color: var(--text, #333);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
.settings-action-btn:hover {
  border-color: var(--accent, #333);
  color: var(--accent, #333);
}
.settings-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.settings-action-btn.full {
  width: 100%;
}
.settings-action-btn.toggle-active {
  border-color: var(--accent, #333);
  color: var(--accent, #333);
}
.theme-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.theme-opt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  font-size: 11px;
  color: var(--text, #333);
  transition: border-color 0.15s;
}
.theme-opt.active {
  border-color: var(--accent, #333);
}
.theme-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid rgba(0,0,0,0.1);
}
.nav-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border, #e0e0e0);
}
.nav-item-label {
  font-size: 13px;
}
.nav-item-toggle {
  width: 40px;
  height: 22px;
  border-radius: 11px;
  border: none;
  background: var(--border, #ccc);
  cursor: pointer;
  position: relative;
  transition: background 0.2s;
}
.nav-item-toggle.on {
  background: var(--accent, #333);
}
.nav-item-toggle::after {
  content: '';
  display: block;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: white;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform 0.2s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
}
.nav-item-toggle.on::after {
  transform: translateX(18px);
}
.perm-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border, #e0e0e0);
}
.perm-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}
.perm-status.ok {
  background: var(--success, #4caf50);
  color: #fff;
}
.perm-status.bad {
  background: var(--danger, #e53935);
  color: #fff;
}
.perm-status.warn {
  background: var(--warning, #ff9800);
  color: #fff;
}
/* 确保链接在设置页中可点击 */
.settings-scroll a {
  color: var(--accent, #333);
  text-decoration: underline;
}
</style>
```

- [ ] **Step 2: 验证 Vue 组件语法**

```bash
npx vite build 2>&1
```

Expected: 构建成功，无 Vue 编译错误

- [ ] **Step 3: Commit**

```bash
git add src/pages/SettingsPage.vue
git commit -m "feat: add SettingsPage Vue component (replaces settings.js)"
```

### Task 4: 修改 App.vue — 添加 SettingsPage 路由

- [ ] **Step 1: 修改 src/components/App.vue**

```vue
<script setup>
import { ref } from 'vue'
import SettingsPage from '../pages/SettingsPage.vue'

const activePage = ref(null)

window.__vueActivate = (page) => {
  activePage.value = page
  // 当切换到设置页时，刷新数据
  if (page === 'settings' && window.__refreshSettingsData) {
    window.__refreshSettingsData()
  }
}
window.__vueDeactivate = () => { activePage.value = null }
</script>

<template>
  <SettingsPage v-if="activePage === 'settings'" />
</template>
```

- [ ] **Step 2: 验证**

```bash
npx vite build 2>&1
```

Expected: 构建成功

- [ ] **Step 3: Commit**

```bash
git add src/components/App.vue
git commit -m "feat: add SettingsPage route to App.vue"
```

### Task 5: 修改 renderer.js — 设置页路由指向 Vue

- [ ] **Step 1: 修改 switchView 函数**

```diff
 function switchView(view) {
   currentView = view;
+  
+  // Vue 管理的页面先激活 Vue 容器并返回
+  const VUE_PAGES = ['settings']
+  if (VUE_PAGES.includes(view)) {
+    // 隐藏所有传统页面
+    document.querySelectorAll('.page-view').forEach(p => p.style.display = 'none');
+    // 显示 Vue 容器
+    const appEl = document.getElementById('app');
+    if (appEl) appEl.style.display = '';
+    window.__vueActivate?.(view);
+    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
+    const activeMap = { calendar: 'home-btn', stats: 'stats-btn', clockin: 'clockin-btn', settings: 'settings-btn', social: 'social-btn' };
+    const activeBtn = document.getElementById(activeMap[view]);
+    if (activeBtn) activeBtn.classList.add('active');
+    return;
+  }
+  
+  // 非 Vue 页面：隐藏 Vue 容器，显示传统页面容器
+  const appEl = document.getElementById('app');
+  if (appEl) appEl.style.display = 'none';
+  window.__vueDeactivate?.();
+
   document.getElementById('calendar-view').style.display = view === 'calendar' ? '' : 'none';
   document.getElementById('stats-view').style.display = view === 'stats' ? '' : 'none';
   document.getElementById('clockin-view').style.display = view === 'clockin' ? '' : 'none';
-  document.getElementById('settings-view').style.display = view === 'settings' ? '' : 'none';
   document.getElementById('social-view').style.display = view === 'social' ? '' : 'none';
+  document.getElementById('settings-view').style.display = 'none';  // 不再被路由使用
   document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
   const activeMap = { calendar: 'home-btn', stats: 'stats-btn', clockin: 'clockin-btn', settings: 'settings-btn', social: 'social-btn' };
   const activeBtn = document.getElementById(activeMap[view]);
   if (activeBtn) activeBtn.classList.add('active');
   if (view === 'stats') renderStats();
   if (view === 'clockin') renderClockinView();
-  if (view === 'settings') renderSettingsView();
   if (view === 'social') renderSocialView();
 }
```

**注意：** `settings-view` 仍存在于 DOM 中但不再显示。设置页的 UI 由 Vue 完全接管。

- [ ] **Step 2: 验证语法**

```bash
node -c src/renderer.js
```

Expected: 语法检查通过

- [ ] **Step 3: Commit**

```bash
git add src/renderer.js
git commit -m "fix: route settings page to Vue component"
```

### Task 6: 验证 v3.5.0 全流程

- [ ] **Step 1: Vite 构建验证**

```bash
npm run build
ls dist/
```

Expected: 构建成功，dist/ 包含正确资源

- [ ] **Step 2: 功能完整性验证**

手动在 Electron 中验证以下每一项（对照原 settings.js 行为）：

| 功能 | 验证方法 | 预期 |
|------|---------|------|
| 注册/登录 | 输入用户名密码，点击注册/登录 | 与之前行为一致 |
| 退出登录 | 点击退出登录 | 与之前行为一致 |
| 头像上传 | 点击头像区域上传图片 | 与之前行为一致 |
| 数据导出 | 点击导出数据 | 弹出保存对话框 |
| 数据导入 | 点击导入数据 | 弹出文件选择对话框 |
| Supabase 配置保存 | 输入 URL/Key，点击保存 | 提示保存成功 |
| Supabase 测试连接 | 点击测试连接 | 弹出诊断结果 |
| 自动同步开关 | 点击切换 | 开关状态切换 |
| 立即同步 | 点击立即同步 | 同步完成提示 |
| 上传/下载云端数据 | 点击上传/下载 | 确认后执行 |
| 主题切换 | 点击主题色块 | 主题立即切换 |
| 导航栏设置 | 切换导航项开关 | 底部导航栏对应显示/隐藏 |
| 开机自启 | 点击按钮 | 切换自启状态 |
| 检查更新 | 点击检查更新 | 触发更新检查 |

- [ ] **Step 3: 提交版本变更并发布**

```bash
# 更新 version.json
# 更新 README.md 更新日志
# 更新 android/app/build.gradle versionCode +1, versionName = 3.5.0
git add -A
git commit -m "feat: v3.5.0 — migrate settings page to Vue + Reka UI"
git tag v3.5.0
git push && git push --tags
```