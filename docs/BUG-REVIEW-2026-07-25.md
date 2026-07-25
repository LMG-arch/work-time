# 上班日历 — 全项目 Bug 审查报告

> 审查范围：5 个页面（日历/打卡/社交/统计/设置）+ 全部功能模块 + 导航路由 + 全局基础设施
> 方法：5 个并行静态分析代理逐文件审查，P0/P1 级已人工复核源码
> 严重级别：P0 致命（功能不可用/数据损坏）｜P1 严重（明显错误/数据风险）｜P2 一般（边界/体验问题）｜P3 建议（冗余/可维护性）

---

## 一、P0/P1 高优先（建议优先修复）

### 【全局】1. 登出后凭据"复活"，无法真正退出登录
- **位置**：`src/storage.js:94-97`（rawRemove）+ `:112-126`（flushAll）+ `:159-178`（_restoreFromFS）
- **问题**：`rawRemove` 先从内存 `_cache` 删除键，而 `flushAll` 只遍历 `_cache` **现存**键写 FS——被删键永远走不到 `fs.deleteFile`，FS 文件残留。重启后 `_restoreFromFS` 又把它读回缓存。`logoutAccount`（client.js:323）删的账号键因此复活，**退出登录后重启自动重新登录**。
- **修复**：`rawRemove` 维护 `_deletedKeys` 集合，`flushAll` 对其显式 `fs.deleteFile`；或 remove 时直接 `await fs.deleteFile`。
- **复核**：✅ 已确认属实。

### 【打卡】2. 打卡按钮永远"等待中"，用户到点也无法打卡
- **位置**：`src/components/ReminderList.vue:26-29`（currentTime）
- **问题**：`currentTime` 是**无响应式依赖**的 `computed`，Vue 首次求值后永久缓存。`getCardStatus` 用 `currentTime.value >= r.time` 判断是否可打卡——用户停留在打卡页等待到点，`currentTime` 停在进入时刻，按钮 `:disabled` 永不解除。必须退出重进页面才能打卡。
- **修复**：改 `ref` + `setInterval` 每分钟更新（卸载时清理），或 `getCardStatus` 内直接 `new Date()`。
- **复核**：✅ 已确认属实。

### 【打卡】3. 过午夜后打卡写入"昨天"日期
- **位置**：`src/components/ReminderList.vue:9-12`（todayStr）+ `:38`
- **问题**：`todayStr` 同样是无依赖 `computed`，跨午夜不更新。`confirmReminder` 用缓存的 `todayStr` 写记录 → 0 点后打卡记到前一天，连击/喝水全显示昨日。
- **修复**：同 #2，时间相关值改为响应式 ref + 定时器，或 `visibilitychange` 时重算。
- **复核**：✅ 已确认属实（与 #2 同源）。

### 【日历】4. 从日历添加待办，默认日期永远为空
- **位置**：`src/components/TodoModal.vue:44` + `src/pages/CalendarView.vue:157-171`
- **问题**：CalendarView 的 `selectedDate` 是组件本地 ref，`selectDate` 从不写入 `calendarStore.selectedDate`；而 TodoModal 新增时读 `calendarStore.selectedDate || ''` → 必为 `''`，点"添加"后日期空白，需手动重选。
- **修复**：`selectDate` 中同步 `calendarStore.selectedDate = dateStr`。

### 【日历】5. 前/后月补位格的农历全部算错
- **位置**：`src/pages/CalendarView.vue:229`
- **问题**：补位格（isOther）用 `lunar(currentYear, currentMonth+1, cd.day)`——7 月视图里 6 月 30 日格显示的是 7 月 30 日农历；日号 31 落入 30 天月份时按 Date 进位成下月 1 日。
- **修复**：从 `cd.dateStr` 拆出真实年月日：`const [y,m,d]=cd.dateStr.split('-')`，传 `lunar(+y,+m,+d)`。

### 【社交】6. 发送好友请求的返回值误用，失败也提示"已发送"
- **位置**：`src/components/FriendsTab.vue:49-51`
- **问题**：`sendFriendRequest`（supabase/social.js:296）返回 `{error:null}` 或 `{error:'...'}`，对象恒 truthy，`if (ok)` 永远成立 → "已发送过申请/已是好友"时也提示"已发送好友请求"。
- **修复**：`const r = await ...; if (r && !r.error) {...} else { addMsg = r.error }`。
- **复核**：✅ 已确认属实（读码核实）。

### 【社交】7. 点赞防重锁返回值与"取消点赞"同值，快速双击计数错乱
- **位置**：`src/supabase/social.js:207-220`（toggleLike）
- **问题**：`_likeLock` 命中时 `return false`，而"取消点赞成功"也 `return false`。SocialPage.vue:163 据此 `liked=false, likes-1` → 快速双击时计数被多减、状态错乱。
- **修复**：锁内返回 `null`，调用方判 `null` 跳过 UI 更新。

