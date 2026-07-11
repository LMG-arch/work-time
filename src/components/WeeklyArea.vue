<script setup>
import { computed } from 'vue'

// 每周面积图：绘制当月每日「忙闲密度」的平滑面积曲线，按周划分网格线。
const props = defineProps({
  series: { type: Array, required: true }, // [{ day, score }]
  weeks: { type: Number, default: 5 },
  height: { type: Number, default: 120 },
})

const W = 320
const H = computed(() => props.height)
const pad = 10
const maxScore = computed(() => Math.max(1, ...props.series.map((s) => s.score)))
const n = computed(() => props.series.length)

const pts = computed(() =>
  props.series.map((s, i) => {
    const x = n.value <= 1 ? W / 2 : pad + (i / (n.value - 1)) * (W - 2 * pad)
    const y = H.value - pad - (s.score / maxScore.value) * (H.value - 2 * pad - 6)
    return { x, y }
  }),
)

const linePath = computed(() => {
  const p = pts.value
  if (p.length === 0) return ''
  if (p.length === 1) return `M ${p[0].x} ${p[0].y} L ${p[0].x} ${p[0].y}`
  let d = `M ${p[0].x} ${p[0].y}`
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i]
    const b = p[i + 1]
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    d += ` Q ${a.x} ${a.y} ${mx} ${my}`
  }
  const last = p[p.length - 1]
  d += ` T ${last.x} ${last.y}`
  return d
})

const areaPath = computed(() => {
  const p = pts.value
  if (p.length === 0) return ''
  return `${linePath.value} L ${p[p.length - 1].x} ${H.value - pad} L ${p[0].x} ${H.value - pad} Z`
})

const weekLines = computed(() => {
  const lines = []
  for (let w = 1; w < props.weeks; w++) {
    lines.push(pad + (w / props.weeks) * (W - 2 * pad))
  }
  return lines
})
</script>

<template>
  <div class="weekly-area">
    <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="area-svg">
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.40" />
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <line v-for="(x, i) in weekLines" :key="'w' + i"
            :x1="x" :y1="pad" :x2="x" :y2="H - pad"
            class="area-week" vector-effect="non-scaling-stroke" />
      <path :d="areaPath" fill="url(#areaFill)" class="area-fill" />
      <path :d="linePath" fill="none" stroke="var(--accent)" stroke-width="2"
            vector-effect="non-scaling-stroke" pathLength="1" class="area-line" />
    </svg>
  </div>
</template>

<style scoped>
.weekly-area {
  width: 100%;
}
.area-svg {
  width: 100%;
  height: v-bind('H + "px"');
  display: block;
  overflow: visible;
}
.area-week {
  stroke: color-mix(in srgb, var(--text3) 30%, transparent);
  stroke-width: 1;
  stroke-dasharray: 2 3;
}
.area-fill {
  animation: area-fade 0.9s ease both;
}
.area-line {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: area-draw 1.1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
@keyframes area-draw {
  to { stroke-dashoffset: 0; }
}
@keyframes area-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .area-line { animation: none; stroke-dashoffset: 0; }
  .area-fill { animation: none; }
}
</style>
