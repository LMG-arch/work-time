# 上班日历 全量代码审查报告

> 审查范围：`src/` 全部 64 个源文件 + `main.js` / `preload.js` + 构建配置
> 审查日期：2026-07-14
> 结论基调：**架构可用，但处于「纯 JS → Vue」迁移中途，存在 4 个严重功能缺陷 + 大量死代码与双状态源隐患**。桌面端核心链路基本通畅，但多个声称功能在移动端/特定路径失效。

---

## 一、架构与"功能接通"总览

```
main.js (Electron 主进程, IPC)
  └─ preload.js (contextBridge → window.calendarAPI, IPC 版)
        └─ 桌面端用 IPC 版 calendarAPI
src/electron/api.js (Web/Capacitor 存储层 → 覆盖 window.calendarAPI，除非 preload 已设为只读)
  └─ 移动端/浏览器用存储层 calendarAPI（⚠️ 缺少 syncRead/syncWrite）

vue-main.js → shared.js(全局状态) → shims.js(window.* 兼容垫片) → App.vue(Pinia)
  ├─ 双状态源：appStore + calendarStore 都持有 currentYear/Month/selectedDate
  └─ 两套渲染：Vue 页面(#app) + 遗留传统 .app(display:none 仅回退)
```

**核心判断**：
- 入口桥（`renderer.js` + `shims.js`）是「活」的，启动不会 ReferenceError。
- 但**遗留业务模块的 `render*` UI 函数全部写入默认 `display:none` 的隐藏 `.app`**，属于「挂载但不可见」的死渲染；真正活的逻辑只剩数据加载/通知调度/云同步/更新检查/账户 UI。
- `social.js`（遗留）含裸 `sb` 等全局引用会在 ESM 严格模式崩溃，而 `social-ui.js`（正确的 ESM 版）**从未被 import**，纯粹死代码。活的好友圈路径实际走 `supabase/social.js` + `SocialPage.vue`。

---

## 二、严重缺陷（必须修复，已逐行确认）

| # | 缺陷 | 位置 | 影响 | 修复建议 |
|---|------|------|------|----------|
| S1 | **编辑待办完全失效** | `TodoItem.vue:73-75` | 点击 ✎ 调 `todoStore.startEdit`（只写 store），未调 `window.__openTodoModal`（弹窗唯一打开入口）。弹窗根本不开，编辑功能 0 反应 | `openEdit` 改为 `window.__openTodoModal(props.todo)` |
| S2 | **待办新增/删除后列表不刷新**（打卡页） | `TodoModal.vue:142,152-157` / `TodoItem.vue:39,59` / `TodoListApp.vue` / `TodoViewApp.vue:12` | 组件绕过含 `loadTodos()` 重拉的 `todoStore.addTodo/deleteTodo`，直接调 `calendarAPI`；且 `refreshAllData` 在 `clockin` 视图不触发 `__refreshTodoView`。新增/删除的待办在当前页不立即显示，需切页才出现 | 组件改为调用 `todoStore.addTodo/deleteTodo/updateTodo`（其内部已 `loadTodos()`），或在 `calendarAPI` 调用后 `await todoStore.loadTodos()` |
| S3 | **休息日/请假日仍弹打卡提醒**（桌面端） | `main.js:474-530` | `checkReminders` 只比对时间与是否已确认，**不读 `store.days[今天].status`**。与 Vue `ReminderList` 隐藏休息日卡片矛盾；点通知会写入一条"休息日已打卡"脏记录 | 在 `checkReminders` 开头加：`const st = store.days?.[todayStr]?.status; if (st && ['rest','leave','annual','sick','personal'].includes(st)) return;` |
| S4 | **Web/Android 假更新弹窗** | `electron/api.js:316` + `updater/updater.js:19-22` + `vite.config.js`(无 `__APP_VERSION__` define) | `getAppVersion` Web 回退硬编码 `3.13.0`，当前真实版 `3.17.5` → `updater` 判 `remote≥3.13.1` 即"有新版本"，Web/安卓用户持续收到假更新提示 | `vite.config.js` 加 `define: { __APP_VERSION__: JSON.stringify(pkg.version) }`；或 `api.js` Web 回退改 `fetch('version.json')` |

---

## 三、中危问题（按子系统）

