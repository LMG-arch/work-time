<script setup>
import { ref } from 'vue'

const activePage = ref(null)

window.__vueActivate = (page) => { activePage.value = page }
window.__vueDeactivate = () => { activePage.value = null }
</script>

<template>
  <!-- Empty shell for v3.4.0 -->
</template>