// renderer.js — Main entry, global state, event listeners, init
// Depends on: utils.js, holidays.js, lunar.js, web-api.js, supabase.js, social.js
//             calendar.js, todos.js, reminders.js, stats.js, settings.js

// ===== Global State =====

let currentYear, currentMonth;
let selectedDate = null;
let allData = {};
let allTodos = [];
let currentView = 'calendar';
let todoFilter = 'all';
let holidayData = null;
let allReminders = [];
let allReminderRecords = {};
let reminderNotifTimer = null;

const WEEKDAYS_CN = ['日', '一', '二', '三', '四', '五', '六'];
const STATUS_LABELS = { work: '上班', rest: '休息', trip: '出差', leave: '请假', annual: '年假', sick: '病假', personal: '事假' };
const STATUS_CHARS = { work: '班', rest: '休', trip: '差', leave: '假', annual: '年', sick: '病', personal: '事' };

const THEMES = [
  { id: 'default', name: '经典', color: '#333' },
  { id: 'dark',    name: '暗黑', color: '#1a1a2e' },
  { id: 'green',   name: '清新', color: '#43A047' },
  { id: 'pink',    name: '粉色', color: '#e91e63' },
  { id: 'purple',  name: '紫色', color: '#7e57c2' },
  { id: 'navy',    name: '商务', color: '#1565c0' },
  { id: 'ocean',   name: '海洋', color: '#00838f' },
  { id: 'sunset',  name: '日落', color: '#e65100' },
  { id: 'rose',    name: '玫瑰金', color: '#b76e79' },
  { id: 'forest',  name: '森林', color: '#2e7d32' },
  { id: 'coffee',  name: '咖啡', color: '#5d4037' },
  { id: 'lavender',name: '薰衣草', color: '#9575cd' },
  { id: 'mint',    name: '薄荷', color: '#26a69a' },
  { id: 'slate',   name: '石板', color: '#546e7a' },
];

// ===== View Router =====

function switchView(view) {
  currentView = view;
  document.getElementById('calendar-view').style.display = view === 'calendar' ? '' : 'none';
  document.getElementById('stats-view').style.display = view === 'stats' ? '' : 'none';
  document.getElementById('clockin-view').style.display = view === 'clockin' ? '' : 'none';
  document.getElementById('settings-view').style.display = view === 'settings' ? '' : 'none';
  document.getElementById('social-view').style.display = view === 'social' ? '' : 'none';
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
  const activeMap = { calendar: 'home-btn', stats: 'stats-btn', clockin: 'clockin-btn', settings: 'settings-btn', social: 'social-btn' };
  const activeBtn = document.getElementById(activeMap[view]);
  if (activeBtn) activeBtn.classList.add('active');
  if (view === 'stats') renderStats();
  if (view === 'clockin') renderClockinView();
  if (view === 'settings') renderSettingsView();
  if (view === 'social') renderSocialView();
}

// Refresh all data from storage and re-render current view
async function refreshAllData() {
  try {
    allData = await window.calendarAPI.getAllData();
    allTodos = await window.calendarAPI.getTodos();
    allReminders = await window.calendarAPI.getReminders();
    allReminderRecords = await window.calendarAPI.getAllReminderRecords();
    renderCalendar();
    if (currentView === 'clockin') renderClockinView();
    if (currentView === 'stats') renderStats();
  } catch (e) {
    console.error('[refreshAllData] Failed:', e.message);
  }
}

// ===== Account UI =====

