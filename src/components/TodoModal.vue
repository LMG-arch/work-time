<script setup>
import { ref, computed } from 'vue'
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogClose } from 'reka-ui'
import { useTodoStore } from '../stores/todoStore.js'
import { useCalendarStore } from '../stores/calendarStore.js'
import { Lunar } from '../lunar.js'

const todoStore = useTodoStore()
const calendarStore = useCalendarStore()

const visible = ref(false)
const editingTodo = ref(null)

function onOpenChange(open) { visible.value = open }

const title = computed(() => editingTodo.value ? '编辑待办' : '添加待办')

const text = ref('')
const type = ref('once')
const dateVal = ref('')
const lunarMonth = ref(1)
const lunarDay = ref(1)
const calType = ref('solar')
const weekdays = ref([])
const remind = ref('')
const remindTime = ref('09:00')

window.__openTodoModal = (todo) => {
  if (todo) {
    editingTodo.value = todo
    text.value = todo.text || ''
    type.value = todo.type || 'once'
    dateVal.value = todo.date || ''
    lunarMonth.value = todo.lunarMonth || 1
    lunarDay.value = todo.lunarDay || 1
    calType.value = todo.lunarMonth ? 'lunar' : 'solar'
    weekdays.value = todo.weekdays ? [...todo.weekdays] : []
    remind.value = todo.remind || ''
    remindTime.value = todo.remindTime || '09:00'
  } else {
    editingTodo.value = null
    text.value = ''
    type.value = 'once'
    dateVal.value = calendarStore.selectedDate || ''
    lunarMonth.value = 1
    lunarDay.value = 1
    calType.value = 'solar'
    weekdays.value = []
    remind.value = ''
    remindTime.value = '09:00'
  }
  visible.value = true
}
window.__closeTodoModal = () => { visible.value = false }

const lunarMonths = computed(() => {
  return Lunar ? Lunar.MonthCN.map((name, i) => ({ value: i + 1, label: name + '月' })) : []
})
const lunarDays = computed(() => {
  const days = []
  for (let d = 1; d <= 30; d++) {
    const label = Lunar ? Lunar.dayCN(d) : String(d)
    days.push({ value: d, label })
  }
  return days
})

