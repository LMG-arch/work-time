<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import SettingsSection from '../components/SettingsSection.vue'
import { isCapacitorPlatform, sanitizeUrl } from '../utils.js'

// ===== 全局依赖（通过 window 访问现有模块函数）=====
const getSupabaseConfig = window.getSupabaseConfig
const saveSupabaseConfig = window.saveSupabaseConfig
const initSupabase = window.initSupabase
const getSavedUsername = window.getSavedUsername
const getCurrentUser = window.getCurrentUser
const getMyProfile = window.getMyProfile
const registerAccount = window.registerAccount
const loginAccount = window.loginAccount
const logoutAccount = window.logoutAccount
const uploadAvatar = window.uploadAvatar
const isSyncEnabled = window.isSyncEnabled
const setSyncEnabled = window.setSyncEnabled
const syncCalendarData = window.syncCalendarData
const pushToCloud = window.pushToCloud
const pullFromCloud = window.pullFromCloud
const isAdmin = window.isAdmin
const resetSelected = window.resetSelected
const getTrashStats = window.getTrashStats
const getTrashSizes = window.getTrashSizes
const restoreSelected = window.restoreSelected
const emptySelected = window.emptySelected
const showToast = window.showToast

const safeAvatarUrl = computed(() => {
  return avatarUrl.value ? sanitizeUrl(avatarUrl.value) || avatarUrl.value : ''
})

// ===== 主题 =====
const THEMES = window.THEMES || [
  { id: 'default', name: '经典', color: '#333' },
  { id: 'dark', name: '暗黑', color: '#1a1a2e' },
  { id: 'green', name: '清新', color: '#43A047' },
  { id: 'pink', name: '粉色', color: '#e91e63' },
  { id: 'purple', name: '紫色', color: '#7e57c2' },
  { id: 'navy', name: '商务', color: '#1565c0' },
  { id: 'ocean', name: '海洋', color: '#00838f' },
  { id: 'sunset', name: '日落', color: '#e65100' },
  { id: 'rose', name: '玫瑰金', color: '#b76e79' },
  { id: 'forest', name: '森林', color: '#2e7d32' },
  { id: 'coffee', name: '咖啡', color: '#5d4037' },
  { id: 'lavender', name: '薰衣草', color: '#9575cd' },
  { id: 'mint', name: '薄荷', color: '#26a69a' },
  { id: 'slate', name: '石板', color: '#546e7a' },
  { id: 'cosmic', name: '星海绽放', color: '#9d8cff' },
]
const currentTheme = ref(document.body.dataset.theme || 'default')

function setTheme(themeId) {
  const apply = () => {
    currentTheme.value = themeId
    document.body.dataset.theme = themeId
    window.__storage.setRaw('calendar-theme', themeId)
  }
  if (document.startViewTransition) {
    document.startViewTransition(apply)
  } else {
    apply()
  }
}

// ===== 账号状态 =====
const isLoggedIn = ref(false)
const nickname = ref('')
const displayId = ref('')
const username = ref('')
const avatarUrl = ref('')
const regUsername = ref('')
const regPassword = ref('')
const authStatus = ref('')
const isSubmitting = ref(false)

async function updateAccountUI() {
  const savedUsername = getSavedUsername()
  const user = await getCurrentUser()
  if (user && savedUsername) {
    isLoggedIn.value = true
    username.value = savedUsername
    const profile = await getMyProfile()
    nickname.value = profile ? profile.nickname : savedUsername
    displayId.value = profile ? profile.display_id : '-'
    if (profile && profile.avatar) {
      avatarUrl.value = profile.avatar
    } else {
      avatarUrl.value = ''
    }
  } else {
    isLoggedIn.value = false
    regUsername.value = ''
    regPassword.value = ''
    authStatus.value = ''
  }
}

async function handleRegister() {
  if (!regUsername.value.trim() || !regPassword.value) return
  isSubmitting.value = true
  authStatus.value = '注册中...'
  try {
    const result = await registerAccount(regUsername.value.trim(), regPassword.value)
    if (result.error) {
      authStatus.value = result.error
    } else {
      await getMyProfile()
      authStatus.value = '注册成功！'
      regUsername.value = ''
      regPassword.value = ''
      await updateAccountUI()
    }
  } finally {
    isSubmitting.value = false
  }
}

