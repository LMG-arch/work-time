// 按钮墨水波纹（Material 风涟漪，但用指数缓动、跟随主题文本色）
// 全局委托：监听 document 的 pointerdown，命中按钮即在其内生成一圈扩散涟漪。
// - 受 appStore.premium.enabled 总开关控制
// - 受 prefers-reduced-motion 守卫（无障碍用户不播放）
// - 仅在点击当时临时给按钮加 position:relative + overflow:hidden，动画结束即还原，不污染业务样式

import { prefersReducedMotion } from './useReducedMotion'
import { useAppStore } from '../stores/appStore'

const SELECTOR = 'button, .btn, [role="button"], flux-button, .nav-btn, .today-btn, .settings-action-btn, .tag-chip'

export function installRipple() {
  const appStore = useAppStore()

  const handler = (e) => {
    if (appStore.premium?.enabled === false) return
    if (prefersReducedMotion()) return

    const target = e.target.closest(SELECTOR)
    if (!target || target.disabled) return

    const rect = target.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height)
    const span = document.createElement('span')
    span.className = 'ripple'
    span.style.width = span.style.height = size + 'px'
    span.style.left = e.clientX - rect.left - size / 2 + 'px'
    span.style.top = e.clientY - rect.top - size / 2 + 'px'

    const prevPos = target.style.position
    const prevOverflow = target.style.overflow
    if (getComputedStyle(target).position === 'static') target.style.position = 'relative'
    target.style.overflow = 'hidden'

    target.appendChild(span)
    span.addEventListener(
      'animationend',
      () => {
        span.remove()
        target.style.position = prevPos
        target.style.overflow = prevOverflow
      },
      { once: true }
    )
  }

  document.addEventListener('pointerdown', handler, { passive: true })
  return () => document.removeEventListener('pointerdown', handler)
}
