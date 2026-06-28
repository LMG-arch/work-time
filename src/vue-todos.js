import { createApp } from 'vue'
import TodoListApp from './components/TodoListApp.vue'
import TodoViewApp from './components/TodoViewApp.vue'
import TodoModal from './components/TodoModal.vue'

createApp(TodoListApp).mount('#todo-list-vue')
createApp(TodoViewApp).mount('#todo-view-vue')
createApp(TodoModal).mount('#todo-modal-vue')