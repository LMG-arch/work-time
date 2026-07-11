// 磁吸倾斜卡片（Premium micro-interaction）
// 全局委托：监听 document 的 pointermove，命中 [data-tilt] 元素即按其光标位置计算
// perspective 倾斜角度（rotateX/Y）+ 轻微抬升，离开复位。
//
// 设计要点：
// - 采用「内联 transform」注入，因此不会与既有 :hover 抬升、:active 缩放、dayIn
//   入场动画相互覆盖：CSS 动画优先级高于内联样式，入场期间倾斜自动让位给动画，
//   动画结束后倾斜接管；hover 抬升则被倾斜覆盖（倾斜本身更高级）。
// - 仅在 pointerType 为 mouse/pen 时生效（触屏无意义，且避免干扰滚动）。
// - 受 appStore.premium.enabled 总开关 + prefers-reduced-motion 守卫。
// - pointermove 用 requestAnimationFrame 节流，单帧只计算一次，零额外布局抖动。
//
// 元素可通过 data-* 微调：
//   data-tilt-max   最大倾斜角（deg），默认 7
//   data-tilt-lift  悬浮抬升像素，默认 6
//   data-tilt-persp 透视距离（px），默认 900

import { prefersReducedMotion } from './useReducedMotion'
import { useAppStore } from '../stores/appStore'

const SELECTOR = '[data-tilt]'

export function installTilt() {
  const appStore = useAppStore()
  let current = null
  let raf = 0
  let pending = null

  // 复位：清除内联样式，交还给 CSS（含平滑复位过渡）
  const clear = (el) => {
    if (!el) return
    el.style.transform = ''
    el.style.transition = ''
    el.style.willChange = ''
  }

  const compute = () => {
    raf = 0
    const job = pending
    pending = null
    if (!job) return
    const { el, e } = job
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    // 光标明显逸出元素范围时忽略，避免子元素溢出导致的错位倾斜
    if (px < -0.15 || px > 1.15 || py < -0.15 || py > 1.15) return
    const max = parseFloat(el.dataset.tiltMax || '7')
    const lift = parseFloat(el.dataset.tiltLift || '6')
    const persp = el.dataset.tiltPersp || '900'
    const ry = (px - 0.5) * 2 * max
    const rx = -(py - 0.5) * 2 * max
    // 跟手：倾斜过程中关闭 transform 过渡，仅保留 box-shadow 过渡
    el.style.transition = 'box-shadow 0.25s ease'
    el.style.willChange = 'transform'
    el.style.transform =
      `perspective(${persp}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(${(-lift).toFixed(2)}px)`
  }

  const onMove = (e) => {
    if (e.pointerType === 'touch') return
    if (appStore.premium?.enabled === false || prefersReducedMotion()) {
      if (current) { clear(current); current = null }
      return
    }
    const t = e.target
    const el = t && t.closest ? t.closest(SELECTOR) : null
    if (el !== current) {
      if (current) clear(current)
      current = el
    }
    if (!current) return
    pending = { el: current, e }
    if (!raf) raf = requestAnimationFrame(compute)
  }

  const leave = () => {
    if (current) { clear(current); current = null }
  }

  document.addEventListener('pointermove', onMove, { passive: true })
  // 离开 tilt 元素（relatedTarget 不在其内部）时复位
  document.addEventListener('pointerout', (e) => {
    if (current && (!e.relatedTarget || !current.contains(e.relatedTarget))) leave()
  }, { passive: true })
  window.addEventListener('blur', leave)
  // 滚动时元素位置偏移，立即复位避免错位
  window.addEventListener('scroll', leave, { passive: true, capture: true })

  return () => {
    document.removeEventListener('pointermove', onMove)
    window.removeEventListener('blur', leave)
    window.removeEventListener('scroll', leave, true)
    if (raf) cancelAnimationFrame(raf)
    leave()
  }
}
