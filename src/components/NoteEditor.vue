<script setup>
import { ref, watch } from 'vue'

const props = defineProps({ selectedDate: String, note: String })
const noteText = ref(props.note || '')

watch(() => props.note, (v) => { noteText.value = v || '' })
watch(() => props.selectedDate, () => { noteText.value = props.note || '' })

async function saveNote() {
  const d = window.allData?.[props.selectedDate] || {}
  await window.calendarAPI.saveDay(props.selectedDate, d.status || '', noteText.value, d.tags || [], d.color || '')
  if (!window.allData[props.selectedDate]) window.allData[props.selectedDate] = {}
  window.allData[props.selectedDate].note = noteText.value
  window.showToast?.('备注已保存')
}
</script>

<template>
  <div class="note-section">
    <textarea v-model="noteText" placeholder="备注今天做了什么..." rows="3"></textarea>
    <button class="save-btn" @click="saveNote">保存</button>
  </div>
</template>
