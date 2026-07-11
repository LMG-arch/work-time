# 上班日历 · 代码审查标准与流程

> 适用范围:Electron 主进程(`main.js` / `preload.js`)、Vue 3 渲染层(`src/**`)、遗留 JS 模块(`renderer.js` / `calendar.js` 等)、Supabase 云同步、Capacitor Android 端。
>
> 设计原则呼应 `CLAUDE.md`:本规范同样坚持**第一性原理**——审查时追问"为什么",打补丁不如修根因,任何决策都要能回答"这对用户/数据意味着什么"。

---

## 一、审查哲学

代码审查不是"找茬比赛",而是**用最小成本在合并前拦住真正会伤害用户的问题**。我们项目质量参差,审查的首要目标是**稳定提升下限**,而不是追求完美。

三条底线:

1. **正确性 > 安全性 > 可维护性 > 性能**。顺序即优先级。
2. **教人,不压人**。每条意见都要解释"为什么"和"怎么改",而不是一句"改成 X"。
3. **双架构视角**。本项目正处于"纯 JS → Vue 3 渐进迁移"阶段,**同一功能往往同时存在 legacy 全局脚本与 Vue 实现两条路径**。审查任何功能都要同时检查两边是否被正确处理,避免"Vue 修了、legacy 没动"的回归。

---

## 二、严重等级定义

每条审查意见必须标注等级。建议用 Emoji 前缀保持一致:

| 等级 | 含义 | 合并门槛 |
|------|------|----------|
| 🔴 **阻断(Blocker)** | 合并后必然或极可能造成伤害:安全漏洞、数据丢失/损坏、竞态、破坏 API 契约、关键路径无错误处理 | **必须修复才能合并** |
| 🟡 **建议(Suggestion)** | 应当修:缺输入校验、逻辑难懂、重要路径无测试、性能隐患、可提取的重复 | **应当修复**,若暂不改需作者与审查者达成一致并记录 |
| 💭 **润色(Nit)** | 锦上添花:命名、注释、风格(无 linter 管的)、可选优化 | 不阻塞,鼓励顺手改 |

**判断技巧**:如果一个问题只在"极端边界 + 特定操作序列"下才触发,且已有兜底不影响数据,通常是 🟡 而非 🔴。反之,只要是"外部输入能触达且未校验",优先按 🔴 处理。

---

## 三、分领域审查清单

### 3.1 Electron 主进程 & IPC(`main.js` / `preload.js`)

- 🔴 `webPreferences` 必须保持 `contextIsolation: true` + `nodeIntegration: false`,且只通过 `contextBridge.exposeInMainWorld` 暴露 API(preload.js 已做到,任何改动都不得回退)。
- 🔴 `ipcMain.handle` 收到的参数**默认不可信**。云端/渲染进程传入的数据必须校验形状后再写入 `store` 或落盘。
  - ⚠️ 真实案例:`main.js` 的 `sync-write` 直接 `mergedDays[date] = cloudDay`,对云端返回对象**无任何字段校验**。一旦云端返回异常结构(或被中间人篡改),可注入任意字段进本地存储。建议增加与 `import-data` 同级别的字段白名单校验(`status`/`note`/`tags`/`color`/`updatedAt`/`deleted`)。
- 🔴 磁盘写入必须用**原子写**(先写 `.tmp` 再 `renameSync`)。`saveStore` / `saveStoreSilent` / `saveDayData` 已采用,新增写入路径须沿用,禁止直接 `writeFileSync` 覆盖原文件。
- 🟡 `import-data` 是**校验的正确范本**:日期键走 `/^\d{4}-\d{2}-\d{2}$/`、note 截断 500 字、tags 过滤非字符串并切片 10。新增加密数据导入时复制这套校验逻辑,不要裸 `Object.assign`。
- 💭 路径拼接用 `path.join`,避免字符串拼接。开机自启的快捷方式路径(`main.js` `setAutoLaunch`)涉及 PowerShell,确认变量已做引号转义(当前用 `EncodedCommand` base64,做法正确)。

### 3.2 安全与隐私(贯穿所有层)

