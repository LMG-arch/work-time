// renderer.js — 启动引导（v3.17.42 重构阶段 4b 精简版）
//
// v3.17.42 起经典层（.app 死壳 / .toolbar / setupEventListeners 的 60 处 DOM 绑定）
// 已全部下线，本文件只保留三类职责：
//   1. 启动引导：数据加载 → 通知调度 → 社交初始化 → 生命周期事件监听
//   2. 过渡期桥：syncToWindow（日历年月/选中日期推送给 Vue，保留现名避免打断消费方）
//   3. 原生事件：onReminderConfirmed / onDataChanged（Electron 主进程 → 渲染层）
//
// 数据刷新唯一入口 = src/lib/dataService.js（refreshAllData/refreshCalendarData）。
// UI 渲染唯一外壳 = Vue（App.vue → LifeWorkbench 统一外壳）。

// ===== 过渡期桥 =====

// 同步桥接：通知 Vue 日历组件当前年月与选中日期
export function syncToWindow() {
  if (window.__calendarSyncDate) {
    window.__calendarSyncDate(window.currentYear, window.currentMonth, window.selectedDate);
  }
}

// ===== Init =====

async function initApp() {
  window.__bootLog && window.__bootLog('DOMContentLoaded fired');

  // v3.17.38 主题由 appStore 在创建时应用（键 calendar-theme 单一真值）

  // ===== UI 引导（同步、不依赖 IPC）=====
  // 导航与激活完全由 Vue 统一外壳负责（App.vue onMounted 即挂 life-mode）。
  // 即使数据 IPC 卡住，Vue 层也已照常显示——此处只需把数据灌进来。
  try {
    if (typeof window.__vueActivate === 'function') {
      window.__vueActivate('calendar');
      window.__bootLog && window.__bootLog('vueActivate(calendar) done');
    } else {
      console.warn('[Init] __vueActivate 未就绪（Vue 外壳未挂载）');
    }
  } catch (e) {
    console.error('[Init] 激活 Vue 层失败:', e.message);
  }

  window.__bootLog && window.__bootLog('loading data via IPC (calendarAPI exists=' + !!window.calendarAPI + ')...');
  try {
    await Promise.all([window.loadAllData(), window.loadHolidays(), window.loadTodos(), window.loadReminders(), window.loadReminderRecords()]);
    // 上班数据首次加载完成后重渲染时光档案（含「上班」展示）
    try { window.__lifeRefreshArchive?.(); } catch (e) {}
    window.__bootLog && window.__bootLog('all data loaded OK');
  } catch (e) {
    console.error('[Init] Data loading failed:', e.message);
    window.__bootLog && window.__bootLog('data loading ERROR: ' + e.message);
  }

  // 数据灌入后通知 Vue 各视图重渲染（纯重渲染，无副作用）
  try {
    window.__refreshCalendarGrid?.();
    window.__refreshReminderList?.();
    window.__refreshReminderHistory?.();
    window.__refreshTodoView?.();
    window.__refreshStats?.();
    window.__refreshSocialFeed?.();
    window.__refreshFriendRequests?.();
  } catch (e) {
    console.error('[Init] Vue refresh hooks failed:', e.message);
  }

  try {
    scheduleReminderNotifications();
    scheduleTodoReminders();
  } catch (e) {
    console.error('[Init] Reminder scheduling failed:', e.message);
  }

  // Init social (Supabase)
  try {
    if (typeof initSocial === 'function') await initSocial();
  } catch (e) {
    console.error('[Init] initSocial failed:', e.message);
  }

  // 关键修复（v3.17.28 起）：SocialPage 常驻挂载，其 onMounted 早于 initSocial 完成，
  // 导致首屏 loadPosts 时 window.sb 尚未就绪而拉空且无重试。
  // 这里在 Supabase 客户端就绪后重放好友动态与好友申请刷新。
  try {
    window.__refreshSocialFeed?.();
    window.__refreshFriendRequests?.();
  } catch (e) {
    console.error('[Init] social refresh replay failed:', e.message);
  }

  // Listen for reminder confirmations from Electron main process
  try {
    if (window.calendarAPI?.onReminderConfirmed) {
      window.calendarAPI.onReminderConfirmed(async (data) => {
        if (!window.allReminderRecords[data.date]) window.allReminderRecords[data.date] = {};
        window.allReminderRecords[data.date][data.reminderId] = { confirmed: true, at: new Date().toISOString() };
        try { window.__refreshReminderList?.(); window.__refreshReminderHistory?.(); } catch (e) {}
        window.__refreshCalendarGrid?.();
        showToast('打卡成功 ✓');
      });
    }
  } catch (e) {
    console.error('[Init] onReminderConfirmed setup failed:', e.message);
  }

  // Electron: auto-sync when data changes in main process
  try {
    if (window.calendarAPI?.onDataChanged) {
      window.calendarAPI.onDataChanged(() => {
        if (typeof autoSyncPush === 'function') {
          autoSyncPush().then(() => {
            // 数据回灌统一走 dataService（store → 纯重渲染）
            import('./lib/dataService.js').then(m => m.refreshAllData()).catch(e => {
              console.error('[onDataChanged] refresh failed:', e.message);
            });
          }).catch(e => {
            console.error('[onDataChanged] Sync failed:', e.message);
          });
        }
      });
    }
  } catch (e) {
    console.error('[Init] onDataChanged setup failed:', e.message);
  }

  // 启动时自动检查更新
  try {
    if (typeof autoCheckUpdate === 'function') autoCheckUpdate();
  } catch (e) {
    console.error('[Init] autoCheckUpdate failed:', e.message);
  }
}

