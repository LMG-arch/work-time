<script setup>
// LifeWorkbench.vue — 「生活工作台」整合统一外壳（本地优先）
//
// 架构：生活工作台做唯一外壳（侧边栏 + 顶栏 + 移动底栏 + 8 大生活模块），
// 上班日历（日历/打卡/好友/统计/设置）作为「工作模块」子视图，通过 Teleport
// 嵌入生活工作台的 #work-embed 内容区，二者并列共存、互不覆盖。
//
// - 生活模块切换：由 lifeEngine.js 的 switchView() 在 .life-app 内部完成（data-nav）。
// - 上班日历切换：侧边栏「工作模块」条目带 data-work-sub，点击后引擎先 switchView('work')
//   再回调 window.__workSubActivate(sub)，本组件据此显示对应的上班日历页面。
// - 上班日历 5 页常驻挂载（v-show 切换、永不卸载），保留各自 onMounted 一次性初始化，
//   避免 document 级监听重复绑定、视图状态丢失。
import { ref, onMounted } from 'vue'
import '../life/life.css'
import markup from '../life/markup.html?raw'
import { initLife } from '../life/lifeEngine.js'

// 上班日历子视图组件
import CalendarView from './CalendarView.vue'
import ClockinPage from './ClockinPage.vue'
import StatsPage from './StatsPage.vue'
import SocialPage from './SocialPage.vue'
import SettingsPage from './SettingsPage.vue'

const lifeHtml = ref(markup)

// 上班日历子视图状态（映射到侧边栏 data-work-sub 值）
const workPages = {
  calendar: CalendarView,
  clockin: ClockinPage,
  social: SocialPage,
  stats: StatsPage,
  settings: SettingsPage,
}
const workOrder = ['calendar', 'clockin', 'social', 'stats', 'settings']
// 移动端（侧边栏隐藏时）工作子页导航：保证「设置」等在 ≤860px 仍可达
const workNavLabels = {
  calendar: '日历',
  clockin: '打卡',
  social: '好友',
  stats: '统计',
  settings: '设置',
}
const activeWork = ref('calendar')

let _inited = false

// 由 lifeEngine 侧边栏「工作模块」点击回调
function workSubActivate(sub) {
  if (workPages[sub]) activeWork.value = sub
  // 同步所有「工作模块」相关按钮高亮：侧边栏条目 + 移动端子页导航
  const navItems = document.querySelectorAll('.life-app [data-nav="work"]')
  navItems.forEach((item) => {
    const itemSub = item.getAttribute('data-work-sub')
    item.classList.toggle('active', (itemSub || 'calendar') === sub)
  })
  // 工作区内部子页导航高亮（移动端可见）
  const subBtns = document.querySelectorAll('.work-subnav button')
  subBtns.forEach((btn, idx) => btn.classList.toggle('active', workOrder[idx] === sub))
}

onMounted(async () => {
  if (_inited) return
  _inited = true
  // 先等耐用存储把 FS 备份灌入缓存（安卓 WebView 清空后可恢复生活工作台数据），再初始化状态引擎
  try { await window.__storage.init() } catch (e) { /* 退化为 localStorage */ }
  initLife()
  // 暴露给 lifeEngine 侧边栏回调
  window.__workSubActivate = workSubActivate
  // 重放 renderer.js 在引擎就绪前缓存的首屏导航请求（默认日历）
  const pending = window.__pendingActivate
  if (pending) {
    delete window.__pendingActivate
    if (typeof window.__vueActivate === 'function') window.__vueActivate(pending)
  }
})
</script>

<template>
  <div class="life-app" v-html="lifeHtml"></div>

  <!-- 上班日历「工作模块」子视图：Teleport 进生活工作台内容区 #work-embed，常驻挂载 -->
  <Teleport to="#work-embed">
    <div class="work-stage">
      <nav class="work-subnav" aria-label="工作子页导航">
        <button v-for="page in workOrder" :key="page" :class="{ active: activeWork === page }" @click="workSubActivate(page)">
          {{ workNavLabels[page] }}
        </button>
      </nav>
      <template v-for="page in workOrder" :key="page">
        <component :is="workPages[page]" v-show="activeWork === page" />
      </template>
    </div>
  </Teleport>
</template>
