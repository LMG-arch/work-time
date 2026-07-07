<script setup>
import { ref } from 'vue'
import SettingsPage from '../pages/SettingsPage.vue'
import StatsPage from '../pages/StatsPage.vue'
import CalendarView from '../pages/CalendarView.vue'
import SocialPage from '../pages/SocialPage.vue'
import ClockinPage from '../pages/ClockinPage.vue'
import TodoModal from './TodoModal.vue'
import ReminderSettings from './ReminderSettings.vue'

const activePage = ref(null)

window.__vueActivate = (page) => {
  activePage.value = page
  if (page === 'settings' && window.__refreshSettingsData) {
    window.__refreshSettingsData()
  }
}
window.__vueDeactivate = () => { activePage.value = null }
</script>

<template>
  <CalendarView v-if="activePage === 'calendar'" />
  <ClockinPage v-if="activePage === 'clockin'" />
  <SettingsPage v-if="activePage === 'settings'" />
  <SocialPage v-if="activePage === 'social'" />
  <StatsPage v-if="activePage === 'stats'" />

  <!-- 全局对话框：在任何页面都可用 -->
  <TodoModal />
  <ReminderSettings />
</template>
