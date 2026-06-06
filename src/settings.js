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
    opt.innerHTML = `<div class="theme-dot" style="background:${t.color}"></div><span>${t.name}</span>`;
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
