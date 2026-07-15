// storage.js — 平台感知的耐用存储封装（针对安卓端 localStorage 易失问题）(ESM)
//
// 背景：本应用安卓端(Capacitor)的全部本地数据都写在 WebView 的 localStorage 里。
// WebView localStorage 非持久存储，可被系统 WebView 升级 / 厂商清理 / 存储压力抹掉，
// 且安卓端没有文件系统兜底。一旦被清，连 Supabase 配置与账号凭据也同在其中，
// 云端同步将彻底失效、数据无法恢复。
//
// 方案：
//  - 以「内存缓存」作为同步读取的真值源，故现有的同步调用点无需改成 async（零雪崩）。
//  - 若 Capacitor Filesystem 可用，缓存由 Data 目录下的文件做耐用备份
//    （app 更新保留该目录，且不受 WebView localStorage 回收影响）。
//    初始化时把文件读入缓存；写操作异步(防抖)落盘。
//  - localStorage 仍作为 write-through 二级副本，即使 FS 失败也有原安全网。
//  - 首次从 localStorage 播种到 FS，老用户升级后数据自动迁到耐用存储。
//
// 注意：Electron 桌面端走 preload/IPC（写 calendar-data.json），preload 注入的
// window.calendarAPI 不可配置，web-api.js 的赋值在其上静默失败，故本封装不影响桌面路径。
// 桌面/浏览器下无 Capacitor Filesystem，自动退化为纯 localStorage（行为与原先一致）。

// FS 引用惰性检测：Capacitor 桥（window.Capacitor.Plugins.Filesystem）可能在
// storage.js 模块求值之后才就绪，故不能在模块加载时一次性求值（否则 FS 永远为
// null，整个耐用层空转——这正是安卓更新/重启后配置与数据丢失的根因）。
// 调用时检测，一旦就绪即缓存复用；之前未就绪则后续调用会重新探测直到成功。
// 首次检测到插件时自动触发 initStorage（从 FS 读入缓存并落盘），无需外部重试。
let _fsRef = null;
function getFS() {
  if (_fsRef) return _fsRef;
  _fsRef = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) || null;
  if (_fsRef && !_loaded && !_loading) {
    storage.init().catch(e => console.warn('[Storage] init failed:', e.message));
  }
  return _fsRef;
}
const PREFIX = 'wc-'; // Data 目录下文件名前缀，避免与其它文件冲突

// 关键键：写入时立即落盘 FS（不走 300ms 防抖），避免应用被杀/更新时丢失
// 最新配置与身份（修复「更新/重启后本地数据/配置不同步」「每次重启显示新用户」）。
const CRITICAL_FLUSH_KEYS = {
  'supabase-config': 1,
  'supabase-auth-store': 1,
  'social-account-username': 1,
  'social-account-hash': 1,
  'social-account-salt': 1,
  'social-bound-user-id': 1,
  'social-nickname': 1,
};

const _cache = {}; // key -> string，同步真值源
let _loaded = false;
let _loading = null;
let _persistTimer = null;
// 注：FS 可用性改由 getFS() 在调用时惰性检测，不再依赖模块加载时刻的值。

// 我们管理的已知 key（init 时预加载，并从 localStorage 播种）
const KNOWN_KEYS = {
  'work-calendar-data': 1,
  'calendar-reminders': 1,
  'calendar-reminder-records': 1,
  'supabase-config': 1,
  'social-account-username': 1,
  'social-account-hash': 1,
  'social-account-salt': 1,
  'social-bound-user-id': 1,
  'supabase-auth-store': 1, // Supabase 认证会话（匿名/登录）耐用备份，跨 WebView 清理与更新保持身份
  'calendar-sync-enabled': 1,
  'calendar-theme': 1,
  // —— 以下为后续补全的耐用化 key（请求：所有本地数据都要保存/恢复）——
  'theme': 1,
  'syncEnabled': 1,
  'premiumEffects': 1,
  'navSettings': 1,
  'water-records': 1,
  'social-nickname': 1,
  'calendar-nav-items': 1
};

// ---- 底层原始字符串读写（同步，缓存驱动）----
function rawGet(key) {
  if (key in _cache) return _cache[key];
  // init 完成前退化为 localStorage，保证读取始终可用
  try { return localStorage.getItem(key); } catch { return null; }
}
function rawSet(key, val) {
  _cache[key] = val;
  _persist(key, val);
}
function rawRemove(key) {
  delete _cache[key];
  _persist(key, null);
}

