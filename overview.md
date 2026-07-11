# Phase 4 — 招牌瞬间（记忆点成型）交付概览

> 上班日历 · 目标版本 v3.15.3（versionCode 33）· 2026-06-29
> 全部复用 Phase 0 单一 RAF 效果引擎，受 `premium` 总开关与 `prefers-reduced-motion` 守卫

## 交付的 4 个招牌瞬间

| # | 瞬间 | 触发时机 | 实现位置 | 技术要点 |
|---|------|----------|----------|----------|
| 4 | **主题切换绽放** | 切换主题时 | `src/effects/signature.js` | `MutationObserver` 监听 `body[data-theme]` → 屏幕中心绽放主题色辉光环（additive `lighter` + 缓出扩散），复用 Phase 0 全局画布 |
| 3 | **启动闪屏** | App 启动 / 从托盘唤醒 | `src/components/SplashScreen.vue` | SVG LOGO `stroke-dashoffset` 描边绘制 + 26 星点从外围收束中心；≤1.2s 自动隐藏、点击/Esc 可跳过 |
| 2 | **成功涟漪** | 打卡/保存/任务完成 | `src/effects/ripple.js` | 拦截全局 `showToast` 一处接入，从点击点扩散主题感知绿色涟漪（`color-mix(--accent,#2ecc71)`），亦支持 `calendar:success` 事件 |
| 1 | **花瓣庆祝** | 连续打卡里程碑（7/30/100 天） | `src/effects/signature.js` | 花瓣从顶部飘落，密度随里程碑递增；`ReminderList` 打卡成功派发 `calendar:celebrate {days}` 事件驱动 |

## 改动文件清单

- **新增** `src/effects/signature.js` —— 主题绽放 + 花瓣庆祝引擎（注册进 `effectRegistry`）
- **新增** `src/components/SplashScreen.vue` —— 启动闪屏组件
- **升级** `src/effects/ripple.js` —— 新增成功涟漪 + `showToast` 拦截 + `calendar:success` 监听
- **编辑** `src/components/App.vue` —— `installSignature()` + 挂载 `<SplashScreen>` + 托盘唤醒重播 + 卸载清理
- **编辑** `src/components/ReminderList.vue` —— 打卡成功派发 `calendar:celebrate`
- **编辑** `src/styles.css` —— `.ripple.success` / `.splash*` 样式 + reduced-motion 降级
- **版本** `package.json`(3.15.3) / `version.json`(v3.15.3, code 33)
- **文档** `README.md` 更新日志 + `docs/UI美化落地计划.md` 进度

## 性能与无障碍守卫

- 主题绽放 / 花瓣庆祝走 `EffectLayer` 全局画布，**仅复用 Phase 0 单一 RAF**，无新增循环
- `premium.enabled === false` → 纯 CSS 氛围归位（`fx-off`），canvas 类效果停绘，闪屏降级极简
- `prefers-reduced-motion: reduce` → 关闭绽放/花瓣/成功涟漪动画、闪屏不播放星海与绘制（仅极简 LOGO，360ms）
- 成功涟漪挂 `document.body`（`position:fixed`），不被按钮 `overflow:hidden` 裁剪

## 如何验证

1. `npm run dev` 启动 → 首次进入见启动闪屏（1.2s，点击可跳过）
2. 设置页切换主题 → 屏幕中心绽放主题色辉光环
3. 待办/提醒页点「确认打卡」→ 点击点扩散绿色成功涟漪 + 顶部飘落花瓣
4. 任意保存成功提示 → 同样触发成功涟漪
5. 设置关闭「高级效果」或系统开启「减少动态效果」→ 上述动效均优雅降级

---
**前端开发工程师** · Phase 4 已完成 · `npm run build` 通过（exit 0）
