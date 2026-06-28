# Phase 1: Vue + Reka UI 基础搭建与首个模块迁移

## 动机

现有纯 HTML/CSS/JS 架构无框架约束，UI 逻辑分散在 `src/` 各 JS 文件中通过 DOM 操作更新视图。引入 Vue + Reka UI 的目标：
- 组件化 UI，减少手写 DOM 操作，提高可维护性
- 利用 Reka UI 的 headless 组件提升可访问性和交互一致性
- 为后续模块迁移铺平架构基础，渐进式完成全量迁移

## 范围限定

**本次只做（Phase 1）：**
- 搭建 Vite + Vue 3 构建工具链
- 配置 Electron 和 Capacitor 适配新构建产出
- 迁移**一个模块**（设置页 `settings.js`）为 Vue SFC 组件，UI 美化

**绝对不做：**
- 更改任何功能逻辑 — 原功能行为的每一行代码必须保留
- 迁移其他模块（calendar、todos、reminders、stats、social 等）
- 修改数据层或 IPC 通信方式 — 继续使用 `calendarAPI` (contextBridge)
- 引入 TypeScript
- 添加新功能

## 目录结构

```
上班日历/
├── index.html                  # Vite 入口（新建）
├── src/
│   ├── index.html              # 保留不动，旧版直接打开 HTML 仍可用
│   ├── main.js                 # Electron 主进程（新增 dev/prod URL 判断）
│   ├── preload.js              # 不变
│   ├── renderer.js             # 渲染进程主入口（新增 Vue 挂载逻辑，逐步减少 DOM 操作）
│   ├── settings.js             # 等 Vue 版验证通过后删除，首期保留用作对照
│   ├── styles.css              # 逐步精简，首期不动
│   ├── ...                     # 其他模块文件全部不动
│   ├── pages/                  # 新增 Vue 页面组件目录
│   │   └── SettingsPage.vue
│   ├── components/             # 新增 Vue 通用组件目录
│   │   ├── App.vue
│   │   ├── SettingsToggle.vue  # Reka UI Switch 封装
│   │   └── SettingsSection.vue # 设置分组容器
│   └── vue-main.js             # Vue 应用入口
├── vite.config.js              # Vite 配置
├── package.json                # 新增依赖 + scripts 更新
└── index.html → 重定向到 src/index.html（备选方案见下文）
```

## 详细架构方案

### 1. 构建工具链：Vite + Vue 3

#### vite.config.js

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  root: 'src',           // 以 src/ 为根，保留原有相对路径
  base: './',            // 相对路径，确保 file:// 协议可用
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,   // 端口被占用时自动 +1
  },
})
```

**关键设计决策：** `root: 'src'` 让 Vite 以 `src/` 为根目录，这样 `src/index.html` 中的现有资源路径（`./renderer.js`、`./styles.css`、`./lib/` 等）无需修改即可被 Vite 正确解析。Vue 的入口 `src/vue-main.js` 在 `src/index.html` 中通过 `<script type="module" src="./vue-main.js">` 引入。

#### index.html 改造

现有 `src/index.html` 需要两处修改：

```diff
   <script src="./lib/supabase.min.js"></script>
   <script src="./renderer.js"></script>
+  <script type="module" src="./vue-main.js"></script>
 </head>
 <body>
+  <div id="app"></div>      <!-- Vue 挂载点 -->
   <div id="page-container"><!-- 现有页面容器 -->
```

注意：`<div id="app">` 和 `<div id="page-container">` 是同级兄弟节点。Vue 只管理 `#app` 内部的内容，现有 JS 模块继续操作 `#page-container` 内部 DOM。两者互不干扰。

### 2. 渐进式共存策略

**核心原则：Vue 组件按需接管特定页面的 UI 渲染，而不影响其他模块。**

渲染进程的页面路由逻辑（位于 `renderer.js`）决定哪个页面激活。当切换到"设置"页面时：
1. 现有逻辑隐藏其他页面容器
2. Vue 的 `SettingsPage` 组件挂载到 `#app` 并渲染设置 UI
3. 其他页面（日历、待办、好友圈等）仍由现有 JS 渲染到 `#page-container` 下的各自容器

