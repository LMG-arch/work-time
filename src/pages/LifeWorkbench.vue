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
import { ref, computed, onMounted } from 'vue'
import '../life/life.css'
import markup from '../life/markup.html?raw'
import { initLife, renderAll, setViewRefreshHook } from '../life/lifeEngine.js'

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

// ── 导航栏设置（v3.17.26）：上班日历 5 个子页的显隐开关 ──
// 存储键与 SettingsPage 一致（calendar-nav-items），支持跨端同步的单一真值。
const NAV_ITEMS_KEY = 'calendar-nav-items'
// 子页 id → 与经典 toolbar 按钮 id 的映射（home=日历、clockin=打卡…）
const WORK_NAV_MAP = {
  calendar: 'home',
  clockin: 'clockin',
  social: 'social',
  stats: 'stats',
  settings: 'settings',
}
// 已启用的子页列表；日历与设置是「固定项」不允许隐藏
const enabledWorkPages = ref(loadNavEnabled())
function loadNavEnabled() {
  try {
    const val = window.__storage?.get(NAV_ITEMS_KEY)
    if (Array.isArray(val)) return val
  } catch (e) { console.warn('[LifeWorkbench] load nav items failed:', e.message) }
  return workOrder.slice() // 默认全部启用
}
// 判定子页是否启用：SettingsPage 存的是经典 id（home=日历），
// 需经 WORK_NAV_MAP 映射后再比对；日历/设置为固定项恒启用
function isPageEnabled(page) {
  if (page === 'calendar' || page === 'settings') return true
  const legacy = WORK_NAV_MAP[page] || page
  return enabledWorkPages.value.includes(legacy)
}
// 始终保留固定项（日历/设置），并按默认顺序输出可见子页
const visibleWorkOrder = computed(() => workOrder.filter(p => isPageEnabled(p)))
function applyWorkNavVisibility(items) {
  enabledWorkPages.value = Array.isArray(items) ? items.slice() : loadNavEnabled()
  // 侧边栏「工作模块」条目显隐（生活工作台 markup 中的静态 DOM）
  workOrder.forEach(page => {
    const show = isPageEnabled(page)
    document.querySelectorAll(`.life-app [data-nav="work"][data-work-sub="${page}"]`).forEach(el => {
      el.style.display = show ? '' : 'none'
    })
  })
}
window.__applyWorkNavVisibility = applyWorkNavVisibility

let _inited = false

// 由 lifeEngine 侧边栏「工作模块」点击回调
function workSubActivate(sub) {
  // 被导航设置隐藏的子页不可激活（日历/设置固定项除外）
  if (!isPageEnabled(sub)) return
  if (workPages[sub]) activeWork.value = sub
  // 同步所有「工作模块」相关按钮高亮：侧边栏条目 + 移动端子页导航
  const navItems = document.querySelectorAll('.life-app [data-nav="work"]')
  navItems.forEach((item) => {
    const itemSub = item.getAttribute('data-work-sub')
    item.classList.toggle('active', (itemSub || 'calendar') === sub)
  })
  // 工作区内部子页导航高亮（移动端可见；按 visibleWorkOrder 顺序对齐）
  const subBtns = document.querySelectorAll('.work-subnav button')
  subBtns.forEach((btn, idx) => btn.classList.toggle('active', visibleWorkOrder.value[idx] === sub))
}

onMounted(async () => {
  if (_inited) return
  _inited = true
  // 先等耐用存储把 FS 备份灌入缓存（安卓 WebView 清空后可恢复生活工作台数据），再初始化状态引擎
  try { await window.__storage.init() } catch (e) { /* 退化为 localStorage */ }
  // 生活模块切换时强制重渲染：switchView 是纯 DOM 切换，原先切页不刷新数据，
  // 导致记账数据在「记账理财 ↔ 今日总览」往返后显示旧值（延迟/不一致）。
  // renderAll 为纯重渲染（从模块内 state 重新读，无监听器副作用），可安全重复调用。
  setViewRefreshHook(() => { try { renderAll(); } catch (e) { console.warn('[LifeWorkbench] refresh failed:', e.message) } })
  initLife()
  // 暴露给 lifeEngine 侧边栏回调
  window.__workSubActivate = workSubActivate
  // 重放 renderer.js 在引擎就绪前缓存的首屏导航请求（默认日历）
  const pending = window.__pendingActivate
  if (pending) {
    delete window.__pendingActivate
    if (typeof window.__vueActivate === 'function') window.__vueActivate(pending)
  }
  // 导航栏设置初始化：按已存配置隐藏侧边栏工作条目（含固定项保护）
  applyWorkNavVisibility(enabledWorkPages.value)
})
</script>

<template>
  <div class="life-app" v-html="lifeHtml"></div>

  <!-- 上班日历「工作模块」子视图：Teleport 进生活工作台内容区 #work-embed，常驻挂载 -->
  <Teleport to="#work-embed">
    <div class="work-stage">
      <nav class="work-subnav" aria-label="工作子页导航">
        <button v-for="page in visibleWorkOrder" :key="page" :class="{ active: activeWork === page }" @click="workSubActivate(page)">
          {{ workNavLabels[page] }}
        </button>
      </nav>
      <template v-for="page in workOrder" :key="page">
        <component :is="workPages[page]" v-show="activeWork === page" />
      </template>
    </div>
  </Teleport>
</template>
