// Phase 3 — 氛围与生命感
// 一个统一的 canvas 效果对象，挂在 EffectLayer 的全局画布上：
//   1) 鼠标视差驱动器：把归一化指针位置写成 CSS 变量 --px / --py（背景辉光层消费它做位移）
//   2) 光标辉光拖尾：记录近期指针轨迹，渐隐绘制（上限 18 点）
//   3) 节气粒子：依月份切换 雪 / 星尘 / 花瓣 / 落叶，主题色感知、数量自适应屏宽、DPR≤2
//
// 全部复用 Phase 0 的 effectRegistry + EffectLoop（单一 RAF），受 premium 总开关与
// prefers-reduced-motion 守卫（EffectLayer.isActive 已代为拦截循环启停）。

import { effectRegistry } from './registry'
import { themeAccent, cssVar } from './themeColor'
import { useAppStore } from '../stores/appStore'

/* ---------- 工具 ---------- */

// "rgb(r, g, b)" / "rgba(...)" -> { r, g, b }
function parseRGB(str) {
  const m = String(str).match(/(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/)
  if (!m) return { r: 150, g: 160, b: 180 }
  return { r: +m[1], g: +m[2], b: +m[3] }
}

// 强度档位：low / high 直接取，auto 按核心数与屏宽自适应
function resolveIntensity() {
  const pref = (useAppStore().premium && useAppStore().premium.intensity) || 'auto'
  if (pref === 'low') return 0.5
  if (pref === 'high') return 1.5
  const cores = navigator.hardwareConcurrency || 4
  const small = Math.min(window.innerWidth, window.innerHeight) < 600
  return cores <= 4 || small ? 0.6 : 1
}

// 月份 -> 季节（北半球）
function getSeason(month = new Date().getMonth()) {
  if (month === 11 || month <= 1) return 'winter'
  if (month <= 4) return 'spring'
  if (month <= 7) return 'summer'
  return 'autumn'
}

const SEASON_LABEL = { winter: '雪', summer: '星尘', spring: '花瓣', autumn: '落叶' }

/* ---------- 安装 ---------- */

export function installAmbient() {
  const appStore = useAppStore()

  // 归一化指针（-1..1，中心为 0），cur 为平滑后的当前值
  let targetX = 0, targetY = 0
  let curX = 0, curY = 0
  let lastX = 0, lastY = 0
  let hasPointer = false

  let trail = []
  let particles = []
  let lastW = 0, lastH = 0
  let intensity = resolveIntensity()
  let lastIntensity = intensity

  let accentRGB = parseRGB(themeAccent())
  let snowRGB = parseRGB(cssVar('--text3', 'rgb(150,160,180)'))
  let season = getSeason()

  /* 主题切换时刷新配色 + 季节 + 重染现有粒子 */
  const mo = new MutationObserver(() => {
    accentRGB = parseRGB(themeAccent())
    snowRGB = parseRGB(cssVar('--text3', 'rgb(150,160,180)'))
    season = getSeason()
    for (const p of particles) p.color = colorForSeason()
  })
  mo.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] })

  /* 指针采样（与拖尾/视差同 RAF 节流，这里只记录 target 与最近坐标） */
  const onMove = (e) => {
    if (e.pointerType === 'touch') {
      hasPointer = false
      return
    }
    const vw = window.innerWidth, vh = window.innerHeight
    targetX = (e.clientX / vw) * 2 - 1
    targetY = (e.clientY / vh) * 2 - 1
    lastX = e.clientX
    lastY = e.clientY
    hasPointer = true
  }
  const onLeave = () => { hasPointer = false }
  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('pointerout', (e) => { if (!e.relatedTarget) onLeave() }, { passive: true })
  window.addEventListener('blur', onLeave)

  /* ---------- 粒子 ---------- */

  function colorForSeason() {
    if (season === 'summer') return `rgb(${accentRGB.r},${accentRGB.g},${accentRGB.b})`
    if (season === 'spring') return 'rgb(255,160,200)'
    if (season === 'autumn') return 'rgb(225,160,70)'
    return `rgb(${snowRGB.r},${snowRGB.g},${snowRGB.b})`
  }

  function makeParticle(w, h, randomY) {
    const p = {
      x: Math.random() * w,
      y: randomY ? Math.random() * h : -12,
      size: 2 + Math.random() * 2.5,
      vy: 10 + Math.random() * 22,
      sway: 6 + Math.random() * 14,
      swaySpeed: 0.4 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 1.2,
      alpha: 0.35 + Math.random() * 0.4,
    }
    if (season === 'summer') { p.vy = (Math.random() - 0.5) * 8; p.size = 1 + Math.random() * 1.6 }
    else if (season === 'winter') { p.size = 1.5 + Math.random() * 2.5; p.vy = 8 + Math.random() * 16 }
    else if (season === 'spring') { p.size = 2 + Math.random() * 2.5; p.vy = 12 + Math.random() * 18 }
    else { p.size = 2.5 + Math.random() * 3; p.vy = 14 + Math.random() * 20 } // autumn
    p.color = colorForSeason()
    return p
  }

  function initParticles(w, h) {
    const n = Math.round(Math.min(Math.max(Math.round(w / 16), 24), 70) * intensity)
    particles = []
    for (let i = 0; i < n; i++) particles.push(makeParticle(w, h, true))
  }

  function drawParticles(ctx, env) {
    const { w, h, dt } = env
    for (const p of particles) {
      p.phase += p.swaySpeed * dt
      p.y += p.vy * dt
      p.x += (season === 'summer' ? Math.cos(p.phase) : Math.sin(p.phase)) * p.sway * dt
      p.rot += p.rotSpeed * dt

      // 环绕回收
      if (p.y > h + 14) { p.y = -14; p.x = Math.random() * w }
      if (p.y < -24) { p.y = h + 14; p.x = Math.random() * w }
      if (p.x < -24) p.x = w + 14
      if (p.x > w + 24) p.x = -24

      let a = p.alpha
      if (season === 'summer') a = p.alpha * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(p.phase * 1.3)))

      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.globalAlpha = Math.max(0, Math.min(1, a))
      ctx.fillStyle = p.color
      if (season === 'winter') {
        ctx.beginPath()
        ctx.arc(0, 0, p.size, 0, Math.PI * 2)
        ctx.fill()
      } else if (season === 'summer') {
        // 星尘：细十字微光
        ctx.fillRect(-p.size, -0.5, p.size * 2, 1)
        ctx.fillRect(-0.5, -p.size, 1, p.size * 2)
      } else {
        // 花瓣 / 落叶：椭圆
        ctx.beginPath()
        ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
  }

  /* ---------- 单一效果对象 ---------- */

  const effect = {
    resize(env) {
      if (env.w !== lastW || env.h !== lastH || particles.length === 0) {
        lastW = env.w
        lastH = env.h
        initParticles(env.w, env.h)
      }
    },
    draw(ctx, env) {
      // 强度档位变化 -> 重新生粒子
      if (Math.abs(intensity - lastIntensity) > 0.001) {
        lastIntensity = intensity
        initParticles(env.w, env.h)
      }

      // 指针平滑跟随（指数缓动，帧率无关）
      const k = 1 - Math.exp(-env.dt * 8)
      curX += (targetX - curX) * k
      curY += (targetY - curY) * k
      const root = document.documentElement
      root.style.setProperty('--px', curX.toFixed(4))
      root.style.setProperty('--py', curY.toFixed(4))

      // 光标辉光拖尾
      if (hasPointer) trail.push({ x: lastX, y: lastY, life: 1 })
      while (trail.length > 18) trail.shift()
      for (const t of trail) t.life -= env.dt * 1.6
      trail = trail.filter((t) => t.life > 0)

      if (trail.length) {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        for (const t of trail) {
          const r = 4 + (1 - t.life) * 12
          const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, r)
          const c = `${accentRGB.r},${accentRGB.g},${accentRGB.b}`
          g.addColorStop(0, `rgba(${c},${(t.life * 0.28).toFixed(3)})`)
          g.addColorStop(1, `rgba(${c},0)`)
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(t.x, t.y, r, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }

      // 节气粒子
      drawParticles(ctx, env)
    },
    dispose() {
      mo.disconnect()
    },
  }

  const unregister = effectRegistry.register(effect)

  // premium 关闭时复位视差变量（避免背景辉光停在偏移位置）
  const unsubApp = appStore.$subscribe(() => {
    intensity = resolveIntensity()
    if (appStore.premium && appStore.premium.enabled === false) {
      document.documentElement.style.setProperty('--px', '0')
      document.documentElement.style.setProperty('--py', '0')
    }
  })

  return function uninstall() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerout', onLeave)
    window.removeEventListener('blur', onLeave)
    if (unsubApp) unsubApp()
    unregister()
    document.documentElement.style.setProperty('--px', '0')
    document.documentElement.style.setProperty('--py', '0')
  }
}
