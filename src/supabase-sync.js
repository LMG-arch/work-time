// supabase-sync.js — 日历数据同步

const SYNC_ENABLED_KEY = 'calendar-sync-enabled';

function isSyncEnabled() {
  return localStorage.getItem(SYNC_ENABLED_KEY) === 'true';
}

function setSyncEnabled(enabled) {
  localStorage.setItem(SYNC_ENABLED_KEY, enabled ? 'true' : 'false');
}

// Collect all calendar data from storage
// Electron: reads from main process JSON file via IPC (syncRead)
// Web/Capacitor: reads from localStorage
async function collectCalendarData() {
  const data = {};
  const isElectron = typeof window.calendarAPI?.syncRead === 'function';
  if (isElectron) {
    try {
      const store = await window.calendarAPI.syncRead();
      if (store) {
        data.workData = { days: store.days || {}, todos: store.todos || [] };
        data.reminders = store.reminders || null;
        data.reminderRecords = store.reminderRecords || {};
      }
    } catch (e) { console.error('[Sync] syncRead failed:', e.message); }
  } else {
    try {
      const store = JSON.parse(localStorage.getItem('work-calendar-data'));
      if (store) data.workData = { days: store.days || {}, todos: store.todos || [] };
    } catch (e) { console.warn('[Sync] Failed to parse work-calendar-data:', e.message); }
    try { data.reminders = JSON.parse(localStorage.getItem('calendar-reminders')); } catch (e) { console.warn('[Sync] Failed to parse reminders:', e.message); }
    try { data.reminderRecords = JSON.parse(localStorage.getItem('calendar-reminder-records')); } catch (e) { console.warn('[Sync] Failed to parse reminderRecords:', e.message); }
  }
  try { data.theme = localStorage.getItem('calendar-theme'); } catch (e) { console.warn('[Sync] Failed to read theme:', e.message); }

  // Ensure all days have updatedAt for proper sync comparison
  if (data.workData?.days) {
    const now = new Date().toISOString();
    for (const date of Object.keys(data.workData.days)) {
      if (!data.workData.days[date].updatedAt) {
        data.workData.days[date].updatedAt = now;
      }
    }
  }
  // Ensure all todos have updatedAt
  if (data.workData?.todos) {
    const now = new Date().toISOString();
    data.workData.todos = data.workData.todos.map(t => {
      if (t && !t.updatedAt) {
        return { ...t, updatedAt: now };
      }
      return t;
    });
  }

  return data;
}

// Apply synced data to storage
// Electron: writes to main process JSON file via IPC (syncWrite)
// Web/Capacitor: writes to localStorage
async function applyCalendarData(data) {
  if (!data) return;
  const isElectron = typeof window.calendarAPI?.syncWrite === 'function';
  if (isElectron) {
    try {
      await window.calendarAPI.syncWrite({
        days: data.workData?.days,
        todos: data.workData?.todos,
        reminders: data.reminders,
        reminderRecords: data.reminderRecords
      });
    } catch (e) { console.error('[Sync] syncWrite failed:', e.message); }
  } else {
    try {
      const store = JSON.parse(localStorage.getItem('work-calendar-data')) || { days: {}, todos: [] };
      if (data.workData) {
        if (data.workData.days) store.days = { ...store.days, ...data.workData.days };
        if (data.workData.todos) {
          const todoMap = {};
          (store.todos || []).forEach(t => { if (t && t.id) todoMap[t.id] = t; });
          data.workData.todos.forEach(t => { if (t && t.id) todoMap[t.id] = t; });
          store.todos = Object.values(todoMap);
        }
      }
      localStorage.setItem('work-calendar-data', JSON.stringify(store));
    } catch (e) { console.warn('[Sync] Failed to save work-calendar-data:', e.message); }
    if (data.reminders) localStorage.setItem('calendar-reminders', JSON.stringify(data.reminders));
    if (data.reminderRecords) localStorage.setItem('calendar-reminder-records', JSON.stringify(data.reminderRecords));
  }
  if (data.theme) localStorage.setItem('calendar-theme', data.theme);
}