- 🔴 **XSS**:任何把用户输入拼进 `innerHTML` / 模板字符串 HTML 的地方,必须经过 `escapeHtml`(正文)或 `escapeAttr`(属性)。
  - ✅ 正面案例:`utils.js` 的 `showDiag` 用 `escapeHtml(message).replace(/\n/g,'<br>')`,先转义再放行换行,正确。
  - 🔴 反例信号:看到 `element.innerHTML = '...' + userInput + '...'` 且没有 `escapeHtml`,即为阻断级。
- 🔴 **URL 校验**:头像 / 图片 / 外部链接 URL 必须走 `sanitizeUrl`(仅放行 `http(s)://`)。`img.src = userProvidedUrl` 直接赋值而未经 `sanitizeUrl` 即阻断级。
- 🔴 **CSP**:`main.js` 已设置 CSP,改动 CSP 时遵循最小权限原则——
  - `script-src` 保持 `'self'`(禁止 `'unsafe-inline'` / `'unsafe-eval'`)。
  - `connect-src` 已放开 `https://raw.githubusercontent.com`,需确认是否真的必要;若仅版本检查用到,建议收紧到具体域名。
- 🟡 **凭据与密码**:`supabase-core.js` 的 `hashPassword` 采用"客户端 SHA-256 + 盐"方案,代码注释已自陈风险——**哈希在传输中等同于密码明文,截获即可登录**。这是已知风险,审查新认证逻辑时:
  - 不得把 anon key / 密码哈希写进"导出数据"或日志(`v3.1.0` 已修过一次,回归不得再犯)。
  - 盐值必须随机(`generateSalt` 用 `crypto.getRandomValues`,正确),且登录时必须复用注册时的盐(`getSavedSalt`),否则哈希不匹配。
- 🟡 **Anon Key 暴露**:Anon Key 属公开密钥,安全性依赖 RLS。`supabase-setup.sql` 的 RLS 策略是最后防线——任何新增表/字段必须配齐 RLS,且管理员函数必须用 `SECURITY DEFINER` + 服务端身份校验(参考 `reset_all_data` 的 `display_id = 1` 检查)。

### 3.3 Vue 3 组件与 Pinia

- 🟡 **响应式陷阱**:直接替换数组/对象引用导致视图不更新;用 `reactive` / `ref` 并走 `.value` 或 `storeToRefs`。新增 SFC 优先用 `<script setup>`。
- 🟡 **生命周期**:定时器 / 事件监听必须在 `onUnmounted` 清理,防止内存泄漏与重复回调(历史 bug:`visibilitychange` 监听器累积泄漏,已在 `v3.3.0` 修复)。
- 🟡 **Props 不可变**:子组件不得直接修改 prop;需要改时 emit 事件或用 `v-model`。
- 💭 **命名与可读性**:组合式函数以 `use` 开头(`useReducedMotion`、`useId`);事件名 `kebab-case`;组件 `PascalCase`。
- 💭 **大型组件拆分**:出现超过 ~300 行的 SFC 或承担 3 个以上职责时,考虑拆出子组件 / composable。

### 3.4 双架构兼容性与迁移规范(本项目头号审查点)

当前状态(来自 `CLAUDE.md` 与 `package.json`):

- **Vue 路径**:`src/components/*`、`src/pages/*`、`src/stores/*`(Pinia)、`src/effects/*`。由 Vite 构建进 `dist`。
- **Legacy 路径**:`renderer.js` / `calendar.js` / `todos.js` / `reminders.js` / `stats.js` / `settings.js` / `social.js` / `web-api.js` 等,作为全局脚本经 `vite.config.js` 的 `copyLegacyAssets` 复制进 `dist`,通过 `window.*` 全局变量与 Vue 桥接。
- **主进程**:`main.js` + `preload.js`(IPC)。

审查规则:

- 🔴 **新功能必须写进 Vue 路径**,不得为图省事往 legacy 全局脚本里再加逻辑。
- 🟡 **修改既有功能时双路径排查**:若改动涉及日历/待办/提醒/设置,需确认 legacy 模块与 Vue 实现是否都会受影响,避免"只改一边导致另一路径行为不一致"。
- 🟡 **桥接点收敛**:全局状态应经 `src/store.js`(Reactive)统一,新代码避免新增 `window.xxx` 全局。
- 💭 **迁移进度**:能在不改行为的前提下把一小块 legacy 逻辑迁到 Vue / composable 的 PR,即使功能不变也值得鼓励(降低未来审查面)。

