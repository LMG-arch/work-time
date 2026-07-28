<script setup>
import { ref, watch } from 'vue'
const props = defineProps({
  title: { type: String, required: true },
  collapsible: { type: Boolean, default: false },
})

// 折叠状态持久化：按标题记忆，避免每次打开设置页都要手动收起
const STORAGE_KEY = 'settings-section-' + props.title

function loadOpen() {
  try {
    const v = window.__storage?.get(STORAGE_KEY)
    if (typeof v === 'boolean') return v
  } catch (e) { console.debug('[SettingsSection] load failed:', e.message) }
  return false // 默认折叠，减少首屏滚动负担
}

const open = ref(loadOpen())

watch(open, (v) => {
  try { window.__storage?.set(STORAGE_KEY, v) } catch (e) { console.debug('[SettingsSection] save failed:', e.message) }
})
</script>

<template>
  <div class="settings-group" data-tilt data-tilt-max="5" data-tilt-lift="3">
    <div
      v-if="collapsible"
      class="settings-group-title settings-collapsible"
      @click="open = !open"
    >
      {{ title }} <span class="collapse-arrow" :class="{ open }">▾</span>
    </div>
    <div v-else class="settings-group-title">{{ title }}</div>
    <div v-show="!collapsible || open">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.settings-group {
  background: var(--card, #fff);
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
}
.settings-group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, #666);
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.settings-collapsible {
  cursor: pointer;
  user-select: none;
}
.collapse-arrow {
  display: inline-block;
  transition: transform 0.2s;
  font-size: 12px;
}
.collapse-arrow.open {
  transform: rotate(180deg);
}
</style>