### 【社交】8. 点赞/评论数统计范围错误，显示数恒低于真实
- **位置**：`src/supabase/social.js:158-159`（getFeedPosts）
- **问题**：统计用 `.in('user_id', friendIds)`——只数"我和好友**发出**的"赞/评论。好友的帖子被其**非共同好友**点赞时不计数。
- **修复**：改为 `.in('post_id', postIds)`（按帖子统计）。

### 【社交】9. 图片上传失败静默降级，用户以为带图发布成功
- **位置**：`src/pages/SocialPage.vue:141`
- **问题**：`uploadPostImage` 失败返回 null，被 `|| ''` 吞掉后继续发纯文字帖 → 图丢失且无任何提示。
- **修复**：上传失败时 toast 并中断发布。

### 【同步】10. 已删除的打卡记录同步后"复活"
- **位置**：`src/supabase/sync.js:83`（applyCalendarData）+ `:183`（merge）
- **问题**：合并阶段正确排除了删除方（tombstone），但 `applyCalendarData` 用 `{...store.days, ...cloudData.days}` **并集**写回——本地较旧的非删除副本键仍在，不会被移除 → 已删记录本地复活，随后又被推回云端，污染所有设备。
- **修复**：合并模式下整体替换 days（或对缺席键显式删除），而非并集。

### 【设置】11. 导入数据无二次确认，误选文件即丢数据
- **位置**：`src/pages/SettingsPage.vue:461` + `src/electron/api.js:200`
- **问题**：`importData` 无 confirm，导入时 `store.todos` 全量替换、days 直接合并覆盖。
- **修复**：解析后先弹确认（显示条数）再写入。

### 【导航】12. 切换页面后日历浏览状态丢失
- **位置**：`src/pages/CalendarView.vue:19-21` + `src/components/App.vue:90-94`
- **问题**：当前月份/选中日期是组件本地 ref，App 无 `<keep-alive>` 且 transition `mode="out-in"` 每次切页都卸载 → 切回日历永远重置回当月、丢失选中日期。
- **修复**：状态提升到 `calendarStore`，或用 `<keep-alive>`。

### 【全局】13. switchView 时序颠倒，日历同步丢失
- **位置**：`src/renderer.js:31-41`
- **问题**：先 `syncToWindow()` 后 `__vueActivate(view)`——切向日历时 CalendarView 尚未挂载，`__calendarSyncDate` 打到已卸载旧实例的死闭包上，同步丢失。
- **修复**：activate 后（nextTick）再 sync。

### 【打卡】14. 禁用全部提醒后，已调度的系统通知仍弹出（幽灵通知）
- **位置**：`src/reminders/reminders.js:307-308`
- **问题**：`enabled.length===0` 时提前 return，跳过后面 cancel 逻辑 → 用户禁用全部提醒后，之前调度的系统通知照常弹出。
- **修复**：先 cancel pending 再判断空。

### 【打卡】15. 待办提醒调度不先取消，重复叠加 + 完成后仍弹
- **位置**：`src/reminders/reminders.js:578-579, 626`
- **问题**：无待办提醒时 early return 不清除已调度；且调度前从不 cancel，独立调用即重复叠加；待办完成/删除后已调度通知仍弹。
- **修复**：调度前统一 cancel 该类型通知。

---

## 二、P2 一般问题

