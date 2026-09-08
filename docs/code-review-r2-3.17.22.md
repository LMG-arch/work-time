# 上班日历 全库深度审查报告（Request 2 · v3.17.22）

审查范围：`D:\ai\上班日历` 全部源码（main.js / preload.js / src/ 72 文件 / android 配置 / scripts）
审查方式：逐文件读取 + 模块联动契约追踪 + 修复后 `vite build` 验证
结论：**0 致命 · 1 严重（已修复）· 5 一般（4 已修复，1 按计划保留）· 若干建议（择机处理）**

---

## 一、致命（BLOCKER）

无。

## 二、严重

### S1 · Electron 生产 CSP `connect-src` 放行 `raw.githubusercontent.com` —— 已修复
- **位置**：`main.js` L562（CSP 字符串内）
- **问题**：更新检查的唯一合法目标是该域名的单个 version.json 文件，但 CSP 整域放行，等于对任意 GitHub raw 内容开放出网通道；配合渲染层若有注入即形成数据外泄通道。
- **修复**：
  1. CSP `connect-src` 移除 `https://raw.githubusercontent.com`（保留 `*.supabase.co/io` 白名单）。
  2. `main.js` 新增 IPC `get-latest-version`：由主进程 `https.get` 拉取固定 URL（10s 超时、UA 标识），并**校验 downloadUrl 必须落在 `github.com/LMG-arch/work-time` 或 GitHub 官方下载域名**，防止 version.json 被篡改后指向恶意下载源。
  3. `preload.js` 暴露 `getLatestVersion`；`src/electron/api.js` 新增同名方法（Electron 走 IPC 代理，其余返回 `{error:'not-supported'}`）。
  4. `src/updater/updater.js` 新增 `fetchRemoteVersion()`：Electron 优先走 IPC 代理，失败回退直连；Web/Capacitor（无此 CSP）直连原 URL。
- **验证**：`vite build` 通过；main.js/preload.js `node --check` 通过。

## 三、一般

### M1 · `store._todoReminded` 污染 `calendar-data.json` 序列化 —— 已修复
- **位置**：`main.js` `scheduleTodoReminders`（原 L737-744）
- **问题**：待办提醒去重标记挂在 `store._todoReminded` 上，`saveStore`/`saveDayData` 的 `JSON.stringify(store)` 会把它写进主数据文件——非业务字段随每次保存扩散、文件体积增长；且它会被 `sync-read` 无关地带入同步读取路径。
- **修复**：去重标记迁至独立文件 `todo-reminded.json`（`todoRemindedMap` + `saveTodoReminded()`）；启动时一次性迁移旧 `_todoReminded` 到新文件并从 store 剥离；7 天清理逻辑不变。

### M2 · 更新检查下载地址无来源校验（被 S1 修复吸收）
- 由 S1 的 `get-latest-version` 域名白名单校验一并解决。

### M3 · `startDownload` 走 `window.open` 与 URL 校验过宽 —— 部分修复
- **位置**：`src/updater/updater.js` `startDownload`
- **问题**：`sanitizeUrl` 仅校验 http/https 前缀即放行；桌面端 `window.open(url)` 可被诱导打开任意站点。
- **处理**：来源校验已由 S1 在「获取远程版本」环节把关（downloadUrl 必须来自本仓库或 GitHub 官方下载域）；`sanitizeUrl` 本身保持兼容不收紧，避免破坏头像等既有用法。已在代码注释中说明。

### M4 · 客户端 SHA-256 密码哈希（密码等价物）—— 保留并强化
- **位置**：`src/supabase/client.js` `hashPassword`（L197-207）
- **问题**：哈希值直发服务端 RPC 比对，截获哈希即可登录（文档已声明该弱点）。
- **处理**：服务端改造（Supabase 内置 Auth）超出本次「仅本地修复」边界，保留现状。已做伴随加固：`loginAccount` 登录成功后若服务端返回 `salt` 则持久化（为未来「服务端存盐」铺路，修复潜在盐不一致导致恢复失败的问题）。