async function handleLogin() {
  if (!regUsername.value.trim() || !regPassword.value) return
  isSubmitting.value = true
  authStatus.value = '登录中...'
  try {
    const result = await loginAccount(regUsername.value.trim(), regPassword.value)
    if (result.error) {
      authStatus.value = result.error
    } else {
      authStatus.value = '登录成功！'
      regUsername.value = ''
      regPassword.value = ''
      await updateAccountUI()
      try { await syncCalendarData(); await window.refreshAllData?.() } catch (e) { console.warn('[Sync] Post-login sync failed:', e.message) }
    }
  } finally {
    isSubmitting.value = false
  }
}

async function handleLogout() {
  if (!confirm('确定退出登录？')) return
  isSubmitting.value = true
  await logoutAccount()
  await updateAccountUI()
  showToast('已退出登录')
  isSubmitting.value = false
}

async function handleAvatarUpload(e) {
  const file = e.target.files[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) { showToast('图片不能超过5MB'); e.target.value = ''; return }
  showToast('正在上传头像...')
  const result = await uploadAvatar(file)
  if (result.error) {
    showToast('上传失败: ' + result.error)
  } else {
    avatarUrl.value = result.url
    showToast('头像已更新 ✓')
  }
  e.target.value = ''
}

// ===== Supabase 配置 =====
const supabaseUrl = ref('')
const supabaseKey = ref('')

function loadSupabaseConfig() {
  const config = getSupabaseConfig()
  supabaseUrl.value = config.url || ''
  supabaseKey.value = config.key || ''
}

function saveSupabase() {
  if (!supabaseUrl.value.trim() || !supabaseKey.value.trim()) {
    showToast('请填写完整配置')
    return
  }
  saveSupabaseConfig(supabaseUrl.value.trim(), supabaseKey.value.trim())
  window.sb = initSupabase()
  showToast('配置已保存')
}

async function testSupabase() {
  if (!supabaseUrl.value.trim() || !supabaseKey.value.trim()) {
    showToast('请填写完整配置')
    return
  }
  saveSupabaseConfig(supabaseUrl.value.trim(), supabaseKey.value.trim())
  window.sb = initSupabase()
  const results = []
  function log(ok, msg) { results.push((ok ? '✓ ' : '✗ ') + msg) }
  log(true, '配置已保存')

  try {
    const { error } = await window.sb.auth.getSession()
    if (error) log(false, '会话失败: ' + error.message)
    else log(true, '会话接口正常')
  } catch (e) { log(false, '会话异常: ' + e.message) }

  try {
    const { data, error: authErr } = await window.sb.auth.signInAnonymously()
    if (authErr) log(false, '匿名登录失败: ' + authErr.message)
    else {
      log(true, '匿名登录成功: ' + data.user.id.slice(0, 8) + '...')
      try {
        const { data: prof } = await window.sb.from('profiles').select('display_id').eq('id', data.user.id).maybeSingle()
        if (prof && prof.display_id) log(true, '数字ID: ' + prof.display_id)
      } catch (e) { console.debug('[Test] Profile query failed:', e.message) }
    }
  } catch (e) { log(false, '匿名登录异常: ' + e.message) }

  try {
    const { data, error } = await window.sb.from('profiles').select('id').limit(1)
    if (error) {
      if (error.code === '42P01') log(false, 'profiles 表不存在 → 请执行 supabase-setup.sql')
      else log(false, '查询失败: ' + error.message)
    } else log(true, 'profiles 表可访问')
  } catch (e) { log(false, '查询异常: ' + e.message) }

  try {
    const { error } = await window.sb.from('posts').select('id').limit(1)
    if (error) log(false, 'posts 表不可用: ' + error.message)
    else log(true, 'posts 表可访问')
  } catch (e) { log(false, 'posts 表异常: ' + e.message) }

  window.showDiag?.(results.join('\n'))
}

// ===== 数据同步 =====
const syncEnabled = ref(false)
const isSyncing = ref(false)

function updateSyncState() {
  syncEnabled.value = isSyncEnabled()
}

