# 全量迁移计划：遗留 JS → Vue 3（纯 SPA 收尾）

> ✅ **执行状态（2026-07-11）**：P1–P11 全部完成，`vite build` 每阶段绿，运行时已无自有代码的经典 `<script>`（仅保留第三方 `lib/supabase.min.js`）。五轮审查 + 阻断项修复已完成。**实际采用的是「行为保持的 ESM 包装 + 过渡垫片（transition-shim）」路线**（非本文件原写的逐字节 SFC 重写），理由与细节见 `docs/vue-migration-report.md` §1。本文件原计划文案保留作历史参考。

> 触发：用户要求「把 js 全部迁移到 vue」。
> 范围决议（已与用户确认）：**UI 逻辑脚本 → SFC 组件；基础设施（无 DOM 模块）→ 被 Vue `import` 的纯 ES 模块**；彻底去掉经典 `<script>` 层。
> 执行策略（已确认）：**先出完整方案，经用户签字后再动手**。本文件即该方案。

---

## 0. 目标架构与不变式

**目标：** 运行时不再加载任何经典 `<script>` 遗留脚本。`index.html` 仅保留 `<div id="app">` + Vue 模块入口。所有数据走 Pinia store（唯一真值源），基础设施走被 `import` 的模块。

**迁移中必须守住的硬边界：**
- 🔴 **Electron IPC 边界保留**：`window.calendarAPI` 由 preload 注入，Vue 侧只能「包一层模块去调它」，不能删（见 Phase 3）。
- 🔴 **不动服务器 SQL**：`supabase-setup.sql` 及任何云端 RPC / RLS 一律不碰（延续此前用户约束）。
- 🔴 **Supabase 客户端零更改（用户 2026-07-11 明确）**：`lib/supabase.min.js`（UMD 全局 `supabase`）与 `vite.config.js` 的 `serveLibRaw` 插件**保留**；**不**换成 npm `@supabase/supabase-js` 的 `import`；`supabase-core.js` 改模块后仍用全局 `window.supabase` 构造客户端。Phase 11 也不删 `lib/supabase.min.js`。
- 🟡 **每阶段可运行**：每迁完一个脚本，必须 `npm run build` 绿 + 手动冒烟通过，再进入下一阶段；**每个阶段单独 git commit**，保证可 bisect。
- 🟡 **逐阶段从 `copyLegacyAssets.FILES` 与 `index.html` 的 `<script>` 标签中移除该文件**（同一阶段迁、同一阶段删，app 始终可跑）。

**回归冒烟清单（每阶段都要过，最后全量再过一遍）：**
启动 → 日历渲染 → 增/改/删 提醒 + 待办 → 喝水记录 → 安卓通知调度 → 好友圈 feed 加载 → 设置保存/恢复 → 云同步拉/推 → 主题切换 → 导航栏开关 → 检查更新。

---

## 1. 当前耦合事实（已核查）

- 遗留经典脚本 14 个（~4,749 行），经 `index.html` 的 `<script>` 在 Vue 模块之前加载，靠 `window.*` 暴露函数/状态。
- Vue 侧已存在：26 个 SFC（CalendarView / ClockinPage / StatsPage / SettingsPage / SocialPage + 组件）+ `effects/` 合成层 + 4 个 Pinia store（calendarStore / reminderStore / todoStore / appStore，已 eager-init 并读 `window.allX` 做向后兼容）。
- `App.vue` 已是 SPA 根：`PAGES` 映射 + `activate()`，并以 `window.__vueActivate` 暴露给 `renderer.js` 驱动切页。
- 双向桥：`renderer.js` 调 `window.__vueActivate(page)`；Vue 组件反过来调 ~40 个遗留全局（`window.renderCalendar` / `window.__refreshCalendarGrid` / `window.refreshAllData` / `window.sb` / `window.calendarAPI` / `window.Lunar` / `window.holidayData` / `window.__storage` …）。

**结论：** 迁移 = 把每个 `.vue` 里的 `window.X` 调用点改成 `import` 模块/组合式函数，并删除定义 `X` 的遗留脚本；同时让 Pinia store 取代 `window.allX` 成为真值源。

---

## 2. 逐文件落点映射

