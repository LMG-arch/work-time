// supabase/sync.js — 日历数据同步（ESM 模块）
// 逻辑与经典脚本逐字节一致；跨脚本依赖改为 import：
//   getEffectiveUserId ← social.js；window.__storage / window.calendarAPI / window.sb 继续走全局（shim 提供）。
import { getEffectiveUserId } from './social.js';

const SYNC_ENABLED_KEY = 'calendar-sync-enabled';

function isSyncEnabled() {
  return window.__storage.getRaw(SYNC_ENABLED_KEY) === 'true';
}

function setSyncEnabled(enabled) {
  window.__storage.setRaw(SYNC_ENABLED_KEY, enabled ? 'true' : 'false');
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
      const store = window.__storage.get('work-calendar-data');
      if (store) data.workData = { days: store.days || {}, todos: store.todos || [] };
    } catch (e) { console.warn('[Sync] Failed to parse work-calendar-data:', e.message); }
    try { data.reminders = window.__storage.get('calendar-reminders'); } catch (e) { console.warn('[Sync] Failed to parse reminders:', e.message); }
    try { data.reminderRecords = window.__storage.get('calendar-reminder-records'); } catch (e) { console.warn('[Sync] Failed to parse reminderRecords:', e.message); }
  }
  try { data.theme = window.__storage.getRaw('calendar-theme'); } catch (e) { console.warn('[Sync] Failed to read theme:', e.message); }

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
      const store = window.__storage.get('work-calendar-data') || { days: {}, todos: [] };
      if (data.workData) {
        // 整体替换而非并集：所有调用方（sync 合并 / 单向 pull / 墓碑清理）都传入
        // 完整数据集。并集会把本地已删除（被合并阶段排除）的旧副本重新并回来，
        // 导致已删除的打卡记录同步后"复活"并回推云端污染所有设备。
        if (data.workData.days) store.days = { ...data.workData.days };
        if (data.workData.todos) store.todos = data.workData.todos.filter(t => t && t.id);
      }
      window.__storage.set('work-calendar-data', store);
    } catch (e) { console.warn('[Sync] Failed to save work-calendar-data:', e.message); }
    if (data.reminders) window.__storage.set('calendar-reminders', data.reminders);
    if (data.reminderRecords) window.__storage.set('calendar-reminder-records', data.reminderRecords);
  }
  if (data.theme) window.__storage.setRaw('calendar-theme', data.theme);
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

        // 保留 tombstone（deleted 标记）而非剔除：删除操作靠 tombstone 跨设备传播。
        // 若在合并时剔除，先删除的设备会过早丢失删除记录，其它设备同步时会把
        // 本地未删除副本当作"仅有本地"保留 → 删除被"复活"。tombstone 读取时被
        // 过滤（electron/api.js getAllData）且 status=null 在日历渲染为空白格，
        // 由下方 30 天清理逻辑定期移除，故保留是安全的。
        if (localDay && cloudDay) {
          const localTime = new Date(localDay.updatedAt || 0).getTime();
          const cloudTime = new Date(cloudDay.updatedAt || 0).getTime();
          mergedDays[date] = localTime >= cloudTime ? localDay : cloudDay;
        } else if (localDay) {
          mergedDays[date] = localDay;
        } else if (cloudDay) {
          mergedDays[date] = cloudDay;
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
    // 主题本地优先：sync 合并未处理 theme，applyCalendarData 会用云端 theme 覆盖本地，
    // 导致本地刚切换的主题被回滚。此处恢复本地主题（随后会被 push 回云端）。
    if (localData.theme) window.__storage.setRaw('calendar-theme', localData.theme);
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
let _syncTimerResolve = null;
function autoSyncPush() {
  if (!isSyncEnabled() || !window.sb) return Promise.resolve();
  // 如果同步正在进行中（初始化/登录），跳过此次自动同步
  if (window._syncInProgress) {
    console.log('[Sync] Skipped auto-sync: sync already in progress');
    return Promise.resolve();
  }
  if (_syncTimer) {
    clearTimeout(_syncTimer);
    // 修复：取消防抖时必须先 resolve 上一个挂起的 Promise，
    // 否则先前 await autoSyncPush() 的调用方将永久悬挂。
    if (_syncTimerResolve) { _syncTimerResolve({ error: null, debounced: true }); _syncTimerResolve = null; }
  }
  return new Promise((resolve, reject) => {
    _syncTimerResolve = resolve;
    _syncTimer = setTimeout(async () => {
      _syncTimer = null;
      _syncTimerResolve = null;
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

export {
  isSyncEnabled,
  setSyncEnabled,
  collectCalendarData,
  applyCalendarData,
  pushCalendarData,
  pullCalendarData,
  syncCalendarData,
  pushToCloud,
  pullFromCloud,
  autoSyncPush
};