async function toggleSync() {
  const next = !syncEnabled.value
  setSyncEnabled(next)
  syncEnabled.value = next
  showToast(next ? '已开启自动同步' : '已关闭自动同步')
  if (next) {
    isSyncing.value = true
    const r = await syncCalendarData()
    if (r.error) showToast('同步失败: ' + r.error)
    else { showToast('同步完成 ✓'); await window.refreshAllData?.() }
    isSyncing.value = false
  }
}

async function syncNow() {
  isSyncing.value = true
  try {
    const r = await syncCalendarData()
    if (r.error) showToast('同步失败: ' + r.error)
    else { showToast('同步完成 ✓'); await window.refreshAllData?.() }
  } finally { isSyncing.value = false }
}

async function pushToCloudHandler() {
  if (!confirm('上传本地数据将覆盖云端数据，确定继续？')) return
  isSyncing.value = true
  try {
    const r = await pushToCloud()
    if (r.error) showToast('上传失败: ' + r.error)
    else showToast('本地数据已上传到云端 ✓')
  } finally { isSyncing.value = false }
}

async function pullFromCloudHandler() {
  if (!confirm('下载云端数据将覆盖本地数据，确定继续？')) return
  isSyncing.value = true
  try {
    const r = await pullFromCloud()
    if (r.error) showToast('下载失败: ' + r.error)
    else { showToast('云端数据已下载到本地 ✓'); await window.refreshAllData?.() }
  } finally { isSyncing.value = false }
}

// ===== 管理员功能（回收站）=====
const isUserAdmin = ref(false)

async function checkAdmin() {
  isUserAdmin.value = await isAdmin()
  if (isUserAdmin.value) {
    await updateTrashStats()
  }
}

const trashStats = ref(null)
const trashSizes = ref(null)
const TABLES = [
  { key: 'posts', label: '动态' },
  { key: 'comments', label: '评论' },
  { key: 'likes', label: '点赞' },
  { key: 'friendships', label: '好友关系' },
  { key: 'profiles', label: '用户' },
]
const selectedTables = ref([])

async function updateTrashStats() {
  const [stats, sizes] = await Promise.all([getTrashStats(), getTrashSizes()])
  trashStats.value = stats
  trashSizes.value = sizes
}

function getSelectedTables() {
  return selectedTables.value.length > 0 ? selectedTables.value : TABLES.map(t => t.key)
}

async function clearData() {
  const label = selectedTables.value.length > 0
    ? selectedTables.value.map(k => TABLES.find(t => t.key === k)?.label || k).join('、')
    : '全部'
  if (!confirm(`⚠️ 即将清除：${label}\n\n数据移入回收站，可恢复。继续吗？`)) return
  if (!confirm('再次确认？')) return
  showToast('正在清除...')
  const r = await resetSelected(getSelectedTables())
  if (r.error) showToast('清除失败: ' + r.error)
  else { showToast('数据已移入回收站 ✓'); await updateTrashStats() }
}

async function restoreData() {
  if (!confirm(`确定从回收站恢复数据？`)) return
  showToast('正在恢复...')
  const r = await restoreSelected(getSelectedTables())
  if (r.error) showToast('恢复失败: ' + r.error)
  else { showToast('数据已恢复 ✓'); await window.refreshAllData?.(); await updateTrashStats() }
}

async function emptyTrash() {
  if (!confirm('⚠️ 数据将永久删除，无法恢复！确定继续？')) return
  if (!confirm('再次确认？')) return
  showToast('正在清空...')
  const r = await emptySelected(getSelectedTables())
  if (r.error) showToast('清空失败: ' + r.error)
  else { showToast('回收站已清空'); await updateTrashStats() }
}

// ===== 自动启动（仅在 Electron 中显示）=====
const autoLaunchEnabled = ref(false)

async function updateAutoLaunchState() {
  if (!window.calendarAPI?.getAutoLaunch) return
  autoLaunchEnabled.value = await window.calendarAPI.getAutoLaunch()
}

async function toggleAutoLaunch() {
  const current = await window.calendarAPI.getAutoLaunch()
  await window.calendarAPI.setAutoLaunch(!current)
  autoLaunchEnabled.value = !current
  showToast(current ? '已关闭开机自启' : '已开启开机自启')
}

