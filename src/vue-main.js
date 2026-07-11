import './shared.js'
import './shims.js'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './components/App.vue'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)

// Eager-init all stores to set up backward compat callbacks
import { useCalendarStore } from './stores/calendarStore.js'
import { useReminderStore } from './stores/reminderStore.js'
import { useTodoStore } from './stores/todoStore.js'
import { useAppStore } from './stores/appStore.js'
useCalendarStore()
useReminderStore()
useTodoStore()
useAppStore()

app.mount('#app')
