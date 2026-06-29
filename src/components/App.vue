<script setup>
import { ref } from 'vue'
import SettingsPage from '../pages/SettingsPage.vue'
import StatsPage from '../pages/StatsPage.vue'

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
  <SettingsPage v-if="activePage === 'settings'" />
  <StatsPage v-if="activePage === 'stats'" />
</template>