### M5 · `settings.js`/`SettingsPage.vue`、`social.js`/`SocialPage.vue` 双套实现并存 —— 判定为存活桥梁，保留
- **判定**：经典 `social.js` 的 `initSocial()` 仍是启动初始化与登录后同步的唯一执行体（`renderer.js` L616 调用）；`settings.js` 的 `setTheme/loadTheme` 被 `renderer.js` L272/L546 直接调用（经 shims 挂 `window.*`）；DOM 渲染函数（`renderSocialView/renderSettingsView`）在 Vue 页常驻后已无 DOM 命中，为惰性死代码，但删除需连带清理 shims 映射与 renderer 依赖，风险收益不划算。
- **结论**：架构债记录在案，随 P11 迁移收尾时一并清除，本轮不删。

## 四、建议（择机处理）

| # | 位置 | 问题 | 建议 |
|---|------|------|------|
| 1 | `src/public/salt-seed.js` | 硬编码恢复盐随包分发 | 服务端存盐后删除本文件（脚本注释已声明为过渡方案） |
| 2 | `main.js` L112-136 | 开机自启走 PowerShell 命令拼接 | 转义已做（`''` 双重引号），可考虑 `app.setLoginItemSettings` 替代 |
| 3 | `src/updater/updater.js` | `UPDATE_CHECK_INTERVAL` 常量未使用（12h 定时器未接线） | 接线或删除常量 |
| 4 | `src/index.html` L29-116 | 内联启动诊断脚本 | 生产态依赖 `'unsafe-inline'` 豁免；长期可抽为外置脚本 |
| 5 | `src/life/markup.html` | 与 LifeWorkbench.vue 存在标记重复（app-shell 骨架） | 迁移完成后统一为组件化渲染，删除静态 markup |

## 五、模块联动结论（契约核验）

- **同步链契约一致**：`sync.js` `collectCalendarData`/`applyCalendarData` ↔ `preload.js` `syncRead/syncWrite` ↔ `main.js` `sync-read/sync-write`（days 按 updatedAt 深度合并、todos 按 id 合并、reminders 按 updatedAt、records 按 at）两端结构吻合；Electron 与 Web/Capacitor 分支行为对齐。
- **Pinia↔window 桥接一致**：`appStore` 主题键 `calendar-theme`、同步键 `calendar-sync-enabled` 均为单一真值；`__refresh*` 回调覆盖各 Vue 页，数据新鲜度修复到位。
- **导航链一致**：`renderer.switchView` → `App.vue.__vueActivate` → `__lifeSwitchView`/`__workSubActivate`（lifeEngine L814 委托 data-nav/work-sub）→ `LifeWorkbench` 子视图切换；`__pendingActivate` 处理引擎未就绪重放。
- **遗留问题（非本轮引入）**：
  - Electron 端 `saveDay` 不触发 `autoSyncPush`（sync.js 防抖推送只在 Web/Capacitor api.js 里接线）；Electron 同步依赖「显式同步/登录时同步」，行为可接受但文档化。
  - `get-reminder-records(date)` 与 `get-all-reminder-records` 在 preload 均有暴露，Vue 组件仅用后者，前者的 IPC 保留无副作用。

## 六、修复清单汇总

| 文件 | 修改 |
|------|------|
| `main.js` | +独立 `todo-reminded.json` 去重持久化（含旧数据迁移）；CSP 收紧；+`get-latest-version` IPC 代理（含下载源校验） |
| `preload.js` | +`getLatestVersion` IPC 桥 |
| `src/electron/api.js` | +`getLatestVersion`（Electron 走代理，其余返回 not-supported） |
| `src/updater/updater.js` | +`fetchRemoteVersion()` 代理优先/直连回退；错误处理统一 |
| `src/supabase/client.js` | `loginAccount` 登录成功后持久化服务端返回的 salt |

## 七、验证

- `node_modules/vite/bin/vite.js build`：✓ 通过（5.86s，仅 Rolldown 纯注释警告）
- `node --check main.js / preload.js`：✓ 通过
