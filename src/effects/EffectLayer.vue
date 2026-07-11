<script setup>
// 全局效果层：一块铺满视口的 canvas，挂在 <body> 下（Teleport），
// pointer-events:none 让它永远不挡交互。所有视觉特效都画在这里，不污染业务 DOM。
// 仅当「效果已开启 + 非 reduced-motion + 有活跃效果」时才让 RAF 循环运行，空闲即静默。

import { ref, onMounted, onBeforeUnmount } from 'vue'
import { EffectLoop } from '../effects/EffectLoop'
import { effectRegistry } from '../effects/registry'
import { prefersReducedMotion } from '../effects/useReducedMotion'
import { useAppStore } from '../stores/appStore'

const appStore = useAppStore()
const canvas = ref(null)
let ctx = null
let unsubLoop = null

function isActive() {
  return appStore.premium?.enabled !== false && !prefersReducedMotion()
}

function resize() {
  const c = canvas.value
  if (!c) return
  const dpr = EffectLoop.dpr
  c.width = Math.floor(window.innerWidth * dpr)
  c.height = Math.floor(window.innerHeight * dpr)
  c.style.width = window.innerWidth + 'px'
  c.style.height = window.innerHeight + 'px'
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function render(dt, now) {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
  const env = { w: window.innerWidth, h: window.innerHeight, dt, now }
  for (const effect of effectRegistry.effects) {
    if (effect.resize) effect.resize(env)
    if (effect.draw) effect.draw(ctx, env)
  }
}

function sync() {
  const shouldRun = isActive() && effectRegistry.size > 0
  if (shouldRun && !unsubLoop) {
    unsubLoop = EffectLoop.subscribe(render)
  } else if (!shouldRun && unsubLoop) {
    unsubLoop()
    unsubLoop = null
    if (ctx) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
  }
}

onMounted(() => {
  ctx = canvas.value.getContext('2d')
  resize()
  window.addEventListener('resize', resize)
  effectRegistry.listen(sync)
  // 设置项或主题开关变化时重新评估是否运行
  appStore.$subscribe(sync)
  sync()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  if (unsubLoop) unsubLoop()
  unsubLoop = null
})
</script>

<template>
  <Teleport to="body">
    <canvas ref="canvas" class="effect-layer" aria-hidden="true"></canvas>
  </Teleport>
</template>

<style scoped>
.effect-layer {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 9999;
}
</style>
