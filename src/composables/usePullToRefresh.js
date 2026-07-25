// src/composables/usePullToRefresh.js
// 顶部下拉刷新：仅在滚动容器处于顶部（scrollTop<=0）时，向下拖拽超过阈值触发 onRefresh。
// 使用 touch 事件并以 passive:false 以便必要时 preventDefault，避免与页面原生回弹冲突。
import { ref, watch, onBeforeUnmount } from 'vue'

export function usePullToRefresh(targetRef, options = {}) {
  const {
    threshold = 64,
    max = 96,
    resistance = 0.5,
    onRefresh,
  } = options

  const pullDistance = ref(0)
  const refreshing = ref(false)

  let startY = null
  let active = false
  let el = null

  function onTouchStart(e) {
    if (!el) return
    if (el.scrollTop > 0) return
    startY = e.touches[0].clientY
    active = true
  }

  function onTouchMove(e) {
    if (!active || startY == null) return
    const d = e.touches[0].clientY - startY
    if (d <= 0 || el.scrollTop > 0) {
      pullDistance.value = 0
      if (d <= 0) active = false
      return
    }
    if (e.cancelable) e.preventDefault()
    pullDistance.value = Math.min(max, d * resistance)
  }

  function onTouchEnd() {
    if (!active) return
    active = false
    if (pullDistance.value >= threshold) {
      refreshing.value = true
      pullDistance.value = Math.min(threshold, max)
      Promise.resolve(onRefresh && onRefresh())
        .catch(() => { /* noop */ })
        .finally(() => { refreshing.value = false; pullDistance.value = 0 })
    } else {
      pullDistance.value = 0
    }
    startY = null
  }

  watch(targetRef, (node) => {
    if (el && el !== node) {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
    if (node) {
      el = node
      node.addEventListener('touchstart', onTouchStart, { passive: true })
      node.addEventListener('touchmove', onTouchMove, { passive: false })
      node.addEventListener('touchend', onTouchEnd, { passive: true })
    }
  }, { immediate: true })

  onBeforeUnmount(() => {
    if (el) {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el = null
    }
  })

  return { pullDistance, refreshing }
}
