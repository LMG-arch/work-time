import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

function loadJson(key, fallback) {
  try {
    const val = window.__storage.get(key)
    return val == null ? fallback : val
  } catch { return fallback }
}

export const useAppStore = defineStore('app', () => {
  const activePage = ref(null)
  const theme = ref(window.__storage.getRaw('theme') || 'light')
  const navSettings = ref(window.__storage.get('navSettings') || {})
  const syncEnabled = ref(window.__storage.getRaw('syncEnabled') === 'true')
  // 高级视觉效果的开关与强度档位（星海绽放等氛围/招牌瞬间效果的全局总闸）
  const premium = ref(window.__storage.get('premiumEffects') || { enabled: true, intensity: 'auto' })
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
    window.__storage.setRaw('theme', t)
  }

  function setSyncEnabled(v) {
    syncEnabled.value = v
    window.__storage.setRaw('syncEnabled', String(v))
  }

  function setPremium(patch) {
    premium.value = { ...premium.value, ...patch }
    window.__storage.set('premiumEffects', premium.value)
  }

  function setNavSettings(s) {
    navSettings.value = s
    window.__storage.set('navSettings', s)
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
    premium,
    currentYear,
    currentMonth,
    selectedDate,
    activatePage,
    deactivate,
    setTheme,
    setSyncEnabled,
    setPremium,
    setNavSettings,
    refreshFromWindow,
  }
})
