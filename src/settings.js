// settings.js — Settings view, theme, auto-launch

function renderSettingsView() {
  // Theme grid
  const grid = document.getElementById('settings-theme-grid');
  const currentTheme = document.body.dataset.theme || 'default';
  grid.innerHTML = '';
  for (const t of THEMES) {
    const opt = document.createElement('div');
    opt.className = 'theme-opt' + (currentTheme === t.id ? ' active' : '');
    opt.dataset.theme = t.id;
    opt.innerHTML = `<div class="theme-dot" style="background:${escapeAttr(t.color)}"></div><span>${escapeHtml(t.name)}</span>`;
    opt.addEventListener('click', () => {
      setTheme(t.id);
      grid.querySelectorAll('.theme-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
    });
    grid.appendChild(opt);
  }

  // Supabase config
  const config = getSupabaseConfig();
  const urlInput = document.getElementById('supabase-url-input');
  const keyInput = document.getElementById('supabase-key-input');
  if (urlInput) urlInput.value = config.url || '';
  if (keyInput) keyInput.value = config.key || '';

  // Auto-launch button
  updateAutoLaunchBtn();

  // Refresh account info (avatar, nickname, ID)
  if (typeof updateAccountUI === 'function') updateAccountUI();

  // Android permissions check
  checkAndroidPermissions();
}

function setTheme(themeId) {
  document.body.dataset.theme = themeId;
  localStorage.setItem('calendar-theme', themeId);
}

function loadTheme() {
  const saved = localStorage.getItem('calendar-theme') || 'default';
  document.body.dataset.theme = saved;
}

async function updateAutoLaunchBtn() {
  const enabled = await window.calendarAPI.getAutoLaunch();
  const btn = document.getElementById('auto-launch-btn');
  if (!btn) return;
  btn.classList.toggle('toggle-active', enabled);
  btn.textContent = enabled ? '✓ 开机自启已开启' : '开机自启';
}

// Android permissions check
async function checkAndroidPermissions() {
  const group = document.getElementById('android-perms-group');
  if (!group || !isCapacitorPlatform()) return;

  group.style.display = '';

  // Collapsible toggle
  const toggle = document.getElementById('perms-toggle');
  const content = document.getElementById('perms-content');
  if (toggle && content) {
    toggle.onclick = () => {
      const shown = content.style.display !== 'none';
      content.style.display = shown ? 'none' : '';
    };
  }

  const list = document.getElementById('perms-list');
  if (!list) return;

  const perms = [
    { name: '通知权限', desc: '打卡提醒和待办提醒', key: 'notification' },
    { name: '精确闹钟', desc: '准时提醒不延迟', key: 'exact-alarm' },
    { name: '后台弹出界面', desc: '后台收到通知时显示', key: 'overlay' },
    { name: '电池优化', desc: '关闭省电限制，确保后台通知正常', key: 'battery' },
    { name: '安装应用', desc: '应用内更新下载安装', key: 'install' },
  ];

  list.innerHTML = '';
  for (const p of perms) {
    const item = document.createElement('div');
    item.className = 'perm-item';
    item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);';
    item.innerHTML = `
      <div>
        <div style="font-size:13px;font-weight:500;">${p.name}</div>
        <div style="font-size:11px;color:var(--text-secondary);">${p.desc}</div>
      </div>
      <span class="perm-status" data-key="${p.key}" style="font-size:12px;padding:2px 8px;border-radius:4px;">检查中...</span>
    `;
    list.appendChild(item);
  }

  // Check permissions
  try {
    const { LocalNotifications } = window.Capacitor.Plugins;

    // Notification permission
    if (LocalNotifications) {
      const perm = await LocalNotifications.checkPermissions();
      updatePermStatus('notification', perm.display === 'granted');

      // Exact alarm
      if (LocalNotifications.checkExactNotificationSetting) {
        try {
          const exact = await LocalNotifications.checkExactNotificationSetting();
          updatePermStatus('exact-alarm', exact.exact_alarm === 'granted');
        } catch { updatePermStatus('exact-alarm', false); }
      }
    }
  } catch (e) {
    console.warn('[Settings] Permission check error:', e);
  }

  // These can't be checked via API, mark as "建议开启"
  updatePermStatus('overlay', null);
  updatePermStatus('battery', null);
  updatePermStatus('install', null);

  // Open system settings button
  const openBtn = document.getElementById('open-app-settings-btn');
  if (openBtn) {
    openBtn.onclick = async () => {
      try {
        const { App } = window.Capacitor.Plugins;
        const appId = 'com.workcalendar.app';

        // Method 1: Try App.openUrl with package scheme
        if (App && App.openUrl) {
          try {
            await App.openUrl({ url: `package:${appId}` });
            return;
          } catch (e1) {
            console.warn('[Settings] package: scheme failed:', e1);
          }
        }

        // Method 2: Try Android intent URI
        try {
          const intentUrl = `intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;package=${appId};end`;
          window.open(intentUrl, '_system');
          return;
        } catch (e2) {
          console.warn('[Settings] intent URI failed:', e2);
        }

        // Method 3: Try market scheme (opens Play Store page)
        try {
          window.open(`market://details?id=${appId}`, '_system');
          return;
        } catch (e3) {
          console.warn('[Settings] market scheme failed:', e3);
        }

        // Fallback: show manual instructions
        showToast('请手动前往：系统设置 > 应用管理 > 上班日历 > 权限');
      } catch (e) {
        console.error('[Settings] Open settings error:', e);
        showToast('请手动前往：系统设置 > 应用管理 > 上班日历 > 权限');
      }
    };
  }

  // Diagnose notifications button
  const diagnoseBtn = document.getElementById('diagnose-notifications-btn');
  if (diagnoseBtn) {
    diagnoseBtn.onclick = async () => {
      if (typeof diagnoseNotifications === 'function') {
        await diagnoseNotifications();
      } else {
        showToast('诊断功能未加载');
      }
    };
  }
}

function updatePermStatus(key, granted) {
  const el = document.querySelector(`.perm-status[data-key="${key}"]`);
  if (!el) return;
  if (granted === null) {
    el.textContent = '建议开启';
    el.style.background = 'var(--warning, #ff9800)';
    el.style.color = '#fff';
  } else if (granted) {
    el.textContent = '✓ 已开启';
    el.style.background = 'var(--success, #4caf50)';
    el.style.color = '#fff';
  } else {
    el.textContent = '未开启';
    el.style.background = 'var(--danger, #e53935)';
    el.style.color = '#fff';
  }
}
