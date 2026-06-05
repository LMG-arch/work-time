const { contextBridge, ipcRenderer } = require('electron');

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
  // Reminders
  getReminders: () => ipcRenderer.invoke('get-reminders'),
  saveReminders: (reminders) => ipcRenderer.invoke('save-reminders', reminders),
  confirmReminder: (date, reminderId) => ipcRenderer.invoke('confirm-reminder', date, reminderId),
  getReminderRecords: (date) => ipcRenderer.invoke('get-reminder-records', date),
  getAllReminderRecords: () => ipcRenderer.invoke('get-all-reminder-records'),
  onReminderConfirmed: (callback) => ipcRenderer.on('reminder-confirmed', (_, data) => callback(data))
});
