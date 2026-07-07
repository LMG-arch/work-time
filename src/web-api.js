// Web-compatible API layer (replaces Electron preload.js)
// Uses localStorage for data persistence

(function () {
  const STORAGE_KEY = 'work-calendar-data';

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const store = JSON.parse(raw);
      if (store && store.days) {
        if (!store.todos) store.todos = [];
        if (!store.reminderRecords) store.reminderRecords = {};
        if (!store.reminders) store.reminders = null;
        return store;
      }
    } catch (e) { console.warn('[Storage] Failed to parse work-calendar-data:', e.message); }
    return { days: {}, todos: [], reminders: null, reminderRecords: {} };
  }

  function saveStore(store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      console.error('[Storage] saveStore failed:', e.message);
    }
  }

  function getStore() {
    return loadStore();
  }

  window.calendarAPI = {
    // --- Day data ---
    async getAllData() {
      const days = getStore().days;
      // Filter out deleted records
      const result = {};
      for (const [key, val] of Object.entries(days)) {
        if (!val.deleted) result[key] = val;
      }
      return result;
    },

    async getMonthData(year, month) {
      const days = getStore().days;
      const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
      const result = {};
      for (const [key, val] of Object.entries(days)) {
        if (key.startsWith(prefix) && !val.deleted) result[key] = val;
      }
      return result;
    },

    async saveDay(date, status, note, tags, color) {
      const store = getStore();
      if (!status && !note && (!tags || tags.length === 0) && !color) {
        // Mark as deleted with timestamp (tombstone) for sync
        store.days[date] = { status: null, note: '', tags: [], color: '', updatedAt: new Date().toISOString(), deleted: true };
      } else {
        store.days[date] = { status, note, tags: tags || [], color: color || '', updatedAt: new Date().toISOString(), deleted: false };
      }
      saveStore(store);
      if (typeof autoSyncPush === 'function') autoSyncPush();
      return { success: true };
    },

    // --- Holidays ---
    async getHolidays() {
      return { HOLIDAYS, FIXED_HOLIDAYS };
    },

    // --- Todos ---
    async getTodos() {
      return (getStore().todos || []).filter(t => t && !t.deleted);
    },

    async addTodo(todo) {
      const store = getStore();
      todo.id = (crypto.randomUUID && crypto.randomUUID()) || 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
      todo.updatedAt = new Date().toISOString();
      store.todos.push(todo);
      saveStore(store);
      if (typeof autoSyncPush === 'function') autoSyncPush();
      return todo;
    },

    async updateTodo(id, updates) {
      const store = getStore();
      const idx = store.todos.findIndex(t => t.id === id);
      if (idx >= 0) {
        updates.updatedAt = new Date().toISOString();
        Object.assign(store.todos[idx], updates);
        saveStore(store);
        if (typeof autoSyncPush === 'function') autoSyncPush();
        return store.todos[idx];
      }
      return null;
    },

    async deleteTodo(id) {
      const store = getStore();
      const idx = store.todos.findIndex(t => t.id === id);
      if (idx >= 0) {
        store.todos[idx].deleted = true;
        store.todos[idx].updatedAt = new Date().toISOString();
      }
      saveStore(store);
      if (typeof autoSyncPush === 'function') autoSyncPush();
      return { success: true };
    },

    // Todo notification (no-op on web, handled by renderer)
    notifyTodo(text, time) {
      // Web/Capacitor: notifications are handled directly in renderer.js
    },

    // --- Export ---
    async exportData() {
      const store = getStore();
      let reminders = null;
      let reminderRecords = {};
      try { reminders = JSON.parse(localStorage.getItem('calendar-reminders')); } catch (e) { console.warn('[Export] Failed to parse reminders:', e.message); }
      try { reminderRecords = JSON.parse(localStorage.getItem('calendar-reminder-records')) || {}; } catch (e) { console.warn('[Export] Failed to parse records:', e.message); }
      const exportData = { ...store, reminders, reminderRecords };
      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '上班日历_' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
      return { success: true };
    },

    // --- Import ---
    async importData() {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async () => {
          const file = input.files[0];
          if (!file) return resolve({ success: false });
          try {
            const text = await file.text();
            const imported = JSON.parse(text);

            // 验证导入数据结构
            if (!imported || typeof imported !== 'object') {
              return resolve({ success: false, error: '无效的数据格式' });
            }

            const store = getStore();
            if (imported.days && typeof imported.days === 'object') {
              // 验证 days 数据
              for (const [key, val] of Object.entries(imported.days)) {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
                if (typeof val !== 'object' || val === null) continue;
                // 只保留有效字段
                store.days[key] = {
                  status: val.status || null,
                  note: typeof val.note === 'string' ? val.note.slice(0, 500) : '',
                  tags: Array.isArray(val.tags) ? val.tags.filter(t => typeof t === 'string').slice(0, 10) : [],
                  color: typeof val.color === 'string' ? val.color : '',
                  updatedAt: typeof val.updatedAt === 'string' ? val.updatedAt : new Date().toISOString(),
                  deleted: !!val.deleted
                };
              }
            } else if (typeof imported === 'object') {
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
            if (Array.isArray(imported.todos)) {
              // 验证 todos 数据
              store.todos = imported.todos.filter(t => t && typeof t === 'object').map(t => ({
                id: typeof t.id === 'string' ? t.id : Date.now().toString(36),
                text: typeof t.text === 'string' ? t.text.slice(0, 200) : '',
                done: !!t.done,
                type: t.type || 'once',
                date: typeof t.date === 'string' ? t.date : '',
                weekdays: Array.isArray(t.weekdays) ? t.weekdays : [],
                remind: t.remind || null,
                remindTime: typeof t.remindTime === 'string' ? t.remindTime : '',
                updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : new Date().toISOString()
              }));
            }
            saveStore(store);
            // Import reminders and records
            if (Array.isArray(imported.reminders)) {
              localStorage.setItem('calendar-reminders', JSON.stringify(imported.reminders));
            }
            if (imported.reminderRecords && typeof imported.reminderRecords === 'object') {
              localStorage.setItem('calendar-reminder-records', JSON.stringify(imported.reminderRecords));
            }
            // 安全：禁止导入文件覆盖 supabase 配置，防止恶意服务器劫持
            // 原有的 supabaseConfig 导入已移除
            resolve({ success: true });
          } catch {
            resolve({ success: false, error: '文件格式错误' });
          }
        };
        input.addEventListener('cancel', () => resolve({ success: false }));
        // Fallback: if focus returns without change, resolve after timeout
        const fallback = setTimeout(() => resolve({ success: false }), 60000);
        input.addEventListener('change', () => clearTimeout(fallback));
        input.click();
      });
    },

    // --- Reminders ---
    async getReminders() {
      try {
        const raw = localStorage.getItem('calendar-reminders');
        if (raw) {
          const parsed = JSON.parse(raw);
          // 兼容新格式 { items, updatedAt } 和旧格式纯数组
          if (Array.isArray(parsed)) return parsed;
          if (parsed && Array.isArray(parsed.items)) return parsed.items;
          return parsed;
        }
      } catch (e) { console.warn('[Store] Failed to parse reminders:', e.message); }
      return [
        { id: 'r1', label: '上班打卡', time: '08:30', enabled: true },
        { id: 'r2', label: '午休下班', time: '12:00', enabled: true },
        { id: 'r3', label: '下午上班', time: '13:30', enabled: true },
        { id: 'r4', label: '下班打卡', time: '17:30', enabled: true }
      ];
    },

    async saveReminders(reminders) {
      // updatedAt 不能加在数组上（JSON.stringify 会丢失），存为包装对象
      const wrapper = { items: reminders, updatedAt: new Date().toISOString() };
      localStorage.setItem('calendar-reminders', JSON.stringify(wrapper));
      if (typeof autoSyncPush === 'function') autoSyncPush();
      return { success: true };
    },

    async confirmReminder(date, reminderId) {
      const key = 'calendar-reminder-records';
      let records = {};
      try {
        const raw = localStorage.getItem(key);
        if (raw) records = JSON.parse(raw);
      } catch (e) { console.warn('[Calendar] Failed to parse reminder records:', e.message); }
      if (!records[date]) records[date] = {};
      records[date][reminderId] = { confirmed: true, at: new Date().toISOString() };
      localStorage.setItem(key, JSON.stringify(records));
      if (typeof autoSyncPush === 'function') autoSyncPush();
      return { success: true };
    },

    async getAllReminderRecords() {
      const key = 'calendar-reminder-records';
      try {
        const raw = localStorage.getItem(key);
        if (raw) return JSON.parse(raw);
      } catch (e) { console.warn('[Calendar] Failed to parse reminder records:', e.message); }
      return {};
    },

    // --- Auto-launch (not applicable on mobile) ---
    async getAutoLaunch() {
      return false;
    },

    async setAutoLaunch() {
      return { success: true };
    },

    // --- App version ---
    async getAppVersion() {
      // 优先从全局变量获取（可由 Vite/构建注入）
      if (window.__APP_VERSION__) return window.__APP_VERSION__;

      // Capacitor 环境
      if (window.Capacitor && window.Capacitor.Plugins) {
        try {
          const { App } = window.Capacitor.Plugins;
          if (App && App.getInfo) {
            const info = await App.getInfo();
            return { versionName: info.version, versionCode: parseInt(info.build) || 0 };
          }
        } catch (e) { console.warn('[Version] Capacitor getInfo failed:', e.message); }
      }

      // Electron 环境 (通过 preload 暴露的 API)
      if (window.calendarAPI && window.calendarAPI.getAppVersion) {
        try {
          return await window.calendarAPI.getAppVersion();
        } catch (e) { console.warn('[Version] Electron getAppVersion failed:', e.message); }
      }

      // Web 降级
      return { versionName: '3.13.0', versionCode: 0 };
    }
  };
})();