// ===== 健壮触发：修复 ESM 加载顺序 + DOMContentLoaded 时机问题 =====
//
// 三层防御：
// 1. ESM 导入顺序：renderer.js 由 shims.js import，在 shims 填充 window.* 之前就
//    被求值。用 queueMicrotask 延迟到同步导入链完成后再执行（此时 window.* 就绪）。
// 2. DOMContentLoaded：ESM 异步加载时该事件可能已触发。用 readyState 检查守卫。
// 3. 全局函数就绪门：即使微任务延迟后仍有极端时序问题，检查关键函数是否存在，
//    不存在则轮询等待（最长 5s），避免 ReferenceError/TypeError 风暴触发 fatal-overlay。

function scheduleInit() {
  // 防御 1：等 DOM 就绪
  function whenDOMReady() {
    return new Promise(resolve => {
      if (document.readyState !== 'loading') resolve();
      else document.addEventListener('DOMContentLoaded', resolve, { once: true });
    });
  }

  // 防御 3：等 window.* 全局函数填充完毕
  function whenGlobalsReady() {
    const required = ['getSupabaseConfig', 'renderCalendar', 'loadAllData'];
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function check() {
        const missing = required.filter(fn => typeof window[fn] !== 'function');
        if (missing.length === 0) { resolve(); return; }
        if (Date.now() - start > 5000) {
          console.warn('[Init] Globals still missing after 5s:', missing.join(', '));
          resolve(); // 超时也继续执行（让 showFatal 报具体错）
          return;
        }
        setTimeout(check, 50);
      })();
    });
  }

  // 微任务延迟：等 ESM 导入链同步完成（shims.js 填充 window.*）
  queueMicrotask(async () => {
    try {
      await whenDOMReady();
      await whenGlobalsReady();
      window.__bootLog && window.__bootLog('[Init] all prerequisites ready, calling initApp');
      initApp();
    } catch (e) {
      console.error('[Init] scheduleInit failed:', e.message);
      // 最后兜底：直接调用，让 showFatal 接住错误
      initApp();
    }
  });
}

scheduleInit();