### 3.5 Supabase / 云端同步

- 🔴 **同步合并必须按时间戳**,且本地/云端都用 `updatedAt` 比较,保留最新版本(`sync-write` 已实现,改动不得退回"整体覆盖")。
- 🔴 **删除用墓碑(tombstone)**:`deleted: true` 而非物理删除,保证多端同步能感知删除(回归过,见 `v3.1.6`)。
- 🟡 **sync 循环防护**:`sync-write` 必须走 `saveStoreSilent()`(不发 `data-changed`),否则会触发自动同步 → 又写 → 又通知的死循环。任何新同步写入路径都要复用该模式。
- 🟡 **RPC 调用错误处理**:所有 `window.sb.rpc(...)` 必须检查 `error` 与返回的 `.error` 字段(本项目多次因忽略 RPC 返回 error 导致静默失败)。
- 🟡 **会话恢复**:`ensureSession` 的"已登录用户过期不新建匿名身份"逻辑是数据不丢的关键,改动不得破坏 `linked_id` 链。

### 3.6 跨平台(桌面 + Android / Capacitor)

- 🟡 **同一逻辑两端行为一致**:通知、权限引导、存储路径在 Electron 与 Capacitor 下都需验证。例如精确闹钟权限(`SCHEDULE_EXACT_ALARM`)、通知 ID 必须在 Java `int` 范围内(曾因越界被系统静默丢弃)。
- 🟡 **权限声明**:`capacitor.config.json` 与 `android/app/src/main/AndroidManifest.xml` 的权限需与功能匹配,不申请无用权限。
- 💭 **通知渠道**:Android 8+ 需创建高优先级通知渠道;桌面端 `requireInteraction` 常驻,两端体验对齐。

### 3.7 数据持久化与序列化

- 🟡 **JSON 解析防御**:`JSON.parse` 必须 `try/catch`(磁盘损坏 / 半截文件不应让应用崩溃)。`initStore` 已做,新增读取路径沿用。
- 🟡 **数据膨胀**:墓碑 / 提醒去重标记(`store._todoReminded`)需有清理上限(当前 90 天 / 7 天),新增持久化字段要带清理策略。
- 💭 **版本元数据一致性**:`package.json` / `android/app/build.gradle`(`versionCode`+`versionName`)/ `version.json` 三处版本号必须在发版时同步(曾因 `build.gradle` 硬编码旧版本导致更新检查永不收敛,见 `v3.16.2`)。

---

## 四、审查流程

### 角色

- **作者(Author)**:提交前完成自检;回应每条意见;修复后重新请求审查。
- **审查者(Reviewer)**:至少 1 人;对 🔴 有一票否决权;🟡 需与作者达成共识。
- **多端功能**:涉及同步/通知/账号的改动,建议额外指定一名"跨平台视角"审查者。

### 提交前自检清单(作者)

- [ ] 本地 `npm run build` 通过,无报错
- [ ] 涉及的功能在**双架构路径**下都验证过(见 3.4)
- [ ] 所有外部输入(用户/云端/文件)都经过校验或转义
- [ ] 新增 IPC / 同步写入沿用原子写与 `saveStoreSilent` 模式
- [ ] 定时器 / 监听器有清理;无 `alert()` 调试弹窗残留
- [ ] 没有把凭据 / 密码哈希写进导出或日志
- [ ] 版本号(若发版)三处已对齐

### PR 规范

- 标题中文,前缀沿用既有约定:`feat:` / `fix:` / `refactor:` / `security:` / `perf:` / `docs:`。
- 描述必须说清:**改了什么、为什么、影响哪条路径(legacy/Vue/主进程/云端)**。
- 关联 Issue 或需求背景;纯重构需说明"行为不变"的证据。

### 审查轮次

1. 审查者通读 PR,按"正确性 → 安全 → 可维护 → 性能"顺序给意见,**一次性给全**,不滴水式分轮。
2. 作者逐条回应:修复 / 解释为何不改 / 提出异议。
3. 争议由双方用"第一性原理"对齐:回到用户与数据本质判断。仍不决则拉第三人。
4. 全部 🔴 关闭、🟡 达成一致后,审查者点 **Approved**。

### 合并后

