<script setup>
import { ref } from 'vue'

const visible = ref(false)
const items = ref([])

window.__openReminderSettings = () => {
  items.value = (window.allReminders || []).map(r => ({
    id: r.id,
    label: r.label,
    time: r.time,
    enabled: r.enabled,
    sound: r.sound !== false,
    vibrate: r.vibrate !== false,
  }))
  visible.value = true
}
window.__closeReminderSettings = () => { visible.value = false }

async function save() {
  const updated = items.value.map(i => ({
    id: i.id,
    label: i.label.trim() || '打卡',
    time: i.time,
    enabled: i.enabled,
    sound: i.sound,
    vibrate: i.vibrate,
  }))
  window.allReminders = updated
  await window.calendarAPI.saveReminders(updated)
  visible.value = false
  window.__refreshReminderList?.()
  if (typeof window.scheduleReminderNotifications === 'function') window.scheduleReminderNotifications()
  if (typeof window.scheduleTodoReminders === 'function') window.scheduleTodoReminders()
  window.showToast?.('提醒设置已保存')
}

async function sendTest() {
  if (typeof window.sendTestNotification === 'function') {
    await window.sendTestNotification()
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal" style="display:flex;" @click.self="visible = false">
      <div class="modal-content">
        <div class="modal-title">打卡提醒设置</div>
        <div class="reminder-settings-list">
          <div v-for="(item, idx) in items" :key="item.id" class="reminder-setting-item">
            <input type="time" v-model="item.time" class="setting-time-input">
            <input type="text" v-model="item.label" class="setting-label-input" maxlength="10">
            <div style="display:flex;gap:8px;align-items:center;">
              <label style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:2px;" title="声音">
                <input type="checkbox" v-model="item.sound" style="width:12px;height:12px;">🔔
              </label>
              <label style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:2px;" title="震动">
                <input type="checkbox" v-model="item.vibrate" style="width:12px;height:12px;">📳
              </label>
              <label class="toggle-switch">
                <input type="checkbox" v-model="item.enabled">
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="modal-btn" style="background:var(--accent);color:#fff;" @click="sendTest">测试通知</button>
          <button class="modal-btn cancel" @click="visible = false">取消</button>
          <button class="modal-btn confirm" @click="save">保存</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.reminder-settings-list { max-height:400px; overflow-y:auto; }
.reminder-setting-item { display:flex; align-items:center; gap:8px; padding:10px 0; border-bottom:1px solid var(--border,#e0e0e0); flex-wrap:wrap; }
.setting-time-input { width:90px; padding:4px 8px; border:1px solid var(--border,#e0e0e0); border-radius:6px; font-size:14px; background:var(--bg,#fff); color:var(--text,#333); }
.setting-label-input { flex:1; min-width:80px; padding:4px 8px; border:1px solid var(--border,#e0e0e0); border-radius:6px; font-size:13px; background:var(--bg,#fff); color:var(--text,#333); }
</style>
