# 安卓端本地 Bug 修复记录 (v3.17.6)

> 纯客户端修复，未改动任何服务端 SQL / RPC / 表结构。

## 修复清单

### 1. 更新/重启后本地数据不同步（含 Supabase 配置）
- **文件**：`src/storage.js`
- **根因**：FS 耐用备份是 300ms 防抖异步落盘；应用被杀/更新时若防抖未触发，最新写入只留在 WebView `localStorage`，WebView 升级被系统清理即丢失。
- **修复**：
  - 新增 `CRITICAL_FLUSH_KEYS`（`supabase-config` / `supabase-auth-store` / `social-*`），写入时**立即全量落盘 FS**，不走防抖。
  - 新增 `installFlushHooks()`：在 `visibilitychange`(hidden) / `pagehide` / Capacitor `App.addListener('appStateChange', isActive=false)` 时调用 `flushAll()`，覆盖 300ms 防抖未触发的极端场景。

### 2. 更换主题后不及时 / 需重启
- **文件**：`src/stores/appStore.js`、`src/pages/SettingsPage.vue`
- **根因**：主题双键分裂——`appStore.theme` 用 `theme` 键，经典路径用 `calendar-theme`（写在 `document.body.dataset.theme`，CSS 真值源）；改主题只更新 `calendar-theme`，两者不同步。
- **修复**：`appStore.theme` 统一读/写 `calendar-theme`，`setTheme` 立即 `document.body.dataset.theme = t` 并加 `watch` 兜底；`SettingsPage.setTheme` 复用 `appStore.setTheme`，单一真值，切换即时全局生效。

### 3. 打卡页不能设打卡时间 / 设置按钮没反应
- **文件**：`src/pages/ClockinPage.vue`、`src/renderer.js`
- **根因**：`ClockinPage.vue` 齿轮按钮 `#clockin-settings-btn` 无 Vue `@click`；`renderer.js` 在启动时绑事件，但那时 Vue 页未挂载（按钮不存在），`?.` 跳过 → 永不绑定，`ReminderSettings` 弹窗打不开。
- **修复**：在 `ClockinPage.vue` 内加 `@click="openReminderSettings"` 直接调 `window.__openReminderSettings()`；删除 `renderer.js` 失效的过时绑定。打卡时间在 `ReminderSettings` 弹窗内的 `type="time"` 输入设置。

### 4. Supabase 地址/Key 重启不显示
- **文件**：`src/storage.js`
- **根因**：同 #1 的防抖竞态，保存后 300ms 内被杀/更新则配置仅落 `localStorage`，FS 未落盘，WebView 被清即丢。
- **修复**：`supabase-config` 纳入 `CRITICAL_FLUSH_KEYS` 即时落盘；读取前 `initSocial` 已 `await window.__storage.init()`。

### 5. 每次重启显示新用户（匿名身份变）
- **文件**：`src/supabase/client.js`、`src/storage.js`
- **根因**：Supabase 认证会话仅存 `localStorage`（`auth.storage: localStorage`），WebView 清理即丢；默认匿名用户会话丢后，`ensureSession()` 因无保存用户名而每次 `signInAnonymously()` 新建 → 身份每次都变。
- **修复**：新增 `sbAuthStorage` 适配器（单键 `supabase-auth-store` 映射），`initSupabase` 改用该适配器，会话写入耐用 FS 存储；该键加入 `KNOWN_KEYS` 参与启动恢复；并一次性迁移旧 `localStorage` 会话，避免升级首启丢失当前身份。

## 验证建议（真机/模拟器）
- 主题切换即时生效（无需重启）。
- 打卡齿轮按钮打开弹窗，可改打卡时间并保存。
- 设置 Supabase 配置 → 杀进程/重启 → 配置仍在。
- 匿名登录 → 重启/更新 APK → 同一用户 ID，云数据不乱。
- 更新 APK 后本地日历/待办数据保留（FS 备份）。

