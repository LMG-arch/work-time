// shims.js — 过渡期 window.* 兼容桥（v3.17.42 精简版：148 → 55 绑定）
//
// v3.17.42 经典层（.app 死壳 + setupEventListeners 的 DOM 绑定）已下线，
// 本文件从 148 绑定精简到 55：只保留「有真实消费者」的绑定。
// 精简依据：stage4b-audit.cjs 的 window.* 消费点扫描（Vue 组件 / renderer.js / 模块间裸名）。
//
// 约定：最后一个消费者迁移完成后，对应绑定随之删除；全部迁完后本文件整体退役
// （见 docs/重构计划-2026-09-11.md P11）。

import * as utils from './utils.js'
import * as lunar from './lunar.js'
import * as holidays from './holidays.js'
import * as supabaseClient from './supabase/client.js'
import * as supabaseSocial from './supabase/social.js'
import * as supabaseSync from './supabase/sync.js'
import './electron/api.js' // 设置 window.calendarAPI（持久化层后的兼容层）
import * as calendar from './calendar/calendar.js'
import * as todos from './todos/todos.js'
import * as stats from './stats/stats.js'
import * as social from './social/social.js'
import * as reminders from './reminders/reminders.js'
import * as notifications from './lib/notifications.js' // S4.2：通知调度核心（原在 reminders.js）
import * as updater from './updater/updater.js'
// renderer.js：启动引导（副作用 import——其 scheduleInit() 在模块求值时触发）
import './renderer.js'
import { refreshAllData as dsRefreshAllData } from './lib/dataService.js'
import './storage.js' // storage.js 自身已挂 window.__storage 并自动初始化

if (typeof window !== 'undefined') {
  // ===== utils =====
  window.showToast = utils.showToast
  window.showDiag = utils.showDiag
  window.lunarToSolar = utils.lunarToSolar
  window.escapeHtml = utils.escapeHtml

  // ===== lunar / holidays =====
  window.Lunar = lunar.Lunar
  window.HOLIDAYS = holidays.HOLIDAYS
  window.FIXED_HOLIDAYS = holidays.FIXED_HOLIDAYS

  // ===== supabase/client.js =====
  window.getSupabaseConfig = supabaseClient.getSupabaseConfig
  window.saveSupabaseConfig = supabaseClient.saveSupabaseConfig
  window.initSupabase = supabaseClient.initSupabase
  window.getCurrentUser = supabaseClient.getCurrentUser
  window.registerAccount = supabaseClient.registerAccount
  window.loginAccount = supabaseClient.loginAccount
  window.logoutAccount = supabaseClient.logoutAccount
  window.getSavedUsername = supabaseClient.getSavedUsername

  // ===== supabase/social.js =====
  window.getEffectiveUserId = supabaseSocial.getEffectiveUserId
  window.getMyProfile = supabaseSocial.getMyProfile
  window.updateProfile = supabaseSocial.updateProfile
  window.uploadAvatar = supabaseSocial.uploadAvatar
  window.uploadPostImage = supabaseSocial.uploadPostImage
  window.createPost = supabaseSocial.createPost
  window.getFeedPosts = supabaseSocial.getFeedPosts
  window.deletePost = supabaseSocial.deletePost
  window.updatePost = supabaseSocial.updatePost
  window.toggleLike = supabaseSocial.toggleLike
  window.getComments = supabaseSocial.getComments
  window.addComment = supabaseSocial.addComment
  window.getFriends = supabaseSocial.getFriends
  window.getFriendRequests = supabaseSocial.getFriendRequests
  window.sendFriendRequest = supabaseSocial.sendFriendRequest
  window.acceptFriendRequest = supabaseSocial.acceptFriendRequest
  window.rejectFriendRequest = supabaseSocial.rejectFriendRequest
  window.removeFriend = supabaseSocial.removeFriend
  window.getProfileByUserId = supabaseSocial.getProfileByUserId
  window.getProfileByDisplayId = supabaseSocial.getProfileByDisplayId
  window.isAdmin = supabaseSocial.isAdmin
  window.getTrashStats = supabaseSocial.getTrashStats
  window.resetSelected = supabaseSocial.resetSelected
  window.restoreSelected = supabaseSocial.restoreSelected
  window.emptySelected = supabaseSocial.emptySelected
  window.getTrashSizes = supabaseSocial.getTrashSizes

  // ===== supabase/sync.js =====
  window.isSyncEnabled = supabaseSync.isSyncEnabled
  window.setSyncEnabled = supabaseSync.setSyncEnabled
  window.autoSyncPush = supabaseSync.autoSyncPush
  window.syncCalendarData = supabaseSync.syncCalendarData
  window.pushToCloud = supabaseSync.pushToCloud
  window.pullFromCloud = supabaseSync.pullFromCloud

  // ===== calendar/calendar.js =====
  window.getHolidayInfo = calendar.getHolidayInfo
  window.loadAllData = calendar.loadAllData
  window.loadHolidays = calendar.loadHolidays

  // ===== todos/todos.js =====
  window.loadTodos = todos.loadTodos
  window.getTodosForDate = todos.getTodosForDate
  window.isTodoDone = todos.isTodoDone

  // ===== stats/stats.js =====
  window.exportStatsAsImage = stats.exportStatsAsImage

  // ===== social/social.js =====
  window.getCurrentUserId = social.getCurrentUserId
  window.initSocial = social.initSocial

  // ===== reminders/reminders.js（数据层）=====
  window.loadReminders = reminders.loadReminders
  window.loadReminderRecords = reminders.loadReminderRecords

  // ===== lib/notifications.js（S4.2 调度核心，调度算法零改动）=====
  // 消费方 ReminderSettings.vue / SettingsPage.vue / renderer.js 仍按 window.* 调用
  window.sendTestNotification = notifications.sendTestNotification
  window.diagnoseNotifications = notifications.diagnoseNotifications
  window.scheduleReminderNotifications = notifications.scheduleReminderNotifications
  window.scheduleTodoReminders = notifications.scheduleTodoReminders

  // ===== updater/updater.js =====
  window.autoCheckUpdate = updater.autoCheckUpdate
  window.manualCheckUpdate = updater.manualCheckUpdate

  // ===== renderer.js / dataService.js =====
  // 数据刷新统一入口：旧名 window.refreshAllData 保留，改绑 dataService 实现
  // （social.js initSocial 等模块内裸名调用方零改动）
  window.refreshAllData = dsRefreshAllData
}
