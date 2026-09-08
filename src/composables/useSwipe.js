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

  // 关键修复：不使用 el.setPointerCapture(pid)。
  // 指针捕获会把 pointer 事件目标重定向为捕获元素，Chromium 据此把 click 事件
  // 的 target 计算为 pointerdown/up 目标的共同祖先（即容器），导致子元素（如
  // 日历 day-cell）的 @click 永远收不到事件——表现为「点击日期无反应、弹层不出现」。
  // 改用 window 级 move/up 监听：滑动期间同样能全程跟踪指针（含移出元素外），
  // 且完全不干扰 click 事件的正常派发。
  function attachWindow() {
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', cancel, true)
  }
  function detachWindow() {
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', up, true)
    window.removeEventListener('pointercancel', cancel, true)
  }

  function down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (active) return
    active = true
    pid = e.pointerId
    startX = e.clientX
    startY = e.clientY
    startT = e.timeStamp
    dx.value = 0
    dy.value = 0
    axis.value = null
    swiping.value = true
    attachWindow()
    onStart && onStart(e)
  }

  function move(e) {
    if (!active || e.pointerId !== pid) return
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
    detachWindow()
    if (e.pointerId !== pid) return
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
    detachWindow()
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
  }

  function unbind() {
    detachWindow()
    if (!el) return
    el.removeEventListener('pointerdown', down)
    el = null
  }

  watch(target, (n, o) => { if (o) unbind(); if (n) bind(n) }, { immediate: true })
  onBeforeUnmount(unbind)

  return { dx, dy, swiping, axis }
}