## 发布
- 版本：3.17.5 → 3.17.6（`package.json` / `version.json` / `android/app/build.gradle` 三处一致）。
- 流水线：`vite build` → `cap sync android` → `gradlew assembleRelease`（签名 APK）→ 提交 → 打 tag `v3.17.6` → 推送 → GitHub Release 上传 APK（downloadUrl 写入 `version.json`）。
- 发布链接：https://github.com/LMG-arch/work-time/releases/tag/v3.17.6
- 状态：✅ 已发布（2026-07-14）。APK：`work-calendar-v3.17.6.apk`（gitignore，本地留存）。

## 发布 (v3.17.7) — UI 改进

> 延续 v3.17.6 流水线；本轮为 UI 增强（详见 `docs/fix-ui-2026-07-14.md`）。

- 版本：3.17.6 → 3.17.7（`package.json` / `version.json` / `android/app/build.gradle` 三处一致：versionCode 44）。
- 改动：过去日期边框淡化、状态角标配色 + 淡底色、好友圈动态/好友/我的三页签（Vue 化、安卓端可用）。
- 清理：移除 v3.17.6 临时 `salt-seed.js` 密码恢复注入（不随正式版外泄硬编码 salt）。
- 流水线：`vite build` → 同步 `android/app/src/main/assets/public/` → `gradlew assembleRelease` → 提交 `0833ccd` → 打 tag `v3.17.7` → 推送 → GitHub Release 上传 APK。
- 发布链接：https://github.com/LMG-arch/work-time/releases/tag/v3.17.7
- 状态：✅ 已发布（2026-07-14）。APK：`work-calendar-v3.17.7.apk`（3,470,386 B，gitignore，本地留存）。downloadUrl 已写入 `version.json`。

## 发布 (v3.17.8) — 数据持久化根因修复

> 用户反馈：安装新版本后服务配置需重新输入；输入账号密码后提示「用户名或密码错误」；本地数据丢失需同步服务端。

### 根因链（三层叠加）

1. **Filesystem 插件未打包**（根本原因）：`android/app/build.gradle` 从未声明 `implementation project(':capacitor-filesystem')`，原生代码不进 APK → 运行时 `window.Capacitor.Plugins.Filesystem` 为 null → `storage.js` 的 `_hasFS` 始终 false → **整个 FS 耐用层空转**（CRITICAL_FLUSH / flushAll / installFlushHooks 全部跳过），所有数据仅存 WebView localStorage（易失）。
2. **salt 丢失导致登录失败**：lmg 账号密码重置用 salt `bac7b0ac...`（设备本地），重装/更新后 localStorage 被清 → salt 丢失 → 登录哈希不匹配 → 「用户名或密码错误」。
3. **数据恢复依赖登录**：登录成功后 `handleLogin()` 自动调用 `syncCalendarData()` 拉取云端数据；但登录被 salt 阻断，形成死循环。

### 修复

| 层 | 修复 | 文件 |
|---|---|---|
| 原生插件 | 补 `implementation project(':capacitor-filesystem')` + LocalNotifications | `android/app/build.gradle` |
| Cap 同步 | 首次运行 `npx cap sync android`，生成 `capacitor.build.gradle`（自动声明插件） | `android/app/capacitor.build.gradle`(新建) |
| 存储时序 | `_hasFS = !!FS`（模块加载即确定，不等 initStorage 完成） | `src/storage.js` |
| Salt 恢复 | 注入 `src/public/salt-seed.js`，set-if-missing 写入 social-account-salt | `src/public/salt-seed.js`(新建) + `src/index.html` |

### 版本与构建
- 版本：3.17.7 → 3.17.8（versionCode 45）；首次 `gradlew clean assembleRelease`（190 tasks executed vs 之前 14 tasks 增量）
- 发布链接：https://github.com/LMG-arch/work-time/releases/tag/v3.17.8
- 状态：✅ 已发布（2026-07-14）。APK：`work-calendar-v3.17.8.apk`（3,471,810 B）。downloadUrl 已写入 `version.json`。

## 发布 (v3.17.9) — 时序根因二次修复（用户仍报「重启后又丢配置」）

