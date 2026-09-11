<script setup>
import { computed, onMounted, watch, ref } from 'vue'
import ReminderList from '../components/ReminderList.vue'
import ReminderHistory from '../components/ReminderHistory.vue'
import TodoViewApp from '../components/TodoViewApp.vue'
import GrowthPlant from '../components/GrowthPlant.vue'
import { useReminderStore } from '../stores/reminderStore.js'

const reminderStore = useReminderStore()

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// 打开打卡提醒设置弹窗（Vue 生命周期内绑定，避免经典 renderer.js 在页面未挂载时绑不到）
function openReminderSettings() {
  window.__openReminderSettings?.()
}
function dayHasClockin(records, date) {
  const day = records[fmtDate(date)]
  if (!day) return false
  return Object.values(day).some((r) => r && r.confirmed)
}
// 连续打卡天数：从今天往回数（今天未打卡时从昨天起算，避免未打卡前视觉断裂）。
const streak = computed(() => {
  const records = reminderStore.reminderRecords || {}
  let s = 0
  const cur = new Date()
  cur.setHours(0, 0, 0, 0)
  if (!dayHasClockin(records, cur)) cur.setDate(cur.getDate() - 1)
  while (dayHasClockin(records, cur)) {
    s++
    cur.setDate(cur.getDate() - 1)
  }
  return s
})

// v3.17.37 融合：喝水记录原由经典 reminders.js 渲染（Vue 模板只留空容器 #water-tracker，
// 数据经 window.__storage 的另一套读写）。现完整收口到 Vue：数据唯一来源 reminderStore，
// 渲染与交互全在本组件，经典实现与其 window.* 桥接一并删除。
const WATER_GOAL = 8
const waterToday = fmtDate(new Date())
const waterCount = computed(() => {
  void reminderStore.waterCount // 依赖 store 响应式计数，更新后自动重算
  const n = Number(reminderStore.getWaterCount(waterToday))
  return Number.isFinite(n) ? Math.max(0, Math.min(WATER_GOAL, n)) : 0
})
const waterProgress = computed(() => (waterCount.value / WATER_GOAL) * 100)
const waterCups = computed(() => Array.from({ length: WATER_GOAL }, (_, i) => i < waterCount.value))
function setWater(n) { reminderStore.setWaterCount(waterToday, Math.max(0, Math.min(WATER_GOAL, n))) }
function onWaterCup(idx) { setWater(idx < waterCount.value ? idx : idx + 1) }
// 里程碑庆祝：连续打卡跨过 7 / 30 / 100 天时，触发 Phase 4 花瓣庆祝（premium 守卫在 signature 内部）。
// 同时给成长苗卡片一个轻量脉冲（非 premium 也可见），形成「数据可视化 → 招牌瞬间」闭环。
const MILESTONES = [7, 30, 100]
const milestoneFlash = ref(false)
let prevSeen = null
let flashTimer = null

watch(streak, (n) => {
  if (prevSeen === null) { prevSeen = n; return } // 首次（含加载）仅记录基线，不庆祝
  if (n > prevSeen) {
    // 若一次连跨多个里程碑（理论极值，如 6→31），仅庆祝其中最高一档，避免重复撒花（M2）。
    let hit = 0
    for (const m of MILESTONES) {
      if (prevSeen < m && n >= m) hit = m
    }
    if (hit > 0) {
      window.__celebrate?.(hit)
      milestoneFlash.value = true
      clearTimeout(flashTimer)
      flashTimer = setTimeout(() => { milestoneFlash.value = false }, 1400)
    }
  }
  prevSeen = n
})

onMounted(async () => {
  try {
    await reminderStore.loadReminders()
    await reminderStore.loadRecords()
  } catch (e) { /* ignore */ }
  prevSeen = streak.value // 捕获加载后的基线，避免历史连胜在加载瞬间误触发庆祝
})
</script>

<template>
  <div class="clockin-view-content">
    <div class="clockin-header-row">
      <div class="clockin-today-label" id="clockin-today-label"></div>
      <button id="clockin-settings-btn" class="clockin-settings-btn" title="提醒设置" @click="openReminderSettings">&#x2699;</button>
    </div>
    <div class="growth-card" :class="{ 'milestone-flash': milestoneFlash }">
      <GrowthPlant :streak="streak" />
    </div>
    <ReminderList />
    <!-- v3.17.37 融合：喝水记录改为 Vue 自渲染（数据源 reminderStore，唯一写入者） -->
    <div class="water-tracker">
      <div class="water-header">
        <span class="water-title">💧 喝水记录</span>
        <span class="water-count">{{ waterCount }}/{{ WATER_GOAL }} 杯</span>
      </div>
      <div class="water-progress-bar">
        <div class="water-progress-fill" :style="{ width: waterProgress + '%' }"></div>
      </div>
      <div class="water-cups">
        <span v-for="(filled, i) in waterCups" :key="i" class="water-cup" :class="{ filled }" @click="onWaterCup(i)">💧</span>
      </div>
      <div class="water-actions">
        <button class="water-btn water-minus" :disabled="waterCount <= 0" @click="setWater(waterCount - 1)">−</button>
        <button class="water-btn water-plus" :disabled="waterCount >= WATER_GOAL" @click="setWater(waterCount + 1)">+</button>
      </div>
      <div v-if="waterCount >= WATER_GOAL" class="water-goal-reached">🎉 今日喝水目标已达成！</div>
    </div>
    <div class="clockin-history-section">
      <div class="clockin-history-title">打卡记录</div>
      <ReminderHistory />
    </div>
    <div class="todo-section" style="margin-top:16px;">
      <TodoViewApp />
    </div>
  </div>
</template>
