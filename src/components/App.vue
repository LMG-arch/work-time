<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
import LifeWorkbench from '../pages/LifeWorkbench.vue'
import TodoModal from './TodoModal.vue'
import ReminderSettings from './ReminderSettings.vue'
import EffectLayer from '../effects/EffectLayer.vue'
import { installRipple } from '../effects/ripple'
import { installTilt } from '../effects/tilt'
import { installAmbient } from '../effects/ambient'
import { installSignature } from '../effects/signature'
import { useAppStore } from '../stores/appStore'

// ===== 统一外壳架构 =====
// 生活工作台（LifeWorkbench）是唯一外壳：侧边栏 + 顶栏 + 移动底栏 + 8 大生活模块，
// 上班日历 5 页作为「工作模块」子视图嵌入其 #work-embed 内容区，二者并列共存、互不覆盖。
// 本组件只负责：渲染外壳 + 全局对话框/特效/闪屏 + 桥接经典 renderer.js 的导航调用。

const WORK_PAGES = ['calendar', 'clockin', 'social', 'stats', 'settings']

// 桥接：经典 renderer.js 仍调用 window.__vueActivate(view)。
// 将 view 转发给生活工作台：上班日历页 → 切 work 视图 + 对应子视图；生活模块名 → 切对应模块。
function activate(page) {
  const pending = page
  const apply = () => {
    if (WORK_PAGES.includes(pending)) {
      window.__lifeSwitchView?.('work')
      window.__workSubActivate?.(pending)
    } else {
      window.__lifeSwitchView?.(pending)
    }
  }
  // 生活工作台引擎可能尚未 init（LifeWorkbench onMounted 异步等 storage.init），
  // 未就绪时缓存请求，待其就绪后由 LifeWorkbench 重放。
  if (window.__lifeSwitchView && window.__workSubActivate) apply()
  else window.__pendingActivate = pending
}

window.__vueActivate = activate
window.__vueDeactivate = () => {} // 统一外壳下无「非 Vue 页面」，空实现保留兼容

const appStore = useAppStore()
let uninstallAmbient = null
let uninstallSignature = null

// 左边缘滑动关闭浮层（移动端「返回 / 收起」手势）
let edgeX0 = 0, edgeY0 = 0, edgeT0 = 0, edgeActive = false
function onEdgeDown(e) {
  if (e.pointerType !== 'touch') return
  if (e.clientX > 20) return
  edgeActive = true
  edgeX0 = e.clientX
  edgeY0 = e.clientY
  edgeT0 = e.timeStamp
}
function onEdgeUp(e) {
  if (!edgeActive) return
  edgeActive = false
  const dx = e.clientX - edgeX0
  const dy = e.clientY - edgeY0
  const dt = e.timeStamp - edgeT0
  if (dx > 90 && Math.abs(dy) < 70 && dt < 500) {
    const overlay = document.querySelector('.dialog-overlay')
    if (overlay) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  }
}

onMounted(() => {
  // 统一外壳：body 始终处于 life-mode（#app 全宽），生活工作台侧边栏常驻
  document.body.classList.add('life-mode')
  installRipple()
  installTilt()
  uninstallAmbient = installAmbient()
  uninstallSignature = installSignature()
  applyPremiumClass()
  appStore.$subscribe(applyPremiumClass)
  document.addEventListener('pointerdown', onEdgeDown, { passive: true })
  document.addEventListener('pointerup', onEdgeUp, { passive: true })
})

function applyPremiumClass() {
  const off = appStore.premium && appStore.premium.enabled === false
  document.documentElement.classList.toggle('fx-off', off)
}

onBeforeUnmount(() => {
  if (uninstallAmbient) uninstallAmbient()
  if (uninstallSignature) uninstallSignature()
  document.removeEventListener('pointerdown', onEdgeDown)
  document.removeEventListener('pointerup', onEdgeUp)
})
</script>

<template>
  <!-- 唯一外壳：生活工作台（侧边栏常驻，上班日历作为「工作模块」嵌入其内容区） -->
  <LifeWorkbench />

  <!-- 全局对话框：在任何模块都可用 -->
  <TodoModal />
  <ReminderSettings />

  <!-- 全局视觉特效层（花瓣/拖尾/粒子都画在这里，不挡交互） -->
  <EffectLayer />
</template>
