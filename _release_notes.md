## v3.17.31 — 圈画三项修复（选择自动收起 + 占比移除 + 主题一致性）

### 1. 日历面板：完成选择后自动收起（用户圈画 1）
- 点击日期格展开内联面板后，在详情区完成任一选择（出勤状态/标记颜色/添加标签/保存备注）→ 面板自动收起、折叠区折回
- 实现：DetailPanel 新增 `marked` 事件（onMarked 统一出口：updateData + 折叠 statusOpen/noteOpen + emit）；CalendarView 监听 `@marked="expandDate = null"`
- 数据先落库后收起（saveDayData 完成才触发），无丢失风险

### 2. 消费结构：移除占比 + 饼图暗色适配（用户圈画 2）
- 图例仅保留分类色点 + 名称，删除百分比 `<b>` 元素
- renderMoneyPie 中心圆 fill=white / 轨道 #eee7df / 文字 #9a9288/#3d3830 硬编码 → 从 .life-app 读取 --life-card/--tint-6/--muted/--ink 令牌（注意令牌定义在 .life-app 作用域而非 :root）
- 暗色主题下饼图中心不再是白底圆，与面板融合

### 3. 主题一致性（用户圈画 3：打卡页 cosmic 下颜色不跟随）
- GrowthPlant.vue：叶/冠 #2faa4f、干盆 #6d4c41/#8d6e63、花 #ff80ab 固定色 → 全部改为 color-mix 锚定 var(--accent)；cosmic 紫蓝系、green 绿色系、default 蓝灰系
- life.css：metric.income #e0ece3 → var(--tint-2)、metric.expense #f1ddd6 → var(--tint-4)、compare-card/target-progress #f0e9df → var(--tint-9)、record-row 边框 #eee7df → var(--line)
- styles.css：water-progress-fill 固定蓝渐变 → var(--accent) 混合；reminder-card.confirmed / history-record.confirmed 的 rgba(76,175,80,*) → color-mix var(--work)

### 验证（agent-browser cosmic + green + default）
- 状态选「上班」→ 落库 status:work + 面板收起 + 折叠折回 ✓；颜色/快捷标签同 ✓
- 饼图 cosmic：hole #211d2e / track #262132 / 文字随主题 ✓；图例无百分比 ✓
- 成长苗 cosmic 紫蓝 / green 绿色 / default 蓝灰 ✓；浅色主题下植物仍为绿色系可读 ✓

## v3.17.30 — 详情面板「出勤状态/备注」默认折叠

### 需求
- 用户反馈详情面板下半部分信息密度过高：出勤状态按钮组与备注编辑区始终完整展开
- 要求：默认收起、仅显示标题+摘要，点击展开/再点收起；上半部分（日期头/颜色/标签/待办）保持原样

### 实现
- DetailPanel.vue：新增 `statusOpen`/`noteOpen`（默认 false=收起），`statusSummary`/`noteSummary` 计算属性
  - 出勤状态 → `.detail-fold`（标题「出勤状态」+ 摘要「未标记/上班/休息…」+ chevron），内嵌 StatusButtons
  - 备注 → 同构 `.detail-fold`（标题「备注」+ 摘要「空/内容截断」），内嵌 NoteEditor
  - 颜色/标签区不包裹，保持原布局
- styles.css：`.detail-fold` 样式（边框圆角卡、head flex 行、摘要右对齐省略、按状态着色 7 态、chevron 旋转 90°）
- CalendarView.vue：`onDetailClick` 排除 `.detail-fold`，fold 头部点击不触发日历展开面板收起

### 验证（agent-browser @5214）
- 初始两折均收起（body display:none，摘要「未标记」「空」）
- 展开出勤状态显示 7 个按钮；点「上班」→ 摘要变「上班」且落库 `allData['2026-09-10']`
- 备注折叠展开 textarea+保存按钮正常；待办/标签/颜色/宫格区不受影响；无布局错位

## v3.17.29 — 六项交互修复（登录持久化 + 日历收起 + 周历切换 + 表单折叠）

### 1. 账号登录持久化（重启不丢）
- 凭证本就落盘持久化，根因是设置页常驻挂载时 onMounted 早于 `initSocial()` 完成会话恢复
- 修复：会话恢复/自动登录完成后补刷设置页账号区（`__refreshSettingsData`），重启即保持在线
- 相关文件：src/social/social.js

### 2. 上班日历展开/收起切换
- 点击日期格展开内联面板（标签+待办），之前点击底部详情区（待办/标签）不会收起
- 修复：点击底部详情区、或面板自身即可收起；再点日期格同样收起
- 待办勾选/编辑/删除、加标签、颜色点等操作控件点击不受影响（显式排除）
- 相关文件：src/pages/CalendarView.vue

### 3. 日程周历支持切换周次
- 一周日历原固定显示当前 7 天，无导航
- 新增：上一周 / 本周 / 下一周 按钮；标题随周次显示（如「2026 年 9 月」）
- 周内日期可点击：选中后智能清单仅显示该日日程，再点取消
- 相关文件：src/life/markup.html、src/life/lifeEngine.js、src/life/life.css

### 4/5/6. 卡片式输入表单统一折叠
- 记账、日程、体重、待买、书影音 5 个输入卡片默认一直展开
- 统一支持点击卡片头部展开/收起（chevron 指示，键盘可达）
- 折叠状态持久化（state.settings.collapsedPanels），重启后保持
- 相关文件：src/life/lifeEngine.js、src/life/life.css、src/life/markup.html

## v3.17.28 — 审美审查全量修复（taste-skill 驱动）

### P0 主题令牌断裂（暗色主题日历区不可读）
- life.css 外壳硬编码色全部语义令牌化（40+ 锚点：--sb-bg / --nav-* / --tint-1~11 / --hint-1~5 / --alert-*）
- styles.css 为 `body[data-theme="dark"|"cosmic"] .life-app` 提供深色暖系重映射
- 实测（cosmic）：月标题对比度 **1.05:1 → 16.2:1**；辅助文字 --text3 提亮后玻璃卡上 **5.06:1（WCAG AA）**
- 暖色主题令牌保持默认值，零影响

### P1 基础修复
- 输入框文字可选：body 级 `user-select:none` 不再传染 input/textarea/select
- Inter 字体声明移除（从未加载，恒回退雅黑）
- 圆角体系收敛：15 种散值 → 8/10/12/16/22/999 档
- life.css 两个重复的 860px 断点块合并
- 组件层硬编码色（268 处）全部令牌化，暗色下记账日分组底色/分隔线/提示文字随主题适配

### P2 微调
- eyebrow 标签 10px → 11px（可读下限）
- 全局 `:focus-visible` 键盘焦点环
- 主按钮三形态归一为实心强调色
- hero 大数字 64px → clamp(44px, 6vw, 56px)