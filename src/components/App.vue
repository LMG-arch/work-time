<script setup>
import { ref, computed } from 'vue'
import SettingsPage from '../pages/SettingsPage.vue'
import StatsPage from '../pages/StatsPage.vue'
import CalendarView from '../pages/CalendarView.vue'
import SocialPage from '../pages/SocialPage.vue'
import ClockinPage from '../pages/ClockinPage.vue'
import TodoModal from './TodoModal.vue'
import ReminderSettings from './ReminderSettings.vue'

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
</template>
