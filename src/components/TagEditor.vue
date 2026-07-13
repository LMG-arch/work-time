<script setup>
import { ref } from 'vue'
import { useCalendarStore } from '../stores/calendarStore.js'

const props = defineProps({ selectedDate: String, tags: { type: Array, default: () => [] } })
const tagInput = ref('')
const calendarStore = useCalendarStore()

const QUICK_TAGS = ['加班','迟到','早退','会议','培训','请假','远程','外勤']

function addTag(tag) {
  const trimmed = (tag || tagInput.value).trim()
  if (!trimmed || props.tags.includes(trimmed)) { tagInput.value = ''; return }
  const newTags = [...props.tags, trimmed]
  saveTags(newTags)
  tagInput.value = ''
}
function removeTag(tag) {
  saveTags(props.tags.filter(t => t !== tag))
}
async function saveTags(newTags) {
  const d = calendarStore.getDayData(props.selectedDate)
  await calendarStore.saveDayData(props.selectedDate, d.status || '', d.note || '', newTags, d.color || '')
  window.renderCalendar?.()
  window.__refreshCalendarGrid?.()
}
</script>

<template>
  <div class="tag-section">
    <div class="tag-list">
      <span v-for="t in tags" :key="t" class="tag-item">{{ t }}<span class="tag-remove" @click="removeTag(t)">&times;</span></span>
    </div>
    <div class="tag-input-row">
      <input id="tag-input" v-model="tagInput" type="text" placeholder="添加标签，回车确认" maxlength="10" @keydown.enter="addTag()">
      <button class="tag-add-btn" @click="addTag()" @touchend.prevent="addTag()">+</button>
    </div>
    <div class="tag-quick">
      <span v-for="qt in QUICK_TAGS" :key="qt" class="quick-tag" @click="addTag(qt)" @touchend.prevent="addTag(qt)">{{ qt }}</span>
    </div>
  </div>
</template>
