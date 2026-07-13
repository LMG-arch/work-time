import './shared.js'
window.__bootLog && window.__bootLog('shared.js loaded')
import './shims.js'
window.__bootLog && window.__bootLog('shims.js loaded')
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './components/App.vue'
window.__bootLog && window.__bootLog('Vue + App imported')

// ===== 全局错误可见化 =====
// 目的：运行时（Electron 桌面端 / 安卓 WebView）一旦出现未捕获异常，
// 直接在屏幕上渲染红色错误浮层，避免「只剩导航栏 / 白屏」却看不到原因。
// 同时保留到 console，便于开发者定位。
function showFatal(msg, stack) {
  try {
    let el = document.getElementById('fatal-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fatal-overlay';
      el.style.cssText =
        'position:fixed;inset:0;z-index:2147483647;background:rgba(28,0,0,.92);' +
        'color:#ffd2d2;font:13px/1.7 ui-monospace,Menlo,Consolas,monospace;' +
        'padding:22px;overflow:auto;white-space:pre-wrap;box-sizing:border-box;' +
        'pointer-events:none;'; /* 关键：错误面板绝不拦截页面交互（导航栏/按钮仍可点） */
      const close = document.createElement('div');
      close.textContent = '× 关闭';
      close.style.cssText =
        'position:fixed;top:12px;right:14px;cursor:pointer;pointer-events:auto;' +
        'padding:6px 12px;border:1px solid rgba(255,210,210,.45);border-radius:8px;' +
        'font-size:12px;color:#ffd2d2;background:rgba(0,0,0,.25);';
      close.addEventListener('click', () => el.remove());
      el.appendChild(close);
      if (document.body) document.body.appendChild(el);
    }
    // 多次错误时追加，不重复创建关闭按钮（容器 pointer-events:none，关闭按钮单独 auto）
    const stamp = new Date().toLocaleString();
    const pre = document.createElement('div');
    pre.className = 'fatal-msg';
    pre.textContent =
      '⚠ 运行错误（请把这段截图发给开发者）\n[' + stamp + ']\n\n' +
      String(msg) + (stack ? '\n\n' + String(stack) : '');
    el.appendChild(pre);
  } catch (_) { /* 极致兜底：连 DOM 都写不了就放弃 */ }
}

window.addEventListener('error', (e) => {
  showFatal(e.message || 'unknown error', e.error && e.error.stack)
})
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason
  showFatal('未处理的 Promise 拒绝: ' + (r && r.message ? r.message : r), r && r.stack)
})

const app = createApp(App)
app.config.errorHandler = (err, _inst, info) => {
  showFatal('[Vue] ' + (info || '') + ': ' + (err && err.message ? err.message : err), err && err.stack)
}
const pinia = createPinia()

app.use(pinia)

// Eager-init all stores to set up backward compat callbacks
import { useCalendarStore } from './stores/calendarStore.js'
import { useReminderStore } from './stores/reminderStore.js'
import { useTodoStore } from './stores/todoStore.js'
import { useAppStore } from './stores/appStore.js'
window.__bootLog && window.__bootLog('store imports done')
useCalendarStore()
useReminderStore()
useTodoStore()
useAppStore()
window.__bootLog && window.__bootLog('stores initialized')

app.mount('#app')
window.__bootLog && window.__bootLog('Vue mounted #app, children=' + document.getElementById('app').childElementCount)