const lunarHint = computed(() => {
  if (!dateVal.value || !Lunar) return ''
  const parts = dateVal.value.split('-')
  const lunar = Lunar.solar2lunar(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
  return lunar ? lunar.full : ''
})

function lunarToSolar(lunarM, lunarD) {
  if (typeof window.lunarToSolar === 'function') {
    return window.lunarToSolar(new Date().getFullYear(), lunarM, lunarD);
  }
  const year = new Date().getFullYear()
  for (const y of [year - 1, year, year + 1]) {
    for (let m = 0; m < 12; m++) {
      const dim = new Date(y, m + 1, 0).getDate()
      for (let d = 1; d <= dim; d++) {
        const lunar = Lunar.solar2lunar(y, m, d)
        if (lunar.lunarMonth === lunarM && lunar.lunarDay === lunarD && !lunar.isLeap) {
          return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        }
      }
    }
  }
  return null
}

function toggleWd(wd) {
  const idx = weekdays.value.indexOf(wd)
  if (idx >= 0) weekdays.value.splice(idx, 1)
  else weekdays.value.push(wd)
}

async function confirm() {
  if (!text.value.trim()) { window.showToast?.('请输入待办内容'); return }
  const updates = { text: text.value.trim(), type: type.value }

  if (type.value === 'once') {
    if (calType.value === 'lunar') {
      const dateStr = lunarToSolar(lunarMonth.value, lunarDay.value)
      if (!dateStr) { window.showToast?.('找不到对应的公历日期'); return }
      updates.date = dateStr
      updates.lunarMonth = lunarMonth.value
      updates.lunarDay = lunarDay.value
    } else {
      if (!dateVal.value) { window.showToast?.('请选择日期'); return }
      updates.date = dateVal.value
      updates.lunarMonth = null
      updates.lunarDay = null
    }
    if (!editingTodo.value) updates.done = false
  } else {
    if (weekdays.value.length === 0) { window.showToast?.('请选择重复星期'); return }
    updates.weekdays = [...weekdays.value]
    updates.lunarMonth = null
    updates.lunarDay = null
  }

  if (remind.value) {
    updates.remind = remind.value
    updates.remindTime = remindTime.value
  } else {
    updates.remind = ''
    updates.remindTime = ''
  }

  try {
    if (editingTodo.value) {
      if (type.value === 'weekly' && editingTodo.value.weeklyDone) {
        updates.weeklyDone = editingTodo.value.weeklyDone
      }
      await window.calendarAPI.updateTodo(editingTodo.value.id, updates)
      Object.assign(editingTodo.value, updates)
      window.showToast?.('待办已更新')
    } else {
      await window.calendarAPI.addTodo(updates)
      window.showToast?.('待办已添加')
    }
  } catch (e) {
    console.error('[TodoModal] confirm failed:', e.message)
    window.showToast?.('保存失败')
    return
  }

  visible.value = false
  todoStore.refreshFromWindow()
  if (typeof window.__refreshTodoList === 'function') {
    window.__refreshTodoList(calendarStore.selectedDate)
  }
  if (typeof window.renderCalendar === 'function') window.renderCalendar()
  window.__refreshCalendarGrid?.()
}
</script>

<template>
  <DialogRoot v-model:open="visible" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay class="dialog-overlay" />
      <DialogContent class="dialog-content" @interact-outside="visible = false">
        <DialogTitle class="dialog-title">{{ title }}</DialogTitle>
        <input v-model="text" type="text" placeholder="待办内容" maxlength="50" class="modal-input">

        <div class="modal-row">
          <span class="modal-label">类型</span>
          <div class="modal-type-btns">
            <button class="type-btn" :class="{ active: type === 'once' }" @click="type = 'once'">指定日期</button>
            <button class="type-btn" :class="{ active: type === 'weekly' }" @click="type = 'weekly'">每周重复</button>
          </div>
        </div>

        <template v-if="type === 'once'">
          <div v-if="calType === 'solar'" class="modal-row">
            <span class="modal-label">日期</span>
            <input v-model="dateVal" type="date" class="modal-date-input">
            <span v-if="lunarHint" class="todo-date-lunar-hint">{{ lunarHint }}</span>
          </div>
          <div v-else class="modal-row">
            <span class="modal-label">农历</span>
            <div class="lunar-date-picker">
              <select v-model="lunarMonth" class="lunar-select">
                <option v-for="m in lunarMonths" :key="m.value" :value="m.value">{{ m.label }}</option>
              </select>
              <select v-model="lunarDay" class="lunar-select">
                <option v-for="d in lunarDays" :key="d.value" :value="d.value">{{ d.label }}</option>
              </select>
            </div>
          </div>
          <div class="modal-row">
            <span class="modal-label">历法</span>
            <div class="modal-type-btns">
              <button class="calendar-type-btn" :class="{ active: calType === 'solar' }" @click="calType = 'solar'">公历</button>
              <button class="calendar-type-btn" :class="{ active: calType === 'lunar' }" @click="calType = 'lunar'">农历</button>
            </div>
          </div>
        </template>

        <div v-if="type === 'weekly'" class="modal-row">
          <span class="modal-label">重复</span>
          <div class="weekday-picker">
            <span v-for="wd in [1,2,3,4,5,6,0]" :key="wd" class="wd-btn" :class="{ active: weekdays.includes(wd) }" @click="toggleWd(wd)">{{ ['日','一','二','三','四','五','六'][wd] }}</span>
          </div>
        </div>

        <div class="modal-row">
          <span class="modal-label">提醒</span>
          <div class="todo-remind-picker">
            <select v-model="remind" class="lunar-select">
              <option value="">不提醒</option>
              <option value="same">准时提醒</option>
              <option value="5">提前5分钟</option>
              <option value="10">提前10分钟</option>
              <option value="15">提前15分钟</option>
              <option value="30">提前30分钟</option>
              <option value="60">提前1小时</option>
              <option value="120">提前2小时</option>
              <option value="1440">提前1天</option>
            </select>
            <input v-if="remind" v-model="remindTime" type="time" class="modal-date-input" value="09:00">
          </div>
        </div>

        <div class="modal-actions">
          <DialogClose class="modal-btn cancel">取消</DialogClose>
          <button class="modal-btn confirm" @click="confirm">确定</button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
