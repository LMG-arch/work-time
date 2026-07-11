// utils.js — Shared utilities (ESM)
// 已迁移为 ES 模块；经典 <script> 通过 src/shims.js 的 window.* 垫片继续调用。

export function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function sanitizeUrl(url) {
  if (!url) return '';
  const s = String(url);
  if (s.startsWith('https://') || s.startsWith('http://')) return s;
  return '';
}

export function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 1800);
}

export function getTodayStr() {
  const today = new Date();
  return dateToStr(today.getFullYear(), today.getMonth(), today.getDate());
}

export function dateToStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

export function getFirstDayOfWeek(year, month) {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

export function formatDateCN(dateStr) {
  const WEEKDAYS_CN = ['日', '一', '二', '三', '四', '五', '六'];
  const d = new Date(dateStr + 'T00:00:00');
  const weekDay = WEEKDAYS_CN[d.getDay()];
  const parts = dateStr.split('-');
  return `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日 星期${weekDay}`;
}

export function isCapacitorPlatform() {
  return typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();
}

// Escape for use inside HTML attribute values
export function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Show diagnostic result popup (used by Supabase connection test)
export function showDiag(message) {
  const existing = document.getElementById('diag-panel');
  if (existing) existing.remove();
  const panel = document.createElement('div');
  panel.id = 'diag-panel';
  panel.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--card,#fff);border:1px solid var(--border,#e0e0e0);border-radius:12px;padding:20px;max-width:420px;width:90%;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.2);font-size:13px;white-space:pre-line;line-height:1.8;color:var(--text,#333);';
  panel.innerHTML = '<div style="font-size:15px;font-weight:600;margin-bottom:12px;">🔍 诊断结果</div><div>' + escapeHtml(message).replace(/\n/g, '<br>') + '</div>' +
    '<button id="diag-close" style="margin-top:16px;width:100%;padding:8px;border:1px solid var(--border,#e0e0e0);border-radius:8px;background:var(--card,#fff);cursor:pointer;font-size:13px;color:var(--text,#333);">关闭</button>';
  document.body.appendChild(panel);
  document.getElementById('diag-close').addEventListener('click', () => panel.remove());
}

// 农历转公历：遍历前年、当年和明年找到对应农历日期
// 带 LRU 缓存，key 为 `${year}-${lunarMonth}-${lunarDay}`
const _lunarToSolarCache = new Map();
const _lunarToSolarCacheMax = 500;
export function lunarToSolar(year, lunarMonth, lunarDay) {
  if (!window.Lunar) return null;
  const key = `${year}-${lunarMonth}-${lunarDay}`;
  const cached = _lunarToSolarCache.get(key);
  if (cached !== undefined) return cached;
  for (const y of [year - 1, year, year + 1]) {
    for (let m = 0; m < 12; m++) {
      const dim = getDaysInMonth(y, m);
      for (let d = 1; d <= dim; d++) {
        const lunar = window.Lunar.solar2lunar(y, m, d);
        if (lunar.lunarMonth === lunarMonth && lunar.lunarDay === lunarDay && !lunar.isLeap) {
          const result = dateToStr(y, m, d);
          if (_lunarToSolarCache.size >= _lunarToSolarCacheMax) {
            const first = _lunarToSolarCache.keys().next().value;
            _lunarToSolarCache.delete(first);
          }
          _lunarToSolarCache.set(key, result);
          return result;
        }
      }
    }
  }
  _lunarToSolarCache.set(key, null);
  return null;
}
