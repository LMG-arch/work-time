# Phase 5 — 数据与信息（v3.16.0）交付概览

> 上班日历 UI 美化最后一阶段：把「数据」变成可感知的画面，信息密度升级。
> 三项均为数据可视化，常驻可见（不依赖 premium 开关），颜色全部读取 CSS 变量 / `color-mix`，跟随主题；动画均受 `prefers-reduced-motion` 守卫。

## 交付清单

### #9 忙闲热力月历（日历网格叠色）
- **文件**：`src/pages/CalendarView.vue`（新增 `busyScore` / `busyLevel`）、`src/styles.css`（Phase 5 块）
- **逻辑**：每日忙闲度 = 待办数 + 备注(+1) + 标签(×0.5) + 状态(+0.5) + 打卡(+1)，映射为 `data-busy` 强度 0–4
- **视觉**：日格内 `.busy-heat` 暖色（`color-mix(var(--trip)…)`）渐变叠层，opacity 0.14→0.33 分级；闲置日（0）无叠色，保持清爽
- **细节**：`.day-cell { isolation: isolate }` 让叠层 `z-index:-1` 静默垫在内容之下，不干扰既有角标

### #10 统计环形月览 + 每周面积图
- **文件**：`src/components/StatsRing.vue`（新）、`src/components/WeeklyArea.vue`（新）、`src/pages/StatsPage.vue`（「本月概览」区块）
- **StatsRing**：SVG 环形图，按状态（上班/休息/出差/请假/年假/病假/事假）占比分段着色，中心显示「已记录天」数，下方图例同步；挂载时环形缩放淡入
- **WeeklyArea**：当月每日忙闲密度的平滑面积曲线（`Q` 二次贝塞尔平滑 + 渐变填充），按周划分虚线网格；描边用 `pathLength=1` 做绘制动画
- **数据**：`StatsPage` 挂载时补全加载 `calendarStore/todoStore/reminderStore`，`busySeries` 与日历热力同源

### #11 连续打卡成长苗
- **文件**：`src/components/GrowthPlant.vue`（新）、`src/pages/ClockinPage.vue`（连续打卡计算 + 挂载）
- **逻辑**：从今天往回数连续打卡天数（今天未打卡时从昨天起算，避免未打卡前视觉断裂）
- **形态里程碑**：0 种子 → 1–2 嫩芽 → 3–6 小苗 → 7–20 灌木 → 21–49 树 → 50+ 满树繁花；颜色用 `color-mix` 偏绿并随主题微调
- **动效**：生长缩放 + 轻摆（6s 缓动），`prefers-reduced-motion` 时静止

## 改动文件总览
| 文件 | 类型 | 说明 |
|------|------|------|
| `src/components/StatsRing.vue` | 新增 | 状态占比环形图 |
| `src/components/WeeklyArea.vue` | 新增 | 忙闲密度面积图 |
| `src/components/GrowthPlant.vue` | 新增 | 连续打卡成长苗 |
| `src/pages/CalendarView.vue` | 编辑 | 忙闲热力计算 + `data-busy` + 叠层 |
| `src/pages/StatsPage.vue` | 编辑 | 本月概览区块 + 数据加载 |
| `src/pages/ClockinPage.vue` | 编辑 | 连续打卡计算 + 成长苗 |
| `src/styles.css` | 编辑 | Phase 5 样式块 |
| `package.json` / `version.json` | 编辑 | 3.16.0 / versionCode 34 |
| `README.md` / `docs/UI美化落地计划.md` | 编辑 | 更新日志 + 进度 |

## 验证步骤
1. `npm run build` 通过（无新增错误）
2. `npm run dev` 后：
   - 日历有数据的日格呈现暖色热力，越忙越深；空日无叠色
   - 统计页出现「本月概览」：环形 + 图例 + 面积曲线
   - 打卡页顶部出现成长苗，连续打卡天数越高形态越繁茂
   - 切换主题：三者颜色跟随变化
   - 系统开启「减少动态效果」：面积图/环形/成长苗动画降级为静态

## 状态
Phase 1–5 全部交付，美化主线收官。建议用户在 dev 模式实际感受热力与成长苗后再决定是否收尾/发版。