### 日历域
- [中] **双状态源架构缺陷**：`appStore` + `calendarStore` + `CalendarView` 局部 ref 三套 `currentYear/Month/selectedDate`，都 watch 并写 `window.*`。外部调用 `calendarStore.changeMonth()` 或 `window.__calendarSyncDate` 只改 store/全局，**日历网格（局部 ref 真源）不更新**。`appStore.activatePage/activePage` 是死代码（`App.vue` 用自身局部 `activePage`）。→ 统一为真源（建议 `CalendarView` 绑 `calendarStore` 并删冗余）。
- [中] `calendar.js:178` 调用未定义的 `renderTagList()`：仅 legacy 回退路径（Vue 失败时）点日期即抛 ReferenceError，正好在安全网处崩溃 → 删除该行（标签由 Vue 渲染）。

### 提醒/打卡域
- [中] **喝水 store 方法死代码**：`reminderStore.getWaterCount/setWaterCount/waterCount` 从未被调用，实际喝水由 legacy `reminders.js` DOM（`window.__storage.set('water-records')`）接管。持久化本身接通（`KNOWN_KEYS` 含 `water-records`），但 store 层"声称"的喝水能力未接通 → 用 Vue 重写或删死代码。
- [中] **提醒提前量跨天错误**：`main.js:685-767` `remindMinutes = 当日分钟 - parseInt(remind)`，负值 clamp 到 0。"提前1天"(1440) 对早间待办恒为 00:00（晚于目标）；"提前2小时"对 01:00 同样变 00:00。→ 基于真实 `Date` 减提前量再回算日期与 HH:MM。
- [中] **weekly 完成态仍提醒**：`main.js:690` 过滤用 `!t.done`，weekly 完成态在 `weeklyDone` 不判，已勾选的 weekly 待办照常提醒 → 改用 `!t.weeklyDone?.[todayStr]`。

### 待办域
- [中] `TodoListApp.vue:20` 过滤未排除 `t.deleted`（主进程 `delete-todo` 仅置 `deleted:true`），若列表刷新仍可能残留已删除项 → 过滤加 `!t.deleted`。
- [低] `TodoModal.vue:154` confirm 后未调 `window.__refreshTodoView?.()`，叠加 S2 后打卡页更不刷新。

### 社交/Supabase
- [中] **`social.js` 裸 `sb` 等全局引用**：`social.js:651` 等用裸 `sb`/`getSupabaseConfig` 等，ESM 严格模式必抛 `ReferenceError`；仅 `SocialPage.vue:190-198` 的 `switchToFriends()` 错误路径触发（`window.renderSocialView` 写隐藏 `#social-content` 且不切 Vue 标签，好友申请红点点击失效）。`social-ui.js`（正确 ESM 版）**从未被 import** → 死代码。→ 删除 `social.js`/`social-ui.js` 遗留件，好友圈统一走 `supabase/social.js`；移除 `shims.js` 对 `social.js` 的挂载。
- [中] **登录后未拉云端**：`supabase/client.js:211-241` `loginAccount` 只设 uid，不触发 `syncCalendarData()`（仅启动 `initSocial` 同步）。启动后登录 → 云端日历不下载 → 登录成功后补 `syncCalendarData()`。
- [低] `SocialPage.vue:216,226` 头像/图片 `:src` 未走 `sanitizeUrl`（传统路径已校验），建议统一校验防 `data:` 注入。
- [低] `SocialPage.vue` `isMyPost` 用会话 id 比有效 id，管理员重置/多设备后可能不显示自己动态的删除按钮。

### 设置/更新/特效
- [中] **设置页开机自启无平台门控**：`SettingsPage.vue:686` Web/Android 显示但 `calendarAPI.getAutoLaunch/setAutoLaunch` 是空实现，点击无反应（legacy `renderer.js` 会隐藏）。→ `v-if` 隐藏非桌面端。
- [中] **`App.vue` 未卸载 `installRipple/installTilt`**：`App.vue:59,61` 丢弃返回值，仅卸载 ambient/signature；HMR/重复挂载叠加 `pointerdown/pointermove` 监听器泄漏 → 保存返回值并在 `onBeforeUnmount` 调用。
- [中] **特效监听器常驻**：`ambient.js:45`/`signature.js:54` 的 MutationObserver/pointermove/`$subscribe` 在 premium 关闭时仍运行徒耗 CPU → `uninstall` 中释放。
- [中] **成功涟漪正则误判**：`ripple.js:116` `/成功|✓|完成|保存|提交/i` 命中"保存失败""未完成"也放绿色成功动画 → 改用 `calendar:success` 事件显式派发。
- [低] `SettingsPage.vue:530` `nickname[0]` 空串渲染 `undefined` → `nickname?.[0] || '?'`。
- [低] `tilt.js:75` 用第二条 RAF，与"单一 EffectLoop"设计不符；`useReducedMotion.js` 每次 `matchMedia` 新建 + `import` 位置不规范。

