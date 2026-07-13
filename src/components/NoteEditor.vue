<script setup>
import { ref, watch } from 'vue'
import { useCalendarStore } from '../stores/calendarStore.js'

const props = defineProps({ selectedDate: String, note: String })
const calendarStore = useCalendarStore()
const noteText = ref(props.note || '')

watch(() => props.note, (v) => { noteText.value = v || '' })
watch(() => props.selectedDate, () => { noteText.value = props.note || '' })

async function saveNote() {
  const d = calendarStore.getDayData(props.selectedDate)
  await calendarStore.saveDayData(props.selectedDate, d.status || '', noteText.value, d.tags || [], d.color || '')
  window.renderCalendar?.()
  window.__refreshCalendarGrid?.()
  window.showToast?.('备注已保存')
}
</script>

<template>
  <div class="note-section">
    <textarea id="note-input" v-model="noteText" placeholder="备注今天做了什么..." rows="3"></textarea>
    <button class="save-btn" @click="saveNote">保存</button>
  </div>
</template>
