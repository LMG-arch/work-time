// renderer.js — 主入口：全局状态初始化、事件监听、应用启动
//
// 全局状态与常量已统一迁移至 src/shared.js（以 window.* 暴露，供各 ES 模块按裸名访问）。
// 各业务模块（calendar/todos/stats/social/reminders/settings/updater）均已迁移为 ES 模块，
// 由 src/shims.js 统一导入并挂回 window.*，本文件按裸名 / window.* 调用它们。
//
// 本文件本身也已是 ES 模块（经 vue-main.js → shims.js 导入），不再作为经典 <script> 加载。

// 同步桥接：通知 Vue 日历组件当前年月与选中日期
export function syncToWindow() {
  if (window.__calendarSyncDate) {
    window.__calendarSyncDate(window.currentYear, window.currentMonth, window.selectedDate);
  }
}

// ===== View Router =====

// 底部导航滑动指示块：定位到当前激活的 .tool-btn
function moveToolbarIndicator() {
  const bar = document.querySelector('.toolbar');
  if (!bar) return;
  const indicator = bar.querySelector('.toolbar-indicator');
  const active = bar.querySelector('.tool-btn.active');
  if (!indicator || !active) return;
  const w = Math.max(18, active.offsetWidth * 0.5);
  indicator.style.width = w + 'px';
  indicator.style.transform = `translateX(${active.offsetLeft + (active.offsetWidth - w) / 2}px)`;
}

export function switchView(view) {
  currentView = view;
  syncToWindow();

  // Vue 管理的页面：隐藏传统 .app，显示 #app
  const VUE_PAGES = ['calendar', 'clockin', 'settings', 'social', 'stats']
  if (VUE_PAGES.includes(view)) {
    const tradApp = document.querySelector('.app');
    if (tradApp) tradApp.style.display = 'none';
    const appEl = document.getElementById('app');
    if (appEl) appEl.style.display = '';
    window.__vueActivate?.(view);
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    const activeMap = { calendar: 'home-btn', stats: 'stats-btn', clockin: 'clockin-btn', settings: 'settings-btn', social: 'social-btn' };
    const activeBtn = document.getElementById(activeMap[view]);
    if (activeBtn) activeBtn.classList.add('active');
    moveToolbarIndicator();
    return;
  }

  // 非 Vue 页面：隐藏 #app，显示传统 .app
  const appEl = document.getElementById('app');
  if (appEl) appEl.style.display = 'none';
  window.__vueDeactivate?.();
  const tradApp = document.querySelector('.app');
  if (tradApp) tradApp.style.display = '';

  document.querySelectorAll('.page-view').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
  const activeMap = { calendar: 'home-btn', stats: 'stats-btn', clockin: 'clockin-btn', settings: 'settings-btn', social: 'social-btn' };
  const activeBtn = document.getElementById(activeMap[view]);
  if (activeBtn) activeBtn.classList.add('active');
  moveToolbarIndicator();
}

// Refresh all data from storage and re-render current view
export async function refreshAllData() {
  try {
    allData = await window.calendarAPI.getAllData();
    window.allData = allData;
    allTodos = await window.calendarAPI.getTodos();
    window.allTodos = allTodos;
    allReminders = await window.calendarAPI.getReminders();
    window.allReminders = allReminders;
    allReminderRecords = await window.calendarAPI.getAllReminderRecords();
    window.allReminderRecords = allReminderRecords;
    // 仅在非 Vue 日历视图时调用传统 DOM 渲染
    if (currentView !== 'calendar' && currentView !== 'stats' && currentView !== 'settings' && currentView !== 'social') renderCalendar();
    // 通知 Vue 组件刷新
    if (currentView === 'calendar') {
      window.__refreshCalendarGrid?.();
      if (selectedDate) window.__refreshTodoList?.(selectedDate);
    }
    if (currentView === 'clockin') {
      renderClockinView();
      window.__refreshReminderList?.();
      window.__refreshReminderHistory?.();
    }
    if (currentView === 'stats') window.__refreshStats?.();
  } catch (e) {
    console.error('[refreshAllData] Failed:', e.message);
  }
}

