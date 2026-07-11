<script setup>
import { computed } from 'vue'

// 统计环形月览：SVG 甜甜圈，按状态占比分段着色（主题感知），中心显示已记录天数。
const props = defineProps({
  segments: { type: Array, required: true }, // [{ label, value, color }]
  centerValue: { type: [String, Number], default: '' },
  centerLabel: { type: String, default: '' },
  size: { type: Number, default: 168 },
  stroke: { type: Number, default: 18 },
})

const radius = computed(() => (props.size - props.stroke) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const total = computed(() => props.segments.reduce((s, x) => s + (x.value || 0), 0))

const arcs = computed(() => {
  let acc = 0
  const gap = total.value > 0 ? 2 : 0 // 段间留白，更精致
  return props.segments
    .filter((s) => s.value > 0)
    .map((seg) => {
      const frac = seg.value / total.value
      const len = Math.max(0, frac * circumference.value - gap)
      const offset = -acc
      acc += frac * circumference.value
      return { ...seg, len, offset }
    })
})
</script>

<template>
  <div class="stats-ring" :style="{ width: size + 'px', height: size + 'px' }" role="img"
       :aria-label="`状态占比环形图，共 ${centerValue} 天`">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" class="ring-svg">
      <circle :cx="size / 2" :cy="size / 2" :r="radius" class="ring-track"
              :stroke-width="stroke" fill="none" />
      <g :transform="`rotate(-90 ${size / 2} ${size / 2})`">
        <circle v-for="a in arcs" :key="a.label"
                :cx="size / 2" :cy="size / 2" :r="radius"
                :stroke="a.color" :stroke-width="stroke" fill="none"
                stroke-linecap="round"
                :stroke-dasharray="`${a.len} ${circumference - a.len}`"
                :stroke-dashoffset="a.offset"
                class="ring-arc" />
      </g>
      <text :x="size / 2" :y="size / 2 - 3" text-anchor="middle" class="ring-center-num">{{ centerValue }}</text>
      <text :x="size / 2" :y="size / 2 + 16" text-anchor="middle" class="ring-center-label">{{ centerLabel }}</text>
    </svg>
  </div>
</template>

<style scoped>
.stats-ring {
  position: relative;
  filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.12));
}
.ring-svg {
  display: block;
  animation: ring-pop 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.ring-track {
  stroke: color-mix(in srgb, var(--text3) 22%, transparent);
}
.ring-arc {
  transition: stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease;
}
.ring-center-num {
  font-size: 30px;
  font-weight: 700;
  fill: var(--text);
  font-variant-numeric: tabular-nums;
}
.ring-center-label {
  font-size: 11px;
  fill: var(--text3);
}
@keyframes ring-pop {
  from { opacity: 0; transform: scale(0.9); }
  to   { opacity: 1; transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .ring-svg { animation: none; }
  .ring-arc { transition: none; }
}
</style>
