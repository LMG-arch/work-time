import { createApp } from 'vue'
import ReminderList from './components/ReminderList.vue'
import ReminderHistory from './components/ReminderHistory.vue'
import ReminderSettings from './components/ReminderSettings.vue'

createApp(ReminderList).mount('#reminder-list-vue')
createApp(ReminderHistory).mount('#reminder-history-vue')
createApp(ReminderSettings).mount('#reminder-settings-vue')