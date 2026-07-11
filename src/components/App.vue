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
import { useAppStore } from '../stores/appStore'

const PAGES = {
  calendar: CalendarView,
  clockin: ClockinPage,
  social: SocialPage,
  stats: StatsPage,
  settings: SettingsPage,
}
const NAV_ORDER = ['calendar', 'clockin', 'social', 'stats', 'settings']

const activePage = ref(null)
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

onMounted(() => {
  // 全局按钮墨水波纹：受 premium 总开关与 prefers-reduced-motion 守卫
  installRipple()
  // 磁吸倾斜卡片：全局委托，受 premium 总开关与 prefers-reduced-motion 守卫
  installTilt()
  // Phase 3 氛围与生命感：背景呼吸/视差驱动 + 光标拖尾 + 节气粒子（单一 RAF）
  uninstallAmbient = installAmbient()
  // 同步 premium 总开关到 <html> 类，供纯 CSS 的氛围效果（呼吸/视差）优雅降级
  applyPremiumClass()
  appStore.$subscribe(applyPremiumClass)
})

function applyPremiumClass() {
  const off = appStore.premium && appStore.premium.enabled === false
  document.documentElement.classList.toggle('fx-off', off)
}

onBeforeUnmount(() => {
  if (uninstallAmbient) uninstallAmbient()
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
</template>
