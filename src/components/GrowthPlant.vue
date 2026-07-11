<script setup>
import { computed } from 'vue'

// 连续打卡成长苗：随连续天数生长 —— 种子 → 嫩芽 → 小苗 → 灌木 → 树 → 满树花开（里程碑换形态）。
const props = defineProps({
  streak: { type: Number, default: 0 },
})

const LEVELS = ['播下种子', '破土嫩芽', '茁壮小苗', '繁茂灌木', '亭亭绿树', '满树繁花']
const stage = computed(() => {
  const s = props.streak
  if (s <= 0) return 0
  if (s <= 2) return 1
  if (s <= 6) return 2
  if (s <= 20) return 3
  if (s <= 49) return 4
  return 5
})
const caption = computed(() => LEVELS[stage.value])
</script>

<template>
  <div class="growth-plant" :data-stage="stage">
    <svg viewBox="0 0 120 150" class="plant-svg" role="img"
         :aria-label="`连续打卡 ${streak} 天，${caption}`">
      <!-- 花盆（静态） -->
      <g class="plant-pot">
        <path d="M40 112 L80 112 L74 140 L46 140 Z" class="pot" />
        <rect x="36" y="104" width="48" height="11" rx="3" class="pot-rim" />
        <ellipse cx="60" cy="112" rx="24" ry="4.5" class="soil" />
      </g>

      <!-- 植被（随阶段生长 + 轻摆） -->
      <g class="foliage">
        <!-- 0 种子 -->
        <ellipse v-if="stage === 0" cx="60" cy="108" rx="5.5" ry="3.6" class="seed" />

        <!-- 1 嫩芽 -->
        <template v-if="stage === 1">
          <path d="M60 112 C60 102 60 94 60 86" class="stem" />
          <path d="M60 92 C50 90 44 82 46 74 C54 76 60 84 60 92 Z" class="leaf" />
          <path d="M60 88 C70 86 76 78 74 70 C66 72 60 80 60 88 Z" class="leaf" />
        </template>

        <!-- 2 小苗 -->
        <template v-else-if="stage === 2">
          <path d="M60 112 C60 96 60 84 60 70" class="stem" />
          <path d="M60 86 C48 84 40 74 43 64 C53 67 60 77 60 86 Z" class="leaf" />
          <path d="M60 82 C72 80 80 70 77 60 C67 63 60 73 60 82 Z" class="leaf" />
          <path d="M60 100 C50 98 44 90 46 82 C54 85 60 92 60 100 Z" class="leaf" />
          <path d="M60 96 C70 94 76 86 74 78 C66 81 60 88 60 96 Z" class="leaf" />
        </template>

        <!-- 3 灌木 -->
        <template v-else-if="stage === 3">
          <path d="M60 112 C60 92 60 78 60 58" class="stem" />
          <path d="M60 80 C71 78 80 71 82 60" class="branch" />
          <path d="M60 86 C49 84 40 78 38 67" class="branch" />
          <path d="M60 70 C72 68 82 62 86 52" class="branch" />
          <path d="M60 74 C48 72 38 66 34 56" class="branch" />
          <circle cx="60" cy="54" r="11" class="leaf-blob" />
          <circle cx="82" cy="56" r="9" class="leaf-blob" />
          <circle cx="38" cy="62" r="9" class="leaf-blob" />
          <circle cx="86" cy="48" r="7" class="leaf-blob" />
          <circle cx="34" cy="52" r="7" class="leaf-blob" />
        </template>

        <!-- 4 树 -->
        <template v-else-if="stage === 4">
          <rect x="55" y="70" width="9" height="42" rx="3" class="trunk" />
          <circle cx="60" cy="54" r="27" class="canopy" />
          <circle cx="42" cy="64" r="18" class="canopy" />
          <circle cx="78" cy="64" r="18" class="canopy" />
        </template>

        <!-- 5 满树繁花 -->
        <template v-else>
          <rect x="53" y="66" width="13" height="46" rx="4" class="trunk" />
          <circle cx="60" cy="46" r="36" class="canopy" />
          <circle cx="34" cy="60" r="23" class="canopy" />
          <circle cx="86" cy="60" r="23" class="canopy" />
          <circle cx="60" cy="26" r="19" class="canopy" />
          <circle cx="44" cy="40" r="4" class="blossom" />
          <circle cx="74" cy="38" r="4" class="blossom" />
          <circle cx="60" cy="58" r="4" class="blossom" />
          <circle cx="38" cy="64" r="3.5" class="blossom" />
          <circle cx="82" cy="64" r="3.5" class="blossom" />
          <circle cx="58" cy="30" r="3.5" class="blossom" />
        </template>
      </g>
    </svg>
    <div class="plant-caption">
      <span class="plant-count">{{ streak }}</span>
      <span class="plant-unit">天连续打卡</span>
    </div>
    <div class="plant-stage">{{ caption }}</div>
  </div>
</template>

<style scoped>
.growth-plant {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  user-select: none;
}
.plant-svg {
  width: 132px;
  height: 165px;
  overflow: visible;
}
.plant-pot .pot {
  fill: color-mix(in srgb, var(--accent) 32%, #8d6e63);
}
.plant-pot .pot-rim {
  fill: color-mix(in srgb, var(--accent) 42%, #a1887f);
}
.plant-pot .soil {
  fill: #4e342e;
}
.foliage {
  transform-box: view-box;
  transform-origin: 60px 112px;
  animation: plant-grow 0.7s cubic-bezier(0.16, 1, 0.3, 1) both,
             plant-sway 6s ease-in-out 0.7s infinite;
}
.stem, .branch { fill: none; stroke: color-mix(in srgb, #6d4c41, var(--accent) 18%); stroke-width: 3.4; stroke-linecap: round; }
.trunk { fill: color-mix(in srgb, #6d4c41, var(--accent) 18%); }
.leaf, .leaf-blob { fill: color-mix(in srgb, #2faa4f, var(--accent) 22%); }
.canopy { fill: color-mix(in srgb, #2faa4f, var(--accent) 18%); }
.seed { fill: color-mix(in srgb, #8d6e63, var(--accent) 25%); }
.blossom { fill: color-mix(in srgb, var(--accent) 55%, #ff80ab); }

.plant-caption { display: flex; align-items: baseline; gap: 4px; margin-top: -4px; }
.plant-count { font-size: 22px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
.plant-unit { font-size: 12px; color: var(--text2); }
.plant-stage { font-size: 11px; color: var(--text3); letter-spacing: 0.06em; }

@keyframes plant-grow {
  from { opacity: 0.3; transform: scale(0.5) translateY(10px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes plant-sway {
  0%, 100% { transform: rotate(-1.6deg); }
  50% { transform: rotate(1.6deg); }
}
@media (prefers-reduced-motion: reduce) {
  .foliage { animation: none; transform: none; }
}
</style>