页面切换时的控制权转移：

```
renderer.js showPage('settings'):
  ├─ 隐藏 #page-container
  ├─ 显示 #app
  └─ 现有 settings.js 不再执行（被 Vue 替代）

renderer.js showPage('calendar'):
  ├─ 隐藏 #app
  ├─ 显示 #page-container
  └─ 原有 calendar.js 正常执行
```

**Vue 应用入口（src/vue-main.js）：**

```js
import { createApp } from 'vue'
import App from './components/App.vue'

const app = createApp(App)
app.mount('#app')
// 注意：Vue 根组件不立即显示任何内容
// 由 renderer.js 的页面切换逻辑控制 #app 的 display
```

**根组件（src/components/App.vue）：**

```vue
<template>
  <SettingsPage v-if="activePage === 'settings'" />
  <!-- 后续迁移的模块页面逐步在此添加 -->
</template>

<script setup>
import { ref, provide } from 'vue'
import SettingsPage from '../pages/SettingsPage.vue'

const activePage = ref(null)

// 暴露给 renderer.js 的全局函数
window.__vueActivate = (page) => { activePage.value = page }
window.__vueDeactivate = () => { activePage.value = null }
</script>
```

**renderer.js 的修改：**

```diff
 function showPage(pageId) {
   // 隐藏所有页面
   document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
+  document.getElementById('app').style.display = 'none';
   
   if (pageId === 'settings') {
+    document.getElementById('app').style.display = 'block';
+    window.__vueActivate?.('settings');
+    return;  // Vue 接管，不需要执行 settings.js 的 DOM 操作
+  }
+  
+  // 非 Vue 页面：显示传统容器
+  document.getElementById('page-container').style.display = 'block';
-    document.getElementById('page-settings').style.display = 'block';
-    loadSettings();  // settings.js 的入口函数
-    return;
-  }
   
   // 其他页面逻辑不变...
   document.getElementById('page-' + pageId).style.display = 'block';
   // ...
 }
```

### 3. SettingsPage.vue 迁移方案

`settings.js`（约 300-400 行）包含以下功能群：

| 功能群 | UI 类型 | Reka UI 组件 |
|--------|---------|-------------|
| 状态同步开关 | Switch | `<SwitchRoot>` / `<SwitchThumb>` |
| 推送开关 | Switch | `<SwitchRoot>` / `<SwitchThumb>` |
| 默认打卡时间 | Select 或 数字输入 | 原生 `<select>` 或 `<input>` |
| 打卡提醒提前量 | Select 或 数字输入 | 原生 `<select>` 或 `<input>` |
| 下班时间设置 | Input | 原生 `<input type="time">` |
| 同步操作/查看状态 | Button + 文本 | 原生 `<button>` |
| 版本信息显示 | 只读文本 | 原生 `<p>` |

**迁移策略：**

1. `SettingsPage.vue` import 并使用 `calendarAPI`（来自 preload.js 的 contextBridge），与 settings.js 使用完全相同的 IPC 通道
2. `SettingsPage.vue` 不再直接操作 `localStorage` 或 DOM，改用 Vue 的 `ref`/`reactive` 管理状态
3. 所有事件监听用 Vue 模板语法（`@click`、`@change` 等）
4. 设置项的值通过 `calendarAPI.getSettings()` 初始化，通过 `calendarAPI.saveSetting(key, value)` 持久化

**数据流：**

```
SettingsPage.vue
  ├─ onMounted → calendarAPI.getSettings() → 填充响应式状态
  ├─ 用户操作 → 更新 ref → watch debounced → calendarAPI.saveSetting()
  └─ 手动触发操作（同步等）→ @click → 调用 calendarAPI.sync()
```

### 4. Reka UI 集成

安装 `reka-ui` 后，按需引入组件。首期只用 `<Switch>`：

