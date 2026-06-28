<script setup>
import { SwitchRoot, SwitchThumb } from 'reka-ui'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <SwitchRoot
    :checked="modelValue"
    :disabled="disabled"
    class="settings-switch-root"
    @update:checked="emit('update:modelValue', $event)"
  >
    <SwitchThumb class="settings-switch-thumb" />
  </SwitchRoot>
</template>

<style scoped>
.settings-switch-root {
  width: 44px;
  height: 24px;
  background: var(--border, #ccc);
  border-radius: 12px;
  position: relative;
  border: none;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}
.settings-switch-root[data-state="checked"] {
  background: var(--accent, #333);
}
.settings-switch-root:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.settings-switch-thumb {
  display: block;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.settings-switch-root[data-state="checked"] .settings-switch-thumb {
  transform: translateX(20px);
}
</style>
