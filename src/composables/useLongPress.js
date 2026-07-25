// src/composables/useLongPress.js
// 长按检测：超过 delay(ms) 未移动即触发 onLongPress，可选震动反馈。
// 返回 active（按住待触发期间为 true，供 UI 显示按压态）。
import { ref, watch, onBeforeUnmount } from 'vue'

export function useLongPress(target, options = {}) {
  const {
    delay = 420,
    moveTolerance = 12,
    haptic = true,
    onLongPress,
    onStart,
    onEnd,
  } = options

  const active = ref(false)
  let timer = null
  let sx = 0
  let sy = 0
  let el = null
  let fired = false

  function clear() {
    if (timer) { clearTimeout(timer); timer = null }
    active.value = false
    fired = false
  }

  function down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    sx = e.clientX
    sy = e.clientY
    fired = false
    active.value = true
    onStart && onStart(e)
    timer = setTimeout(() => {
      fired = true
      active.value = false
      if (haptic && navigator.vibrate) {
        try { navigator.vibrate(14) } catch (_) { /* noop */ }
      }
      onLongPress && onLongPress(e)
    }, delay)
  }

  function move(e) {
    if (!timer) return
    if (Math.abs(e.clientX - sx) > moveTolerance || Math.abs(e.clientY - sy) > moveTolerance) clear()
  }

  function up() {
    clear()
    onEnd && onEnd()
  }

  function bind(node) {
    if (!node) return
    el = node
    node.addEventListener('pointerdown', down)
    node.addEventListener('pointermove', move)
    node.addEventListener('pointerup', up)
    node.addEventListener('pointercancel', clear)
    node.addEventListener('pointerleave', clear)
  }

  function unbind() {
    if (!el) return
    clear()
    el.removeEventListener('pointerdown', down)
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', clear)
    el.removeEventListener('pointerleave', clear)
    el = null
  }

  watch(target, (n, o) => { if (o) unbind(); if (n) bind(n) }, { immediate: true })
  onBeforeUnmount(unbind)

  return { active, clear }
}