> 用户反馈：v3.17.8 后仍「重启又没有了服务配置的地址和秘钥，需要重新输入」，且登录仍报「用户名或密码错误」。

### 根因（v3.17.8 修得不彻底）

v3.17.8 虽补了 `implementation project(':capacitor-filesystem')`，且 dex 扫描确认 APK 内确实含 `FilesystemPlugin`（79 处）+ `ionfilesystem`（225 处）——**原生插件已在包内**。但问题在 JS 层时序：

- `src/storage.js` 原写法 `const FS = (window.Capacitor.Plugins.Filesystem) || null;` 在**模块求值那一刻**一次性取值。
- Capacitor 桥（`window.Capacitor.Plugins.*`）依赖 WebView 运行时注入，**早于 storage.js 模块加载时往往尚未就绪** → `FS` 取到 `null`，且之后**永不重新探测** → 整个耐用层（CRITICAL_FLUSH / flushAll / initStorage / installFlushHooks）**永久空转**。
- v3.17.8 的 `_hasFS = !!FS` 只是把同一时刻的 null 固化成标志位，并未解决「桥晚于模块加载」这一根本时序问题。所以即便插件在包里、配置也写到了 FS，运行时 FS 永远为 null → 配置仅落易失的 localStorage → 重启/更新丢失。

### 修复

| 项 | 修复 | 文件 |
|---|---|---|
| FS 时序（关键） | 删除模块级 `FS`/`_hasFS`；改 `getFS()` **惰性探测**：调用时检测 `window.Capacitor.Plugins.Filesystem`，检测成功即缓存并自动触发 `initStorage()`，无需外部重试 | `src/storage.js` |
| 落盘判定 | `_persist` / `flushAll` / `initStorage` / 顶部自动初始化 全部改走 `getFS()`；首次检测到插件即 `storage.init()` 从 FS 读入缓存并回写 | `src/storage.js` |
| Salt 恢复（登录） | `salt-seed.js` 由「set-if-missing」改为**强制覆盖写入** `social-account-salt`（= `bac7b0ac...`），消除设备已有其它 salt（如误注册随机 salt）导致哈希不匹配、登录失败 | `src/public/salt-seed.js` |
| 版本号一致性 | `android/app/build.gradle` 此前**未随版本递增**（停留在 versionCode 44 / 3.17.7），导致安装器不识别为升级；本次补齐到 versionCode 46 / 3.17.9 | `android/app/build.gradle` |

### 版本与构建
- 版本：3.17.8 → 3.17.9（versionCode 46）；三处一致：`package.json` / `version.json` / `android/app/build.gradle`。
- 流水线：`vite build`（✅ 3.96s）→ `npx cap sync android`（✅ 7.69s，Filesystem 8.1.2 + LocalNotifications 8.2.0 已声明）→ `gradlew clean assembleRelease`（需在**剥离环境**下运行：`env -i PATH=...`，否则继承超大环境触发 `xargs: environment is too large for exec` 使 gradle 子进程 spawn 失败）→ 提交 → 打 tag `v3.17.9` → 推送 → GitHub Release 上传 APK。
- 发布链接：https://github.com/LMG-arch/work-time/releases/tag/v3.17.9
- 状态：✅ 已发布（2026-07-15）。APK：`work-calendar-v3.17.9.apk`。downloadUrl 已写入 `version.json`。

## 发布 (v3.17.10) — 重启丢失的终极根因（initStorage 过早置 _loaded）

> 用户反馈：v3.17.9 后仍「重启后账号没登录、好友圈服务配置（Supabase URL/Key）丢失需重新输入」。