```vue
<script setup>
import { SwitchRoot, SwitchThumb } from 'reka-ui'
</script>

<template>
  <SwitchRoot v-model:checked="notificationsEnabled">
    <SwitchThumb />
  </SwitchRoot>
</template>
```

**按需导入，不全局注册。** Reka UI 组件通过 tree-shaking 被 Vite 自动优化。

**CSS 美化方向：**
- 保持现有配色方案（基于已有 styles.css 的 CSS 变量）
- Switch 组件样式使用 Radix/Vue 推荐的 data-[state] 属性选择器
- 设置页布局：卡片式分组，减少视觉密度
- 字体、间距、颜色尊重现有设计语言

### 5. Electron 适配

**main.js 修改：**

```diff
-  // 生产环境加载文件
-  if (isPackaged) {
-    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
-  } else {
-    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
-  }
+  // 开发环境加载 Vite dev server
+  const isDev = !app.isPackaged;
+  if (isDev) {
+    // 尝试连接 Vite dev server
+    mainWindow.loadURL('http://localhost:5173');
+    mainWindow.webContents.openDevTools();
+  } else {
+    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
+  }
```

**注意：** 如果 Vite server 尚未启动，Electron 启动可能会遇到空白页。解决方案：
- 启动脚本 `npm run dev` 应同时启动 Vite 和 Electron（使用 `concurrently` 或 `wait-on`）
- 见下方 scripts 配置

### 6. Capacitor 适配

Capacitor 加载的是 Web 构建产物。修改 `capacitor.config.json` 确保指向构建输出：

```json
{
  "appId": "com.work.calendar",
  "appName": "上班日历",
  "webDir": "dist",
  "server": {
    "androidScheme": "https"
  }
}
```

安卓开发流程：
1. `npm run build`（Vite 构建输出到 dist/）
2. `npx cap sync android`（同步到 Android 项目）
3. Android Studio 构建 APK

### 7. page 路由联动

renderer.js 控制页面切换，Vue 组件被动响应：

```
renderer.js 的页面切换逻辑 (showPage)
  │
  ├─ 非 settings/非 Vue 页面
  │   ├─ 隐藏 #app (display: none)
  │   ├─ 显示 #page-container
  │   └─ 显示对应 .page 元素
  │
  ├─ settings 页面
  │   ├─ 隐藏 #page-container
  │   ├─ 显示 #app (display: block)
  │   └─ window.__vueActivate('settings')
  │       └─ App.vue 显示 <SettingsPage />
  │
  └─ 后续迁移页面
      └─ 扩展同上模式
```

此模式确保迁移过程是二进制开关：同一时间要么 Vue 模块渲染，要么现有 JS 模块渲染，不存在双重渲染或冲突。

### 8. npm scripts 配置

```json
{
  "scripts": {
    "dev": "concurrently \"vite\" \"wait-on http://localhost:5173 && electron .\"",
    "build": "vite build",
    "electron:dev": "electron .",
    "pack": "npm run build && electron-packager . 上班日历 --platform=win32 --arch=x64 --out=dist-electron ...",
    "cap:sync": "npx cap sync android"
  }
}
```

使用 `concurrently` + `wait-on` 确保 Vite 启动后再启动 Electron，避免空白页。

或者拆分为两步手动操作：
```json
{
  "dev": "vite & sleep 3 && electron ."
}
```

推荐第一种方案。

## v3.4.0 文件变更清单

v3.4.0 版本专注于工具链搭建，不改变任何 UI 行为：

| 文件 | 操作 | 内容 |
|------|------|------|
| `package.json` | 修改 | 新增 `vue`、`reka-ui`、`vite`、`@vitejs/plugin-vue`、`concurrently`、`wait-on` 依赖；更新 scripts |
| `vite.config.js` | 新建 | Vite 配置（root: src, base: ./） |
| `src/vue-main.js` | 新建 | Vue 应用入口，createApp 挂载到 #app |
| `src/components/App.vue` | 新建 | Vue 根组件，带空模板（v3.4.0 还不迁移任何页面） |
| `src/index.html` | 修改 | 添加 `<div id="app">` 挂载点，添加 vue-main.js 入口 script |
| `main.js` | 修改 | 开发模式 loadURL，生产模式 loadFile dist/index.html |
| `src/renderer.js` | 修改 | showPage 中添加 Vue 页面路由分流 |