// ===== Account UI =====

export async function updateAccountUI() {
  const loggedOut = document.getElementById('account-logged-out');
  const loggedIn = document.getElementById('account-logged-in');
  const savedUsername = getSavedUsername();
  const user = await getCurrentUser();
  if (user && savedUsername) {
    loggedOut.style.display = 'none';
    loggedIn.style.display = '';
    const profile = await getMyProfile();
    const nickname = profile ? profile.nickname : savedUsername;
    const displayId = profile ? profile.display_id : '-';
    const avatarEl = document.getElementById('account-avatar');
    if (profile && profile.avatar) {
      const safeAvatarUrl = typeof sanitizeUrl === 'function' ? sanitizeUrl(profile.avatar) : profile.avatar;
      avatarEl.innerHTML = `<img src="${escapeHtml(safeAvatarUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      avatarEl.classList.remove('avatar-placeholder');
    } else {
      avatarEl.textContent = nickname[0];
      avatarEl.classList.add('avatar-placeholder');
    }
    document.getElementById('account-nickname').textContent = nickname;
    document.getElementById('account-id').textContent = `ID: ${displayId} | ${savedUsername}`;
  } else {
    loggedOut.style.display = '';
    loggedIn.style.display = 'none';
    document.getElementById('reg-username').value = '';
    document.getElementById('reg-password').value = '';
    document.getElementById('auth-status').textContent = '';
  }
}

// ===== Event Listeners =====

function setupEventListeners() {
  // Touch swipe for month navigation (calendar view)
  let touchStartX = 0, touchStartY = 0;
  document.addEventListener('touchstart', (e) => {
    if (currentView !== 'calendar') return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (currentView !== 'calendar') return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      // 当 Vue 日历视图激活时，使用 Vue 的导航方法
      if (window.__calendarPrevMonth && window.__calendarNextMonth) {
        if (dx > 0) window.__calendarPrevMonth();
        else window.__calendarNextMonth();
      } else {
        if (dx > 0) changeMonth(-1); else changeMonth(1);
      }
    }
  }, { passive: true });

  document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
  document.getElementById('next-month').addEventListener('click', () => changeMonth(1));

  document.getElementById('today-btn').addEventListener('click', async () => {
    if (currentView === 'calendar') {
      window.__calendarGoToday?.();
      closeDetailPanel();
      await loadAllData();
      return;
    }
    const today = new Date();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();
    closeDetailPanel();
    await loadAllData();
    if (currentView === 'stats') window.__refreshStats?.();
    else renderClockinView();
    updateMonthLabel();
  });

  // Toolbar navigation
  document.getElementById('home-btn').addEventListener('click', () => switchView('calendar'));
  document.getElementById('stats-btn').addEventListener('click', () => switchView('stats'));
  document.getElementById('clockin-btn').addEventListener('click', () => switchView('clockin'));
  document.getElementById('settings-btn').addEventListener('click', () => switchView('settings'));
  document.getElementById('social-btn').addEventListener('click', () => switchView('social'));

  // Data export/import
  document.getElementById('export-btn').addEventListener('click', async () => {
    await window.calendarAPI.exportData();
    showToast('数据已导出');
  });
  document.getElementById('import-btn').addEventListener('click', async () => {
    const result = await window.calendarAPI.importData();
    if (result.success) {
      await loadAllData(); await loadTodos(); await loadReminders(); await loadReminderRecords();
      renderCalendar();
      showToast('数据已导入');
    } else if (result.error) {
      showToast('导入失败: ' + result.error);
    }
  });

  // Supabase config
  document.getElementById('supabase-save-btn').addEventListener('click', () => {
    const url = document.getElementById('supabase-url-input').value.trim();
    const key = document.getElementById('supabase-key-input').value.trim();
    if (!url || !key) { showToast('请填写完整配置'); return; }
    saveSupabaseConfig(url, key);
    sb = initSupabase();
    showToast('配置已保存');
  });

  document.getElementById('supabase-test-btn').addEventListener('click', async () => {
    const url = document.getElementById('supabase-url-input').value.trim();
    const key = document.getElementById('supabase-key-input').value.trim();
    if (!url || !key) { showToast('请填写完整配置'); return; }

    const results = [];
    function log(ok, msg) { results.push((ok ? '✓ ' : '✗ ') + msg); }

    log(true, '配置格式检查通过');
    try { saveSupabaseConfig(url, key); sb = initSupabase(); log(true, '客户端初始化成功'); }
    catch (e) { log(false, '客户端初始化失败: ' + e.message); showDiag(results.join('\n')); return; }

    try {
      const { error } = await sb.auth.getSession();
      if (error) log(false, '获取会话失败: ' + error.message);
      else log(true, '会话接口正常');
    } catch (e) { log(false, '会话异常: ' + e.message); }

    try {
      const { data: authData, error: authErr } = await sb.auth.signInAnonymously();
      if (authErr) log(false, '匿名登录失败: ' + authErr.message);
      else {
        log(true, '匿名登录成功: ' + authData.user.id.slice(0, 8) + '...');
        try {
          const { data: prof } = await sb.from('profiles').select('display_id').eq('id', authData.user.id).maybeSingle();
          if (prof && prof.display_id) log(true, '你的数字ID: ' + prof.display_id);
        } catch (e) { console.debug('[Test] Profile query failed:', e.message); }
      }
    } catch (e) { log(false, '匿名登录异常: ' + e.message); }

    try {
      const { data, error } = await sb.from('profiles').select('id').limit(1);
      if (error) {
        if (error.code === '42P01') { log(false, 'profiles 表不存在'); log(false, '→ 请到 Supabase SQL Editor 执行 supabase-setup.sql'); }
        else log(false, '查询 profiles 失败: ' + error.message + ' (code: ' + error.code + ')');
      } else log(true, 'profiles 表可访问 (共 ' + (data ? data.length : 0) + ' 条)');
    } catch (e) { log(false, '查询异常: ' + e.message); }

    try {
      const { error } = await sb.from('posts').select('id').limit(1);
      if (error) log(false, 'posts 表不可用: ' + error.message);
      else log(true, 'posts 表可访问');
    } catch (e) { log(false, 'posts 表异常: ' + e.message); }

    showDiag(results.join('\n'));
  });

  // 管理员回收站功能已由 SettingsPage.vue 处理
  // Called after initSocial() so Supabase client is ready

  // Clock-in settings
  document.getElementById('clockin-settings-btn')?.addEventListener('click', () => window.__openReminderSettings?.());
  // 提醒设置弹窗由 Vue ReminderSettings 组件处理

  // Auto-launch toggle
  const autoLaunchBtn = document.getElementById('auto-launch-btn');
  autoLaunchBtn.addEventListener('click', async () => {
    const current = await window.calendarAPI.getAutoLaunch();
    await window.calendarAPI.setAutoLaunch(!current);
    updateAutoLaunchBtn();
    showToast(current ? '已关闭开机自启' : '已开启开机自启');
  });

  // Check update button
  const checkUpdateBtn = document.getElementById('check-update-btn');
  if (checkUpdateBtn) {
    checkUpdateBtn.addEventListener('click', () => {
      if (typeof manualCheckUpdate === 'function') manualCheckUpdate();
    });
  }

  // ===== Account Registration / Login =====
  (async () => {
    const loggedOut = document.getElementById('account-logged-out');
    const loggedIn = document.getElementById('account-logged-in');
    const regUsername = document.getElementById('reg-username');
    const regPassword = document.getElementById('reg-password');
    const regBtn = document.getElementById('reg-btn');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const authStatus = document.getElementById('auth-status');

    const config = getSupabaseConfig();
    if (!config.url || !config.key) return;
    if (!sb) sb = initSupabase();

    updateAccountUI();

    regBtn.addEventListener('click', async () => {
      const username = regUsername.value.trim();
      const password = regPassword.value;
      regBtn.disabled = true;
      authStatus.textContent = '注册中...';
      try {
        const result = await registerAccount(username, password);
        if (result.error) { authStatus.textContent = result.error; authStatus.style.color = '#e53935'; }
        else { await getMyProfile(); authStatus.textContent = '注册成功！'; authStatus.style.color = ''; regUsername.value = ''; regPassword.value = ''; updateAccountUI(); }
      } finally { regBtn.disabled = false; }
    });

    loginBtn.addEventListener('click', async () => {
      const username = regUsername.value.trim();
      const password = regPassword.value;
      loginBtn.disabled = true;
      authStatus.textContent = '登录中...';
      try {
        const result = await loginAccount(username, password);
        if (result.error) { authStatus.textContent = result.error; authStatus.style.color = '#e53935'; }
        else {
          authStatus.textContent = '登录成功！'; authStatus.style.color = '';
          regUsername.value = ''; regPassword.value = '';
          updateAccountUI();
          try {
            await syncCalendarData();
            await refreshAllData();
          } catch (e) { console.log('[Login] Sync after login failed:', e.message); }
        }
      } finally { loginBtn.disabled = false; }
    });

    logoutBtn.addEventListener('click', async () => {
      if (!confirm('确定退出登录？')) return;
      logoutBtn.disabled = true;
      await logoutAccount();
      updateAccountUI();
      // Force re-enable inputs and buttons (Electron may lose focus after signOut)
      regBtn.disabled = false;
      loginBtn.disabled = false;
      regUsername.disabled = false;
      regPassword.disabled = false;
      regUsername.value = '';
      regPassword.value = '';
      authStatus.textContent = '';
      showToast('已退出登录');
      logoutBtn.disabled = false;
    });

    // Avatar upload
    document.getElementById('avatar-upload-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { showToast('图片不能超过5MB'); e.target.value = ''; return; }
      showToast('正在上传头像...');
      const result = await uploadAvatar(file);
      if (result.error) { showToast('上传失败: ' + result.error); }
      else {
        const avatarEl = document.getElementById('account-avatar');
        avatarEl.innerHTML = `<img src="${escapeHtml(result.url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        showToast('头像已更新 ✓');
      }
      e.target.value = '';
    });
  })();

  // ===== Data Sync Settings =====
  (async () => {
    const syncToggleBtn = document.getElementById('sync-toggle-btn');
    const syncNowBtn = document.getElementById('sync-now-btn');

    const config = getSupabaseConfig();
    if (!config.url || !config.key) { syncToggleBtn.disabled = true; syncNowBtn.disabled = true; syncToggleBtn.textContent = '需先配置服务'; return; }
    if (!sb) sb = initSupabase();

    function updateSyncToggleBtn() {
      const enabled = isSyncEnabled();
      syncToggleBtn.textContent = enabled ? '自动同步：开启' : '自动同步：关闭';
      syncToggleBtn.style.borderColor = enabled ? 'var(--accent)' : '';
      syncToggleBtn.style.color = enabled ? 'var(--accent)' : '';
    }
    updateSyncToggleBtn();

    syncToggleBtn.addEventListener('click', async () => {
      const next = !isSyncEnabled();
      setSyncEnabled(next);
      updateSyncToggleBtn();
      showToast(next ? '已开启自动同步' : '已关闭自动同步');
      if (next) {
        const r = await syncCalendarData();
        if (r.error) showToast('同步失败: ' + r.error);
        else {
          showToast('同步完成 ✓');
          await refreshAllData();
        }
      }
    });

    syncNowBtn.addEventListener('click', async () => {
      syncNowBtn.disabled = true; syncNowBtn.textContent = '同步中...';
      try {
        const result = await syncCalendarData();
        if (result.error) showToast('同步失败: ' + result.error);
        else {
          showToast('同步完成 ✓');
          await refreshAllData();
        }
      } finally { syncNowBtn.disabled = false; syncNowBtn.textContent = '立即同步'; }
    });

    // One-way sync buttons
    const pushBtn = document.getElementById('push-to-cloud-btn');
    const pullBtn = document.getElementById('pull-from-cloud-btn');

    if (pushBtn) {
      pushBtn.addEventListener('click', async () => {
        if (!confirm('上传本地数据将覆盖云端数据，确定继续？')) return;
        pushBtn.disabled = true; pushBtn.textContent = '上传中...';
        try {
          const result = await pushToCloud();
          if (result.error) showToast('上传失败: ' + result.error);
          else showToast('本地数据已上传到云端 ✓');
        } finally { pushBtn.disabled = false; pushBtn.textContent = '↑ 上传本地数据'; }
      });
    }

    if (pullBtn) {
      pullBtn.addEventListener('click', async () => {
        if (!confirm('下载云端数据将覆盖本地数据，确定继续？')) return;
        pullBtn.disabled = true; pullBtn.textContent = '下载中...';
        try {
          const result = await pullFromCloud();
          if (result.error) showToast('下载失败: ' + result.error);
          else {
            showToast('云端数据已下载到本地 ✓');
            await refreshAllData();
          }
        } finally { pullBtn.disabled = false; pullBtn.textContent = '↓ 下载云端数据'; }
      });
    }
  })();

  // ===== Collapsible Theme Section =====
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const grid = document.getElementById('settings-theme-grid');
    const arrow = document.querySelector('#theme-toggle .collapse-arrow');
    const isOpen = grid.style.display !== 'none';
    grid.style.display = isOpen ? 'none' : '';
    arrow.classList.toggle('open', !isOpen);
  });

  // ===== Nav Bar Settings =====
  (function() {
    const NAV_ITEMS_KEY = 'calendar-nav-items';
    const allNavItems = [
      { id: 'home', label: '日历', always: true },
      { id: 'clockin', label: '打卡' },
      { id: 'social', label: '好友' },
      { id: 'stats', label: '统计' },
      { id: 'settings', label: '设置', always: true }
    ];

    function getNavItems() {
      try { const val = window.__storage.get(NAV_ITEMS_KEY); if (val) return val; } catch (e) { console.warn('[Settings] Failed to parse nav items:', e.message); }
      return allNavItems.map(n => n.id);
    }
    function saveNavItems(items) { window.__storage.set(NAV_ITEMS_KEY, items); }
    function applyNavItems() {
      const enabled = getNavItems();
      allNavItems.forEach(item => {
        const btn = document.getElementById(item.id + '-btn');
        if (btn) btn.style.display = enabled.includes(item.id) ? '' : 'none';
      });
      moveToolbarIndicator();
    }

    document.getElementById('nav-toggle').addEventListener('click', () => {
      const content = document.getElementById('nav-settings-content');
      const arrow = document.querySelector('#nav-toggle .collapse-arrow');
      const isOpen = content.style.display !== 'none';
      content.style.display = isOpen ? 'none' : '';
      arrow.classList.toggle('open', !isOpen);
    });

    const list = document.getElementById('nav-items-list');
    const enabled = getNavItems();
    allNavItems.forEach(item => {
      const row = document.createElement('div');
      row.className = 'nav-item-row';
      const label = document.createElement('span');
      label.className = 'nav-item-label';
      label.textContent = item.label;
      if (item.always) { label.textContent += '（固定）'; label.style.color = 'var(--text3)'; }
      const toggle = document.createElement('button');
      toggle.className = 'nav-item-toggle' + (enabled.includes(item.id) ? ' on' : '');
      if (item.always) { toggle.disabled = true; toggle.style.opacity = '0.5'; }
      toggle.addEventListener('click', () => {
        let items = getNavItems();
        if (items.includes(item.id)) { items = items.filter(i => i !== item.id); toggle.classList.remove('on'); }
        else { items.push(item.id); toggle.classList.add('on'); }
        saveNavItems(items); applyNavItems();
      });
      row.appendChild(label); row.appendChild(toggle); list.appendChild(row);
    });
    applyNavItems();
  })();

  // Close modals on backdrop click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
  });

  // Status buttons 和备注保存由 Vue DetailPanel 处理

  // Todo add button
  document.getElementById('todo-add-btn').addEventListener('click', () => window.__openTodoModal?.());

  // Post modal 由 SocialPage.vue 处理

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft') {
      if (currentView === 'calendar') window.__calendarPrevMonth?.();
      else changeMonth(-1);
    }
    if (e.key === 'ArrowRight') {
      if (currentView === 'calendar') window.__calendarNextMonth?.();
      else changeMonth(1);
    }
    if (e.key === 't' && !e.ctrlKey && !e.metaKey) { window.__openTodoModal?.(); e.preventDefault(); }
    if (e.key === 'Escape') {
      closeDetailPanel();
      closeTodoModal();
      window.__closeReminderSettings?.();
    }
  });
}

