<script setup>
import { computed } from 'vue'

// 空状态品牌插画：手绘风 SVG，随主题换色（currentColor = --text3，高亮 = --accent）
// 三种意象：star 星海 / sprout 苗 / calendar 日历拟人
const props = defineProps({
  variant: { type: String, default: 'star' }, // 'star' | 'sprout' | 'calendar'
  size: { type: [Number, String], default: 110 },
  label: { type: String, default: '' },
})

const accentFill = computed(() => 'var(--accent)')
</script>

<template>
  <div class="empty-illustration" :style="{ width: size + 'px' }">
    <svg
      class="ei-svg"
      :class="'ei-' + variant"
      viewBox="0 0 120 120"
      :width="size"
      :height="size"
      role="img"
      :aria-label="label || variant"
    >
      <!-- 星海：中央四角星 + 环抱星点 + 底部 accent 波纹 -->
      <g v-if="variant === 'star'" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M60 20 L66 46 L90 52 L66 58 L60 84 L54 58 L30 52 L54 46 Z" :fill="accentFill" fill-opacity="0.18" />
        <circle cx="60" cy="30" r="2.4" fill="currentColor" stroke="none" class="ei-twinkle" />
        <circle cx="93" cy="42" r="1.8" fill="currentColor" stroke="none" class="ei-twinkle2" />
        <circle cx="27" cy="46" r="1.8" fill="currentColor" stroke="none" class="ei-twinkle2" />
        <path d="M22 88 q14 -11 24 0 t24 0 t24 0" :stroke="accentFill" stroke-opacity="0.55" />
      </g>

      <!-- 苗：土丘 + 茎 + 双叶，象征生长 -->
      <g v-else-if="variant === 'sprout'" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 94 q38 -18 76 0" :stroke="accentFill" stroke-opacity="0.5" />
        <path d="M60 94 L60 56" />
        <path d="M60 72 q-19 -1 -24 -19 q19 1 24 15 Z" :fill="accentFill" fill-opacity="0.22" />
        <path d="M60 66 q19 -1 24 -19 q-19 1 -24 15 Z" :fill="accentFill" fill-opacity="0.22" />
      </g>

      <!-- 日历拟人：圆角页 + 装订环 + 两点眼 + 微笑 -->
      <g v-else fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <rect x="32" y="32" width="56" height="60" rx="11" :fill="accentFill" fill-opacity="0.12" />
        <line x1="44" y1="32" x2="44" y2="22" :stroke="accentFill" />
        <line x1="76" y1="32" x2="76" y2="22" :stroke="accentFill" />
        <line x1="40" y1="44" x2="80" y2="44" :stroke="accentFill" stroke-opacity="0.4" />
        <circle cx="52" cy="60" r="2.6" fill="currentColor" stroke="none" />
        <circle cx="68" cy="60" r="2.6" fill="currentColor" stroke="none" />
        <path d="M52 73 q8 8 16 0" />
      </g>
    </svg>
    <div v-if="label" class="ei-label">{{ label }}</div>
  </div>
</template>

<style scoped>
.empty-illustration {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin: 0 auto;
  color: var(--text3);
  user-select: none;
}
.ei-svg {
  overflow: visible;
}
.ei-label {
  font-size: 13px;
  color: var(--text3);
  opacity: 0.85;
  letter-spacing: 0.5px;
  font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif);
}

@keyframes ei-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes ei-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }

@media (prefers-reduced-motion: no-preference) {
  .ei-svg { animation: ei-float 4.2s ease-in-out infinite; }
  .ei-twinkle { animation: ei-pulse 2.6s ease-in-out infinite; }
  .ei-twinkle2 { animation: ei-pulse 3.4s ease-in-out infinite 0.6s; }
}
</style>
