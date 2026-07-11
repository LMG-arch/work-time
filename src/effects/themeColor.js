// 主题色读取：让 canvas 效果跟随当前主题，绝不写死颜色。
// - cssVar(): 直接读 CSS 变量（如 --accent）
// - resolveColor(): 把 color-mix() / 任意 CSS 颜色表达式解析为 rgb(a) 字符串，供 canvas 使用
//   利用一个隐藏 probe 元素 + getComputedStyle，浏览器负责把 color-mix 算成最终色值。

let probe = null

function getProbe() {
  if (probe) return probe
  if (typeof document === 'undefined') return null
  probe = document.createElement('span')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.position = 'fixed'
  probe.style.left = '-9999px'
  probe.style.top = '-9999px'
  probe.style.pointerEvents = 'none'
  document.body.appendChild(probe)
  return probe
}

/** 读取 CSS 变量，失败回退 fallback */
export function cssVar(name, fallback = '') {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

/** 把任意 CSS 颜色表达式（含 color-mix）解析为 canvas 可用的 rgb(a) 字符串 */
export function resolveColor(expr, fallback = 'rgb(136,136,136)') {
  const el = getProbe()
  if (!el) return fallback
  el.style.color = ''
  // 先置一个已知值，避免读到继承色
  el.style.color = 'rgb(0,0,0)'
  el.style.color = expr
  const computed = getComputedStyle(el).color
  return computed && computed !== 'rgba(0, 0, 0, 0)' ? computed : fallback
}

/** 取当前主题主色，供效果默认着色 */
export function themeAccent(fallback = 'rgb(120,160,255)') {
  return resolveColor('var(--accent, #78a0ff)', fallback)
}
