<script setup>
defineProps({
  title: { type: String, required: true },
  collapsible: { type: Boolean, default: false },
})
import { ref } from 'vue'
const open = ref(true)
</script>

<template>
  <div class="settings-group">
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