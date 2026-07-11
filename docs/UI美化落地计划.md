# 上班日历 · UI 美化落地计划

> 范围：用户已确认的 18 项「高级感 + 生命感」美化功能
> 基调：默认「星海绽放」宇宙感，克制、有惊喜、绝不泛 AI 俗套
> 目标版本：v3.14.0 → v3.15.x 分批交付
> 制定日期：2026-06-29

---

## 一、总原则（不可妥协的底线）

1. **性能预算**：所有动效稳定 60fps；任何 canvas 粒子系统必须满足 `devicePixelRatio` 上限、离屏降级、空闲暂停。
2. **无障碍守卫**：全局尊重 `prefers-reduced-motion: reduce` —— 关闭飘落/拖尾/视差/呼吸，仅保留瞬时状态切换。
3. **主题感知**：每个效果必须读取当前主题色（`color-mix` 派生或 CSS 变量），不能写死颜色。
4. **单一 RAF 循环**：所有 canvas 类效果（拖尾、粒子、视差）共用一个 `requestAnimationFrame` 调度器，避免多循环抢占主线程。
5. **效果可开关**：在 `appStore` 增加 `premiumEffects` 配置（总开关 + 强度档位），设置页可关。
6. **优雅降级**：不支持 View Transitions / canvas 的环境自动回退到 CSS 过渡。

---

## 二、架构基础（Phase 0，先做，所有功能依赖）

| 模块 | 内容 | 说明 |
|------|------|------|
| 效果调度器 `useEffectLoop` | 单一 RAF + 订阅者模式 | 各 canvas 效果注册 tick 回调，统一暂停/恢复 |
| 全局效果配置 `appStore.premium` | `{ enabled, intensity, reducedMotion }` | 设置页读取，启动时初始化 |
| `reduced-motion` 守卫 composable | `usePrefersReducedMotion()` | 所有动效前先判断 |
| 主题色读取 util | `themeColor(token)` → 从 CSS 变量解析 | 保证效果跟随主题 |
| 固定效果层 `<EffectLayer>` | 一个 `position:fixed` 的 canvas/SVG 容器 | 花瓣、拖尾、粒子都画在这里，不污染业务 DOM |

> Phase 0 不交付可见功能，但它是后面所有东西的地基，必须先合入。

---

## 三、分阶段实施

### Phase 1 — 质感与排版（低风险、高回报、纯 CSS/SVG，优先做）

| # | 功能 | 技术实现 | 触发/位置 | 性能守卫 |
|---|------|----------|-----------|----------|
| 12 | 标题性格中文字体 + 数字对齐 | 引入 1 套免费中文标题字体（如「得意黑」/「思源宋体」），`font-feature-settings: "tnum"` 数字等宽对齐 | 月份标题、统计数字 | 字体 `font-display: swap`，子集化 |
| 13 | 玻璃面极淡颗粒 | `feTurbulence` SVG 噪声叠加为 `::before`，`opacity < 0.04`，`mix-blend-mode: overlay` | 所有玻璃卡片 | 静态纹理不重绘 |
| 14 | 每日诗意 / 节气文案 | 内置文案 JSON（节气+随机诗意），每日首屏展示于日历顶部 | 日历视图顶部条 | 纯文本，无性能开销 |
| 16 | 按钮墨水波纹 | pointerdown 生成 ripple 元素，`transform: scale` + `opacity` 动画 | 所有 `flux:button` / 主按钮 | 动画结束自动移除节点 |
| 17 | 列表错落入场 | `IntersectionObserver` + `transition-delay` 递增（stagger） | 待办/统计/好友圈列表 | 仅首屏可视区触发 |

### Phase 2 — 微交互（中等，增强手感）

| # | 功能 | 技术实现 | 触发/位置 | 性能守卫 |
|---|------|----------|-----------|----------|
| 15 | 磁吸倾斜卡片 | `pointermove` 计算倾斜角度 + 轻微位移，`transform: perspective rotateX/Y`，离开复位 | 日历日格、统计卡、设置卡 | `pointermove` throttle 到 16ms，reduced-motion 关闭 |
| 18 | 空状态品牌插画 | 手绘风 SVG 插画组件（星海/苗/日历拟人），随主题换色 | 待办空、好友圈空、统计空 | 静态 SVG，无动画开销（可加微动） |

### Phase 3 — 氛围与生命感（canvas / 性能敏感）