| # | 位置 | 问题 | 建议 |
|---|------|------|------|
| 16 | `todoStore.js:70-78` | `toggleDone` 调 `window.calendarAPI.toggleTodoDone`（该 API 不存在），`?.` 守卫使函数静默空操作 | 改用 `updateTodo(id,{done})` 或删死代码 |
| 17 | `calendarStore.js:107` vs `CalendarView.vue:23` | `__refreshCalendarGrid` 被 Vue 版覆盖为仅 `refreshCount++`，遗留/同步路径的数据改动在 Vue 日历不可见 | Vue 回调中补数据回同步 |
| 18 | `supabase/social.js:216` | `getComments`/`acceptFriendRequest`/`rejectFriendRequest` 无 `window.sb` 守卫，sb 为 null 时 TypeError | 加 `if(!window.sb)` 守卫 |
| 19 | `SocialPage.vue:176-178` | `addComment` 不查返回值，插入失败也 `commentCount+1` 虚增 | 判 null 再更新 |
| 20 | `SocialPage.vue:22` | friendRequests 徽标仅 onMounted 查一次，同意/拒绝后红点数字不消 | 处理后刷新 badge |
| 21 | `FriendsTab.vue:63` | 好友申请列表不显示头像（好友列表有 `<img>`，不一致） | 补 avatar 渲染 |
| 22 | `FriendsTab.vue:48` | "不能加自己"用 auth id 与 profile id 比较，linked_id 场景失效 | 改用 `getEffectiveUserId()` |
| 23 | `reminders.js:374-385` | 通知回调直接改 `window.allReminderRecords`，store 持旧引用，通知栏打卡后 UI 不同步 | 统一走 reminderStore.confirmReminder |
| 24 | `ReminderSettings.vue:25-34` | 未校验 time 格式，清空后 NaN 时间参与调度 | 保存前校验 `HH:MM` |
| 25 | `sync.js:6` vs `appStore.js:17,44` | 同步开关双键分裂（`calendar-sync-enabled` vs `syncEnabled`），互不同步 | 统一为同一键 |
| 26 | `sync.js:257` | 主题同步漏合并 theme，本地刚换的主题被云端强制回滚 | theme 按时间戳或本地优先合并 |
| 27 | `sync.js:328-340` | `autoSyncPush` 防抖 clearTimeout 后，先前返回的 Promise 永不 resolve，await 方永久挂起 | 取消时先 resolve 旧 Promise |
| 28 | `stats.js:119-126` | Android 导出统计图必失败：Capacitor `Share.files` 需 URI 字符串数组，此处传 File 对象 | 先 Filesystem.writeFile 取 uri 再 share |
| 29 | `StatsPage.vue:47-48` + `appStore.js:21` | `window.currentMonth \|\| ...` 把 1 月（month=0）当 falsy 吞掉，查看 1 月回退成当前月 | 改用 `??` 或 `!= null` |
| 30 | `updater.js:38` | 版本号带 `v`/`-beta` 时 `map(Number)` 得 NaN，比较恒 false 漏报更新 | 先 `replace(/[^\d.]/g,'')` |
| 31 | `storage.js:180-199` | 非 Capacitor 平台（Electron/浏览器）FS 永不可用，仍空转 30×300ms≈9s，拖延按钮接线 | `if(!window.Capacitor){_loaded=true;return}` 短路 |
| 32 | `renderer.js:518-525` | 键盘 ←/→ 在 stats/social 等非日历页仍调遗留 `changeMonth`，污染全局年月 | 仅日历页响应 |
| 33 | `App.vue:78-80` | 任意 `visibilitychange` 可见即重播闪屏（文件导入框/权限弹窗/切后台返回都盖屏 1.2s） | 限定 Electron 托盘唤醒事件 |
| 34 | `vue-main.js:49-52` | 所有 unhandledrejection（含离线时 Supabase 请求）渲染全屏红色错误层，惊吓用户 | 过滤网络类错误仅 console |
| 35 | `CalendarView/StatsPage/TodoModal` | `window.__refresh*` hook 卸载后不清理（仅 SettingsPage 清理），renderer `?.()` 改死组件 ref | 统一 onBeforeUnmount 置 undefined |

---

## 三、P3 建议（冗余/可维护性）

| # | 位置 | 问题 |
|---|------|------|
| 36 | `social/social.js` vs `social/social-ui.js` | 700+ 行逐字节重复，双份维护必腐坏；social-ui.js 疑似死代码未被 import |
| 37 | `reminderStore.js:61-80` vs `reminders.js:60-130` | 喝水逻辑双份；store.waterCount 从未被写入，恒为 0 的死状态 |
| 38 | `renderer.js:50-62` | switchView 非 Vue 分支已是死代码；`.app` 内整段遗留 settings DOM 永不显示，建议按迁移计划删除 |
| 39 | `updater.js:4` | `UPDATE_CHECK_INTERVAL` 定义后从未使用，每次启动 5 秒即联网检查，12 小时间隔形同虚设 |
| 40 | `DetailPanel.vue:22` | `formatDateCN` 与 `utils.js:44` 重复实现 |
| 41 | `NoteEditor.vue` | 切换日期直接丢弃未保存备注，无确认提示 |
| 42 | `TodoItem.vue:42-44,60` | 周期待办先改本地再 await，失败无回滚无 toast；deleteTodo 失败无反馈 |
| 43 | `SocialPage.vue:69` | `formatRelativeTime` 跨年帖子只显"X月X日"，去年/今年无法区分 |
| 44 | `SettingsPage.vue:32` | `sanitizeUrl(url) \|\| avatarUrl.value` 回退使消毒失效，被拦截的非 http(s) URL 仍进 `img src` |
| 45 | `StatsPage.vue:96` | `noStatus` 把仅有备注/标签但无状态的天计为"未记录"，统计口径误导 |
| 46 | `sync.js:261-275` | 30 天墓碑清理只针对 days，todo 墓碑永不清理且 merge 不过滤 deleted → 云数据膨胀 |

---

## 四、已排除的误报

- ~~**shims.js:25 引错 social 模块导致 initSocial 崩溃**~~（原判 P0）：**误报**。`window.sb` 在 client.js:12 模块加载时已设 null，且 shims.js 先 import client.js（line 18）再 import social.js（line 25）。ES 模块严格模式下对**已存在**的全局对象属性赋值不抛错，`sb = initSupabase()` 实际写入 `window.sb`，bare-global 引用经 window 正常解析。社交页在生产环境正常运行亦印证。但 social.js / social-ui.js 重复代码（#36）仍是真实的维护性问题。

---

## 修复优先级建议

**第一梯队（影响核心功能/数据安全）**：#2、#3（打卡失效）、#1（登出复活）、#10（删除复活）、#11（导入覆盖）
**第二梯队（明显逻辑错误）**：#4、#5、#6、#7、#8、#12、#13、#14、#15
**第三梯队（边界/体验）**：#16-#35
**第四梯队（清理重构）**：#36-#46

> 总计：P0/P1 级 15 项，P2 级 20 项，P3 级 11 项。
