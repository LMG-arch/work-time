# Phase 5 收尾增强（v3.16.1）交付概览

> 承接 Phase 5（数据与信息，v3.16.0），补齐两项可读性与「招牌瞬间」闭环增强。
> 延续既有原则：颜色全读取 CSS 变量 / `color-mix` 跟随主题；动画受 `prefers-reduced-motion` 守卫；花瓣庆祝沿用 Phase 4 的 premium 守卫。

## 交付清单

### 方向 1 — 成长苗里程碑庆祝（数据可视化 → 招牌瞬间闭环）
- **文件**：`src/pages/ClockinPage.vue`（新增 `watch(streak)` 逻辑 + 模板 `milestone-flash` 类）、`src/styles.css`（`.growth-card.milestone-flash` 脉冲）
- **逻辑**：用 `watch(streak)` 监听连续打卡天数变化，跨过 **7 / 30 / 100** 时调用 `window.__celebrate(m)`（Phase 4 花瓣庆祝，premium 守卫在 `signature.js` 内部）
- **双反馈**：同时给成长苗卡片加 `milestone-flash` 脉冲（1.4s，accent 光环扩散），即使 premium 关闭也可见，形成「连续打卡 → 庆祝」闭环
- **防误触**：`onMounted` 加载记录后把 `prevSeen` 设为当前值作为基线，加载历史连胜时只记录、不庆祝；仅在本会话内增长跨过里程碑才触发

### 方向 2a — 忙闲热力图例（降低色阶理解成本）
- **文件**：`src/pages/CalendarView.vue`（网格下方新增 `.busy-legend`）、`src/styles.css`（`.busy-legend*` 块）
- **视觉**：「忙闲」标签 + 4 级同款 `color-mix(var(--trip)…)` 色块 + 「色越深越忙」说明，与日格 `.busy-heat` 叠色同源，主题感知

### 方向 2b — 面积图 hover 提示（信息可读）
- **文件**：`src/components/WeeklyArea.vue`（新增 `onMove` / `onLeave` / tooltip + marker）、`src/styles.css` 内 scoped 样式
- **交互**：鼠标在 `.weekly-area` 移动时定位最近数据点（按 x 距离），浮动 tooltip 显示「X日 · 忙闲 N」并高亮曲线标记点
- **细节**：容器 `position: relative`，tooltip 用 `transform: translate(-50%,-130%)` 浮于点上方；纯定位无动画，`prefers-reduced-motion` 不影响；`pointer-events: none` 不挡曲线

## 改动文件总览
| 文件 | 类型 | 说明 |
|------|------|------|
| `src/pages/ClockinPage.vue` | 编辑 | 里程碑 watch + 卡片脉冲类 |
| `src/pages/CalendarView.vue` | 编辑 | 忙闲色阶图例 |
| `src/components/WeeklyArea.vue` | 编辑 | hover 提示 + 标记点 |
| `src/styles.css` | 编辑 | `milestone-flash` + `busy-legend` 块 |
| `package.json` | 编辑 | 3.16.0 → 3.16.1 |
| `version.json` | 编辑 | 3.16.1 / versionCode 35 |
| `README.md` / `docs/UI美化落地计划.md` | 编辑 | 更新日志 + 进度 |

## 验证步骤
1. `npm run build` 通过（✓ 已验证，exit 0；`@vueuse/core` 注释告警为无害依赖噪声）
2. `npm run dev` 后：
   - 打卡页连续打卡跨过 7/30/100 天 → 花瓣飘落 + 卡片脉冲（premium 关时仅卡片脉冲）
   - 日历底部出现「色越深越忙」色阶图例，与日格热力同色
   - 统计页面积图悬停 → 浮动提示「X日 · 忙闲 N」+ 标记点
   - 切换主题：色阶 / 成长苗 / 提示框均跟随变化
   - 系统开启「减少动态效果」：花瓣庆祝与脉冲降级，tooltip 仍可用（纯定位）

## 状态
v3.16.1 已实现并构建通过，本地提交待执行（GitHub 推送受沙箱网络限制，需用户本地 `git push origin main`）。
