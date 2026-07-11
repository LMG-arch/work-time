<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import SettingsPage from '../pages/SettingsPage.vue'
import StatsPage from '../pages/StatsPage.vue'
import CalendarView from '../pages/CalendarView.vue'
import SocialPage from '../pages/SocialPage.vue'
import ClockinPage from '../pages/ClockinPage.vue'
import TodoModal from './TodoModal.vue'
import ReminderSettings from './ReminderSettings.vue'
import EffectLayer from '../effects/EffectLayer.vue'
import { installRipple } from '../effects/ripple'
import { installTilt } from '../effects/tilt'
import { installAmbient } from '../effects/ambient'
import { installSignature } from '../effects/signature'
import SplashScreen from './SplashScreen.vue'
import { useAppStore } from '../stores/appStore'

const PAGES = {
  calendar: CalendarView,
  clockin: ClockinPage,
  social: SocialPage,
  stats: StatsPage,
  settings: SettingsPage,
}
const NAV_ORDER = ['calendar', 'clockin', 'social', 'stats', 'settings']

// 默认即渲染日历页：不依赖 renderer.js 后续调用 activate()，
// 即使其初始化因 IPC 卡住而未执行，Vue 层也立即显示内容，杜绝「只剩导航栏」。
const activePage = ref('calendar')
const prevIndex = ref(0)
const transitionDir = ref('fade')

function activate(page) {
  const idx = NAV_ORDER.indexOf(page)
  const prev = prevIndex.value
  transitionDir.value = idx > prev ? 'forward' : idx < prev ? 'back' : 'fade'
  if (idx >= 0) prevIndex.value = idx
  activePage.value = page
  if (page === 'settings' && window.__refreshSettingsData) {
    window.__refreshSettingsData()
  }
}

window.__vueActivate = activate
window.__vueDeactivate = () => { activePage.value = null }

const currentComponent = computed(() => (activePage.value ? PAGES[activePage.value] : null))

const appStore = useAppStore()
let uninstallAmbient = null
let uninstallSignature = null
const showSplash = ref(true)

onMounted(() => {
  // 双保险：无论 SplashScreen 内部计时是否异常，最长 4s 后强制收起闪屏，
  // 杜绝「只剩导航栏 / 一片空白」的永久盖屏（沙箱无法跑真机，此为防御性兜底）。
  setTimeout(() => { showSplash.value = false }, 4000)
  // 全局按钮墨水波纹：受 premium 总开关与 prefers-reduced-motion 守卫
  installRipple()
  // 磁吸倾斜卡片：全局委托，受 premium 总开关与 prefers-reduced-motion 守卫
  installTilt()
  // Phase 3 氛围与生命感：背景呼吸/视差驱动 + 光标拖尾 + 节气粒子（单一 RAF）
  uninstallAmbient = installAmbient()
  // Phase 4 招牌瞬间：主题绽放 + 花瓣庆祝（单一 RAF，复用 EffectLayer 全局画布）
  uninstallSignature = installSignature()
  // 同步 premium 总开关到 <html> 类，供纯 CSS 的氛围效果（呼吸/视差）优雅降级
  applyPremiumClass()
  appStore.$subscribe(applyPremiumClass)
  // 从托盘唤醒时重播启动闪屏
  document.addEventListener('visibilitychange', onVisibility)
})

function applyPremiumClass() {
  const off = appStore.premium && appStore.premium.enabled === false
  document.documentElement.classList.toggle('fx-off', off)
}

function onVisibility() {
  if (!document.hidden) showSplash.value = true
}

onBeforeUnmount(() => {
  if (uninstallAmbient) uninstallAmbient()
  if (uninstallSignature) uninstallSignature()
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <transition
    :name="transitionDir === 'forward' ? 'page-forward' : transitionDir === 'back' ? 'page-back' : 'page-fade'"
    mode="out-in"
  >
    <component :is="currentComponent" :key="activePage" v-if="currentComponent" />
  </transition>

  <!-- 全局对话框：在任何页面都可用 -->
  <TodoModal />
  <ReminderSettings />

  <!-- 全局视觉特效层（花瓣/拖尾/粒子都画在这里，不挡交互） -->
  <EffectLayer />

  <!-- 启动闪屏（招牌瞬间 #3）：App 启动 / 从托盘唤醒时播放，可跳过 -->
  <SplashScreen :visible="showSplash" @done="showSplash = false" />
</template>
