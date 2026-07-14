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