| 遗留脚本 | 行数 | 角色 | 落点 |
|---|---|---|---|
| `utils.js` | 103 | 工具（sanitizeUrl/showToast/escapeHtml/isCapacitorPlatform/showDiag…）| `src/utils.js`（ESM 导出）|
| `holidays.js` | 151 | 节假日数据 + getHolidayInfo | `src/data/holidays.js`（模块）|
| `lunar.js` | 163 | 农历 Lunar + lunarToSolar | `src/data/lunar.js`（模块）|
| `storage.js` | 143 | 耐用存储封装（`window.__storage`）| `src/storage.js`（ESM `export const storage`，保留 FS 自动 init）|
| `web-api.js` | 309 | Electron IPC 桥（包 `window.calendarAPI`）| `src/electron/api.js`（模块，内部仍调 `window.calendarAPI`）|
| `supabase-core.js` | 292 | Supabase 客户端 + 登录/会话 | `src/supabase/client.js` + `auth.js`（模块）|
| `supabase-social.js` | 465 | 社交 DB 操作 | `src/supabase/social.js`（模块）|
| `supabase-sync.js` | 338 | 云同步合并 | `src/supabase/sync.js`（模块，接 appStore/calendarStore）|
| `calendar.js` | 244 | 日历渲染 + 月导航 | `CalendarView.vue` + `useCalendar` 组合式 |
| `todos.js` | 94 | 待办逻辑 | 并入 `todoStore.js` + 现有 Todo* 组件 |
| `reminders.js` | 696 | 打卡/喝水/通知调度 | `ClockinPage.vue` + `useNotifications` 组合式 |
| `stats.js` | 151 | 统计 + 导出图 | `StatsPage.vue` |
| `settings.js` | 198 | 设置 UI 装配 | `SettingsPage.vue`（已大半在 Vue）|
| `updater.js` | 159 | 检查更新 | `useUpdater` 组合式（并入 Settings/App）|
| `social.js` | 710 | 好友圈 UI（最大）| `SocialPage.vue` + FeedList/PostCard/PostModal/FriendsList/ProfilePanel/CommentsPanel 组件 |
| `renderer.js` | 708 | **胶水层**：底部 toolbar + nav + 月导航 + 主题 + 切页驱动 | 并入 `App.vue`（它已有 `activate`/`PAGES`）|

---

## 3. 分阶段执行顺序（带回归闸门）

> 每阶段开头先 Read 该脚本全文，确认内部实现，再动手；严禁凭角色猜测内部逻辑。

### Phase 0 — 准备
- 固化上面「回归冒烟清单」为可勾选检查表。
- 确认 Electron 路径：`window.calendarAPI` 方法清单（getReminders / getAllReminderRecords / confirmReminder / getCalendarData / saveCalendarData / notifyTodo / syncRead …）逐条登记，Phase 3 必须 1:1 保留。
- 注：本阶段不删任何文件，仅立基线。

### Phase 1 — 纯工具模块（无 DOM，风险最低）
- `utils.js` → 模块；`holidays.js` → `data/holidays.js`；`lunar.js` → `data/lunar.js`；`storage.js` → ESM（导出 `storage`，在 `vue-main.js` 的 `app.mount` 前显式 `storage.init()`，保证 store 读取前已就绪）。
- 改写所有 `.vue` 里的 `window.showToast` / `window.sanitizeUrl` / `window.isCapacitorPlatform` / `window.showDiag` / `window.holidayData` / `window.getHolidayInfo` / `window.Lunar` / `window.lunarToSolar` / `window.__storage` 为 import。
- 从 `copyLegacyAssets.FILES` + `index.html` 移除这 4 个文件。
- **闸门**：build 绿 + 冒烟（toast/农历/节假日/存储读写）。