// Push local data to cloud
async function pushCalendarData() {
  if (!window.sb) return { error: '未连接' };
  const uid = await getEffectiveUserId();
  if (!uid) return { error: '未登录' };
  const data = await collectCalendarData();
  const { error } = await window.sb.from('user_data').upsert({
    user_id: uid,
    data: data,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });
  return { error: error ? error.message : null };
}

// Pull cloud data to local
async function pullCalendarData() {
  if (!window.sb) return { error: '未连接' };
  const uid = await getEffectiveUserId();
  if (!uid) return { error: '未登录' };
  const { data, error } = await window.sb.from('user_data').select('data').eq('user_id', uid).maybeSingle();
  if (error) return { error: error.message };
  if (data && data.data) {
    await applyCalendarData(data.data);
    return { error: null, pulled: true };
  }
  return { error: null, pulled: false };
}

// Smart sync: pull cloud data, merge with local, push back
// 排队机制：同步进行中时，后续调用等待而非丢弃
let _syncPromise = null;
let _syncQueued = false;
async function syncCalendarData() {
  if (_syncPromise) {
    // 当前有同步在运行，标记排队并等待完成后重试一次
    _syncQueued = true;
    await _syncPromise;
    _syncQueued = false;
  }
  _syncPromise = _doSyncCalendarData();
  try {
    return await _syncPromise;
  } finally {
    _syncPromise = null;
  }
}

async function _doSyncCalendarData() {
  if (!window.sb) return { error: '未连接' };
  const uid = await getEffectiveUserId();
  if (!uid) return { error: '未登录' };

  // Get cloud data
  const { data: cloudRow, error: fetchErr } = await window.sb.from('user_data')
    .select('data, updated_at').eq('user_id', uid).maybeSingle();
  if (fetchErr) return { error: fetchErr.message };

  const localData = await collectCalendarData();

  console.log('[Sync] Local days:', Object.keys(localData.workData?.days || {}).length);
  console.log('[Sync] Cloud days:', Object.keys(cloudRow?.data?.workData?.days || {}).length);

  if (cloudRow && cloudRow.data) {
    const cloudData = cloudRow.data;

    // Smart merge: compare updatedAt for each item, keep the latest
    if (cloudData.workData && localData.workData) {
      // Merge days: keep the one with newer updatedAt
      const mergedDays = {};
      const allDates = new Set([
        ...Object.keys(localData.workData.days || {}),
        ...Object.keys(cloudData.workData.days || {})
      ]);

      for (const date of allDates) {
        const localDay = localData.workData.days?.[date];
        const cloudDay = cloudData.workData.days?.[date];

        if (localDay && cloudDay) {
          // Both exist: keep newer
          const localTime = new Date(localDay.updatedAt || 0).getTime();
          const cloudTime = new Date(cloudDay.updatedAt || 0).getTime();
          const winner = localTime >= cloudTime ? localDay : cloudDay;
          // Only keep if not deleted
          if (!winner.deleted) {
            mergedDays[date] = winner;
          }
        } else if (localDay) {
          // Only local: keep if not deleted
          if (!localDay.deleted) {
            mergedDays[date] = localDay;
          }
        } else if (cloudDay) {
          // Only cloud: keep if not deleted
          if (!cloudDay.deleted) {
            mergedDays[date] = cloudDay;
          }
        }
      }
      cloudData.workData.days = mergedDays;

      // Merge todos: keep the one with newer updatedAt per id
      const todoMap = {};
      const allTodos = [
        ...(localData.workData.todos || []),
        ...(cloudData.workData.todos || [])
      ];
      for (const todo of allTodos) {
        if (!todo || !todo.id) continue;
        const existing = todoMap[todo.id];
        if (!existing) {
          todoMap[todo.id] = todo;
        } else {
          const existingTime = new Date(existing.updatedAt || 0).getTime();
          const currentTime = new Date(todo.updatedAt || 0).getTime();
          if (currentTime > existingTime) {
            todoMap[todo.id] = todo;
          }
        }
      }
      cloudData.workData.todos = Object.values(todoMap);
    }

    // Reminders: keep newer
    if (localData.reminders && cloudData.reminders) {
      const localTime = new Date(localData.reminders.updatedAt || 0).getTime();
      const cloudTime = new Date(cloudData.reminders.updatedAt || 0).getTime();
      if (localTime > cloudTime) {
        cloudData.reminders = localData.reminders;
      }
    } else if (localData.reminders) {
      cloudData.reminders = localData.reminders;
    }

    // ReminderRecords: merge, keep newer per record
    if (localData.reminderRecords) {
      if (!cloudData.reminderRecords) cloudData.reminderRecords = {};
      for (const date of Object.keys(localData.reminderRecords)) {
        if (!cloudData.reminderRecords[date]) {
          cloudData.reminderRecords[date] = localData.reminderRecords[date];
        } else {
          for (const rid of Object.keys(localData.reminderRecords[date])) {
            const localRec = localData.reminderRecords[date][rid];
            const cloudRec = cloudData.reminderRecords[date][rid];
            if (!cloudRec) {
              cloudData.reminderRecords[date][rid] = localRec;
            } else {
              const localTime = new Date(localRec.at || 0).getTime();
              const cloudTime = new Date(cloudRec.at || 0).getTime();
              if (localTime >= cloudTime) {
                cloudData.reminderRecords[date][rid] = localRec;
              }
            }
          }
        }
      }
    }

    await applyCalendarData(cloudData);
  }

  // 清理超过 30 天的 tombstone 记录，避免数据膨胀
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffTime = thirtyDaysAgo.getTime();

  const currentData = await collectCalendarData();
  if (currentData.workData?.days) {
    for (const [date, day] of Object.entries(currentData.workData.days)) {
      if (day.deleted && day.updatedAt) {
        const deletedTime = new Date(day.updatedAt).getTime();
        if (deletedTime < cutoffTime) {
          delete currentData.workData.days[date];
        }
      }
    }
  }
  await applyCalendarData(currentData);

  // Push merged data to cloud
  const pushData = await collectCalendarData();
  const { error: pushErr } = await window.sb.from('user_data').upsert({
    user_id: uid,
    data: pushData,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });

  return { error: pushErr ? pushErr.message : null };
}

