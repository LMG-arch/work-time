// supabase/client.js — Supabase 客户端配置、认证、账号系统（ESM 模块）
// 客户端构造继续保持使用全局 window.supabase（UMD，来自 lib/supabase.min.js），不替换为 npm import。
// 复用 window.__storage（由 shims.js 注入）做本地持久化；不动任何服务器 SQL / RPC。

// 共享跨模块状态：此前 _globalUserId 是 social.js 声明、core.js 写入的词法全局；
// 转 ESM 后词法全局消失，这里集中为模块级变量并暴露访问器。
let _globalUserId = null;
export function getGlobalUserId() { return _globalUserId; }
export function setGlobalUserId(id) { _globalUserId = id; }

// 初始化为 null，与经典脚本行为一致
window.sb = null;

function getSupabaseConfig() {
  try {
    const obj = window.__storage.get('supabase-config');
    if (obj) return obj;
  } catch (e) { console.warn('[Config] Failed to parse supabase config:', e.message); }
  return { url: '', key: '' };
}

function saveSupabaseConfig(url, key) {
  window.__storage.set('supabase-config', { url, key });
}

// Store bound user UUID locally so we survive session expiry
function getBoundUserId() {
  return window.__storage.getRaw('social-bound-user-id') || '';
}
function setBoundUserId(id) {
  if (id) window.__storage.setRaw('social-bound-user-id', id);
}

function initSupabase() {
  const config = getSupabaseConfig();
  if (!config.url || !config.key) return null;
  if (!window.supabase || !window.supabase.createClient) {
    console.error('[Supabase] CDN library not loaded - window.supabase is undefined');
    return null;
  }
  try {
    window.sb = window.supabase.createClient(config.url, config.key, {
      auth: {
        storage: localStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      }
    });
  } catch (e) {
    console.error('[Supabase] createClient failed:', e);
    return null;
  }
  return window.sb;
}

// ===== Auth =====

async function getCurrentUser() {
  if (!window.sb) return null;
  try {
    const { data } = await window.sb.auth.getUser();
    return data.user;
  } catch {
    return null;
  }
}

// Robust session restoration: try multiple methods before creating new user
async function ensureSession() {
  if (!window.sb) return null;

  // Method 1: getUser() — checks token, auto-refreshes if possible
  try {
    const { data } = await window.sb.auth.getUser();
    if (data.user) {
      setBoundUserId(data.user.id);
      return data.user;
    }
  } catch (e) { console.debug('[Auth] getUser failed (falling back to method 2):', e.message); }

  // Method 2: getSession() — reads stored session directly, may succeed when getUser fails
  try {
    const { data } = await window.sb.auth.getSession();
    if (data.session && data.session.user) {
      const { data: refreshed } = await window.sb.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token
      });
      if (refreshed.user) {
        setBoundUserId(refreshed.user.id);
        return refreshed.user;
      }
    }
  } catch (e) { console.debug('[Auth] setSession failed (falling back to method 3):', e.message); }

  // Method 3: Create new anonymous user (only if no saved account)
  // If user has a saved account, don't create a new anonymous user —
  // it would create a different identity and break the linked_id chain.
  const hasSavedAccount = getSavedUsername();
  if (hasSavedAccount) {
    console.warn('[Auth] Session expired for logged-in user, not creating new anonymous user');
    return null;
  }

  try {
    const { data, error } = await window.sb.auth.signInAnonymously();
    if (!error && data.user) {
      setBoundUserId(data.user.id);
      return data.user;
    }
  } catch (e) { console.warn('[Auth] signInAnonymously failed:', e.message); }

  return null;
}

// Re-authenticate with saved credentials when session expires
async function restoreExpiredSession() {
  if (!window.sb) return null;
  const savedUsername = getSavedUsername();
  const savedHash = window.__storage.getRaw(ACCOUNT_HASH_KEY);
  const savedSalt = getSavedSalt();
  if (!savedUsername || !savedHash || !savedSalt) return null;

  try {
    // Create a fresh anonymous session
    const { data, error } = await window.sb.auth.signInAnonymously();
    if (error || !data.user) return null;
    setBoundUserId(data.user.id);

    // Re-link via login RPC
    const { data: loginData, error: loginErr } = await window.sb.rpc('login_username', {
      p_username: savedUsername,
      p_password_hash: savedHash
    });
    if (loginErr || (loginData && loginData.error)) {
      console.warn('[Auth] Auto-restore login failed:', loginErr?.message || loginData?.error);
      return data.user; // Return the anonymous user at least
    }

    console.log('[Auth] Session restored for', savedUsername);
    setGlobalUserId(loginData.user_id);
    setBoundUserId(loginData.user_id);
    return data.user;
  } catch (e) {
    console.warn('[Auth] restoreExpiredSession error:', e.message);
    return null;
  }
}

// ===== Account Registration / Login =====

const ACCOUNT_USERNAME_KEY = 'social-account-username';
const ACCOUNT_HASH_KEY = 'social-account-hash';
const ACCOUNT_SALT_KEY = 'social-account-salt';

// 生成随机盐值
function generateSalt() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

