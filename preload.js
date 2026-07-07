const { contextBridge, ipcRenderer } = require('electron');

// 管理每个 channel 的监听器，避免 removeAllListeners 误杀其他模块的监听
const _channelListeners = {};

function safeOn(channel, callback) {
  // 移除本模块之前注册的监听器，而非清除所有
  if (_channelListeners[channel]) {
    ipcRenderer.removeListener(channel, _channelListeners[channel]);
  }
  const handler = (_, data) => callback(data);
  _channelListeners[channel] = handler;
  ipcRenderer.on(channel, handler);
}

contextBridge.exposeInMainWorld('calendarAPI', {
  getAllData: () => ipcRenderer.invoke('get-all-data'),
  getMonthData: (year, month) => ipcRenderer.invoke('get-month-data', year, month),
  saveDay: (date, status, note, tags, color) => ipcRenderer.invoke('save-day', date, status, note, tags, color),
  exportData: () => ipcRenderer.invoke('export-data'),
  importData: () => ipcRenderer.invoke('import-data'),
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
  setAutoLaunch: (enable) => ipcRenderer.invoke('set-auto-launch', enable),
  getHolidays: () => ipcRenderer.invoke('get-holidays'),
  getTodos: () => ipcRenderer.invoke('get-todos'),
  addTodo: (todo) => ipcRenderer.invoke('add-todo', todo),
  updateTodo: (id, updates) => ipcRenderer.invoke('update-todo', id, updates),
  deleteTodo: (id) => ipcRenderer.invoke('delete-todo', id),
  // Todo notification
  notifyTodo: (text, time) => ipcRenderer.send('notify-todo', text, time),
  // App version
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  // Reminders
  getReminders: () => ipcRenderer.invoke('get-reminders'),
  saveReminders: (reminders) => ipcRenderer.invoke('save-reminders', reminders),
  confirmReminder: (date, reminderId) => ipcRenderer.invoke('confirm-reminder', date, reminderId),
  getReminderRecords: (date) => ipcRenderer.invoke('get-reminder-records', date),
  getAllReminderRecords: () => ipcRenderer.invoke('get-all-reminder-records'),
  onReminderConfirmed: (callback) => safeOn('reminder-confirmed', callback),
  // Sync bridge: read/write full store for cloud sync
  syncRead: () => ipcRenderer.invoke('sync-read'),
  syncWrite: (data) => ipcRenderer.invoke('sync-write', data),
  onDataChanged: (callback) => safeOn('data-changed', callback)
});