### Phase 2 — Supabase 层（基础设施模块）
- `supabase-core.js` → `src/supabase/client.js`（导出 `sb` getter、`initSupabase`、`get/saveSupabaseConfig`、`ensureSession`、`restoreAccount`、`register/login/logoutAccount`、`getSavedUsername`、`isAdmin`）。**客户端构造保持现状（用户明确：Supabase 客户端不做任何更改、不更新服务器）**：继续用 `lib/supabase.min.js` 暴露的全局 `supabase` 构造客户端，`serveLibRaw` 插件与 `lib/supabase.min.js` 一律保留、不删。
- `supabase-social.js` → `src/supabase/social.js`（导出全部函数）。
- `supabase-sync.js` → `src/supabase/sync.js`（导出 `isSyncEnabled`/`syncCalendarData`/`pushToCloud`/`pullFromCloud`/collect/apply），接 `appStore` + `calendarStore`。
- 改写 `.vue` 与 `social.js` 调用点（`window.sb`/`window.initSupabase`/`window.ensureSession`/`window.saveSupabaseConfig`/`window.isSyncEnabled`/`window.syncCalendarData`/`window.pushToCloud`/`window.pullFromCloud`/`window.registerAccount`/`window.loginAccount`/`window.logoutAccount`/`window.isAdmin`/`window.getTrashStats`/`window.getTrashSizes`/`window.restoreSelected`/`window.resetSelected`/`window.uploadPostImage`/`window.uploadAvatar`/`window.toggleLike`）。
- **闸门**：build 绿 + 冒烟（登录/会话恢复/好友圈 feed/云同步拉推）。

### Phase 3 — web-api（Electron 桥模块）
- `web-api.js` → `src/electron/api.js`，导出 calendarAPI 封装（内部仍调 `window.calendarAPI`，保留 IPC 边界）。Web/Capacitor 路径按现状优雅 no-op。
- 改写 `reminders.js` 等后续阶段的调用点（本阶段先迁模块本身，调用点随各 UI 阶段一起改）。
- **闸门**：build 绿 + 冒烟（Electron 存/取；Capacitor/Web 路径不崩）。

### Phase 4 — Calendar（UI）
- `calendar.js` → 把 `renderCalendar` / `updateMonthLabel` / 月导航并入 `CalendarView.vue` + `useCalendar` 组合式。
- 用 store 驱动取代 `window.renderCalendar` / `window.__refreshCalendarGrid` 桥：`calendarStore` 持有 `allData`，`CalendarView` watch 它重渲。
- **闸门**：build 绿 + 冒烟（渲染 / 上/下月 / 今天 / 点日期出详情）。**注意**：忙闲热力/面积图权重此前已审查一致，渲染逻辑须逐字节保持。

### Phase 5 — Todos（UI）
- `todos.js` → 逻辑并入 `todoStore.js`；删除 `window.__refreshTodoList` 桥。
- **闸门**：build 绿 + 冒烟（增/改/勾选/删待办，与提醒联动）。

### Phase 6 — Reminders / 打卡（UI，🔴 高风险）
- `reminders.js` → `ClockinPage.vue` 吸收 `renderClockinView` + 喝水记录；抽 `useNotifications` 组合式承载 `scheduleReminderNotifications` / `scheduleTodoReminders` / `sendTestNotification` / `diagnoseNotifications`（LocalNotifications 预调度 + Web 轮询兜底）。
- 以 store + 组合式取代 `window.__refreshReminderList` / `window.__refreshReminderHistory` / `window.renderClockinView` / `window.scheduleReminderNotifications` / `window.scheduleTodoReminders` 桥。
- 🔴 **风险最高区**：安卓通知调度。行为须逐字节一致；**必须真机验证**（沙箱无设备，见风险章）。
- **闸门**：build 绿 + 冒烟 + **真机安卓通知测试**。

### Phase 7 — Stats（UI）
- `stats.js` → `StatsPage.vue` 吸收 `exportStatsAsImage` + 统计渲染；删 `window.exportStatsAsImage` 桥。
- **闸门**：build 绿 + 冒烟（统计页 / 导出图）。

### Phase 8 — Settings + Updater（UI）
- `settings.js` → `SettingsPage.vue`（已大半在 Vue）吸收 `renderSettingsView` + 账号/同步/管理员 UI 装配。
- `updater.js` → `useUpdater` 组合式（manualCheckUpdate），并入 Settings/App。
- 此时多数桥函数已指向 Phase 2 的模块；本阶段清掉 `window.__refreshSettingsData` / `window.manualCheckUpdate` 等残留桥。
- **闸门**：build 绿 + 冒烟（存配置 / 登录 / 同步开关 / 导出导入 / 检查更新）。