// ===== 安卓权限（仅 Capacitor 平台显示）=====
const isAndroid = ref(false)
const permStatuses = ref({})

async function checkAndroidPermissions() {
  if (!isCapacitorPlatform()) return
  isAndroid.value = true
  try {
    const { LocalNotifications } = window.Capacitor.Plugins
    if (LocalNotifications) {
      const perm = await LocalNotifications.checkPermissions()
      permStatuses.value.notification = perm.display === 'granted'
      if (LocalNotifications.checkExactNotificationSetting) {
        try {
          const exact = await LocalNotifications.checkExactNotificationSetting()
          permStatuses.value['exact-alarm'] = exact.exact_alarm === 'granted'
        } catch (e) { console.warn('[Perm] Exact alarm check failed:', e.message); permStatuses.value['exact-alarm'] = false }
      }
    }
  } catch (e) { console.warn('[Perm] Notification check failed:', e.message) }
  permStatuses.value.overlay = null
  permStatuses.value.battery = null
  permStatuses.value.install = null
}

async function openAppSettings() {
  try {
    const { App } = window.Capacitor.Plugins
    const appId = 'com.workcalendar.app'
    if (App?.openUrl) {
      try { await App.openUrl({ url: `package:${appId}` }); return } catch (e) { console.debug('[Settings] App.openUrl failed:', e.message) }
    }
    try { window.open(`intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;package=${appId};end`, '_system'); return } catch (e) { console.debug('[Settings] Intent URL failed:', e.message) }
    try { window.open(`market://details?id=${appId}`, '_system'); return } catch (e) { console.debug('[Settings] Market URL failed:', e.message) }
    showToast('请手动前往：系统设置 > 应用管理 > 上班日历 > 权限')
  } catch (e) {
    showToast('请手动前往：系统设置 > 应用管理 > 上班日历 > 权限')
  }
}

async function diagnoseNotifications() {
  if (typeof window.diagnoseNotifications === 'function') {
    await window.diagnoseNotifications()
  } else {
    showToast('诊断功能未加载')
  }
}

const perms = [
  { name: '通知权限', desc: '打卡提醒和待办提醒', key: 'notification' },
  { name: '精确闹钟', desc: '准时提醒不延迟', key: 'exact-alarm' },
  { name: '后台弹出界面', desc: '后台收到通知时显示', key: 'overlay' },
  { name: '电池优化', desc: '关闭省电限制，确保后台通知正常', key: 'battery' },
  { name: '安装应用', desc: '应用内更新下载安装', key: 'install' },
]

function getPermStatus(key) {
  const val = permStatuses.value[key]
  if (val === null) return { text: '建议开启', cls: 'warn' }
  if (val) return { text: '✓ 已开启', cls: 'ok' }
  return { text: '未开启', cls: 'bad' }
}

// ===== 导航栏设置 =====
const NAV_ITEMS_KEY = 'calendar-nav-items'
const allNavItems = [
  { id: 'home', label: '日历', always: true },
  { id: 'clockin', label: '打卡' },
  { id: 'social', label: '好友' },
  { id: 'stats', label: '统计' },
  { id: 'settings', label: '设置', always: true },
]
const navEnabled = ref(getNavItems())

function getNavItems() {
  try { const val = window.__storage.get(NAV_ITEMS_KEY); if (val) return val } catch (e) { console.warn('[Settings] Failed to parse nav items:', e.message) }
  return allNavItems.map(n => n.id)
}
function saveNavItems(items) {
  window.__storage.set(NAV_ITEMS_KEY, items)
  navEnabled.value = items
  allNavItems.forEach(item => {
    const btn = document.getElementById(item.id + '-btn')
    if (btn) btn.style.display = items.includes(item.id) ? '' : 'none'
  })
}
function toggleNavItem(itemId) {
  let items = [...navEnabled.value]
  if (items.includes(itemId)) {
    items = items.filter(i => i !== itemId)
  } else {
    items.push(itemId)
  }
  saveNavItems(items)
}
function isNavEnabled(itemId) {
  return navEnabled.value.includes(itemId)
}

