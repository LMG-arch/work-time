<script setup>
// Phase 4 — 启动闪屏（招牌瞬间 #3）
// 全屏 LOGO + 星海汇聚：SVG 描边绘制动画（stroke-dashoffset）+ 星点从外围收束到中心。
// - 受 premium 总开关与 prefers-reduced-motion 守卫：关闭时降级为极简（仅 LOGO，无汇聚/绘制动画，更短时长）
// - 自动隐藏（≤1.2s），点击 / Esc 可跳过
// - 由父级 App.vue 通过 visible 控制显隐，并在「从托盘唤醒」（visibilitychange）时重播

import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { prefersReducedMotion } from '../effects/useReducedMotion'
import { useAppStore } from '../stores/appStore'
import { themeAccent } from '../effects/themeColor'

const props = defineProps({ visible: { type: Boolean, default: false } })
const emit = defineEmits(['done'])

const appStore = useAppStore()
const reduced = prefersReducedMotion()

// 是否启用完整动画（premium 关闭或 reduced-motion 时降级为极简）
const animated = computed(() => appStore.premium?.enabled !== false && !reduced)

const accent = ref(themeAccent())
const stars = ref([])

function buildStars() {
  const arr = []
  const n = animated.value ? 26 : 0
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2
    const dist = 150 + Math.random() * 190
    arr.push({
      x: Math.cos(ang) * dist,
      y: Math.sin(ang) * dist,
      size: 1.5 + Math.random() * 2.5,
      delay: (Math.random() * 0.5).toFixed(2),
      dur: (0.9 + Math.random() * 0.6).toFixed(2),
    })
  }
  stars.value = arr
}

let timer = null

function finish() {
  emit('done')
}

function start() {
  buildStars()
  const dur = reduced ? 360 : appStore.premium?.enabled === false ? 360 : 1200
  clearTimeout(timer)
  timer = setTimeout(finish, dur)
}

function skip() {
  clearTimeout(timer)
  finish()
}

watch(
  () => props.visible,
  (v) => {
    if (v) start()
  }
)

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <Teleport to="body">
    <transition name="splash-fade">
      <div
        v-if="visible"
        class="splash"
        :class="{ animated }"
        tabindex="0"
        aria-label="启动中"
        @click="skip"
        @keydown.esc="skip"
      >
        <div class="splash-stage">
          <span
            v-for="(s, i) in stars"
            :key="i"
            class="splash-star"
            :style="{
              '--sx': s.x + 'px',
              '--sy': s.y + 'px',
              '--sd': s.delay + 's',
              '--sdu': s.dur + 's',
              width: s.size + 'px',
              height: s.size + 'px',
            }"
          ></span>

          <svg class="splash-logo" viewBox="0 0 120 120" fill="none" aria-hidden="true">
            <circle class="logo-ring" cx="60" cy="60" r="46" :stroke="accent" stroke-width="3" stroke-linecap="round" />
            <path
              class="logo-star"
              d="M60 30 L68 52 L92 52 L72 66 L80 90 L60 74 L40 90 L48 66 L28 52 L52 52 Z"
              :stroke="accent"
              stroke-width="3"
              stroke-linejoin="round"
            />
          </svg>

          <div class="splash-title">上班日历</div>
          <div class="splash-sub">WORK CALENDAR</div>
        </div>
        <div class="splash-hint" v-if="animated">点击任意处跳过</div>
      </div>
    </transition>
  </Teleport>
</template>
