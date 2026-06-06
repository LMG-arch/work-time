// utils.js — Shared utilities

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sanitizeUrl(url) {
  if (!url) return '';
  const s = String(url);
  if (s.startsWith('https://') || s.startsWith('http://')) return s;
  return '';
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 1800);
}

function getTodayStr() {
  const today = new Date();
  return dateToStr(today.getFullYear(), today.getMonth(), today.getDate());
}

function dateToStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year, month) {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

function formatDateCN(dateStr) {
  const WEEKDAYS_CN = ['日', '一', '二', '三', '四', '五', '六'];
  const d = new Date(dateStr + 'T00:00:00');
  const weekDay = WEEKDAYS_CN[d.getDay()];
  const parts = dateStr.split('-');
  return `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日 星期${weekDay}`;
}

function isCapacitorPlatform() {
  return typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();
}

// Escape for use inside HTML attribute values
function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
