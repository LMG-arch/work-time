<script setup>
import { ref, watch } from 'vue'
import StatusButtons from './StatusButtons.vue'
import ColorPicker from './ColorPicker.vue'
import TagEditor from './TagEditor.vue'
import NoteEditor from './NoteEditor.vue'

const selectedDate = ref(null)
const dayData = ref({})

function formatDateCN(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const parts = dateStr.split('-')
  return `${parseInt(parts[0])}年${parseInt(parts[1])}月${parseInt(parts[2])}日 ${weekdays[d.getDay()]}`
}

function updateData() {
  dayData.value = window.allData?.[selectedDate.value] || {}
}

window.__vueDetailPanel = (dateStr) => {
  selectedDate.value = dateStr
  updateData()
}

watch(selectedDate, updateData)
</script>

<template>
  <div v-if="selectedDate">
    <div id="detail-date" class="detail-date">{{ formatDateCN(selectedDate) }}</div>
    <StatusButtons :selectedDate="selectedDate" :currentStatus="dayData?.status" @update="updateData" />
    <ColorPicker :selectedDate="selectedDate" :currentColor="dayData?.color || ''" />
    <TagEditor :selectedDate="selectedDate" :tags="dayData?.tags || []" />
    <NoteEditor :selectedDate="selectedDate" :note="dayData?.note || ''" />
  </div>
</template>