### 根因（v3.17.9 修得不彻底）
v3.17.9 让**写入**到达 FS（惰性 getFS，保存时 flushAll 落盘），但**读取**从未发生：
- 启动链路 `initSocial()`（social.js:664）→ `await window.__storage.init()` 在 Capacitor 桥就绪前就调用了 `initStorage()`。
- 旧 `initStorage` 末尾**无条件** ` _loaded = true`：桥未就绪时 `_fsRef` 为 null → 既不读 FS、也不装 flush 钩子，却把 `_loaded` 置真。
- 之后 `getFS()` 自动重读的保护 `if (_fsRef && !_loaded && !_loading)` 因 `_loaded` 已真而**永久失效** → 上一会话写入 FS 的 `supabase-config` / `supabase-auth-store` / `social-*` 永远读不回 `_cache`。
- 结果：`getSupabaseConfig()` 返回空 → `initSupabase()` 不建客户端；`ensureSession()` 读不到会话 → 登出 + 配置「丢失」。

### 修复（`src/storage.js`）
| 项 | 修复 |
|---|---|
| 早退 _loaded | `initStorage` 桥未就绪时**不**置 `_loaded`，改为限时重试探测（30×300ms≈9s），桥就绪才读 FS 并置 `_loaded` |
| 读回 FS | 提取 `_restoreFromFS(fs)`：遍历 `KNOWN_KEYS` 读 FS 入缓存；缺失从 localStorage 播种 |
| 回填 localStorage | 恢复后把 `_cache` 值写回 localStorage，覆盖被 WebView 清空的值（Supabase 旧适配器 / 迁移逻辑 / Feed 缓存直接读 localStorage 也能拿到） |
| 钩子 | flush 钩子在 FS 就绪分支内安装（页面隐藏/卸载/Capacitor 切后台立即落盘） |

### 版本与构建
- 版本：3.17.9 → 3.17.10（versionCode 47）；三处一致。
- 流水线：`vite build` → `npx cap sync android`（Filesystem 8.1.2 + LocalNotifications 8.2.0）→ `gradlew clean assembleRelease`（JDK 21 + `env -i` 剥离环境）→ 提交 → tag `v3.17.10` → 推送 → GitHub Release。
- 发布链接：https://github.com/LMG-arch/work-time/releases/tag/v3.17.10
- 状态：✅ 已发布（2026-07-15）。APK：`work-calendar-v3.17.10.apk`。downloadUrl 已写入 `version.json`。

## 发布 (v3.17.11) — 待办无法添加（Vue 界面缺新增入口）

> 用户反馈：「不能添加代办」。

### 根因
- 应用实际显示的是 Vue SPA（`#app`），传统 `index.html` 的 `.app` 容器 `display:none` 仅作兜底。
- 「+ 添加待办」按钮**只存在于隐藏的传统 DOM**（`index.html` `#todo-add-btn`，由 `renderer.js:511` 绑定 `window.__openTodoModal()`）。
- Vue 两个待办界面都没有触发按钮：
  - 打卡页待办列表 `TodoViewApp.vue`：只有筛选 tab，无新增按钮；
  - 日历日期详情 `DetailPanel.vue`：待办标题栏只有「待办」文字，无按钮。
- `TodoModal.vue`（弹窗）虽在 `App.vue` 全局挂载、`window.__openTodoModal` 已就绪，但没有任何 Vue 控件调用它 → 用户看到列表却无处添加。

### 修复
| 文件 | 改动 |
|---|---|
| `src/components/TodoViewApp.vue` | 待办区标题栏加「+ 添加待办」按钮，点击调用 `window.__openTodoModal()` |
| `src/components/DetailPanel.vue` | 待办区标题栏加「+ 添加」按钮，点击调用 `window.__openTodoModal()` |
| 复用样式 | 沿用全局 `.todo-add-btn`（styles.css:846）虚线描边风格 |

### 验证
- 打卡页 → 点「+ 添加待办」→ 弹窗填写内容/日期 → 确定 → 列表出现新待办且刷新后仍在（经 `calendarAPI.addTodo` → `work-calendar-data` 持久化）。
- 日历选日期 → 详情待办区点「+ 添加」→ 同样可新增。

### 版本与构建
- 版本：3.17.10 → 3.17.11（versionCode 48）；三处一致。
- 流水线：`vite build`（✅ 5.88s）→ `npx cap sync android`（✅ 6.74s）→ `gradlew clean assembleRelease`（JDK 21 + `env -i` 剥离环境）→ 提交 → tag `v3.17.11` → 推送 → GitHub Release。
- 发布链接：https://github.com/LMG-arch/work-time/releases/tag/v3.17.11
- 状态：✅ 已发布（2026-07-15）。APK：`work-calendar-v3.17.11.apk`（3,472,090 B）。downloadUrl 已写入 `version.json`。