// One-way push: local -> cloud (overwrites cloud)
async function pushToCloud() {
  if (!window.sb) return { error: '未连接' };
  const uid = await getEffectiveUserId();
  if (!uid) return { error: '未登录' };
  const data = await collectCalendarData();
  const { error } = await window.sb.from('user_data').upsert({
    user_id: uid,
    data: data,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });
  return { error: error ? error.message : null };
}

// One-way pull: cloud -> local (overwrites local)
async function pullFromCloud() {
  if (!window.sb) return { error: '未连接' };
  const uid = await getEffectiveUserId();
  if (!uid) return { error: '未登录' };
  const { data, error } = await window.sb.from('user_data').select('data').eq('user_id', uid).maybeSingle();
  if (error) return { error: error.message };
  if (data && data.data) {
    await applyCalendarData(data.data);
    return { error: null, pulled: true };
  }
  return { error: null, pulled: false };
}

// Auto-sync: full sync if enabled (debounced, 3s idle)
// Returns a promise that resolves when sync completes (or immediately if no sync needed)
// 同步锁：防止初始化/登录期间并发写入导致数据冲突
let _syncTimer = null;
function autoSyncPush() {
  if (!isSyncEnabled() || !window.sb) return Promise.resolve();
  // 如果同步正在进行中（初始化/登录），跳过此次自动同步
  if (window._syncInProgress) {
    console.log('[Sync] Skipped auto-sync: sync already in progress');
    return Promise.resolve();
  }
  if (_syncTimer) clearTimeout(_syncTimer);
  return new Promise((resolve, reject) => {
    _syncTimer = setTimeout(async () => {
      _syncTimer = null;
      try {
        const result = await syncCalendarData();
        resolve(result);
      } catch (e) {
        console.log('[Sync] Auto-sync failed:', e.message);
        reject(e);
      }
    }, 3000);
  });
}
