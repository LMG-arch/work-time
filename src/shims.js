// shims.js — 过渡期 window.* 兼容垫片
//
// 已迁移的 ES 模块（utils / holidays / lunar / storage / supabase-*）在此统一导入，
// 并把它们的导出重新挂回 window.*，供尚未迁移的经典 <script>
// （web-api.js / social.js / calendar.js / todos.js / reminders.js / stats.js /
// settings.js / updater.js / renderer.js）在运行时按原名继续调用。
//
// 经典脚本在 HTML 解析期同步执行，Vue 的 ES 模块是 defer 的（解析后、
// DOMContentLoaded 前执行）。本文件在 vue-main.js 中最先 import，确保 window.*
// 在 DOMContentLoaded 触发、遗留脚本的运行时调用发生之前就已就绪。
//
// 约定：当最后一个依赖某符号的遗留脚本迁移完成后（见 docs/vue-migration-plan.md
// 的 P11），本垫片与所有 window.* 引用将一并移除，届时经典 <script> 层彻底消失。

import * as utils from './utils.js'
import * as lunar from './lunar.js'
import * as holidays from './holidays.js'
import * as supabaseClient from './supabase/client.js'
import * as supabaseSocial from './supabase/social.js'
import * as supabaseSync from './supabase/sync.js'
import './electron/api.js' // 设置 window.calendarAPI（持久化后端的兼容层）
import * as calendar from './calendar/calendar.js'
import * as todos from './todos/todos.js'
import * as stats from './stats/stats.js'
import * as social from './social/social.js'
import * as reminders from './reminders/reminders.js'
import * as settings from './settings/settings.js'
import * as updater from './updater/updater.js'
import * as renderer from './renderer.js'
import './storage.js' // storage.js 自身已挂 window.__storage 并自动初始化

