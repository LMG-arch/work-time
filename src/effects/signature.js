// Phase 4 — 招牌瞬间（事件驱动的「记忆点」）
// 一个统一的 canvas 效果对象，挂在 EffectLayer 全局画布上：
//   1) 主题切换绽放过场 —— 监听 body[data-theme] 变化，在屏幕中心绽放一圈辉光环（主题主色）
//   2) 花瓣飘落庆祝 —— triggerCelebration(days) / window.__celebrate(days) / calendar:celebrate 事件触发，
//      花瓣从顶部飘落，密度随里程碑（7/30/100 天）递增
//
// 全部复用 Phase 0 的 effectRegistry + EffectLoop（单一 RAF），受 premium 总开关与
// prefers-reduced-motion 守卫（EffectLayer.isActive 已代为拦截循环启停）。

import { effectRegistry } from './registry'
import { themeAccent } from './themeColor'
import { prefersReducedMotion } from './useReducedMotion'
import { useAppStore } from '../stores/appStore'

/* ---------- 工具 ---------- */

// "rgb(r, g, b)" / "rgba(...)" -> { r, g, b }
function parseRGB(str) {
  const m = String(str).match(/(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/)
  if (!m) return { r: 120, g: 160, b: 255 }
  return { r: +m[1], g: +m[2], b: +m[3] }
}

function rgba(c, a) {
  return `rgba(${c.r},${c.g},${c.b},${a})`
}

// 强度档位：low / high 直接取，auto 按核心数与屏宽自适应（与 ambient 一致）
function resolveIntensity() {
  const pref = (useAppStore().premium && useAppStore().premium.intensity) || 'auto'
  if (pref === 'low') return 0.5
  if (pref === 'high') return 1.5
  const cores = navigator.hardwareConcurrency || 4
  const small = Math.min(window.innerWidth, window.innerHeight) < 600
  return cores <= 4 || small ? 0.6 : 1
}

/* ---------- 模块级触发入口（供外部调用） ---------- */

let active = null

/** 主题切换绽放：中心辉光环（无需参数，自动取屏幕中心 + 当前主题色） */
export function triggerBloom() {
  if (active) active.bloom()
}

/** 花瓣庆祝：days 越大密度越高（7 轻 / 30 中 / 100 重） */
export function triggerCelebration(days) {
  if (active) active.celebrate(days || 1)
}

/* ---------- 安装 ---------- */

export function installSignature() {
  const appStore = useAppStore()

  const blooms = [] // { x, y, t, life, c:{r,g,b} }
  const petals = [] // 庆祝花瓣
  let lastTheme = document.body.getAttribute('data-theme') || ''

  const accentRGB = () => parseRGB(themeAccent())

  /* 1) 主题切换绽放 */
  function bloom() {
    if (appStore.premium?.enabled === false) return
    if (prefersReducedMotion()) return
    blooms.push({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      t: 0,
      life: 0.9,
      c: accentRGB(),
    })
  }

  /* 2) 花瓣庆祝 */
  function makePetal(w, h, c, stagger) {
    return {
      x: Math.random() * w,
      y: stagger ? -Math.random() * h * 1.1 : -12,
      size: 4 + Math.random() * 5,
      vy: 60 + Math.random() * 80,
      sway: 20 + Math.random() * 40,
      swaySpeed: 1 + Math.random() * 1.6,
      phase: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 2.4,
      alpha: 0.6 + Math.random() * 0.4,
      c,
    }
  }

  function celebrate(days) {
    if (appStore.premium?.enabled === false) return
    if (prefersReducedMotion()) return
    const w = window.innerWidth
    const h = window.innerHeight
    const base = days >= 100 ? 90 : days >= 30 ? 54 : days >= 7 ? 30 : 16
    const n = Math.max(8, Math.round(base * resolveIntensity()))
    const palette = [
      { r: 255, g: 160, b: 200 },
      { r: 255, g: 210, b: 120 },
      { r: 255, g: 255, b: 255 },
      { r: 180, g: 200, b: 255 },
      accentRGB(),
    ]
    for (let i = 0; i < n; i++) {
      petals.push(makePetal(w, h, palette[(Math.random() * palette.length) | 0], true))
    }
  }

  /* ---------- 绘制 ---------- */

  function drawBlooms(ctx, env) {
    for (let i = blooms.length - 1; i >= 0; i--) {
      const b = blooms[i]
      b.t += env.dt
      const p = b.t / b.life
      if (p >= 1) {
        blooms.splice(i, 1)
        continue
      }
      const maxR = Math.max(env.w, env.h) * 0.55
      const r = maxR * (1 - Math.pow(1 - p, 3)) // easeOutCubic
      const a = (1 - p) * 0.9
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r)
      g.addColorStop(0, rgba(b.c, a * 0.3))
      g.addColorStop(0.65, rgba(b.c, a * 0.1))
      g.addColorStop(1, rgba(b.c, 0))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.lineWidth = 2 + (1 - p) * 3
      ctx.strokeStyle = rgba(b.c, a)
      ctx.beginPath()
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
  }

  function drawPetals(ctx, env) {
    const { w, h, dt } = env
    for (let i = petals.length - 1; i >= 0; i--) {
      const p = petals[i]
      p.phase += p.swaySpeed * dt
      p.y += p.vy * dt
      p.x += Math.sin(p.phase) * p.sway * dt
      p.rot += p.rotSpeed * dt
      if (p.y > h + 20) {
        petals.splice(i, 1)
        continue
      }
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha))
      ctx.fillStyle = rgba(p.c, 1)
      ctx.beginPath()
      ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  /* ---------- 单一效果对象 ---------- */

  const effect = {
    resize() {},
    draw(ctx, env) {
      drawBlooms(ctx, env)
      drawPetals(ctx, env)
    },
    dispose() {},
  }
  const unregister = effectRegistry.register(effect)

  // 主题变化 -> 绽放（忽略挂载时的初次设定）
  const mo = new MutationObserver(() => {
    const now = document.body.getAttribute('data-theme') || ''
    if (now && now !== lastTheme) {
      lastTheme = now
      bloom()
    }
  })
  mo.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] })

  // 显式庆祝事件
  const onCelebrate = (e) => {
    const d = (e && e.detail) || {}
    celebrate((d.days) || 1)
  }
  window.addEventListener('calendar:celebrate', onCelebrate)

  // 便捷全局钩子，供业务在里程碑（7/30/100 天连续打卡）处调用
  window.__celebrate = (days) => celebrate(days || 1)

  active = { bloom, celebrate }

  return function uninstall() {
    unregister()
    mo.disconnect()
    window.removeEventListener('calendar:celebrate', onCelebrate)
    delete window.__celebrate
    active = null
  }
}
