// 单一 requestAnimationFrame 调度器
// 所有 canvas 类效果（光标拖尾 / 节气粒子 / 花瓣 / 视差）都通过 subscribe 接入这唯一的循环，
// 避免多个 RAF 抢占主线程，统一处理「标签页隐藏时暂停」「DPR 上限」等横切关注点。

const subscribers = new Set()
let rafId = null
let lastTime = 0
let running = false

function frame(now) {
  const dt = lastTime ? (now - lastTime) / 1000 : 0
  lastTime = now
  // 复制一份避免回调中增删 subscriber 导致迭代异常
  for (const cb of [...subscribers]) {
    try {
      cb(dt, now)
    } catch (err) {
      console.error('[EffectLoop] subscriber error:', err)
    }
  }
  rafId = requestAnimationFrame(frame)
}

function start() {
  if (running) return
  running = true
  lastTime = 0
  rafId = requestAnimationFrame(frame)
}

function stop() {
  running = false
  if (rafId) cancelAnimationFrame(rafId)
  rafId = null
}

/**
 * 注册一帧回调。返回取消订阅函数。
 * @param {(dt:number, now:number)=>void} cb dt 为秒级增量，now 为 performance.now()
 */
export function subscribe(cb) {
  subscribers.add(cb)
  start()
  return () => {
    subscribers.delete(cb)
    if (subscribers.size === 0) stop()
  }
}

// 标签页不可见时暂停，回来再恢复（省电、避免后台空转）
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop()
    else if (subscribers.size > 0) start()
  })
}

export const EffectLoop = {
  subscribe,
  start,
  stop,
  /** 设备像素比上限（高 DPR 屏限制到 2，避免 3x/4x 下 canvas 像素爆炸掉帧） */
  get dpr() {
    return Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2)
  },
  get running() {
    return running
  },
}