if (typeof window !== 'undefined') {
  // ===== utils =====
  window.showToast = utils.showToast
  window.sanitizeUrl = utils.sanitizeUrl
  window.isCapacitorPlatform = utils.isCapacitorPlatform
  window.showDiag = utils.showDiag
  window.lunarToSolar = utils.lunarToSolar
  window.escapeHtml = utils.escapeHtml
  window.escapeAttr = utils.escapeAttr
  window.getTodayStr = utils.getTodayStr
  window.dateToStr = utils.dateToStr
  window.getDaysInMonth = utils.getDaysInMonth
  window.getFirstDayOfWeek = utils.getFirstDayOfWeek
  window.formatDateCN = utils.formatDateCN

  // ===== lunar / holidays =====
  window.Lunar = lunar.Lunar
  window.HOLIDAYS = holidays.HOLIDAYS
  window.FIXED_HOLIDAYS = holidays.FIXED_HOLIDAYS

  // ===== supabase/client.js =====
  window.getSupabaseConfig = supabaseClient.getSupabaseConfig
  window.saveSupabaseConfig = supabaseClient.saveSupabaseConfig
  window.getBoundUserId = supabaseClient.getBoundUserId
  window.setBoundUserId = supabaseClient.setBoundUserId
  window.initSupabase = supabaseClient.initSupabase
  window.getCurrentUser = supabaseClient.getCurrentUser
  window.ensureSession = supabaseClient.ensureSession
  window.restoreExpiredSession = supabaseClient.restoreExpiredSession
  window.generateSalt = supabaseClient.generateSalt
  window.hashPassword = supabaseClient.hashPassword
  window.getSavedSalt = supabaseClient.getSavedSalt
  window.registerAccount = supabaseClient.registerAccount
  window.loginAccount = supabaseClient.loginAccount
  window.restoreAccount = supabaseClient.restoreAccount
  window.logoutAccount = supabaseClient.logoutAccount
  window.getSavedUsername = supabaseClient.getSavedUsername

  // ===== supabase/social.js =====
  window.getEffectiveUserId = supabaseSocial.getEffectiveUserId
  window.getProfile = supabaseSocial.getProfile
  window.getMyProfile = supabaseSocial.getMyProfile
  window.updateProfile = supabaseSocial.updateProfile
  window.uploadAvatar = supabaseSocial.uploadAvatar
  window.compressImage = supabaseSocial.compressImage
  window.uploadPostImage = supabaseSocial.uploadPostImage
  window.createPost = supabaseSocial.createPost
  window.getFeedPosts = supabaseSocial.getFeedPosts
  window.deletePost = supabaseSocial.deletePost
  window.toggleLike = supabaseSocial.toggleLike
  window.getComments = supabaseSocial.getComments
  window.addComment = supabaseSocial.addComment
  window.getFriendIds = supabaseSocial.getFriendIds
  window.getFriends = supabaseSocial.getFriends
  window.getFriendRequests = supabaseSocial.getFriendRequests
  window.sendFriendRequest = supabaseSocial.sendFriendRequest
  window.acceptFriendRequest = supabaseSocial.acceptFriendRequest
  window.rejectFriendRequest = supabaseSocial.rejectFriendRequest
  window.removeFriend = supabaseSocial.removeFriend
  window.getProfileByUserId = supabaseSocial.getProfileByUserId
  window.getProfileByDisplayId = supabaseSocial.getProfileByDisplayId
  window.isAdmin = supabaseSocial.isAdmin
  window.clearAllSocialData = supabaseSocial.clearAllSocialData
  window.deleteAllStorageFiles = supabaseSocial.deleteAllStorageFiles
  window.getTrashStats = supabaseSocial.getTrashStats
  window.restoreAllData = supabaseSocial.restoreAllData
  window.emptyTrash = supabaseSocial.emptyTrash
  window.resetSelected = supabaseSocial.resetSelected
  window.restoreSelected = supabaseSocial.restoreSelected
  window.emptySelected = supabaseSocial.emptySelected
  window.getTrashSizes = supabaseSocial.getTrashSizes

  // ===== supabase/sync.js =====
  window.isSyncEnabled = supabaseSync.isSyncEnabled
  window.setSyncEnabled = supabaseSync.setSyncEnabled
  window.collectCalendarData = supabaseSync.collectCalendarData
  window.applyCalendarData = supabaseSync.applyCalendarData
  window.pushCalendarData = supabaseSync.pushCalendarData
  window.pullCalendarData = supabaseSync.pullCalendarData
  window.syncCalendarData = supabaseSync.syncCalendarData
  window.pushToCloud = supabaseSync.pushToCloud
  window.pullFromCloud = supabaseSync.pullFromCloud
  window.autoSyncPush = supabaseSync.autoSyncPush

  // ===== calendar/calendar.js =====
  window.updateMonthLabel = calendar.updateMonthLabel
  window.getDayData = calendar.getDayData
  window.getHolidayInfo = calendar.getHolidayInfo
  window.renderCalendar = calendar.renderCalendar
  window.createDayCell = calendar.createDayCell
  window.onDayClick = calendar.onDayClick
  window.openDetailPanel = calendar.openDetailPanel
  window.closeDetailPanel = calendar.closeDetailPanel
  window.loadAllData = calendar.loadAllData
  window.loadHolidays = calendar.loadHolidays
  window.saveDay = calendar.saveDay
  window.saveCurrentDay = calendar.saveCurrentDay
  window.changeMonth = calendar.changeMonth

  // ===== todos/todos.js =====
  window.loadTodos = todos.loadTodos
  window.getTodosForDate = todos.getTodosForDate
  window.isTodoDone = todos.isTodoDone
  window.toggleTodoDone = todos.toggleTodoDone
  window.renderTodoList = todos.renderTodoList
  window.openTodoModal = todos.openTodoModal
  window.openEditTodoModal = todos.openEditTodoModal
  window.closeTodoModal = todos.closeTodoModal
  window.setupTodoModal = todos.setupTodoModal
  window.renderTodoView = todos.renderTodoView

  // ===== stats/stats.js =====
  window.exportStatsAsImage = stats.exportStatsAsImage

  // ===== social/social.js =====
  window.renderSocialView = social.renderSocialView
  window.renderSocialTabContent = social.renderSocialTabContent
  window.getCachedFeed = social.getCachedFeed
  window.isFeedCacheFresh = social.isFeedCacheFresh
  window.setCachedFeed = social.setCachedFeed
  window.renderFeedPosts = social.renderFeedPosts
  window.renderFeed = social.renderFeed
  window.setupFeedPullToRefresh = social.setupFeedPullToRefresh
  window.loadMoreFeedPosts = social.loadMoreFeedPosts
  window.renderPostCard = social.renderPostCard
  window.bindPostEvents = social.bindPostEvents
  window.bindPostEventsForElements = social.bindPostEventsForElements
  window.renderCommentsPanel = social.renderCommentsPanel
  window.openPostModal = social.openPostModal
  window.closePostModal = social.closePostModal
  window.setupPostImagePicker = social.setupPostImagePicker
  window.submitPost = social.submitPost
  window.renderFriends = social.renderFriends
  window.renderProfile = social.renderProfile
  window.getCurrentUserId = social.getCurrentUserId
  window.formatTime = social.formatTime
  window.checkDatabaseSetup = social.checkDatabaseSetup
  window.initSocial = social.initSocial

  // ===== reminders/reminders.js =====
  window.loadReminders = reminders.loadReminders
  window.generateNotifId = reminders.generateNotifId
  window.loadReminderRecords = reminders.loadReminderRecords
  window.getReminderRecordsForDate = reminders.getReminderRecordsForDate
  window.isReminderConfirmed = reminders.isReminderConfirmed
  window.renderClockinView = reminders.renderClockinView
  window.getWaterCount = reminders.getWaterCount
  window.setWaterCount = reminders.setWaterCount
  window.renderWaterTracker = reminders.renderWaterTracker
  window.sendTestNotification = reminders.sendTestNotification
  window.diagnoseNotifications = reminders.diagnoseNotifications
  window.getClockinStatusForDate = reminders.getClockinStatusForDate
  window.scheduleReminderNotifications = reminders.scheduleReminderNotifications
  window.scheduleTodoReminders = reminders.scheduleTodoReminders

  // ===== settings/settings.js =====
  window.renderSettingsView = settings.renderSettingsView
  window.setTheme = settings.setTheme
  window.loadTheme = settings.loadTheme
  window.updateAutoLaunchBtn = settings.updateAutoLaunchBtn
  window.checkAndroidPermissions = settings.checkAndroidPermissions
  window.updatePermStatus = settings.updatePermStatus

  // ===== updater/updater.js =====
  window.getLocalVersion = updater.getLocalVersion
  window.compareVersions = updater.compareVersions
  window.checkForUpdate = updater.checkForUpdate
  window.showUpdateDialog = updater.showUpdateDialog
  window.startDownload = updater.startDownload
  window.autoCheckUpdate = updater.autoCheckUpdate
  window.manualCheckUpdate = updater.manualCheckUpdate

  // ===== renderer.js =====
  window.refreshAllData = renderer.refreshAllData
  // 被其它 ES 模块按裸名调用的 renderer 函数，必须挂回 window.*
  // （window 是全局对象，裸标识符可解析到其属性）
  window.syncToWindow = renderer.syncToWindow
  window.switchView = renderer.switchView
  window.updateAccountUI = renderer.updateAccountUI
  window.setupEventListeners = renderer.setupEventListeners
}
