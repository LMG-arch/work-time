const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, shell, Notification, session } = require('electron');
const path = require('path');
const fs = require('fs');

let win;
let tray = null;
let isQuitting = false;

let dataPath;
let store = { days: {}, todos: [], reminders: null, reminderRecords: {} };
let reminderTimers = [];

// 规范化 reminders 存储格式：确保 { items: [...], updatedAt: ... } 结构
function normalizeReminders(raw) {
  if (Array.isArray(raw)) return { items: raw, updatedAt: null };
  if (raw && typeof raw === 'object' && Array.isArray(raw.items)) return raw;
  return null;
}

// Notify renderer to auto-sync after data changes
function notifyDataChanged() {
  if (win) {
    try { win.webContents.send('data-changed'); } catch (e) { console.error('[Main] notifyDataChanged failed:', e.message); }
  }
}

// --- Data persistence ---

function getDefaultReminders() {
  return [
    { id: 'r1', label: '上班打卡', time: '08:30', enabled: true },
    { id: 'r2', label: '午休下班', time: '12:00', enabled: true },
    { id: 'r3', label: '下午上班', time: '13:30', enabled: true },
    { id: 'r4', label: '下班打卡', time: '17:30', enabled: true }
  ];
}

function initStore() {
  dataPath = path.join(app.getPath('userData'), 'calendar-data.json');
  try {
    const raw = fs.readFileSync(dataPath, 'utf-8');
    store = JSON.parse(raw);
    if (!store.days) store.days = {};
    if (!store.todos) store.todos = [];
    if (!store.reminderRecords) store.reminderRecords = {};
    // 规范化旧格式的 reminders：统一存储为 { items: [...], updatedAt: ... }
    const norm = normalizeReminders(store.reminders);
    store.reminders = norm || store.reminders;
  } catch {
    store = { days: {}, todos: [], reminders: null, reminderRecords: {} };
  }
  // 清理超过 90 天的墓碑记录和旧数据
  cleanupOldDays();
}

// 清理超过 90 天的墓碑记录，防止数据无限增长
function cleanupOldDays() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  let cleaned = 0;
  for (const dateStr of Object.keys(store.days)) {
    if (dateStr < cutoffStr && store.days[dateStr].deleted) {
      delete store.days[dateStr];
      cleaned++;
    }
  }
  if (cleaned > 0) console.log('[Main] Cleaned', cleaned, 'old tombstone records');
}

function saveStore() {
  const tempPath = dataPath + '.tmp';
  try {
    fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tempPath, dataPath);
  } catch (e) {
    console.error('[Main] saveStore failed:', e.message);
  }
  notifyDataChanged();
}

// Save without triggering sync notification (used by sync-write to avoid loops)
function saveStoreSilent() {
  const tempPath = dataPath + '.tmp';
  try {
    fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tempPath, dataPath);
  } catch (e) {
    console.error('[Main] saveStoreSilent failed:', e.message);
  }
}

function saveDayData(dateStr, status, note, tags, color) {
  if (!status && !note && (!tags || tags.length === 0) && !color) {
    // Mark as deleted with timestamp (tombstone) for sync
    store.days[dateStr] = { status: null, note: '', tags: [], color: '', updatedAt: new Date().toISOString(), deleted: true };
  } else {
    store.days[dateStr] = { status, note, tags: tags || [], color: color || '', updatedAt: new Date().toISOString(), deleted: false };
  }
  const tempPath = dataPath + '.tmp';
  try {
    fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tempPath, dataPath);
  } catch (e) {
    console.error('[Main] saveDayData failed:', e.message);
  }
  notifyDataChanged();
}

// --- Auto-launch ---

const STARTUP_FOLDER = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const SHORTCUT_PATH = path.join(STARTUP_FOLDER, '上班日历.lnk');

function isAutoLaunchEnabled() {
  return fs.existsSync(SHORTCUT_PATH);
}

function setAutoLaunch(enable) {
  if (enable) {
    const shortcutTarget = process.execPath;
    const workingDir = path.dirname(shortcutTarget);
    // Use PowerShell with encoded command to avoid injection
    const psScript = `
      $ws = New-Object -ComObject WScript.Shell
      $s = $ws.CreateShortcut('${SHORTCUT_PATH.replace(/'/g, "''")}')
      $s.TargetPath = '${shortcutTarget.replace(/'/g, "''")}'
      $s.WorkingDirectory = '${workingDir.replace(/'/g, "''")}'
      $s.Save()
    `;
    const encodedCommand = Buffer.from(psScript, 'utf16le').toString('base64');
    require('child_process').execSync(`powershell -NoProfile -EncodedCommand ${encodedCommand}`, { windowsHide: true });
  } else {
    try { fs.unlinkSync(SHORTCUT_PATH); } catch (e) { console.error('[Main] Remove shortcut failed:', e.message); }
  }
}

