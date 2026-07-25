<script setup>
import { useId } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  actions: { type: Array, default: () => [] }, // { label, icon?, danger?, value }
})
const emit = defineEmits(['select', 'update:open'])

const titleId = useId()

function close() {
  emit('update:open', false)
}
function pick(action) {
  emit('select', action)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet-fade">
      <div v-if="open" class="action-sheet-root">
        <div class="action-sheet-backdrop" @click="close" />
        <div class="action-sheet" role="dialog" :aria-labelledby="titleId">
          <div v-if="title" :id="titleId" class="action-sheet-title">{{ title }}</div>
          <div class="action-sheet-list">
            <button
              v-for="a in actions"
              :key="a.value !== undefined ? a.value : a.label"
              type="button"
              class="action-sheet-item"
              :class="{ danger: a.danger }"
              @click="pick(a)"
            >
              <span v-if="a.icon" class="action-sheet-icon">{{ a.icon }}</span>
              <span class="action-sheet-label">{{ a.label }}</span>
            </button>
          </div>
          <button type="button" class="action-sheet-cancel" @click="close">取消</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.action-sheet-root {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.action-sheet-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.action-sheet {
  position: relative;
  margin: 0 auto 0;
  width: 100%;
  max-width: 560px;
  padding: 8px 12px calc(12px + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
}

.action-sheet-title {
  text-align: center;
  font-size: 13px;
  color: var(--text3, #999);
  padding: 10px 0 8px;
}

.action-sheet-list {
  background: var(--card, #fff);
  border: 1px solid var(--border, rgba(0, 0, 0, 0.08));
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
}

.action-sheet-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 15px 12px;
  border: none;
  background: transparent;
  color: var(--text, #222);
  font-size: 16px;
  font-family: inherit;
  cursor: pointer;
  border-bottom: 1px solid var(--border, rgba(0, 0, 0, 0.06));
  transition: background 0.15s;
  -webkit-tap-highlight-color: transparent;
}

.action-sheet-item:last-child {
  border-bottom: none;
}

.action-sheet-item:active {
  background: var(--hover, rgba(0, 0, 0, 0.04));
}

.action-sheet-item.danger {
  color: #e53935;
  font-weight: 600;
}

.action-sheet-icon {
  font-size: 17px;
}

.action-sheet-cancel {
  width: 100%;
  margin-top: 10px;
  padding: 15px 12px;
  border: 1px solid var(--border, rgba(0, 0, 0, 0.08));
  border-radius: 16px;
  background: var(--card, #fff);
  color: var(--text2, #555);
  font-size: 16px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  -webkit-tap-highlight-color: transparent;
}

.action-sheet-cancel:active {
  background: var(--hover, rgba(0, 0, 0, 0.04));
}

/* 入场 / 退场动画 */
.sheet-fade-enter-active,
.sheet-fade-leave-active {
  transition: opacity 0.22s ease;
}
.sheet-fade-enter-active .action-sheet,
.sheet-fade-leave-active .action-sheet {
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.sheet-fade-enter-from,
.sheet-fade-leave-to {
  opacity: 0;
}
.sheet-fade-enter-from .action-sheet,
.sheet-fade-leave-to .action-sheet {
  transform: translateY(100%);
}

@media (prefers-reduced-motion: reduce) {
  .sheet-fade-enter-active,
  .sheet-fade-leave-active,
  .sheet-fade-enter-active .action-sheet,
  .sheet-fade-leave-active .action-sheet {
    transition: none;
  }
}
</style>