### 统计域
- [中] **导出 PNG 高度估算不足**：`stats.js:16-17,87` 用估值 `H`，记录多时循环内 `break` 提前，逐日记录被截断 → 先精确累加行高再定画布高。
- [低] 比例条分母(全月) vs 环形分母(已记录)口径不一致（`StatsPage.vue:222-228`）。
- [低] `StatsPage` 仅 `onMounted` 加载，标记后不自动重算（无 `watch(calendarStore.daysData)`）。

---

## 四、低危 / 清理项

- `holidays.js:119-122`：2027 中秋 `09-23/24/25` 疑似多算一天（25 为周六，通常 2 天）。
- `TagEditor.vue:14,21`：标签上限未强制（`maxlength` 仅限输入框，最多 8 个未拦截）→ 加 `if (newTags.length >= 8) return`。
- `DetailPanel.vue:17,30-47`：`dayData` 非响应式，保存后面板不即时刷新 → 改 computed 读 `calendarStore.daysData[selectedDate]`。
- `ReminderHistory.vue:43`：历史按"当前启用提醒"过滤，禁用/删除的已确认记录不显示 → 基于当日 records 实际键。
- 多 Vue 组件反复调 `window.renderCalendar?.()` 刷新隐藏网格（纯浪费）→ 迁移完成后整体移除。
- `reminders.js` 等遗留模块裸全局赋值（`allReminders = ...`）→ 迁移 ESM 后严格模式 `ReferenceError` 隐患，统一 `window.` 前缀。
- `calendarStore.changeMonth/goToday/selectDate` 在日历域无调用方（冗余死代码）。
- `main.js` 无 `weeklyDone` 60 天清理（README v3.3.0 声称有）→ 定时裁剪早于 60 天的键。

---

## 五、确认正常（无需改动）

- IPC 接通：`ReminderList` 点击确认 → `confirmReminder`(主进程落盘) ✓；主进程通知点击 → `reminder-confirmed` → renderer → `__refreshReminderList/History` → store 刷新 ✓。两条链路都接上。
- `syncRead/syncWrite` 缺失问题**已被特性检测规避**：`sync.js` 用 `typeof window.calendarAPI?.syncRead === 'function'` 回退到 `window.__storage`，移动端同步链路通畅（非严重 bug）。
- 农历标题（`ganZhi`/`animal`/`monthName` 含闰月）、节假日重复键（2026-09-27 已修复）、忙闲热力、StatsRing/WeeklyArea（M1 周一边界、M4 `useId` 唯一渐变）、GrowthPlant 里程碑守卫 — 均正确。
- XSS：用户输入（备注/标签/待办/动态）均经 Vue `{{ }}` 自动转义或 `escapeHtml`/`sanitizeUrl`，无注入点。
- `EffectLoop` 单一 `rafId`、订阅幂等、`visibilitychange` 暂停、registry 异常隔离均正确；premium → `html.fx-off` 降级生效。
- `version.json`(3.17.5) 与 `package.json`(3.17.5) 一致。

---

## 六、优先级修复路线

1. **P0（严重，用户立即可见）**：S1 编辑失效、S2 待办不刷新、S3 休息日提醒、S4 假更新弹窗。
2. **P1（中危，正确性/一致性）**：双状态源统一、喝水 store 接通、`social.js` 崩溃路径移除、登录后拉云端、提醒提前量/周完成态、设置页平台门控、特效监听器泄漏。
3. **P2（清理/健壮性）**：删除死代码（social-ui.js、legacy render*、store 冗余）、补齐 weeklyDone 清理、节假日数据核对、PNG 导出高度、口径一致性。

> 当前为**审查报告**，未改动任何源码。需要我直接修复 P0（4 个严重项）或按优先级批量修复时，告诉我即可。