// --- IPC ---

function registerIPC() {
  // Filter out deleted records when returning data
  ipcMain.handle('get-all-data', () => {
    const result = {};
    for (const [key, val] of Object.entries(store.days)) {
      if (!val.deleted) result[key] = val;
    }
    return result;
  });

  ipcMain.handle('get-month-data', (_, year, month) => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const result = {};
    for (const [key, val] of Object.entries(store.days)) {
      if (key.startsWith(prefix) && !val.deleted) result[key] = val;
    }
    return result;
  });

  ipcMain.handle('save-day', (_, date, status, note, tags, color) => {
    saveDayData(date, status, note, tags, color);
    return { success: true };
  });

  ipcMain.handle('export-data', async () => {
    const { filePath, canceled } = await dialog.showSaveDialog(win, {
      title: '导出日历数据',
      defaultPath: `上班日历_${new Date().toISOString().slice(0, 10)}.json`,
      filters: [
        { name: 'JSON 文件', extensions: ['json'] },
        { name: 'CSV 文件', extensions: ['csv'] }
      ]
    });
    if (canceled || !filePath) return { success: false };

    if (filePath.endsWith('.csv')) {
      const statusMap = { work: '上班', rest: '休息', trip: '出差' };
      let csv = '日期,状态,备注\n';
      const sorted = Object.keys(store.days).sort();
      for (const date of sorted) {
        const d = store.days[date];
        const status = statusMap[d.status] || '';
        const note = (d.note || '').replace(/"/g, '""');
        csv += `${date},${status},"${note}"\n`;
      }
      fs.writeFileSync(filePath, '﻿' + csv, 'utf-8');
    } else {
      // Include reminders and records in JSON export
      const exportObj = {
        ...store,
        reminders: (normalizeReminders(store.reminders) || { items: getDefaultReminders() }).items,
        reminderRecords: store.reminderRecords || {}
      };
      fs.writeFileSync(filePath, JSON.stringify(exportObj, null, 2), 'utf-8');
    }
    return { success: true, path: filePath };
  });

  ipcMain.handle('import-data', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog(win, {
      title: '导入日历数据',
      filters: [{ name: 'JSON 文件', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths.length) return { success: false };

    try {
      const raw = fs.readFileSync(filePaths[0], 'utf-8');
      const imported = JSON.parse(raw);

      // 验证导入数据结构
      if (!imported || typeof imported !== 'object') {
        return { success: false, error: '无效的数据格式' };
      }

      if (imported.days && typeof imported.days === 'object') {
        // 验证 days 数据
        for (const [key, val] of Object.entries(imported.days)) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
          if (typeof val !== 'object' || val === null) continue;
          store.days[key] = {
            status: val.status || null,
            note: typeof val.note === 'string' ? val.note.slice(0, 500) : '',
            tags: Array.isArray(val.tags) ? val.tags.filter(t => typeof t === 'string').slice(0, 10) : [],
            color: typeof val.color === 'string' ? val.color : '',
            updatedAt: typeof val.updatedAt === 'string' ? val.updatedAt : new Date().toISOString(),
            deleted: !!val.deleted
          };
        }
      } else {
        // Old format: keys are date strings, values are day records
        for (const [k, v] of Object.entries(imported)) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === 'object' && v !== null) {
            store.days[k] = {
              status: v.status || null,
              note: typeof v.note === 'string' ? v.note.slice(0, 500) : '',
              tags: Array.isArray(v.tags) ? v.tags.filter(t => typeof t === 'string').slice(0, 10) : [],
              color: typeof v.color === 'string' ? v.color : '',
              updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : new Date().toISOString(),
              deleted: !!v.deleted
            };
          }
        }
      }
      if (Array.isArray(imported.reminders)) {
        store.reminders = { items: imported.reminders, updatedAt: null };
      } else if (imported.reminders && typeof imported.reminders === 'object' && Array.isArray(imported.reminders.items)) {
        store.reminders = imported.reminders;
      }
      if (imported.reminderRecords && typeof imported.reminderRecords === 'object') {
        Object.assign(store.reminderRecords, imported.reminderRecords);
      }
      // 安全：禁止导入文件覆盖 supabase 配置，防止恶意服务器劫持
      saveStore();
      scheduleReminders();
      scheduleTodoReminders();
      return { success: true };
    } catch (e) {
      console.error('[Main] import-data failed:', e.message);
      return { success: false, error: '文件格式错误' };
    }
  });

    // Auto-launch: Windows only (IPC handlers always registered, but setAutoLaunch is no-op on non-Windows)
    ipcMain.handle('get-app-version', () => {
      return { versionName: app.getVersion(), versionCode: 0 };
    });
    ipcMain.handle('get-auto-launch', () => {
      if (process.platform !== 'win32') return false;
      return isAutoLaunchEnabled();
    });
    ipcMain.handle('set-auto-launch', (_, enable) => {
      if (process.platform !== 'win32') return { success: false, error: '仅支持 Windows' };
      setAutoLaunch(enable);
      return { success: true };
    });

  // Holidays
  const { HOLIDAYS, FIXED_HOLIDAYS } = require('./src/holidays.js');
  ipcMain.handle('get-holidays', () => ({ HOLIDAYS, FIXED_HOLIDAYS }));

  // Reminders
  ipcMain.handle('get-reminders', () => {
    const wrapped = normalizeReminders(store.reminders);
    return wrapped ? wrapped.items : getDefaultReminders();
  });

  ipcMain.handle('save-reminders', (_, reminders) => {
    const wrapped = { items: reminders, updatedAt: new Date().toISOString() };
    store.reminders = wrapped;
    saveStore();
    scheduleReminders();
    return { success: true };
  });

  ipcMain.handle('confirm-reminder', (_, date, reminderId) => {
    if (!store.reminderRecords) store.reminderRecords = {};
    if (!store.reminderRecords[date]) store.reminderRecords[date] = {};
    store.reminderRecords[date][reminderId] = { confirmed: true, at: new Date().toISOString() };
    saveStore();
    return { success: true };
  });

  ipcMain.handle('get-reminder-records', (_, date) => {
    if (!store.reminderRecords) return {};
    return store.reminderRecords[date] || {};
  });

  ipcMain.handle('get-all-reminder-records', () => {
    return store.reminderRecords || {};
  });

  // Todos
  ipcMain.handle('get-todos', () => (store.todos || []).filter(t => t && !t.deleted));

  ipcMain.handle('add-todo', (_, todo) => {
    todo.id = crypto.randomUUID();
    todo.updatedAt = new Date().toISOString();
    store.todos.push(todo);
    saveStore();
    scheduleTodoReminders();
    return todo;
  });

  ipcMain.handle('update-todo', (_, id, updates) => {
    const idx = store.todos.findIndex(t => t.id === id);
    if (idx >= 0) {
      updates.updatedAt = new Date().toISOString();
      Object.assign(store.todos[idx], updates);
      saveStore();
      scheduleTodoReminders();
      return store.todos[idx];
    }
    return null;
  });

  ipcMain.handle('delete-todo', (_, id) => {
    const idx = store.todos.findIndex(t => t.id === id);
    if (idx >= 0) {
      store.todos[idx].deleted = true;
      store.todos[idx].updatedAt = new Date().toISOString();
    }
    saveStore();
    scheduleTodoReminders();
    return { success: true };
  });

  // Sync bridge: read/write full store for cloud sync
  ipcMain.handle('sync-read', () => {
    let modified = false;
    // Ensure all days have updatedAt for proper sync comparison
    const days = store.days || {};
    const now = new Date().toISOString();
    for (const date of Object.keys(days)) {
      if (!days[date].updatedAt) {
        days[date].updatedAt = now;
        modified = true;
      }
    }
    // Ensure all todos have updatedAt
    const todos = (store.todos || []).map(t => {
      if (t && !t.updatedAt) {
        modified = true;
        return { ...t, updatedAt: now };
      }
      return t;
    });
    
    if (modified) {
        store.todos = todos;
        saveStoreSilent();
    }
    
    return {
      days: days,
      todos: todos,
      reminders: store.reminders ? (normalizeReminders(store.reminders) || store.reminders) : null,
      reminderRecords: store.reminderRecords || {}
    };
  });

  ipcMain.handle('sync-write', (_, data) => {
    if (!data) return;
    if (data.days) {
      // 深度合并：按 updatedAt 时间戳比较
      const mergedDays = { ...store.days };
      for (const [date, cloudDay] of Object.entries(data.days)) {
        const localDay = mergedDays[date];
        if (!localDay) {
          mergedDays[date] = cloudDay;
        } else {
          const localTime = new Date(localDay.updatedAt || 0).getTime();
          const cloudTime = new Date(cloudDay.updatedAt || 0).getTime();
          if (cloudTime > localTime) {
            mergedDays[date] = cloudDay;
          }
        }
      }
      store.days = mergedDays;
    }
    if (data.todos) {
      const todoMap = {};
      (store.todos || []).forEach(t => { if (t && t.id) todoMap[t.id] = t; });
      data.todos.forEach(t => { if (t && t.id) todoMap[t.id] = t; });
      store.todos = Object.values(todoMap);
    }
    if (data.reminders) {
      const norm = normalizeReminders(data.reminders);
      if (norm) {
        const localNorm = normalizeReminders(store.reminders);
        if (!localNorm || !localNorm.updatedAt || (norm.updatedAt && norm.updatedAt > localNorm.updatedAt)) {
          store.reminders = norm;
        }
      } else if (Array.isArray(data.reminders)) {
        store.reminders = { items: data.reminders, updatedAt: null };
      }
    }
    if (data.reminderRecords) {
      if (!store.reminderRecords) store.reminderRecords = {};
      for (const date of Object.keys(data.reminderRecords)) {
        if (!store.reminderRecords[date]) store.reminderRecords[date] = {};
        Object.assign(store.reminderRecords[date], data.reminderRecords[date]);
      }
    }
    saveStoreSilent();
    scheduleReminders();
    scheduleTodoReminders();
    return { success: true };
  });


  // Todo notification from renderer
  ipcMain.on('notify-todo', (_, text, time) => {
    try {
      const iconPath = path.join(__dirname, 'assets', 'icon.png');
      const iconOpts = fs.existsSync(iconPath) ? { icon: iconPath } : {};
      const notification = new Notification({
        title: '上班日历 · 待办提醒',
        body: `📋 ${text} (${time})`,
        ...iconOpts,
        silent: false,
        requireInteraction: true
      });
      notification.on('click', () => {
        if (win) { win.show(); win.focus(); }
      });
      notification.show();
      console.log('[Main] Todo notification shown:', text, time);
    } catch (e) {
      console.error('[Main] Todo notification error:', e.message);
    }
  });
}

