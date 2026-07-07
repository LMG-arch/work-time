<script setup>
import { onMounted } from 'vue'
import ReminderList from '../components/ReminderList.vue'
import ReminderHistory from '../components/ReminderHistory.vue'
import TodoViewApp from '../components/TodoViewApp.vue'

onMounted(() => {
  // 触发旧 JS 更新非 Vue 部分（today-label, water-tracker）
  window.renderClockinView?.()
})
</script>

<template>
  <div class="clockin-view-content">
    <div class="clockin-header-row">
      <div class="clockin-today-label" id="clockin-today-label"></div>
      <button id="clockin-settings-btn" class="clockin-settings-btn" title="提醒设置">&#x2699;</button>
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
