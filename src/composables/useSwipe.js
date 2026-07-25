// src/composables/useSwipe.js
// 统一的指针滑动检测（触摸 / 鼠标 / 笔）。挂载到元素 ref 上，
// 当某方向的位移超过阈值且该轴占主导时，触发对应的方向回调。
import { ref, watch, onBeforeUnmount } from 'vue'

export function useSwipe(target, options = {}) {
  const {
    threshold = 56,
    direction = 'horizontal', // 'horizontal' | 'vertical' | 'both'
    onLeft, onRight, onUp, onDown,
    onStart, onMove, onEnd,
  } = options

  const dx = ref(0)
  const dy = ref(0)
  const swiping = ref(false)
  const axis = ref(null)

  let startX = 0, startY = 0, startT = 0, active = false, pid = null, el = null

  const isH = direction === 'horizontal' || direction === 'both'
  const isV = direction === 'vertical' || direction === 'both'

  function down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    active = true
    pid = e.pointerId
    startX = e.clientX
    startY = e.clientY
    startT = e.timeStamp
    dx.value = 0
    dy.value = 0
    axis.value = null
    swiping.value = true
    try { el.setPointerCapture(pid) } catch (_) { /* noop */ }
    onStart && onStart(e)
  }

  function move(e) {
    if (!active) return
    dx.value = e.clientX - startX
    dy.value = e.clientY - startY
    if (!axis.value) {
      const ax = Math.abs(dx.value)
      const ay = Math.abs(dy.value)
      if (ax > 6 || ay > 6) {
        if (direction === 'horizontal') axis.value = ax >= ay ? 'x' : null
        else if (direction === 'vertical') axis.value = ay >= ax ? 'y' : null
        else axis.value = ax >= ay ? 'x' : 'y'
      }
    }
    onMove && onMove(dx.value, dy.value, axis.value, e)
  }

  function up(e) {
    if (!active) return
    active = false
    try { el.releasePointerCapture(pid) } catch (_) { /* noop */ }
    const ex = e.clientX - startX
    const ey = e.clientY - startY
    const dt = Math.max(1, e.timeStamp - startT)
    const speed = Math.hypot(ex, ey) / dt
    const ax = Math.abs(ex)
    const ay = Math.abs(ey)
    let fired = false
    if (isH && ax > threshold && ax >= ay) {
      if (ex < 0) onLeft && onLeft(ex, speed)
      else onRight && onRight(ex, speed)
      fired = true
    }
    if (isV && ay > threshold && ay >= ax) {
      if (ey < 0) onUp && onUp(ey, speed)
      else onDown && onDown(ey, speed)
      fired = true
    }
    onEnd && onEnd({ dx: ex, dy: ey, axis: axis.value, fired, speed })
    dx.value = 0
    dy.value = 0
    swiping.value = false
    axis.value = null
  }

  function cancel() {
    if (!active) return
    active = false
    dx.value = 0
    dy.value = 0
    swiping.value = false
    axis.value = null
    onEnd && onEnd({ dx: 0, dy: 0, axis: null, fired: false, speed: 0 })
  }

  function bind(node) {
    if (!node) return
    el = node
    node.addEventListener('pointerdown', down)
    node.addEventListener('pointermove', move)
    node.addEventListener('pointerup', up)
    node.addEventListener('pointercancel', cancel)
  }

  function unbind() {
    if (!el) return
    el.removeEventListener('pointerdown', down)
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', cancel)
    el = null
  }

  watch(target, (n, o) => { if (o) unbind(); if (n) bind(n) }, { immediate: true })
  onBeforeUnmount(unbind)

  return { dx, dy, swiping, axis }
}