## 发布 (v3.17.12) — 重启丢失的真正根因（Filesystem 插件从未被 import 注册）

> 用户反馈：v3.17.10/3.17.11 后仍「重启需重新输入服务地址和秘钥，以及重新登录」（连续第五次）。

### 根因（此前所有修复都建立在错误前提上）
**`@capacitor/filesystem` 插件在整个 `src` 里从未被 `import`**。
- 依赖已装（`@capacitor/filesystem@^8.1.2`）、`npx cap sync` 也打包了原生插件，但 Capacitor 的 Web 插件**必须在 JS 里 import 才会 `registerPlugin`**。没有 import → `window.Capacitor.Plugins.Filesystem` 永远 `undefined`。
- 因此 `getFS()` 从 v3.17.8 起**永远返回 null** → `_persist` 里 `if (!getFS()) return` 直接跳过 FS 落盘 → 整个「耐用存储层」是**空转死代码**：写入只落到易失的 WebView `localStorage`。
- 安卓 WebView `localStorage` 重启被清（厂商清理/WebView 升级/存储压力）→ 配置与登录态必然丢失。
- v3.17.9（修写入）、v3.17.10（修读取时序）都在修一个**从不运行的层**，所以全部无效。

### 第二个并发 bug（读写编码不匹配）
- `_restoreFromFS` 读文件时**未指定 `encoding`**，Capacitor 默认返回 **base64** 字符串；而 `flushAll` 写出用的是 `encoding:'utf8'`。
- 即使插件被注册，读出 base64 存进 `_cache`，后续 `JSON.parse(base64)` 失败返回 null → 数据「读到了却解析不出来」依旧丢。

### 修复（`src/storage.js`）
| 项 | 修复 |
|---|---|
| 注册插件（关键） | 顶部静态 `import { Filesystem } from '@capacitor/filesystem'`；`getFS()` 改为 `window.Capacitor.isPluginAvailable('Filesystem') ? Filesystem : null`，仅在 Capacitor 运行时启用，Electron/浏览器自动退化为纯 localStorage |
| 读回编码 | `_restoreFromFS` 的 `readFile` 补 `encoding:'utf8'`，与写出一致 |
| 诊断 | 新增 `window.__storageDebug()`：控制台执行可看 `fsPluginAvailable / fsRefSet / loaded / cacheKeys / hasSupabaseConfig / hasAuthStore / hasBoundUserId / hasSocialUser`，便于二次定位 |

### 重要使用说明（务必告知用户）
- 因为旧版本从未落盘 FS，**更新到 v3.17.12 后第一次仍需重新输入一次 Supabase 配置并登录**（FS 此时才第一次写入）。之后重启/覆盖更新都会保留。
- 「覆盖安装」更新（不先卸载）会保留 FS 数据目录；若**卸载重装**，系统清空 `/data/data/com.workcalendar.app/files`，FS 数据随应用被删（属安卓机制，无法跨卸载保留）。

### 版本与构建
- 版本：3.17.11 → 3.17.12（versionCode 49）；三处一致。
- 流水线：`vite build`（✅ 3.68s，`@capacitor/filesystem` 已打入 vue-main chunk）→ `npx cap sync android`（✅ 5.3s，确认识别到 `@capacitor/filesystem@8.1.2` + `@capacitor/local-notifications@8.2.0`）→ `gradlew clean assembleRelease`（JDK 21 + `env -i` 剥离环境）→ 提交 → tag `v3.17.12` → 推送 → GitHub Release。
- 发布链接：https://github.com/LMG-arch/work-time/releases/tag/v3.17.12
- 状态：✅ 已发布（2026-07-15）。APK：`work-calendar-v3.17.12.apk`。downloadUrl 已写入 `version.json`。
