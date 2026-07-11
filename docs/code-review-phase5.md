# Phase 5 代码审查 — 功能衔接与 Bug 检查

**审查范围**：`d44cb68` (v3.15.3) → `568dfef` (v3.16.1)
**审查方式**：`@skill:requesting-code-review` → superpowers:code-reviewer 子代理静态审查 + 本地 `npm run build` 验证
**日期**：2026-07-11

---

## 构建状态
`npm run build` → **exit 0 ✓**

`@vueuse/core` 的 `[INVALID_ANNOTATION] #__PURE__` 告警来自第三方依赖，Phase 5 文件均未引入 `@vueuse`，属既有噪声，非回归。

---

## 核心结论
**无 Critical / Important 问题，功能衔接正确，可合并（Ready to merge: Yes）。**

用户最担心的两个衔接点经核实均正确实现：

1. **忙闲算法未分叉** — `CalendarView.busyScore` 与 `StatsPage.busyScoreForDate` 权重逐字一致（备注 +1 / 标签 ×0.5 / 状态 +0.5 / 待办计数 / 已确认打卡 +1），读取同一响应式源。日历热力与统计面积图**完全一致**。
2. **streak→庆祝 无竞态/无误触** — `streak` 响应式依赖 `reminderStore.reminderRecords`，`onMounted` 加载后重算；`watch(streak)` 非立即、基线 `prevSeen=null` 守卫确保历史连胜不触发花瓣；今日未打卡从昨日计数的逻辑与 `GrowthPlant` 阶段阈值（7→灌木 / 30→树 / 100→繁花）协调。

---

## 审查亮点（Strengths）
- 忙闲双重实现权重一致，日历热力 ↔ 统计面积图数据同源。
- 三个页面异步加载 store 后 computed 重算，无空数据竞态。
- 15 套主题 + cosmic 均定义 `--trip` / `--accent`，忙闲热力在全部主题可见。
- `window.__celebrate` 在 `App.vue` 挂载前由 `signature.js` 安装，且用 `?.` 防御调用，缺失处理器绝不抛错。

---

## 问题清单

### Critical（必须修）
无。

### Important（应修）
无。两个最高风险的衔接点（重复忙闲算法、streak 庆祝竞态）均实现正确。

### Minor（可后续优化，非阻塞）
| 编号 | 位置 | 问题 | 影响 | 建议 |
|------|------|------|------|------|
| **M1** | `WeeklyArea.vue:48-54` / `StatsPage.vue:164` | 面积图「按周」网格线按 `w/weeks` 等距分割，未对齐真实周一日期边界 | 仅视觉，caption「按周」略有误导 | 按每日星期回落计算周一 x 坐标 |
| **M2** | `ClockinPage.vue:43-51` | 单次 streak 更新若跨越多个里程碑，只庆祝最低档 | 实际每日 +1 不可达，理论风险 | 遍历所有跨过的里程碑 |
| **M3** | `styles.css:2541-2548` vs `2522-2539` | 图例透明度 0.55–0.92，远高于日格 0.14–0.33 | 弱化「色越深越忙」映射可信度 | 图例透明度对齐日格区间 |
| **M4** | `WeeklyArea.vue:85` | SVG 渐变 `id="areaFill"` 硬编码 | 多实例（如双 StatsPage）时 `url(#areaFill)` 引用歧义 | 用 `useId()` 生成唯一后缀 |

---

## 建议（Recommendations）
1. **抽离忙闲算法为单一工具**（如 `src/utils/busyScore.js`），当前逐字一致但重复即未来分叉风险——单一真相源彻底消除隐患。
2. 修正 M1 周网格数学，使「按周」标签真实。
3. 对齐 M3 图例透明度与日格。
4. `WeeklyArea` 渐变 id 用 `useId()`（M4）做防御。

---

## 评估（Assessment）
**Ready to merge: Yes** — 未发现功能、衔接或逻辑缺陷。Phase 5 三项特性彼此及与既有 store/数据层正确衔接：忙闲算法跨日历/统计一致、streak→庆祝接线竞态安全且有基线守卫、主题变量覆盖全部 15 套、构建通过。仅余 M1–M4 非阻塞性小项，可后续跟进修。

---

## 修复状态（2026-07-11 已修）
| 编号 | 修复内容 | 文件 |
|------|----------|------|
| **M1** | 面积图周网格线改为对齐真实周一边界：`StatsPage` 计算 `weekBoundaries`（每月 1 日 + 各周一的「日」序号），`WeeklyArea` 据其映射 x，不再等距切分 | `StatsPage.vue` / `WeeklyArea.vue` |
| **M2** | 连跨多里程碑时仅庆祝最高一档（如 6→31 庆祝 30 天而非 7 天），避免重复撒花 | `ClockinPage.vue` |
| **M3** | 忙闲图例四档背景渐变 + 透明度与日格 `.busy-heat` 完全一致（.14/.20/.26/.33），图例即日格等比微缩 | `styles.css` |
| **M4** | 面积图 SVG 渐变 id 用 `useId()` 生成唯一值（清理非法字符），替换硬编码 `areaFill`，杜绝多实例冲突 | `WeeklyArea.vue` |

修复后 `npm run build` 通过（exit 0）。因均为非功能性微调，未升版本号、未重打 APK。
