// 按钮墨水波纹（Material 风涟漪，但用指数缓动、跟随主题文本色）
// 全局委托：监听 document 的 pointerdown，命中按钮即在其内生成一圈扩散涟漪。
// - 受 appStore.premium.enabled 总开关控制
// - 受 prefers-reduced-motion 守卫（无障碍用户不播放）
// - 仅在点击当时临时给按钮加 position:relative + overflow:hidden，动画结束即还原，不污染业务样式
//
// Phase 4 升级：新增「成功涟漪」——从点击点扩散的成功色涟漪（主题感知绿色），
// 通过拦截全局 showToast 自动覆盖 打卡成功 / 保存成功 / 任务完成 等所有成功提示，
// 亦可显式派发 calendar:success 事件（detail:{x,y}）触发。

import { prefersReducedMotion } from './useReducedMotion'
import { useAppStore } from '../stores/appStore'

const SELECTOR = 'button, .btn, [role="button"], flux-button, .nav-btn, .today-btn, .settings-action-btn, .tag-chip'

// 最近一次指针位置（用于成功涟漪在无显式坐标时落在光标附近）
let lastX = 0
let lastY = 0
let lastMoveTs = 0

function trackPointer(e) {
  if (e.clientX == null) return
  lastX = e.clientX
  lastY = e.clientY
  lastMoveTs = performance.now()
}

/**
 * 在指定坐标生成一圈涟漪。
 * @param {number} x 点击横坐标；为 null 时回退到最近指针或屏幕中心
 * @param {number} y 点击纵坐标
 * @param {object} opts { success?:boolean, target?:HTMLElement, size?:number }
 */
export function spawnRipple(x, y, opts = {}) {
  const appStore = useAppStore()
  if (appStore.premium?.enabled === false) return
  if (prefersReducedMotion()) return

  let px = x
  let py = y
  if (px == null || py == null) {
    const recent = performance.now() - lastMoveTs < 4000
    px = recent ? lastX : window.innerWidth / 2
    py = recent ? lastY : window.innerHeight / 2
  }

  const span = document.createElement('span')
  span.className = 'ripple' + (opts.success ? ' success' : '')

  if (opts.success) {
    const size = opts.size || 130
    span.style.width = span.style.height = size + 'px'
    span.style.left = px - size / 2 + 'px'
    span.style.top = py - size / 2 + 'px'
    document.body.appendChild(span)
    span.addEventListener('animationend', () => span.remove(), { once: true })
    return
  }

  const target = opts.target
  if (!target) return
  const rect = target.getBoundingClientRect()
  const size = Math.max(rect.width, rect.height)
  span.style.width = span.style.height = size + 'px'
  span.style.left = px - rect.left - size / 2 + 'px'
  span.style.top = py - rect.top - size / 2 + 'px'

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

export function installRipple() {
  const appStore = useAppStore()

  window.addEventListener('pointerdown', trackPointer, { passive: true })
  window.addEventListener('pointermove', trackPointer, { passive: true })

  // 普通按钮按压波纹（沿用原行为）
  const handler = (e) => {
    if (appStore.premium?.enabled === false) return
    if (prefersReducedMotion()) return
    const target = e.target.closest(SELECTOR)
    if (!target || target.disabled) return
    spawnRipple(e.clientX, e.clientY, { target })
  }
  document.addEventListener('pointerdown', handler, { passive: true })

  // 成功涟漪：监听显式事件 + 拦截全局 showToast（覆盖所有成功提示，一处接入、全局生效）
  const onSuccess = (e) => {
    const d = (e && e.detail) || {}
    spawnRipple(d.x, d.y, { success: true })
  }
  window.addEventListener('calendar:success', onSuccess)

  const originalToast = window.showToast
  if (typeof originalToast === 'function') {
    window.showToast = (msg, ...args) => {
      try {
        originalToast(msg, ...args)
      } catch (err) {
        /* toast 实现异常不影响涟漪 */
      }
      if (typeof msg === 'string' && /成功|✓|完成|saved|done|保存|提交/i.test(msg)) {
        spawnRipple(null, null, { success: true })
      }
    }
  }

  return () => {
    window.removeEventListener('pointerdown', handler)
    window.removeEventListener('pointerdown', trackPointer)
    window.removeEventListener('pointermove', trackPointer)
    window.removeEventListener('calendar:success', onSuccess)
  }
}
