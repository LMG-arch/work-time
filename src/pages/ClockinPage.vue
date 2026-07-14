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
  // 触发旧 JS 更新非 Vue 部分（today-label, water-tracker）
  window.renderClockinView?.()
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
    <div id="water-tracker" class="water-tracker"></div>
    <div class="clockin-history-section">
      <div class="clockin-history-title">打卡记录</div>
      <ReminderHistory />
    </div>
    <div class="todo-section" style="margin-top:16px;">
      <TodoViewApp />
    </div>
  </div>
</template>
