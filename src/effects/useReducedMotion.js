// prefers-reduced-motion 守卫
// - prefersReducedMotion(): 给非 Vue 模块（效果引擎）用的即时判断
// - usePrefersReducedMotion(): 给 Vue 组件用的响应式 ref，系统设置变化时自动更新

export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

import { ref, onMounted, onUnmounted } from 'vue'

export function usePrefersReducedMotion() {
  const reduced = ref(false)
  let mq

  onMounted(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reduced.value = mq.matches
    const handler = (e) => {
      reduced.value = e.matches
    }
    mq.addEventListener('change', handler)
    onUnmounted(() => mq && mq.removeEventListener('change', handler))
  })

  return reduced
}