// ===== Admin Controls =====

// ===== Init =====

document.addEventListener('DOMContentLoaded', async () => {
  try {
    loadTheme();
  } catch (e) {
    console.error('[Init] loadTheme failed:', e.message);
  }

  const today = new Date();
  currentYear = today.getFullYear();
  currentMonth = today.getMonth();

  try {
    await Promise.all([loadAllData(), loadHolidays(), loadTodos(), loadReminders(), loadReminderRecords()]);
  } catch (e) {
    console.error('[Init] Data loading failed:', e.message);
  }

  try {
    renderCalendar();
  } catch (e) {
    console.error('[Init] renderCalendar failed:', e.message);
  }

  try {
    setupEventListeners();
  } catch (e) {
    console.error('[Init] setupEventListeners failed:', e.message);
  }

  // Setup interactive components (deferred from module load)
  try {
// setupColorPicker/setupTagInputs/setupTodoModal 由 Vue 组件替代
    // setupPostImagePicker 由 SocialPage.vue 处理
  } catch (e) {
    console.error('[Init] Interactive components setup failed:', e.message);
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

  // setupAdminControls 已由 SettingsPage.vue 处理

  // Listen for reminder confirmations from Electron main process
  try {
    if (window.calendarAPI?.onReminderConfirmed) {
      window.calendarAPI.onReminderConfirmed(async (data) => {
        if (!allReminderRecords[data.date]) allReminderRecords[data.date] = {};
        allReminderRecords[data.date][data.reminderId] = { confirmed: true, at: new Date().toISOString() };
        window.allReminderRecords = allReminderRecords;
        if (currentView === 'clockin') {
          renderClockinView();
          window.__refreshReminderList?.();
          window.__refreshReminderHistory?.();
        }
        renderCalendar();
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
            refreshAllData();
          }).catch(e => {
            console.error('[onDataChanged] Sync failed:', e.message);
          });
        }
      });
    }
  } catch (e) {
    console.error('[Init] onDataChanged setup failed:', e.message);
  }

  // Hide auto-launch on mobile
  try {
    if (window.Capacitor || !navigator.userAgent.includes('Electron')) {
      const autoBtn = document.getElementById('auto-launch-btn');
      if (autoBtn) autoBtn.parentElement.style.display = 'none';
    }
  } catch (e) {
    console.error('[Init] Auto-launch hide failed:', e.message);
  }

  // 启动时自动检查更新
  try {
    if (typeof autoCheckUpdate === 'function') autoCheckUpdate();
  } catch (e) {
    console.error('[Init] autoCheckUpdate failed:', e.message);
  }

  // 关键修复：应用启动即激活 Vue 层，默认显示现代化日历视图。
  // 否则 #app 始终 display:none，用户看到的是遗留的传统 .app 旧界面，
  // 所有 Vue 现代化改造（CalendarView/SettingsPage 等）永远不会显示。
  try {
    if (typeof window.__vueActivate === 'function') {
      switchView('calendar');
    } else {
      console.warn('[Init] Vue 层尚未就绪，回退到传统渲染');
      renderCalendar();
    }
  } catch (e) {
    console.error('[Init] 激活 Vue 层失败，回退传统渲染:', e.message);
    renderCalendar();
  }

  // 导航指示块：首屏布局稳定后定位，并随窗口尺寸变化重定位
  try {
    requestAnimationFrame(moveToolbarIndicator);
    window.addEventListener('resize', moveToolbarIndicator);
  } catch (e) {
    console.error('[Init] 导航指示块初始化失败:', e.message);
  }
});