// ===== 数据导出/导入 =====
async function exportData() {
  await window.calendarAPI.exportData()
  showToast('数据已导出')
}

async function importData() {
  const result = await window.calendarAPI.importData()
  if (result.success) {
    await window.refreshAllData?.()
    showToast('数据已导入')
  } else if (result.error) {
    showToast('导入失败: ' + result.error)
  }
}

// ===== 检查更新 =====
function checkUpdate() {
  if (typeof window.manualCheckUpdate === 'function') {
    window.manualCheckUpdate()
  }
}

// ===== 设置页激活 =====
onMounted(async () => {
  await updateAccountUI()
  loadSupabaseConfig()
  await updateAutoLaunchState()
  updateSyncState()
  await checkAdmin()
  await checkAndroidPermissions()
})

window.__refreshSettingsData = async () => {
  await updateAccountUI()
  loadSupabaseConfig()
  await updateAutoLaunchState()
  updateSyncState()
  await checkAdmin()
  await updateTrashStats()
}

onUnmounted(() => {
  if (window.__refreshSettingsData) {
    window.__refreshSettingsData = undefined
  }
})
</script>

<template>
  <div class="settings-scroll">
    <!-- ===== 账号 ===== -->
    <SettingsSection title="账号">
      <div v-if="!isLoggedIn">
        <div class="settings-hint" style="margin-bottom:8px;">注册账号后数据不会丢失，换设备可登录恢复</div>
        <div class="settings-field">
          <label>用户名</label>
          <input v-model="regUsername" class="settings-input" placeholder="设置用户名" maxlength="20">
        </div>
        <div class="settings-field">
          <label>密码</label>
          <input v-model="regPassword" class="settings-input" type="password" placeholder="设置密码" maxlength="32">
        </div>
        <div class="settings-btn-row">
          <button class="settings-action-btn" :disabled="isSubmitting" @click="handleRegister">注册</button>
          <button class="settings-action-btn" :disabled="isSubmitting" @click="handleLogin">登录</button>
        </div>
        <div v-if="authStatus" class="settings-hint" style="margin-top:4px;">{{ authStatus }}</div>
      </div>
      <div v-else>
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="position:relative;width:40px;height:40px;cursor:pointer;" title="点击更换头像">
            <template v-if="safeAvatarUrl">
              <img :src="safeAvatarUrl" style="width:40px;height:40px;object-fit:cover;border-radius:50%;">
            </template>
            <div v-else class="post-avatar avatar-placeholder" style="width:40px;height:40px;font-size:18px;">{{ nickname[0] }}</div>
            <input type="file" accept="image/*" style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:pointer;" @change="handleAvatarUpload">
          </div>
          <div>
            <div style="font-weight:600;">{{ nickname }}</div>
            <div class="settings-hint" style="margin:0;">ID: {{ displayId }} | {{ username }}</div>
          </div>
        </div>
        <button class="settings-action-btn full" style="margin-top:8px;" :disabled="isSubmitting" @click="handleLogout">退出登录</button>
      </div>
    </SettingsSection>

    <!-- ===== 数据管理 ===== -->
    <SettingsSection title="数据管理">
      <div class="settings-btn-row">
        <button class="settings-action-btn" @click="exportData">导出数据</button>
        <button class="settings-action-btn" @click="importData">导入数据</button>
      </div>
    </SettingsSection>

    <!-- ===== 好友圈服务配置 ===== -->
    <SettingsSection title="好友圈服务配置">
      <div class="settings-hint">在 <a href="https://supabase.com" target="_blank">supabase.com</a> 免费注册，创建项目后填入以下信息</div>
      <div class="settings-field">
        <label>Project URL</label>
        <input v-model="supabaseUrl" class="settings-input" placeholder="https://xxx.supabase.co">
      </div>
      <div class="settings-field">
        <label>Anon Key</label>
        <input v-model="supabaseKey" class="settings-input" type="password" placeholder="sb_publishable_xxx 或 eyJxxx">
      </div>
      <div class="settings-btn-row">
        <button class="settings-action-btn" @click="saveSupabase">保存配置</button>
        <button class="settings-action-btn" @click="testSupabase">测试连接</button>
      </div>
      <div class="settings-hint" style="margin-top:8px;">
        首次配置后需在 Supabase SQL Editor 执行 <b>supabase-setup.sql</b> 创建数据表
      </div>

      <template v-if="isUserAdmin">
        <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;">
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px;">勾选数据类型（不勾选 = 全部）</div>
          <div style="display:flex;flex-wrap:wrap;gap:2px 10px;">
            <label v-for="t in TABLES" :key="t.key" style="font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;">
              <input type="checkbox" :value="t.key" v-model="selectedTables" style="width:14px;height:14px;">
              {{ t.label }}
              <span style="color:var(--text3);font-size:11px;">
                {{ trashSizes?.[t.key]?.total_size || '' }}
                {{ trashSizes?.[t.key]?.count > 0 ? `(回收站${trashSizes[t.key].count}条)` : '' }}
              </span>
            </label>
          </div>
          <button class="settings-action-btn btn-danger-ghost" style="margin-top:8px;" @click="clearData">清除云端数据</button>
          <div class="settings-hint" style="margin-top:4px;">⚠️ 管理员功能：重置全部数据（移入回收站，可恢复），不影响配置</div>
        </div>

        <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;">
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;">🗑️ 回收站</div>
          <div class="settings-hint" style="margin-bottom:8px;">
            <template v-if="!trashStats || trashStats.total === 0">回收站为空</template>
            <template v-else>
              共 {{ trashStats.total }} 条：
              <template v-if="trashStats.profiles">{{ trashStats.profiles }} 个用户、</template>
              <template v-if="trashStats.posts">{{ trashStats.posts }} 条动态、</template>
              <template v-if="trashStats.comments">{{ trashStats.comments }} 条评论、</template>
              <template v-if="trashStats.likes">{{ trashStats.likes }} 个点赞、</template>
              <template v-if="trashStats.friendships">{{ trashStats.friendships }} 条好友关系</template>
            </template>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="settings-action-btn" style="flex:1;" @click="restoreData">恢复数据</button>
            <button class="settings-action-btn btn-danger-ghost" style="flex:1;" @click="emptyTrash">清空回收站</button>
          </div>
        </div>
      </template>
    </SettingsSection>

    <!-- ===== 数据同步 ===== -->
    <SettingsSection title="数据同步">
      <div class="settings-hint">登录同一账号即可多端同步，数据变更自动上传云端</div>
      <div class="settings-btn-row" style="margin-top:8px;">
        <button
          class="settings-action-btn"
          :style="syncEnabled ? {borderColor:'var(--accent)',color:'var(--accent)'} : {}"
          @click="toggleSync"
        >
          自动同步：{{ syncEnabled ? '开启' : '关闭' }}
        </button>
        <button class="settings-action-btn" :disabled="isSyncing" @click="syncNow">
          {{ isSyncing ? '同步中...' : '立即同步' }}
        </button>
      </div>
      <div class="settings-btn-row" style="margin-top:8px;">
        <button class="settings-action-btn" :disabled="isSyncing" @click="pushToCloudHandler">↑ 上传本地数据</button>
        <button class="settings-action-btn" :disabled="isSyncing" @click="pullFromCloudHandler">↓ 下载云端数据</button>
      </div>
      <div class="settings-hint" style="margin-top:4px;font-size:11px;">上传：本地覆盖云端 | 下载：云端覆盖本地</div>
    </SettingsSection>

    <!-- ===== 主题风格 ===== -->
    <SettingsSection title="主题风格" collapsible>
      <div class="theme-grid">
        <div
          v-for="t in THEMES"
          :key="t.id"
          class="theme-opt"
          :class="{ active: currentTheme === t.id }"
          @click="setTheme(t.id)"
        >
          <div class="theme-dot" :style="{ background: t.color }"></div>
          <span>{{ t.name }}</span>
        </div>
      </div>
    </SettingsSection>

    <!-- ===== 导航栏设置 ===== -->
    <SettingsSection title="导航栏设置" collapsible>
      <div class="settings-hint" style="margin-bottom:8px;">选择底部导航栏显示的功能</div>
      <div>
        <div v-for="item in allNavItems" :key="item.id" class="nav-item-row">
          <span class="nav-item-label">
            {{ item.label }}
            <template v-if="item.always"><span style="color:var(--text3);">（固定）</span></template>
          </span>
          <button
            class="nav-item-toggle"
            :class="{ on: isNavEnabled(item.id) }"
            :disabled="item.always"
            :style="item.always ? {opacity:0.5} : {}"
            @click="toggleNavItem(item.id)"
          ></button>
        </div>
      </div>
    </SettingsSection>

    <!-- ===== 安卓权限 ===== -->
    <SettingsSection v-if="isAndroid" title="安卓权限" collapsible>
      <div class="settings-hint" style="margin-bottom:8px;">以下权限影响通知和更新功能，建议全部开启</div>
      <div>
        <div v-for="p in perms" :key="p.key" class="perm-item">
          <div>
            <div style="font-size:13px;font-weight:500;">{{ p.name }}</div>
            <div style="font-size:11px;color:var(--text-secondary);">{{ p.desc }}</div>
          </div>
          <span
            class="perm-status"
            :class="getPermStatus(p.key).cls"
          >{{ getPermStatus(p.key).text }}</span>
        </div>
      </div>
      <button class="settings-action-btn full" style="margin-top:8px;" @click="openAppSettings">前往系统设置</button>
      <button class="settings-action-btn full btn-primary" style="margin-top:8px;" @click="diagnoseNotifications">🔍 诊断通知问题</button>
    </SettingsSection>

    <!-- ===== 其他 ===== -->
    <SettingsSection title="其他">
      <button class="settings-action-btn full" :class="{ 'toggle-active': autoLaunchEnabled }" @click="toggleAutoLaunch">
        {{ autoLaunchEnabled ? '✓ 开机自启已开启' : '开机自启' }}
      </button>
      <button class="settings-action-btn full" style="margin-top:8px;" @click="checkUpdate">检查更新</button>
    </SettingsSection>

    <div style="height:24px;"></div>
  </div>
