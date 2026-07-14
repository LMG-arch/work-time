# 安卓端本地 Bug 修复设计 (2026-07-14)

## 约束
- 仅客户端改动，**不修改任何服务端 SQL / RPC / 表结构**。
- 目标环境：Android (Capacitor WebView)。复用现有 `src/storage.js` 耐用层（Capacitor Filesystem + localStorage 二级副本）。
- 已与用户确认：发布 = 构建 APK + 提交 + 打 tag 发布；Bug 5 采用「持久化匿名 ID 并复用」方案（实现上需把 Supabase 会话/认证持久化接入耐用存储，才能真正复用同一匿名身份）。

## Bug 1 & 4：更新/重启后本地数据（含 Supabase 配置）丢失

**根因**：`storage.js` 的 FS 耐用备份是 300ms 防抖**异步**落盘；应用被杀/更新时若防抖未触发，最新写入只留在 `localStorage`，WebView 升级被系统清理即丢失。`supabase-config` 同样受影响 → 重启不显示。

**修复**：
1. `_persist` 中对关键配置键（`supabase-config`、`social-account-*`、`social-bound-user-id`、`social-nickname`）**即时落盘**：直接 `FS.writeFile(...)`（fire-and-forget，不走 300ms 防抖）。
2. 监听 `visibilitychange`(hidden) / `pagehide` → 调用 `flushAll()` 立即全量写 FS（最后保险）。
3. `storage.js` 内增加 Capacitor `App` 的 `appStateChange`(pause) 回调 → `flushAll()`（Android 切后台/被杀前的最佳落盘窗口）。
4. 读取前保证 `await window.__storage.init()`（SettingsPage.loadSupabaseConfig、initSocial 已 await；补充 ClockinPage 等读取点）。

## Bug 2：换主题不及时 / 需重启

**根因**：主题双键分裂——`appStore.theme` 用 `theme` 键，经典路径用 `calendar-theme`（CSS 驱动，写在 `document.body.dataset.theme`）；改主题只更新 `calendar-theme`，`appStore.theme` 不随动，部分组件读 `appStore.theme` 显示错位。

**修复**：
1. 删掉 `appStore` 独立的 `theme` 键，统一读/写 `calendar-theme`。
2. `appStore.setTheme(t)`：写 `calendar-theme` + 立即 `document.body.dataset.theme = t`（可保留 `startViewTransition`），并加响应式 `watch` 兜底。
3. `SettingsPage.setTheme` 复用 `appStore.setTheme`（单一入口），保证全应用同步、即时生效。
4. 启动 `loadTheme()` 已读 `calendar-theme` 应用到 body，确保挂载后不被覆盖。

## Bug 3：打卡设置按钮无反应 / 不能设打卡时间

**根因**：`ClockinPage.vue` 的齿轮按钮 `#clockin-settings-btn` **无 Vue `@click`**；`renderer.js` 在启动时绑事件，但那时 Vue 页未挂载（按钮不存在），`?.` 跳过 → 永不绑定；`ReminderSettings` 弹窗打不开，故无法设打卡时间。

**修复**：
1. 在 `ClockinPage.vue` 给按钮加 `@click="openReminderSettings"`，函数内 `window.__openReminderSettings?.()`。
2. 删除 `renderer.js` 中对 `#clockin-settings-btn` 的过时绑定（避免失效残留）。
3. `ReminderSettings.vue` 内的 `type="time"` 输入早已可用，弹窗打开即可设打卡时间；保存走 `calendarAPI.saveReminders`（已耐用化）。

## Bug 5：每次重启显示新用户（匿名身份变）

**根因**：Supabase 认证会话仅存 `localStorage`（`auth.storage: localStorage`），WebView 清理即丢；默认**匿名用户**会话丢后，`ensureSession()` 因无保存用户名而每次 `signInAnonymously()` 新建 → 身份每次都变。已注册用户有 `restoreAccount()` 兜底，匿名（默认）没有。

**修复（持久化匿名 ID + 复用）**：
1. 新增耐用认证存储适配器：
   ```js
   const sbAuthStorage = {
     getItem: k => window.__storage.getRaw('sb-auth:' + k),
     setItem: (k, v) => window.__storage.setRaw('sb-auth:' + k, v),
     removeItem: k => window.__storage.remove('sb-auth:' + k),
   }
   ```
2. `initSupabase()` 的 `createClient` 用 `auth: { storage: sbAuthStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }`，替换原 `localStorage`。
3. 该适配器写入的 `sb-auth:*` 键加入 `storage.js` 的 `KNOWN_KEYS`（确保 FS 备份 + 启动恢复）。
4. 副作用：登录态（已注册用户）也一并耐用化，与现有 `restoreAccount()` 互补；`ensureSession()` 因能从耐用存储读到会话而返回同一用户，无需改其逻辑。
5. **边界**：若刷新令牌被服务端吊销（极少见），仍会新建匿名用户——客户端无法避免，可接受。

## 发布流水线（推送更新）
1. 版本号：`package.json` 3.17.5→3.17.6；`version.json` 的 `version`/`versionCode`(42→43)/`releaseDate`/`downloadUrl`(`.../v3.17.6/work-calendar-v3.17.6.apk`)/`changelog`。
2. `npm run build` → `dist/`。
3. `npx cap sync android` → 同步到 `android/assets`。
4. `npx cap build android`（assembleRelease，用 `android/app/workcalendar.keystore` 签名）→ 产出 `work-calendar-v3.17.6.apk`。
5. `git add -A && git commit -m "fix(android): 本地数据/主题/打卡/配置/匿名身份持久化"`；`git tag v3.17.6`；`git push && git push --tags`。
6. `gh release create v3.17.6 --title "v3.17.6" --notes "<changelog>" work-calendar-v3.17.6.apk`（downloadUrl 与 version.json 一致）。
7. 更新文档：`docs/fix-android-2026-07-14.md` 记录本次修复；README 视情况补充。
8. 注：APK 构建需本机 Android SDK/Gradle；若沙箱缺失，则完成 1/2/3/5/6/7 并产出 APK 构建命令供本地执行。

## 验证清单
- 主题切换即时生效（无需重启）。
- 打卡齿轮按钮打开弹窗，可设时间。
- 设置 Supabase 配置 → 杀进程/重启 → 配置仍在。
- 匿名登录 → 重启/更新 → 同一用户 ID，云数据不乱。
- 更新 APK 后本地日历/待办数据保留（FS 备份）。