- 发版类改动走 `CLAUDE.md` 的发布流程(版本号 + 构建 + Release)。
- 重大修复在 `README.md` 更新日志登记(延续现有格式)。

---

## 五、审查意见格式(示例)

```
🔴 **安全:sync-write 未校验云端数据结构**
main.js · sync-write (line ~381)

**为什么**:云端返回对象被直接 `mergedDays[date] = cloudDay` 赋值,
若结构异常或被篡改,可在本地 store 注入任意字段,后续落盘与渲染都受影响。

**建议**:复用 import-data 的白名单校验——只接受
{ status, note, tags[], color, updatedAt, deleted } 这些字段,
丢弃未知键:
  const allowed = ['status','note','tags','color','updatedAt','deleted'];
  const clean = {}; for (const k of allowed) if (k in cloudDay) clean[k] = cloudDay[k];
```

```
🟡 **可维护:该函数承担了 3 个职责**
reminders.js · scheduleReminders

**为什么**:定时计算、通知构造、点击回调全挤在一个函数里(>150 行),
将来加"免打扰时段"很容易改崩。

**建议**:拆出 `buildNotification(reminder)` 与 `persistConfirmation(date, id)`,
主函数只负责调度。不阻塞合并,建议后续 PR 跟进。
```

```
💭 **润色:变量名 `remindMinutes` 疑似拼写**
reminders.js · checkTodoReminders (line 691)

小建议:应为 `remindMinutes`(提醒分钟数),当前 `remindMinutes` 不影响运行,
但顺手改了可读性更好。
```

---

## 六、工具与自动化建议

- **ESLint + Vue 插件**:覆盖 `src/**`,至少开启 `no-undef` / `no-unused-vars` / `no-eval` / `security` 类规则。legacy 全局脚本因依赖 `window.*` 可能报 undef,可对该目录放宽或加 `/* global */` 注释,但**不要因此关闭整条规则**。
- **Prettier**:统一引号 / 缩进 / 分号,消除"风格争论"占用审查精力。
- **Secret 扫描**:CI 中加 `gitleaks` 或等价工具,防止 anon key / 私钥误提交(`.gitignore` 已排除 `.workbuddy/`,但凭据不应进仓库任何位置)。
- **CSP 校验**:若引入构建期注入 CSP,加一步断言"无 `unsafe-inline`/`unsafe-eval`"。
- **手动审查不可替代**:自动化只管风格与明显坏味道,**安全、正确性、双架构一致性必须人工审查**。

---

## 七、常见反模式速查(Reviewer  checklist)

- ❌ 用户输入直接进 `innerHTML` / `img.src` / `sql`(本项目用 Supabase RPC,勿手拼 SQL)。
- ❌ IPC handler 信任渲染进程传入参数,未校验即写入。
- ❌ 新增写入路径用裸 `writeFileSync` 覆盖(非原子)。
- ❌ 为省事往 legacy 全局脚本加新功能,而非写进 Vue。
- ❌ 定时器 / 监听器不清理,或 `alert()` 调试弹窗残留。
- ❌ 忽略 `rpc` 返回的 `error` / `.error`,静默失败。
- ❌ 同步写入触发 `data-changed`(造成死循环)。
- ❌ 密码哈希 / anon key 进导出文件或 `console.log`。
- ❌ 版本号三处(`package.json` / `build.gradle` / `version.json`)不同步。
- ✅ 正面模式:`escapeHtml`/`escapeAttr`/`sanitizeUrl` 已就位且被使用;`import-data` 的字段白名单校验;`saveStoreSilent` 防循环;`ensureSession` 的会话恢复链。

---

> **附:本规范与代码的映射**(便于新人上手)
> - 安全转义范本:`src/utils.js`(`escapeHtml` / `escapeAttr` / `sanitizeUrl`)
> - 数据校验范本:`main.js` `import-data`
> - 同步合并范本:`main.js` `sync-write`(注意其缺校验,见 3.1)
> - 认证与已知风险:`src/supabase-core.js`(`hashPassword` 注释自陈风险)
> - 安全基线:`main.js` CSP + `contextIsolation` + `preload.js` `contextBridge`
> - 云端防线:`supabase-setup.sql`(RLS + `SECURITY DEFINER` 管理员函数)