// SHA-256 哈希密码（使用随机盐值，每个用户独立）
// ⚠️ 安全注意：客户端哈希值直接发送给服务端 RPC 做比对，
// 哈希本身等同于密码等价物。截获哈希可直接登录。
// 更安全的方案是使用 Supabase 内置 Auth 或让服务端负责加盐比对。
async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + ':' + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 获取已保存的盐值（用于登录/恢复）
function getSavedSalt() {
  return window.__storage.getRaw(ACCOUNT_SALT_KEY) || '';
}

async function registerAccount(username, password) {
  if (!window.sb) return { error: '未配置服务' };
  if (!username || username.length < 2) return { error: '用户名至少2个字符' };
  if (!password || password.length < 4) return { error: '密码至少4个字符' };
  // Use existing session if available, otherwise create one
  let user = await getCurrentUser();
  if (!user) {
    const { data, error } = await window.sb.auth.signInAnonymously();
    if (error) return { error: '创建会话失败: ' + error.message };
    user = data.user;
    setBoundUserId(user.id);
  }

  // 生成随机盐值并哈希密码
  const salt = generateSalt();
  const pwHash = await hashPassword(password, salt);
  const { data, error } = await window.sb.rpc('register_username', {
    p_username: username,
    p_password_hash: pwHash
  });
  if (error) return { error: error.message };
  if (data && data.error) return { error: data.error };

  window.__storage.setRaw(ACCOUNT_USERNAME_KEY, username);
  window.__storage.setRaw(ACCOUNT_HASH_KEY, pwHash);
  window.__storage.setRaw(ACCOUNT_SALT_KEY, salt);
  setGlobalUserId(user.id);
  return { user: { id: user.id } };
}

async function loginAccount(username, password) {
  if (!window.sb) return { error: '未配置服务' };
  if (!username || !password) return { error: '请输入用户名和密码' };
  // Use existing session if available, otherwise create one
  let currentUser = await getCurrentUser();
  if (!currentUser) {
    const { data, error } = await window.sb.auth.signInAnonymously();
    if (error) return { error: '创建会话失败: ' + error.message };
    currentUser = data.user;
    setBoundUserId(currentUser.id);
  }

  // 使用注册时保存的盐值（必须与注册时相同，否则哈希不匹配）
  const salt = getSavedSalt();
  if (!salt) return { error: '未找到账户信息，请先注册' };
  const pwHash = await hashPassword(password, salt);
  const { data, error } = await window.sb.rpc('login_username', {
    p_username: username,
    p_password_hash: pwHash
  });
  if (error) return { error: error.message };
  if (data && data.error) return { error: data.error };

  const userId = data.user_id;
  window.__storage.setRaw(ACCOUNT_USERNAME_KEY, username);
  window.__storage.setRaw(ACCOUNT_HASH_KEY, pwHash);
  // 保持盐值不变（已在上方通过 getSavedSalt 获取）
  setBoundUserId(userId);
  setGlobalUserId(userId);
  return { user: { id: userId } };
}

// Auto-restore login on app start (uses saved credentials)
async function restoreAccount() {
  const username = getSavedUsername();
  const pwHash = window.__storage.getRaw(ACCOUNT_HASH_KEY);
  const salt = getSavedSalt();
  if (!username || !pwHash || !salt || !window.sb) return false;

  // Check if already logged in with correct user
  const currentUser = await getCurrentUser();
  if (currentUser) {
    const profile = await getProfile(currentUser.id);
    if (profile && profile.username === username) {
      // Already logged in as the right user
      setGlobalUserId(currentUser.id);
      return true;
    }
  }

  // Need to re-login (session expired or different user)
  let user = await getCurrentUser();
  if (!user) {
    try {
      const { data, error } = await window.sb.auth.signInAnonymously();
      if (error) return false;
      user = data.user;
      setBoundUserId(user.id);
    } catch { return false; }
  }

  try {
    const { data, error } = await window.sb.rpc('login_username', {
      p_username: username,
      p_password_hash: pwHash
    });
    if (error || (data && data.error)) return false;

    const userId = data.user_id;
    setBoundUserId(userId);
    setGlobalUserId(userId);
    return true;
  } catch { return false; }
}

async function logoutAccount() {
  if (window.sb) {
    try { await window.sb.auth.signOut(); } catch (e) { console.warn('[Auth] signOut failed:', e.message); }
  }
  window.__storage.remove(ACCOUNT_USERNAME_KEY);
  window.__storage.remove(ACCOUNT_HASH_KEY);
  window.__storage.remove(ACCOUNT_SALT_KEY);
  window.__storage.remove('social-bound-user-id');
  setGlobalUserId(null);
}

function getSavedUsername() {
  return window.__storage.getRaw(ACCOUNT_USERNAME_KEY) || '';
}

export {
  getSupabaseConfig,
  saveSupabaseConfig,
  getBoundUserId,
  setBoundUserId,
  initSupabase,
  getCurrentUser,
  ensureSession,
  restoreExpiredSession,
  generateSalt,
  hashPassword,
  getSavedSalt,
  registerAccount,
  loginAccount,
  restoreAccount,
  logoutAccount,
  getSavedUsername,
  ACCOUNT_USERNAME_KEY,
  ACCOUNT_HASH_KEY,
  ACCOUNT_SALT_KEY
};