| # | 功能 | 技术实现 | 触发/位置 | 性能守卫 |
|---|------|----------|-----------|----------|
| 5 | 背景呼吸 | glow 层 `opacity`/`scale` 缓慢正弦呼吸（纯 CSS keyframes） | 全局背景辉光 | CSS 合成层，不触发重排 |
| 6 | 光标辉光拖尾 | canvas 拖尾，记录近期指针轨迹点，渐隐绘制 | `<EffectLayer>` | 点上限 20，离屏暂停 |
| 8 | 鼠标视差 | 指针位置 → 多层背景以不同系数 `translate` | 背景层/标题层 | 与拖尾同 RAF，系数 < 0.05 |
| 7 | 节气天气粒子 | canvas 粒子系统：依节气/天气切换（雪/雨/星尘/花瓣风） | `<EffectLayer>` | 粒子数随屏宽自适应，DPR≤2 |

### Phase 4 — 招牌瞬间（事件驱动，记忆点）

| # | 功能 | 触发时机 | 技术实现 |
|---|------|----------|----------|
| 4 | 主题切换绽放过场 | 切换主题时 | 在现有 View Transition 之外，中心绽放一圈辉光环（`color-mix` 主题色） |
| 3 | 启动闪屏 | App 启动 / 每次从托盘唤醒 | 全屏 LOGO + 星海汇聚动画（SVG `stroke-dashoffset` + 粒子），≤1.2s 可跳过 |
| 2 | 成功波纹 | 打卡成功 / 保存成功 / 任务完成 | 从点击点扩散的成功色涟漪（复用墨水波纹升级版） |
| 1 | 花瓣飘落庆祝 | 连续打卡里程碑（7/30/100 天）/ 节日 | `<EffectLayer>` 花瓣粒子从顶部飘落，密度按里程碑递增 |

### Phase 5 — 数据与信息（新可视化，独立组件）

| # | 功能 | 技术实现 | 说明 |
|---|------|----------|------|
| 9 | 忙闲热力月历 | 在月历格内叠加忙闲色阶（基于当日事件密度） | 复用现有日历网格，新增 `data-busy` 强度 |
| 10 | 统计环形月览 + 每周面积图 | SVG `conic-gradient` 环形 + SVG `path` 面积图 | 新增 `StatsRing.vue` / `WeeklyArea.vue` |
| 11 | 连续打卡成长苗 | SVG 幼苗 → 大树随连续天数生长 | `GrowthPlant.vue`，里程碑换形态 |

---

## 四、实施顺序与里程碑

```
Phase 0  架构地基  ──► 合入主分支（无可见变化，但开关/调度器就位）
   │
Phase 1  质感排版  ──► v3.15.0  可见提升最大、风险最低
   │
Phase 2  微交互    ──► v3.15.1  手感质变
   │
Phase 3  氛围生命  ──► v3.15.2  宇宙感拉满（重点压测性能）
   │
Phase 4  招牌瞬间  ──► v3.15.3  记忆点成型
   │
Phase 5  数据信息  ──► v3.16.0  信息密度升级
```

每阶段结束即提交 + 推 GitHub + 更新 README 更新日志（沿用当前版本管理流程）。

---

## 五、风险与对策

| 风险 | 对策 |
|------|------|
| canvas 多效果叠加掉帧 | 单一 RAF 调度 + 离屏暂停 + 强度档位可降级 |
| 主题切换闪烁 | 所有效果读取 CSS 变量，过渡用 `color-mix` 平滑 |
| reduced-motion 用户不适 | 全局守卫，关闭所有持续动效，仅留瞬时态 |
| 字体加载 FOIT | `font-display: swap` + 子集化中文标题字体 |
| 低配机性能 | `intensity` 档位：低配自动降粒子数/关视差 |

---

## 六、下一步

1. 确认本计划分阶段顺序与版本号节奏（是否有要调整优先级的功能）。
2. 锁定 Phase 0 架构（效果调度器 + 配置 + 守卫）先合入。
3. 从 Phase 1 起逐阶段实现，每阶段独立提交。

---

## 七、进度追踪

- **2026-06-29**：✅ Phase 0 架构地基已完成并通过 `vite build`。新增 `src/effects/`（EffectLoop 单一 RAF 调度器 / registry 效果注册表 / useReducedMotion 守卫 / themeColor 主题色读取 / EffectLayer.vue 全局画布层），`appStore.premium` 配置接入，`App.vue` 挂载全局效果层。
- **2026-06-29**：✅ Phase 1 质感与排版已完成并 `npm run build` 通过。交付 5 项：① 标题衬线字体（系统栈 `--font-serif`）+ 数字等宽 `tnum`；② 玻璃面 feTurbulence 极淡颗粒（6 类卡片 `::before`）；③ 每日诗意/节气文案挂日历顶栏 `.daily-poetic`；④ 按钮墨水波纹 `effects/ripple.js`（全局委托，premium/reduced-motion 守卫）；⑤ 列表错落入场 `revealUp` + `--i` stagger（独立 `translate` 属性，避免与 hover 冲突）。下一步进入 Phase 2（微交互：磁吸倾斜 / 空状态插画）。
