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
    } catch {}
    return { days: {}, todos: [], reminders: null, reminderRecords: {} };
  }

  function saveStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function getStore() {
    return loadStore();
  }

  window.calendarAPI = {
    // --- Day data ---
    async getAllData() {
      return getStore().days;
    },

    async saveDay(date, status, note, tags, color) {
      const store = getStore();
      if (!status && !note && (!tags || tags.length === 0) && !color) {
        delete store.days[date];
      } else {
        store.days[date] = { status, note, tags: tags || [], color: color || '' };
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
      return getStore().todos;
    },

    async addTodo(todo) {
      const store = getStore();
      todo.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      store.todos.push(todo);
      saveStore(store);
      if (typeof autoSyncPush === 'function') autoSyncPush();
      return todo;
    },

    async updateTodo(id, updates) {
      const store = getStore();
      const idx = store.todos.findIndex(t => t.id === id);
      if (idx >= 0) {
        Object.assign(store.todos[idx], updates);
        saveStore(store);
        if (typeof autoSyncPush === 'function') autoSyncPush();
        return store.todos[idx];
      }
      return null;
    },

    async deleteTodo(id) {
      const store = getStore();
      store.todos = store.todos.filter(t => t.id !== id);
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
      // Include reminders, records, and supabase config in export
      let reminders = null;
      let reminderRecords = {};
      let supabaseConfig = null;
      try { reminders = JSON.parse(localStorage.getItem('calendar-reminders')); } catch {}
      try { reminderRecords = JSON.parse(localStorage.getItem('calendar-reminder-records')) || {}; } catch {}
      try { supabaseConfig = JSON.parse(localStorage.getItem('supabase-config')); } catch {}
      const exportData = { ...store, reminders, reminderRecords, supabaseConfig };
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
            const store = getStore();
            if (imported.days) {
              Object.assign(store.days, imported.days);
            } else if (typeof imported === 'object') {
              // Old format: keys are date strings, values are day records
              for (const [k, v] of Object.entries(imported)) {
                if (/^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === 'object') {
                  store.days[k] = v;
                }
              }
            }
            if (imported.todos) {
              store.todos = imported.todos;
            }
            saveStore(store);
            // Import reminders and records
            if (imported.reminders) {
              localStorage.setItem('calendar-reminders', JSON.stringify(imported.reminders));
            }
            if (imported.reminderRecords) {
              localStorage.setItem('calendar-reminder-records', JSON.stringify(imported.reminderRecords));
            }
            if (imported.supabaseConfig) {
              localStorage.setItem('supabase-config', JSON.stringify(imported.supabaseConfig));
            }
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
        if (raw) return JSON.parse(raw);
      } catch {}
      return [
        { id: 'r1', label: '上班打卡', time: '08:30', enabled: true },
        { id: 'r2', label: '午休下班', time: '12:00', enabled: true },
        { id: 'r3', label: '下午上班', time: '13:30', enabled: true },
        { id: 'r4', label: '下班打卡', time: '17:30', enabled: true }
      ];
    },

    async saveReminders(reminders) {
      localStorage.setItem('calendar-reminders', JSON.stringify(reminders));
      if (typeof autoSyncPush === 'function') autoSyncPush();
      return { success: true };
    },

    async confirmReminder(date, reminderId) {
      const key = 'calendar-reminder-records';
      let records = {};
      try {
        const raw = localStorage.getItem(key);
        if (raw) records = JSON.parse(raw);
      } catch {}
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
      } catch {}
      return {};
    },

    // --- Auto-launch (not applicable on mobile) ---
    async getAutoLaunch() {
      return false;
    },

    async setAutoLaunch() {
      return { success: true };
    }
  };
})();