async function updateAccountUI() {
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
      avatarEl.innerHTML = `<img src="${escapeHtml(profile.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
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
  // Touch swipe for month navigation
  let touchStartX = 0, touchStartY = 0;
  const calendarView = document.getElementById('calendar-view');
  calendarView.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  calendarView.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0) changeMonth(-1); else changeMonth(1);
    }
  }, { passive: true });

  document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
  document.getElementById('next-month').addEventListener('click', () => changeMonth(1));

  document.getElementById('today-btn').addEventListener('click', async () => {
    const today = new Date();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();
    closeDetailPanel();
    await loadAllData();
    if (currentView === 'calendar') renderCalendar();
    else if (currentView === 'stats') renderStats();
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
        } catch {}
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

  function showDiag(message) {
    const existing = document.getElementById('diag-panel');
    if (existing) existing.remove();
    const panel = document.createElement('div');
    panel.id = 'diag-panel';
    panel.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;max-width:420px;width:90%;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.2);font-size:13px;white-space:pre-line;line-height:1.8;color:var(--text);';
    panel.innerHTML = '<div style="font-size:15px;font-weight:600;margin-bottom:12px;">🔍 诊断结果</div><div>' + escapeHtml(message).replace(/\n/g, '<br>') + '</div>' +
      '<button id="diag-close" style="margin-top:16px;width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--card);cursor:pointer;font-size:13px;">关闭</button>';
    document.body.appendChild(panel);
    document.getElementById('diag-close').addEventListener('click', () => panel.remove());
  }

  // Clear Supabase data (admin only) — deferred to setupAdminControls()
  // Called after initSocial() so Supabase client is ready

  // Clock-in settings
  document.getElementById('clockin-settings-btn').addEventListener('click', openReminderSettings);
  document.getElementById('reminder-modal-cancel').addEventListener('click', closeReminderSettings);
  document.getElementById('reminder-modal-save').addEventListener('click', saveReminderSettings);
  document.getElementById('reminder-test-btn').addEventListener('click', sendTestNotification);

  // Auto-launch toggle
  const autoLaunchBtn = document.getElementById('auto-launch-btn');
  autoLaunchBtn.addEventListener('click', async () => {
    const current = await window.calendarAPI.getAutoLaunch();
    await window.calendarAPI.setAutoLaunch(!current);
    updateAutoLaunchBtn();
    showToast(current ? '已关闭开机自启' : '已开启开机自启');
  });

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
      try { const raw = localStorage.getItem(NAV_ITEMS_KEY); if (raw) return JSON.parse(raw); } catch {}
      return allNavItems.map(n => n.id);
    }
    function saveNavItems(items) { localStorage.setItem(NAV_ITEMS_KEY, JSON.stringify(items)); }
    function applyNavItems() {
      const enabled = getNavItems();
      allNavItems.forEach(item => {
        const btn = document.getElementById(item.id + '-btn');
        if (btn) btn.style.display = enabled.includes(item.id) ? '' : 'none';
      });
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

  // Status buttons (work/rest/trip)
  document.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!selectedDate) return;
      const status = btn.dataset.status;
      const dayData = getDayData(selectedDate);
      const newStatus = dayData.status === status ? '' : status;
      await saveCurrentDay(newStatus);
      document.querySelectorAll('.status-btn').forEach(b => b.classList.toggle('active', b.dataset.status === newStatus));
      renderCalendar();
    });
  });

  // Todo add button
  document.getElementById('todo-add-btn').addEventListener('click', openTodoModal);

  // Save note button
  document.getElementById('save-note-btn').addEventListener('click', async () => {
    if (!selectedDate) return;
    const note = document.getElementById('note-input').value;
    await saveCurrentDay(null, note);
    showToast('备注已保存');
  });

  // Post modal buttons
  document.getElementById('post-modal-cancel').addEventListener('click', closePostModal);
  document.getElementById('post-modal-submit').addEventListener('click', submitPost);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft') changeMonth(-1);
    if (e.key === 'ArrowRight') changeMonth(1);
    if (e.key === 't' && !e.ctrlKey && !e.metaKey) { openTodoModal(); e.preventDefault(); }
    if (e.key === 'Escape') {
      closeDetailPanel();
      closeTodoModal();
      closePostModal();
      closeReminderSettings();
    }
  });
}

// ===== Admin Controls =====

async function setupAdminControls() {
  const clearBtn = document.getElementById('supabase-clear-btn');
  const clearHint = clearBtn?.nextElementSibling;
  if (await isAdmin()) {
    const TABLES = [
      { key: 'posts', label: '动态' },
      { key: 'comments', label: '评论' },
      { key: 'likes', label: '点赞' },
      { key: 'friendships', label: '好友关系' },
      { key: 'profiles', label: '用户' }
    ];

    function getSelectedTables() {
      const checked = document.querySelectorAll('.trash-check:checked');
      if (checked.length === 0) return null;
      return Array.from(checked).map(cb => cb.dataset.table);
    }
    function getSelectedLabel() {
      const tables = getSelectedTables();
      if (!tables) return '全部';
      return tables.map(t => TABLES.find(x => x.key === t)?.label || t).join('、');
    }

    // Insert checkboxes BEFORE the clear button
    const container = clearBtn.parentElement;
    const selectorDiv = document.createElement('div');
    selectorDiv.style.cssText = 'margin-bottom:8px;';
    selectorDiv.innerHTML = `
      <div style="font-size:11px;color:var(--text3);margin-bottom:4px;">勾选数据类型（不勾选 = 全部）</div>
      <div style="display:flex;flex-wrap:wrap;gap:2px 10px;">
        ${TABLES.map(t => `<label style="font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;">
          <input type="checkbox" class="trash-check" data-table="${t.key}" style="width:14px;height:14px;">${t.label}
          <span id="data-size-${t.key}" style="color:var(--text3);font-size:11px;"></span>
        </label>`).join('')}
      </div>
    `;
    container.insertBefore(selectorDiv, clearBtn);

    // Clear button — selective
    clearBtn.addEventListener('click', async () => {
      const label = getSelectedLabel();
      if (!confirm(`⚠️ 即将清除以下数据：${label}\n\n数据会移入回收站，可从回收站恢复。\n\n继续吗？`)) return;
      if (!confirm('再次确认：真的要清除吗？')) return;
      showToast('正在清除...');
      const tables = getSelectedTables() || TABLES.map(t => t.key);
      const result = await resetSelected(tables);
      if (result.error) showToast('清除失败: ' + result.error);
      else { showToast('数据已移入回收站 ✓'); updateTrashStats(); }
    });

    // Trash section below
    const trashSection = document.createElement('div');
    trashSection.id = 'trash-section';
    trashSection.style.cssText = 'margin-top:12px;border-top:1px solid var(--border);padding-top:12px;';
    trashSection.innerHTML = `
      <div style="font-size:13px;font-weight:600;margin-bottom:8px;">🗑️ 回收站</div>
      <div id="trash-stats" class="settings-hint" style="margin-bottom:8px;">加载中...</div>
      <div style="display:flex;gap:8px;">
        <button id="trash-restore-btn" class="settings-action-btn" style="flex:1;">恢复数据</button>
        <button id="trash-empty-btn" class="settings-action-btn" style="flex:1;color:#e53935;border-color:#e53935;">清空回收站</button>
      </div>
    `;
    container.appendChild(trashSection);

    async function updateTrashStats() {
      const statsEl = document.getElementById('trash-stats');
      if (!statsEl) return;
      const [stats, sizes] = await Promise.all([getTrashStats(), getTrashSizes()]);
      // Update size labels next to checkboxes
      if (sizes) {
        const sizeMap = {};
        sizes.forEach(s => { sizeMap[s.table_name] = { count: Number(s.deleted_count), size: s.total_size }; });
        TABLES.forEach(t => {
          const el = document.getElementById(`data-size-${t.key}`);
          if (el && sizeMap[t.key]) {
            const info = sizeMap[t.key];
            const parts2 = [info.size];
            if (info.count > 0) parts2.push(`回收站${info.count}条`);
            el.textContent = `(${parts2.join(', ')})`;
          }
        });
      }
      if (!stats || stats.total === 0) { statsEl.textContent = '回收站为空'; return; }
      const parts = [];
      if (stats.profiles) parts.push(`${stats.profiles} 个用户`);
      if (stats.posts) parts.push(`${stats.posts} 条动态`);
      if (stats.comments) parts.push(`${stats.comments} 条评论`);
      if (stats.likes) parts.push(`${stats.likes} 个点赞`);
      if (stats.friendships) parts.push(`${stats.friendships} 条好友关系`);
      statsEl.textContent = `共 ${stats.total} 条：${parts.join('、')}`;
    }
    updateTrashStats();

    document.getElementById('trash-restore-btn').addEventListener('click', async () => {
      const label = getSelectedLabel();
      if (!confirm(`确定从回收站恢复以下数据？\n${label}`)) return;
      showToast('正在恢复...');
      const tables = getSelectedTables() || TABLES.map(t => t.key);
      const result = await restoreSelected(tables);
      if (result.error) showToast('恢复失败: ' + result.error);
      else {
        showToast('数据已恢复 ✓');
        await refreshAllData();
        updateTrashStats();
      }
    });

    document.getElementById('trash-empty-btn').addEventListener('click', async () => {
      const label = getSelectedLabel();
      if (!confirm(`⚠️ 以下数据将永久删除，无法恢复！\n${label}\n\n确定继续？`)) return;
      if (!confirm('再次确认：真的要永久删除吗？')) return;
      showToast('正在清空...');
      const tables = getSelectedTables() || TABLES.map(t => t.key);
      const result = await emptySelected(tables);
      if (result.error) showToast('清空失败: ' + result.error);
      else { showToast('回收站已清空'); updateTrashStats(); }
    });
  } else {
    if (clearBtn) clearBtn.style.display = 'none';
    if (clearHint) clearHint.style.display = 'none';
  }
}

// ===== Init =====

document.addEventListener('DOMContentLoaded', async () => {
  loadTheme();
  const today = new Date();
  currentYear = today.getFullYear();
  currentMonth = today.getMonth();
  await Promise.all([loadAllData(), loadHolidays(), loadTodos(), loadReminders(), loadReminderRecords()]);
  renderCalendar();
  setupEventListeners();

  // Setup interactive components (deferred from module load)
  if (typeof setupColorPicker === 'function') setupColorPicker();
  if (typeof setupTagInputs === 'function') setupTagInputs();
  if (typeof setupTodoModal === 'function') setupTodoModal();
  if (typeof setupPostImagePicker === 'function') setupPostImagePicker();

  scheduleReminderNotifications();
  scheduleTodoReminders();

  // Init social (Supabase)
  if (typeof initSocial === 'function') await initSocial();

  // Setup admin controls (needs Supabase to be initialized first)
  if (typeof setupAdminControls === 'function') await setupAdminControls();

  // Listen for reminder confirmations from Electron main process
  if (window.calendarAPI.onReminderConfirmed) {
    window.calendarAPI.onReminderConfirmed(async (data) => {
      if (!allReminderRecords[data.date]) allReminderRecords[data.date] = {};
      allReminderRecords[data.date][data.reminderId] = { confirmed: true, at: new Date().toISOString() };
      if (currentView === 'clockin') renderClockinView();
      renderCalendar();
      showToast('打卡成功 ✓');
    });
  }

  // Electron: auto-sync when data changes in main process
  if (window.calendarAPI?.onDataChanged) {
    window.calendarAPI.onDataChanged(() => {
      if (typeof autoSyncPush === 'function') {
        autoSyncPush().then(() => {
          refreshAllData();
        });
      }
    });
  }

  // Hide auto-launch on mobile
  if (window.Capacitor || !navigator.userAgent.includes('Electron')) {
    const autoBtn = document.getElementById('auto-launch-btn');
    if (autoBtn) autoBtn.parentElement.style.display = 'none';
  }
});
