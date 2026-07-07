import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

export const useAppStore = defineStore('app', () => {
  const activePage = ref(null)
  const theme = ref(localStorage.getItem('theme') || 'light')
  const navSettings = ref(loadJson('navSettings', {}))
  const syncEnabled = ref(localStorage.getItem('syncEnabled') === 'true')
  const currentYear = ref(window.currentYear || new Date().getFullYear())
  const currentMonth = ref(window.currentMonth || new Date().getMonth())
  const selectedDate = ref(window.selectedDate || null)

  function activatePage(page) {
    activePage.value = page
    if (page === 'settings' && window.__refreshSettingsData) {
      window.__refreshSettingsData()
    }
  }

  function deactivate() {
    activePage.value = null
  }

  function setTheme(t) {
    theme.value = t
    localStorage.setItem('theme', t)
  }

  function setSyncEnabled(v) {
    syncEnabled.value = v
    localStorage.setItem('syncEnabled', String(v))
  }

  function setNavSettings(s) {
    navSettings.value = s
    localStorage.setItem('navSettings', JSON.stringify(s))
  }

  function refreshFromWindow() {
    currentYear.value = window.currentYear || new Date().getFullYear()
    currentMonth.value = window.currentMonth || new Date().getMonth()
    selectedDate.value = window.selectedDate || null
  }

  // Sync Pinia → window.* for old JS backward compat
  watch(currentYear, (v) => { window.currentYear = v }, { immediate: true })
  watch(currentMonth, (v) => { window.currentMonth = v }, { immediate: true })
  watch(selectedDate, (v) => { window.selectedDate = v }, { immediate: true })

  return {
    activePage,
    theme,
    navSettings,
    syncEnabled,
    currentYear,
    currentMonth,
    selectedDate,
    activatePage,
    deactivate,
    setTheme,
    setSyncEnabled,
    setNavSettings,
    refreshFromWindow,
  }
})