// --- Reminder notifications ---

function scheduleReminders() {
  // Clear existing timers
  reminderTimers.forEach(t => clearInterval(t));
  reminderTimers = [];

  const wrapped = normalizeReminders(store.reminders);
  const reminders = wrapped ? wrapped.items : getDefaultReminders();
  const enabledReminders = reminders.filter(r => r.enabled);
  if (enabledReminders.length === 0) {
    console.log('[Main] No enabled reminders');
    return;
  }

  console.log('[Main] Scheduling reminders:', enabledReminders.map(r => r.label + '@' + r.time).join(', '));

  // Also schedule immediately for current minute
  let _notifiedThisMinute = {};
  
  function checkReminders() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${hh}:${mm}`;
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // 休息日/请假类状态不弹打卡提醒（避免写入脏打卡记录）
    const dayStatus = store.days?.[todayStr]?.status;
    if (dayStatus && ['rest', 'leave', 'annual', 'sick', 'personal'].includes(dayStatus)) {
      return;
    }

    // 清理过期的分钟通知记录
    for (const key of Object.keys(_notifiedThisMinute)) {
      if (!key.endsWith(currentTime)) {
        delete _notifiedThisMinute[key];
      }
    }

    for (const r of enabledReminders) {
      if (r.time !== currentTime) continue;
      
      const notifKey = `${r.id}-${currentTime}`;
      if (_notifiedThisMinute[notifKey]) continue;

      // Check if already confirmed
      const records = store.reminderRecords?.[todayStr]?.[r.id];
      if (records && records.confirmed) continue;
      
      _notifiedThisMinute[notifKey] = true;

      const iconPath = path.join(__dirname, 'assets', 'icon.png');
      const iconOpts = fs.existsSync(iconPath) ? { icon: iconPath } : {};

      try {
        const notification = new Notification({
          title: '上班日历 · 打卡提醒',
          body: `⏰ ${r.label} (${r.time})\n点击确认打卡`,
          ...iconOpts,
          silent: false,
          requireInteraction: true
        });

        notification.on('click', () => {
          if (!store.reminderRecords) store.reminderRecords = {};
          if (!store.reminderRecords[todayStr]) store.reminderRecords[todayStr] = {};
          store.reminderRecords[todayStr][r.id] = { confirmed: true, at: new Date().toISOString() };
          saveStore();
          if (win) {
            win.webContents.send('reminder-confirmed', { date: todayStr, reminderId: r.id });
            win.show();
            win.focus();
          }
        });

        notification.show();
        console.log('[Main] Notification shown:', r.label, r.time);
      } catch (notifErr) {
        console.error('[Main] Notification error:', notifErr.message);
      }
    }
  }

  // Check now
  checkReminders();

  // Check every 10 seconds
  const timer = setInterval(checkReminders, 10000);
  reminderTimers.push(timer);
}

// --- Window ---

function createWindow() {
  Menu.setApplicationMenu(null);

  // Security: set CSP to block dangerous resources
  // Development mode: allow 'unsafe-inline' for Vite HMR + diagnostic inline scripts
  // Production mode: strict (dist bundle has no inline scripts)
  const isDev = !app.isPackaged;
  const devConnectSrc = isDev ? ' ws://localhost:* http://localhost:*' : '';
  const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self'";
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self'${devConnectSrc} https://*.supabase.co https://supabase.co https://*.supabase.io wss://*.supabase.co wss://*.supabase.io https://raw.githubusercontent.com; font-src 'self' data:; object-src 'none'; base-uri 'self';`
        ]
      }
    });
  });

  win = new BrowserWindow({
    width: 520,
    height: 720,
    resizable: true,
    minWidth: 380,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 开发模式通过 Vite dev server 加载（编译 Vue SFC + HMR）
  // 生产模式加载构建后的 dist/index.html
  if (isDev) {
    // 重试逻辑：Vite 可能还没就绪（尤其 concurrently 启动时 vite 和 electron 几乎同时开始），
    // 不能一失败就 fallback 到 dist（dist 可能是旧的或不存在的），而是等待 Vite 就绪。
    const DEV_URL = 'http://localhost:5173';
    const MAX_RETRIES = 10;       // 最多重试 10 次
    const RETRY_DELAY = 1500;     // 每次间隔 1.5s（总等待约 15s）

    async function loadWithRetry(attempt) {
      attempt = attempt || 1;
      try {
        await win.loadURL(DEV_URL);
        console.log('[Main] Dev server loaded on attempt', attempt);
      } catch (e) {
        console.warn('[Main] Dev server not ready (attempt ' + attempt + '/' + MAX_RETRIES + '):', e.message);
        if (attempt < MAX_RETRIES) {
          await new Promise(function(res) { setTimeout(res, RETRY_DELAY); });
          return loadWithRetry(attempt + 1);
        }
        // 所有重试耗尽，fallback 到 dist 并在标题中标记
        console.error('[Main] Dev server unreachable after ' + MAX_RETRIES + ' attempts, falling back to dist/');
        try { win.loadFile(path.join(__dirname, 'dist', 'index.html')); } catch (e2) {
          console.error('[Main] Fallback also failed:', e2.message);
          // 最后手段：加载 src 目录原始文件（至少能看到界面）
          win.loadFile(path.join(__dirname, 'src', 'index.html'));
        }
        win.setTitle('[DEV SERVER OFFLINE] 上班日历');
      }
    }
    loadWithRetry();
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Minimize to tray instead of closing
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

// --- Tray ---

function createTray() {
  const { nativeImage } = require('electron');
  const iconPath = path.join(__dirname, 'assets', 'icon.png');

  if (fs.existsSync(iconPath)) {
    tray = new Tray(iconPath);
  } else {
    // Generate a simple 32x32 calendar icon programmatically
    const size = 32;
    const buffer = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const inCorner = (dx, dy) => Math.sqrt(dx * dx + dy * dy) > 4;
        const isRounded = (x < 4 && y < 4 && inCorner(x - 4, y - 4)) ||
                          (x >= 28 && y < 4 && inCorner(x - 27, y - 4)) ||
                          (x < 4 && y >= 28 && inCorner(x - 4, y - 27)) ||
                          (x >= 28 && y >= 28 && inCorner(x - 27, y - 27));
        if (isRounded) {
          buffer[i] = 0; buffer[i + 1] = 0; buffer[i + 2] = 0; buffer[i + 3] = 0;
        } else if (y < 8) {
          // Top bar (header)
          buffer[i] = 0x33; buffer[i + 1] = 0x33; buffer[i + 2] = 0x33; buffer[i + 3] = 0xff;
        } else if (y === 8) {
          // Divider line
          buffer[i] = 0xcc; buffer[i + 1] = 0xcc; buffer[i + 2] = 0xcc; buffer[i + 3] = 0xff;
        } else {
          // Body
          buffer[i] = 0xff; buffer[i + 1] = 0xff; buffer[i + 2] = 0xff; buffer[i + 3] = 0xff;
        }
      }
    }
    const img = nativeImage.createFromBuffer(buffer, { width: size, height: size });
    tray = new Tray(img);
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开上班日历',
      click: () => { win.show(); win.focus(); }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('上班日历');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    win.show();
    win.focus();
  });
}

