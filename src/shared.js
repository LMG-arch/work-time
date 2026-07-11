// shared.js — 全局状态与常量（迁移后的统一来源）
//
// 原 renderer.js 以经典 <script> 的顶层 let/const 声明在“全局词法环境”中
// 暴露这些符号，供其它 ES 模块按裸名访问。renderer.js 自身迁移为 ES 模块后，
// 顶层声明不再进入全局词法环境，因此在此统一以 window.* 属性形式预置，
// 既能被 ES 模块按裸名解析（全局对象属性），也保持了与迁移前一致的可变引用语义。
//
// 本文件必须在 shims.js 之前由 vue-main.js 导入。

// ===== 状态（基本类型，外部赋值即写回 window.*）=====
window.currentYear = new Date().getFullYear();
window.currentMonth = new Date().getMonth();
window.selectedDate = null;
window.allData = {};
window.allTodos = [];
window.currentView = 'calendar';
window.todoFilter = 'all';
window.holidayData = null;
window.allReminders = [];
window.allReminderRecords = {};
window.reminderNotifTimer = null;

// ===== 常量 =====
window.WEEKDAYS_CN = ['日', '一', '二', '三', '四', '五', '六'];
window.STATUS_LABELS = { work: '上班', rest: '休息', trip: '出差', leave: '请假', annual: '年假', sick: '病假', personal: '事假' };
window.STATUS_CHARS = { work: '班', rest: '休', trip: '差', leave: '假', annual: '年', sick: '病', personal: '事' };
window.THEMES = [
  { id: 'default', name: '经典', color: '#333' },
  { id: 'dark',    name: '暗黑', color: '#1a1a2e' },
  { id: 'green',   name: '清新', color: '#43A047' },
  { id: 'pink',    name: '粉色', color: '#e91e63' },
  { id: 'purple',  name: '紫色', color: '#7e57c2' },
  { id: 'navy',    name: '商务', color: '#1565c0' },
  { id: 'ocean',   name: '海洋', color: '#00838f' },
  { id: 'sunset',  name: '日落', color: '#e65100' },
  { id: 'rose',    name: '玫瑰金', color: '#b76e79' },
  { id: 'forest',  name: '森林', color: '#2e7d32' },
  { id: 'coffee',  name: '咖啡', color: '#5d4037' },
  { id: 'lavender',name: '薰衣草', color: '#9575cd' },
  { id: 'mint',    name: '薄荷', color: '#26a69a' },
  { id: 'slate',   name: '石板', color: '#546e7a' },
  { id: 'cosmic',  name: '星海绽放', color: '#9d8cff' },
];