v3.4.0 验收：`npm run dev` → Electron 正常显示，所有页面功能与之前完全一致（Vue 尚未接管任何页面）。

## v3.5.0 文件变更清单

| 文件 | 操作 | 内容 |
|------|------|------|
| `src/pages/SettingsPage.vue` | 新建 | 设置页完整 Vue 组件 |
| `src/components/SettingsToggle.vue` | 新建 | Reka UI Switch 封装 |
| `src/components/SettingsSection.vue` | 新建 | 设置分组卡片容器 |
| `src/components/App.vue` | 修改 | 添加 SettingsPage 路由分支 |
| `src/renderer.js` | 修改 | settings 页面路由指向 Vue |
| `src/styles.css` | 修改 | 移除设置页相关样式（由组件内置样式替代） |

## 版本管理与发布流程

严格按照 CLAUDE.md 中的版本发布流程执行：

### v3.4.0 发布步骤

1. `package.json` 版本号改为 3.4.0
2. `android/app/build.gradle` → `versionCode` +1，`versionName` 3.4.0
3. `version.json` → 版本号、下载链接、更新日志（"搭建 Vue 组件化基础架构"）
4. `README.md` 更新日志添加 v3.4.0 条目
5. 构建 APK：`npm run build && npx cap sync android && cd android && ./gradlew assembleRelease`
6. 复制 APK → `work-calendar-v3.4.0.apk`
7. `gh release create v3.4.0 --title "v3.4.0" work-calendar-v3.4.0.apk`
8. 推送代码到 GitHub

### v3.5.0 发布步骤

同上述流程，版本号改为 3.5.0，更新日志为"迁移设置页为 Vue 组件，UI 重构"。

## 风险与缓解措施

| 风险 | 影响 | 缓解 |
|------|------|------|
| Vite 构建破坏现有资源路径 | 功能不可用 | root: 'src' + base: './' 确保相对路径；构建后验证 dist/ 输出 |
| Vue 与现有 JS 的 DOM 冲突 | 双渲染/白屏 | #app 与 #page-container 隔离；通过 display:none 确保同一时间只有一个激活 |
| settings.js 迁移遗漏逻辑 | 功能缺失 | 迁移前完整记录所有设置项和交互路径；逐项对照验证 |
| Capacitor 插件在 Vue 中不可用 | 原生功能失效 | Vue 组件继续使用 `window.calendarAPI` 和 `window._capacitor`，不走新的 import |
| Reka UI 组件的样式冲突 | 视觉不一致 | Reka UI 使用 data-[state] 属性选择器，不依赖全局 class，作用域隔离 |

## 验收标准

1. `npm run dev` 启动后 Electron 正常加载 Vite 开发服务器，所有页面功能正常
2. 设置页所有功能完全一致（所有开关、输入、按钮行为）— 逐一对照原 settings.js 的功能列表
3. 其他现有模块（日历、待办、提醒、统计、好友圈）不受影响，功能完全一致
4. `npm run build` 输出 `dist/` 目录结构正确，所有资源可访问
5. `npm run pack` 打包后可正常安装运行
6. 安卓 `npx cap sync android && cd android && ./gradlew assembleRelease` 构建后功能正常
7. 版本发布流程完整执行：更新文档 → 构建 APK → GitHub Release → 推送代码

## 设计原则

- **最小侵入**：对现有架构的修改降到最低，Vue 作为"增值层"而不是"替代层"叠加
- **单次只动一个模块**：迁移完一个模块，验证通过后，再动下一个
- **保持同一套代码跑两端**：不出现 Electron 和 Android 各写一套 UI
- **不做非必要的抽象**：不创建组件库、不预先封装通用组件、不写与当前迁移无关的代码