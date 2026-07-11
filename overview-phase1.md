# 全量迁移 Vue — Phase 1 完成

## 本阶段做了什么
把 4 个「基础设施」模块从经典 `<script>` 全局脚本转换为纯 ES 模块（被 Vue `import`），并加了一层过渡垫片，让还没迁移的遗留经典脚本继续按原名工作。

### 改动清单
| 文件 | 改动 |
|------|------|
| `src/utils.js` | 所有工具函数改为 `export function`；删除 `window.lunarToSolar =` 这一全局挂载行 |
| `src/holidays.js` | `HOLIDAYS` / `FIXED_HOLIDAYS` 改为 `export const`；删除 `module.exports` 守卫 |
| `src/lunar.js` | `const Lunar = IIFE` → `export const Lunar = IIFE` |
| `src/storage.js` | IIFE 改为模块级代码，导出 `export const storage`；保留 `window.__storage` 自挂 + 加载即 `initStorage()`（行为完全不变） |
| `src/shims.js`（新增） | 过渡垫片：把四模块的符号重新挂到 `window.*`，供遗留经典脚本按原名调用 |
| `src/vue-main.js` | 最前 `import './shims.js'`，保证 DOMContentLoaded 前 `window.*` 就绪 |
| `src/pages/CalendarView.vue` | `window.Lunar` → `import { Lunar }`（**顺带修好了原先 `window.Lunar` 恒为 `undefined`、Vue 农历显示一直是坏的 bug**） |
| `src/components/TodoModal.vue`、`src/components/TodoItem.vue` | 同上，改用 `import { Lunar }` |
| `src/pages/SettingsPage.vue` | `isCapacitorPlatform` / `sanitizeUrl` 改为 `import`（`showToast` 保留 `window` 捕获，因为 ripple 成功涟漪特效依赖 monkey-patch `window.showToast`） |
| `src/index.html` | 删除 `storage.js` / `utils.js` / `holidays.js` / `lunar.js` 的 4 个经典 `<script>` 标签 |
| `vite.config.js` | `copyLegacyAssets.FILES` 移除上述 4 个文件名 |

## 关键设计：过渡垫片（shims）
经典脚本在 HTML 解析期**同步**执行；Vue 的 ES 模块是 **deferred**（解析后、`DOMContentLoaded` 前执行）。因此：
- `shims.js` 在 `vue-main.js` 最前 import，保证 `window.*` 在所有遗留脚本的运行时调用之前就位。
- 遗留脚本（calendar.js / social.js / web-api.js / renderer.js 等）只会在**函数体内（运行时）**引用这些全局，不会在模块就绪前触发——本次已核对无顶层裸调用。

## 验证结果
- `npm run build` → **exit 0**（113 模块转译）。
- `dist/index.html` 已无 4 个经典 `<script>`，模块入口在 `<head>`。
- `dist/` 根目录**无**这 4 个文件的残留副本（已打包进 bundle，不会双重加载）。
- bundle 内确认含 `window.Lunar` / `window.__storage` / `window.showToast` / `window.HOLIDAYS` 垫片。

## 未做（留给后续阶段）
- **P2 Supabase 层**：`supabase-core.js` / `supabase-social.js` / `supabase-sync.js` 仍是经典脚本，且按用户硬约束**客户端零更改**（保留 `lib/supabase.min.js` + vite `serveLibRaw`）。
- **P3–P11**：web-api 桥、Calendar / Todos / Reminders（通知高风险）/ Stats / Settings+Updater / Social / Renderer 胶水层 / 构建配置清理。
- 遗留经典脚本目前仍靠 `shims.js` 的 `window.*` 运行，待各自阶段迁移完成后，在 **P11** 统一撤掉垫片与所有 `window.*` 引用。

## 下一步
进入 P2（Supabase 层），同样转 ESM + 由 Vue `import`，并把依赖它们的遗留调用点改走模块导入。每阶段保持「独立可编译 + 单独 git commit」，应用始终可运行。