// --- Todo reminder notifications ---

let todoRemindTimers = [];

function scheduleTodoReminders() {
  todoRemindTimers.forEach(t => clearInterval(t));
  todoRemindTimers = [];

  const todos = store.todos || [];
  const todosWithRemind = todos.filter(t => t.remind && !t.done);
  if (todosWithRemind.length === 0) return;

  console.log('[Main] Scheduling todo reminders for', todosWithRemind.length, 'todos');

  function checkTodoReminders() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${hh}:${mm}`;
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const weekday = now.getDay();

    for (const todo of todosWithRemind) {
      if (todo.done) continue;

      // Determine if this todo applies today
      let appliesToday = false;
      if (todo.type === 'once') {
        appliesToday = (todo.date === todayStr);
      } else if (todo.type === 'weekly') {
        appliesToday = (todo.weekdays || []).includes(weekday);
      }
      if (!appliesToday) continue;

      // Calculate reminder time
      let targetTime = todo.remindTime || '09:00';
      const [th, tm] = targetTime.split(':').map(Number);
      let remindMinutes = th * 60 + tm;
      if (todo.remind !== 'same') {
        remindMinutes -= parseInt(todo.remind) || 0;
      }
      if (remindMinutes < 0) remindMinutes = 0;
      const remindH = Math.floor(remindMinutes / 60);
      const remindM = remindMinutes % 60;
      const remindTimeStr = `${String(remindH).padStart(2, '0')}:${String(remindM).padStart(2, '0')}`;

      if (remindTimeStr !== currentTime) continue;

      // Check if already reminded (persist to store so it survives restart)
      const remindedKey = `todo-reminded-${todo.id}-${todayStr}`;
      if (!store._todoReminded) store._todoReminded = {};
      if (store._todoReminded[remindedKey]) continue;
      store._todoReminded[remindedKey] = Date.now();
      // Clean up old keys (keep last 7 days), and persist to disk
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (const key of Object.keys(store._todoReminded)) {
        if (store._todoReminded[key] < cutoff) delete store._todoReminded[key];
      }
      // 持久化去重标记到文件，防止重启后重复提醒
      saveStoreSilent();

      const iconPath = path.join(__dirname, 'assets', 'icon.png');
      const iconOpts = fs.existsSync(iconPath) ? { icon: iconPath } : {};

      try {
        const notification = new Notification({
          title: '上班日历 · 待办提醒',
          body: `📋 ${todo.text} (${targetTime})`,
          ...iconOpts,
          silent: false,
          requireInteraction: true
        });
        notification.on('click', () => {
          if (win) { win.show(); win.focus(); }
        });
        notification.show();
        console.log('[Main] Todo notification shown:', todo.text, targetTime);
      } catch (e) {
        console.error('[Main] Todo notification error:', e.message);
      }
    }
  }

  checkTodoReminders();
  const timer = setInterval(checkTodoReminders, 10000);
  todoRemindTimers.push(timer);
}

// --- App lifecycle ---

app.whenReady().then(() => {
  // 写入本进程 PID，供「启动-开发模式.bat」精准清理上一轮残留的 Electron
  // （关闭时只最小化到托盘，进程不退出，残留窗口会一直显示旧代码）。
  try {
    fs.writeFileSync(path.join(__dirname, 'electron.pid'), String(process.pid), 'utf8');
  } catch (_) { /* 忽略 */ }
  initStore();
  registerIPC();
  createWindow();
  createTray();
  scheduleReminders();
  scheduleTodoReminders();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      win.show();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  try { fs.unlinkSync(path.join(__dirname, 'electron.pid')); } catch (_) { /* 忽略 */ }
});
