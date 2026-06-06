const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

let win;
let tray = null;
let isQuitting = false;

let dataPath;
let store = { days: {}, todos: [], reminders: null, reminderRecords: {} };
let reminderTimers = [];

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
  } catch {
    store = { days: {}, todos: [], reminders: null, reminderRecords: {} };
  }
}

function saveStore() {
  fs.writeFileSync(dataPath, JSON.stringify(store, null, 2), 'utf-8');
}

function saveDayData(dateStr, status, note, tags, color) {
  if (!status && !note && (!tags || tags.length === 0) && !color) {
    delete store.days[dateStr];
  } else {
    store.days[dateStr] = { status, note, tags: tags || [], color: color || '' };
  }
  fs.writeFileSync(dataPath, JSON.stringify(store, null, 2), 'utf-8');
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
    // Use PowerShell to create shortcut
    const ps = `$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('${SHORTCUT_PATH.replace(/\\/g, '\\\\')}'); $s.TargetPath = '${shortcutTarget.replace(/\\/g, '\\\\')}'; $s.WorkingDirectory = '${path.dirname(shortcutTarget).replace(/\\/g, '\\\\')}'; $s.Save()`;
    require('child_process').execSync(`powershell -NoProfile -Command "${ps}"`, { windowsHide: true });
  } else {
    try { fs.unlinkSync(SHORTCUT_PATH); } catch {}
  }
}

// --- IPC ---

function registerIPC() {
  ipcMain.handle('get-all-data', () => store.days);

  ipcMain.handle('get-month-data', (_, year, month) => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const result = {};
    for (const [key, val] of Object.entries(store.days)) {
      if (key.startsWith(prefix)) result[key] = val;
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

    // Include reminders and records in JSON export
    const exportObj = filePath.endsWith('.csv') ? store : {
      ...store,
      reminders: store.reminders || getDefaultReminders(),
      reminderRecords: store.reminderRecords || {}
    };

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
      if (imported.days) {
        Object.assign(store.days, imported.days);
      } else {
        Object.assign(store.days, imported);
      }
      if (imported.reminders) store.reminders = imported.reminders;
      if (imported.reminderRecords) Object.assign(store.reminderRecords, imported.reminderRecords);
      fs.writeFileSync(dataPath, JSON.stringify(store, null, 2), 'utf-8');
      scheduleReminders();
      return { success: true };
    } catch {
      return { success: false, error: '文件格式错误' };
    }
  });

  ipcMain.handle('get-auto-launch', () => isAutoLaunchEnabled());

  ipcMain.handle('set-auto-launch', (_, enable) => {
    setAutoLaunch(enable);
    return { success: true };
  });

  // Holidays
  const { HOLIDAYS, FIXED_HOLIDAYS } = require('./src/holidays.js');
  ipcMain.handle('get-holidays', () => ({ HOLIDAYS, FIXED_HOLIDAYS }));

  // Reminders
  ipcMain.handle('get-reminders', () => {
    return store.reminders || getDefaultReminders();
  });

  ipcMain.handle('save-reminders', (_, reminders) => {
    store.reminders = reminders;
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
  ipcMain.handle('get-todos', () => store.todos);

  ipcMain.handle('add-todo', (_, todo) => {
    todo.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    store.todos.push(todo);
    saveStore();
    return todo;
  });

  ipcMain.handle('update-todo', (_, id, updates) => {
    const idx = store.todos.findIndex(t => t.id === id);
    if (idx >= 0) {
      Object.assign(store.todos[idx], updates);
      saveStore();
      return store.todos[idx];
    }
    return null;
  });

  ipcMain.handle('delete-todo', (_, id) => {
    store.todos = store.todos.filter(t => t.id !== id);
    saveStore();
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

  const reminders = store.reminders || getDefaultReminders();
  const enabledReminders = reminders.filter(r => r.enabled);
  if (enabledReminders.length === 0) {
    console.log('[Main] No enabled reminders');
    return;
  }

  console.log('[Main] Scheduling reminders:', enabledReminders.map(r => r.label + '@' + r.time).join(', '));

  // Also schedule immediately for current minute
  function checkReminders() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${hh}:${mm}`;
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    for (const r of enabledReminders) {
      if (r.time !== currentTime) continue;
      // Check if already confirmed
      const records = store.reminderRecords?.[todayStr]?.[r.id];
      if (records && records.confirmed) continue;

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

  // Check every 30 seconds
  const timer = setInterval(checkReminders, 10000);
  reminderTimers.push(timer);
}

// --- Window ---

function createWindow() {
  Menu.setApplicationMenu(null);

  win = new BrowserWindow({
    width: 420,
    height: 620,
    resizable: true,
    minWidth: 380,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));

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

// --- App lifecycle ---

app.whenReady().then(() => {
  initStore();
  registerIPC();
  createWindow();
  createTray();
  scheduleReminders();

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
});