### Phase 9 — Social（UI，最大块）
- `social.js`（710 行）→ `SocialPage.vue` + FeedList / PostCard / PostModal / FriendsList / ProfilePanel / CommentsPanel 组件。
- 移植 renderFeed/renderFriends/renderProfile/模态/点赞/评论/好友操作。
- 取代 `window.renderSocialView` / `window.__refreshSocialFeed` / `window.socialTab` / `window.uploadPostImage` / `window.uploadAvatar` / `window.toggleLike` / `window.sendTestNotification`（共享）/ `window.diagnoseNotifications`（共享）桥。
- **闸门**：build 绿 + 冒烟（feed 加载 / 发帖 / 点赞 / 评论 / 加好友 / 同意 / 改昵称）。

### Phase 10 — Renderer 胶水层（最后）
- `renderer.js` → 把 toolbar 点击 / nav 显隐 / 月导航 / 主题应用 / nav-items 逻辑并入 `App.vue`（它已有 `activate`/`PAGES`）。
- 删 `window.__vueActivate` / `window.__vueDeactivate` 桥（路由由 App 自管）。
- 从 `index.html` 删除遗留容器 `#calendar-view` / `#stats-view` / `#social-view` / `#settings-view` / `#detail-panel`（DOM 交由 Vue）。
- 从 `copyLegacyAssets.FILES` + `index.html` 移除 `renderer.js`。
- **闸门**：build 绿 + 全量冒烟（切页 / nav 开关 / 主题 / 月导航）。

### Phase 11 — 构建/配置清理
- `vite.config.js`：`copyLegacyAssets.FILES` 缩为空 → 删该插件；若 Phase 2 已弃 `supabase.min.js`，删 `serveLibRaw`。
- `index.html`：删除全部经典 `<script src="...js">` 标签，仅留 Vue 模块入口。
- **闸门**：build 绿 + 全量冒烟 + 一次干净冷启动。

---

## 4. 贯穿每阶段的规则
- 让对应 Pinia store 成为真值源；`window.allX` 读取改 store 状态，`window.allX =` 写入删除。
- 每迁一个脚本，同阶段从 `copyLegacyAssets` + `index.html` 摘掉它（app 始终可跑）。
- `storage` 改模块后，在 `vue-main.js` 的 `app.mount` 前显式 `init()`，store 改 `import storage`（不再用 `window.__storage`）。
- **过渡期 `window.*` 兼容垫片（关键）**：基础设施模块（utils/holidays/lunar/storage/supabase-*/web-api）改成 ESM 后，仍要把导出**挂回 `window.*` 垫片**，直到**最后一个**依赖它的遗留脚本也被迁移。垫片在最终 Phase 11 清理时统一删除。否则（例：Phase 1 把 `storage.js` 改成模块却不挂 `window.__storage`）会让尚未迁移的 `social.js`/`supabase-core.js`/`renderer.js` 等瞬间失效，违反「每阶段 app 可跑」。**Vue 侧调用点本阶段就改成 `import`**（不留双路径）；垫片只服务还没迁的遗留脚本。
- 服务器 SQL 永不改；Supabase 客户端构造零更改（见不变式）。
- **提交节奏（用户未另指定，按方案默认）**：每阶段单独 `git commit`，保证可 bisect。
- 每阶段 `npm run build` 绿 + 手动冒烟，再进下一阶段。

---

## 5. 风险登记
- 🔴 **通知调度（reminders.js）**：最高回归区。Phase 6 行为须逐字节一致，且**必须真机安卓验证**（沙箱无设备，无法代做）。
- 🔴 **日历渲染正确性**：忙闲/热力权重此前已审查一致，渲染逻辑不得漂移。
- 🟡 **Electron IPC**：`web-api` 封装须 1:1 保留 `window.calendarAPI` 方法面；Web/Capacitor 路径优雅 no-op。
- 🟡 **Supabase 客户端替换**（UMD 全局 → npm `import`）：改变客户端构造，须验证登录/会话恢复。
- 💭 **真机覆盖安装测试**：沙箱做不了。迁移完成后，建议用户按此前方案做 v3.16.x→新版 覆盖装验证（数据在 + 老用户自动迁移）。

---

## 6. 工作量与建议
- 总规模 ~4,749 行遗留 + 大量 `.vue` 桥调用点改写。Phase 6（通知）与 Phase 9（社交）是两块硬骨头。
- 建议：**严格按 Phase 1→11 顺序**，每阶段一个 commit；不要跨阶段并行改同一文件，避免冲突。
- 未动服务器。Electron 桌面端路径（userData/calendar-data.json）不受影响。