</template>

<style scoped>
.settings-scroll {
  overflow-y: auto;
  height: 100%;
  padding: 4px 0 16px;
  box-sizing: border-box;
}
.settings-hint {
  font-size: 12px;
  color: var(--text2, #888);
  line-height: 1.5;
}
.settings-field {
  margin-bottom: 12px;
}
.settings-field label {
  display: block;
  font-size: 12px;
  color: var(--text2, #666);
  margin-bottom: 4px;
}
.settings-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 8px;
  background: var(--card, #fff);
  color: var(--text, #333);
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
}
.settings-input:focus {
  border-color: var(--accent, #333);
}
.settings-btn-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.settings-action-btn {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 8px;
  background: var(--card, #fff);
  color: var(--text, #333);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
.settings-action-btn:hover {
  border-color: var(--accent, #333);
  color: var(--accent, #333);
}
.settings-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.settings-action-btn.full {
  width: 100%;
}
.settings-action-btn.toggle-active {
  border-color: var(--accent, #333);
  color: var(--accent, #333);
}
.theme-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.theme-opt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  font-size: 11px;
  color: var(--text, #333);
  transition: border-color 0.15s;
}
.theme-opt.active {
  border-color: var(--accent, #333);
}
.theme-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid rgba(0,0,0,0.1);
}
.nav-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border, #e0e0e0);
}
.nav-item-label {
  font-size: 13px;
}
.nav-item-toggle {
  width: 40px;
  height: 22px;
  border-radius: 11px;
  border: none;
  background: var(--border, #ccc);
  cursor: pointer;
  position: relative;
  transition: background 0.2s;
}
.nav-item-toggle.on {
  background: var(--accent, #333);
}
.nav-item-toggle::after {
  content: '';
  display: block;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: white;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform 0.2s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
}
.nav-item-toggle.on::after {
  transform: translateX(18px);
}
.perm-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border, #e0e0e0);
}
.perm-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}
.perm-status.ok {
  background: #4caf50;
  color: #fff;
}
.perm-status.bad {
  background: #e53935;
  color: #fff;
}
.perm-status.warn {
  background: #ff9800;
  color: #fff;
}
.settings-scroll a {
  color: var(--accent, #333);
  text-decoration: underline;
}
</style>