// ---- 异步落盘到 Filesystem（防抖）----
function _persist(key, val) {
  try { localStorage.setItem(key, val == null ? '' : val); } catch (e) { /* 配额或隐私模式，忽略 */ }
  if (!getFS()) return;
  if (CRITICAL_FLUSH_KEYS[key]) {
    // 关键键：跳过防抖，立即全量落盘 FS（一次写入量很小，开销可忽略）
    flushAll().catch(e => console.warn('[Storage] critical flush failed:', e.message));
    return;
  }
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => { flushAll(); }, 300);
}

async function flushAll() {
  const fs = getFS();
  if (!fs) return;
  const entries = Object.keys(_cache);
  for (const k of entries) {
    const v = _cache[k];
    try {
      if (v == null) {
        await fs.deleteFile({ path: PREFIX + k, directory: 'DATA' }).catch(() => {});
      } else {
        await fs.writeFile({ path: PREFIX + k, data: v, directory: 'DATA', encoding: 'utf8' });
      }
    } catch (e) { console.warn('[Storage] FS persist failed:', e.message); }
  }
}

// 兜底落盘钩子：在页面/应用进入不可见状态时把内存缓存立即写 FS。
// 这是 WebView 被系统回收前最后可靠的落盘窗口，覆盖 300ms 防抖未触发的情况。
function installFlushHooks() {
  if (typeof window === 'undefined') return;
  const onHide = () => { flushAll().catch(() => {}); };
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onHide();
  });
  window.addEventListener('pagehide', onHide);
  // Capacitor Android：应用切后台/被杀前的最佳落盘窗口
  try {
    const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (App && typeof App.addListener === 'function') {
      App.addListener('appStateChange', (state) => {
        if (state && state.isActive === false) onHide();
      }).catch(() => {});
    }
  } catch (e) { console.warn('[Storage] appStateChange hook failed:', e.message); }
}

// ---- 一次性异步初始化：FS -> 缓存，缺失则从 localStorage 播种 ----
async function initStorage() {
  if (_loaded) return;
  if (_loading) return _loading;
  _loading = (async () => {
    const fs = getFS();
    if (fs) {
      for (const k of Object.keys(KNOWN_KEYS)) {
        // 若该 key 已被写操作写入缓存，保留写操作的结果（避免回灌旧值）
        if (k in _cache) continue;
        try {
          const r = await fs.readFile({ path: PREFIX + k, directory: 'DATA' });
          _cache[k] = (r && r.data != null) ? String(r.data) : null;
        } catch {
          // 文件不存在：从 localStorage 播种，保证老用户升级不丢数据
          try { _cache[k] = localStorage.getItem(k); } catch { _cache[k] = null; }
        }
      }
      // 关键修复：把「从 localStorage 播种进缓存」的值落盘到 FS。
      // 否则仅存于 localStorage 的旧配置（如更新前录入的 supabase-config）
      // 永远不会被耐用备份覆盖；一旦 WebView 在更新时被系统清空，
      // 配置将永久丢失、且无法从云端恢复。这里统一回写，完成一次性迁移。
      try { await flushAll(); } catch (e) { console.warn('[Storage] seed flush failed:', e.message); }

      // 兜底落盘：页面隐藏/卸载、以及 Capacitor 切后台时立即把缓存写 FS，
      // 避免 WebView 被系统回收导致数据丢失（修复「更新/重启后数据不同步」）。
      installFlushHooks();
    }
    _loaded = true;
  })();
  return _loading;
}

// ---- 公开 JSON API（同步）----
function storageGet(key) {
  const raw = rawGet(key);
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function storageSet(key, obj) {
  rawSet(key, JSON.stringify(obj));
}
function storageRemove(key) {
  rawRemove(key);
}
// 原始字符串读写（用于非 JSON 值，如 'true' / 主题 id）
function storageGetRaw(key) { return rawGet(key); }
function storageSetRaw(key, val) { rawSet(key, val == null ? null : String(val)); }

export const storage = {
  get: storageGet,
  set: storageSet,
  remove: storageRemove,
  getRaw: storageGetRaw,
  setRaw: storageSetRaw,
  init: initStorage,
  flush: flushAll
};

// 兼容垫片：未迁移的经典脚本继续通过 window.__storage 读取
if (typeof window !== 'undefined') {
  window.__storage = storage;
  // 脚本加载即自动初始化（页面启动早期触发，无需各模块手动调用）。
  // 用 getFS() 惰性检测：即使此刻 Capacitor 桥未就绪，initStorage 内部也会在
  // FS 可用时读取并落盘，无需外部重试。
  if (getFS()) {
    storage.init().catch(e => console.warn('[Storage] init failed:', e.message));
  }
}
