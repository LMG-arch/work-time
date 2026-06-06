// Supabase client and API
let sb = null;

function getSupabaseConfig() {
  try {
    const raw = localStorage.getItem('supabase-config');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { url: '', key: '' };
}

function saveSupabaseConfig(url, key) {
  localStorage.setItem('supabase-config', JSON.stringify({ url, key }));
}

// Store bound user UUID locally so we survive session expiry
function getBoundUserId() {
  return localStorage.getItem('social-bound-user-id') || '';
}
function setBoundUserId(id) {
  if (id) localStorage.setItem('social-bound-user-id', id);
}

function initSupabase() {
  const config = getSupabaseConfig();
  if (!config.url || !config.key) return null;
  if (!window.supabase || !window.supabase.createClient) {
    console.error('[Supabase] CDN library not loaded - window.supabase is undefined');
    return null;
  }
  try {
    sb = window.supabase.createClient(config.url, config.key, {
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
  return sb;
}

// ===== Auth =====

async function getCurrentUser() {
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getUser();
    return data.user;
  } catch {
    return null;
  }
}

// Robust session restoration: try multiple methods before creating new user
async function ensureSession() {
  if (!sb) return null;

  // Method 1: getUser() — checks token, auto-refreshes if possible
  try {
    const { data } = await sb.auth.getUser();
    if (data.user) {
      setBoundUserId(data.user.id);
      return data.user;
    }
  } catch {}

  // Method 2: getSession() — reads stored session directly, may succeed when getUser fails
  try {
    const { data } = await sb.auth.getSession();
    if (data.session && data.session.user) {
      const { data: refreshed } = await sb.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token
      });
      if (refreshed.user) {
        setBoundUserId(refreshed.user.id);
        return refreshed.user;
      }
    }
  } catch {}

  // Method 3: Create new anonymous user (only if no saved account)
  // If user has a saved account, don't create a new anonymous user —
  // it would create a different identity and break the linked_id chain.
  const hasSavedAccount = getSavedUsername();
  if (hasSavedAccount) {
    console.warn('[Auth] Session expired for logged-in user, not creating new anonymous user');
    return null;
  }

  try {
    const { data, error } = await sb.auth.signInAnonymously();
    if (!error && data.user) {
      setBoundUserId(data.user.id);
      return data.user;
    }
  } catch {}

  return null;
}

// Re-authenticate with saved credentials when session expires
async function restoreExpiredSession() {
  if (!sb) return null;
  const savedUsername = getSavedUsername();
  const savedHash = localStorage.getItem(ACCOUNT_HASH_KEY);
  if (!savedUsername || !savedHash) return null;

  try {
    // Create a fresh anonymous session
    const { data, error } = await sb.auth.signInAnonymously();
    if (error || !data.user) return null;
    setBoundUserId(data.user.id);

    // Re-link via login RPC
    const { data: loginData, error: loginErr } = await sb.rpc('login_username', {
      p_username: savedUsername,
      p_password_hash: savedHash
    });
    if (loginErr || (loginData && loginData.error)) {
      console.warn('[Auth] Auto-restore login failed:', loginErr?.message || loginData?.error);
      return data.user; // Return the anonymous user at least
    }

    console.log('[Auth] Session restored for', savedUsername);
    if (typeof _currentUserId !== 'undefined') _currentUserId = loginData.user_id;
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

// Simple SHA-256 hash for passwords (browser Web Crypto API)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + '_workcalendar_salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function registerAccount(username, password) {
  if (!sb) return { error: '未配置服务' };
  if (!username || username.length < 2) return { error: '用户名至少2个字符' };
  if (!password || password.length < 4) return { error: '密码至少4个字符' };

  // Use existing session if available, otherwise create one
  let user = await getCurrentUser();
  if (!user) {
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) return { error: '创建会话失败: ' + error.message };
    user = data.user;
    setBoundUserId(user.id);
  }

  const pwHash = await hashPassword(password);
  const { data, error } = await sb.rpc('register_username', {
    p_username: username,
    p_password_hash: pwHash
  });
  if (error) return { error: error.message };
  if (data && data.error) return { error: data.error };

  localStorage.setItem(ACCOUNT_USERNAME_KEY, username);
  localStorage.setItem(ACCOUNT_HASH_KEY, pwHash);
  if (typeof _currentUserId !== 'undefined') _currentUserId = user.id;
  return { user: { id: user.id } };
}

async function loginAccount(username, password) {
  if (!sb) return { error: '未配置服务' };
  if (!username || !password) return { error: '请输入用户名和密码' };

  // Use existing session if available, otherwise create one
  let currentUser = await getCurrentUser();
  if (!currentUser) {
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) return { error: '创建会话失败: ' + error.message };
    currentUser = data.user;
    setBoundUserId(currentUser.id);
  }

  const pwHash = await hashPassword(password);
  const { data, error } = await sb.rpc('login_username', {
    p_username: username,
    p_password_hash: pwHash
  });
  if (error) return { error: error.message };
  if (data && data.error) return { error: data.error };

  const userId = data.user_id;
  localStorage.setItem(ACCOUNT_USERNAME_KEY, username);
  localStorage.setItem(ACCOUNT_HASH_KEY, pwHash);
  setBoundUserId(userId);
  if (typeof _currentUserId !== 'undefined') _currentUserId = userId;
  return { user: { id: userId } };
}

// Auto-restore login on app start (uses saved credentials)
async function restoreAccount() {
  const username = getSavedUsername();
  const pwHash = localStorage.getItem(ACCOUNT_HASH_KEY);
  if (!username || !pwHash || !sb) return false;

  // Check if already logged in with correct user
  const currentUser = await getCurrentUser();
  if (currentUser) {
    const profile = await getProfile(currentUser.id);
    if (profile && profile.username === username) {
      // Already logged in as the right user
      if (typeof _currentUserId !== 'undefined') _currentUserId = currentUser.id;
      return true;
    }
  }

  // Need to re-login (session expired or different user)
  let user = await getCurrentUser();
  if (!user) {
    try {
      const { data, error } = await sb.auth.signInAnonymously();
      if (error) return false;
      user = data.user;
      setBoundUserId(user.id);
    } catch { return false; }
  }

  try {
    const { data, error } = await sb.rpc('login_username', {
      p_username: username,
      p_password_hash: pwHash
    });
    if (error || (data && data.error)) return false;

    const userId = data.user_id;
    setBoundUserId(userId);
    if (typeof _currentUserId !== 'undefined') _currentUserId = userId;
    return true;
  } catch { return false; }
}

async function logoutAccount() {
  if (sb) {
    try { await sb.auth.signOut(); } catch {}
  }
  localStorage.removeItem(ACCOUNT_USERNAME_KEY);
  localStorage.removeItem(ACCOUNT_HASH_KEY);
  localStorage.removeItem('social-bound-user-id');
  if (typeof _currentUserId !== 'undefined') _currentUserId = null;
}

function getSavedUsername() {
  return localStorage.getItem(ACCOUNT_USERNAME_KEY) || '';
}

// ===== Profile =====

// Get the effective user ID, following linked_id chain (for RLS compatibility)
async function getEffectiveUserId() {
  const user = await ensureSession();
  if (!user) return null;
  const profile = await getProfile(user.id);
  if (profile && profile.linked_id && profile.linked_id !== user.id) {
    return profile.linked_id;
  }
  return user.id;
}

async function getProfile(userId) {
  if (!sb) return null;
  const { data } = await sb.from('profiles').select('*').eq('id', userId).is('deleted_at', null).single();
  return data;
}

async function getMyProfile() {
  const user = await ensureSession();
  if (!user) return null;
  let profile = await getProfile(user.id);
  if (!profile) {
    // Create default profile
    const nickname = localStorage.getItem('social-nickname') || '用户' + user.id.slice(0, 4);
    const { data, error } = await sb.from('profiles').insert({ id: user.id, nickname }).select().single();
    if (error) { console.error('[Supabase] getMyProfile insert error:', error); return null; }
    profile = data;
  }
  // Follow linked_id for multi-device support
  if (profile.linked_id && profile.linked_id !== user.id) {
    const linkedProfile = await getProfile(profile.linked_id);
    if (linkedProfile) return linkedProfile;
  }
  return profile;
}

async function updateProfile(updates) {
  if (!sb) return null;
  const user = await ensureSession();
  if (!user) return null;
  if (updates.nickname) localStorage.setItem('social-nickname', updates.nickname);
  const { data, error } = await sb.from('profiles').update(updates).eq('id', user.id).select().single();
  if (error) { console.error('[Supabase] updateProfile error:', error); return null; }
  return data;
}

// Upload avatar image and update profile
async function uploadAvatar(file) {
  if (!sb) return { error: '未连接' };
  const profile = await getMyProfile();
  if (!profile) return { error: '未登录' };
  const compressed = await compressImage(file, 400, 0.8);
  const ext = compressed.name.split('.').pop() || 'jpg';
  const path = `avatars/${profile.id}-${Date.now()}.${ext}`;
  const { error: uploadErr } = await sb.storage.from('post-images').upload(path, compressed, { upsert: true });
  if (uploadErr) return { error: uploadErr.message };
  const urlData = sb.storage.from('post-images').getPublicUrl(path);
  const avatarUrl = urlData.data.publicUrl;
  const { error: updateErr } = await sb.from('profiles').update({ avatar: avatarUrl }).eq('id', profile.id);
  if (updateErr) return { error: updateErr.message };
  return { url: avatarUrl };
}

// ===== Posts =====

// Compress image: max width 1200px, JPEG quality 0.7
function compressImage(file, maxWidth = 1200, quality = 0.7) {
  return new Promise((resolve) => {
    // Skip small files (< 200KB)
    if (file.size < 200 * 1024) { resolve(file); return; }
    const reader = new FileReader();
    reader.onerror = () => resolve(file);
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => resolve(file);
      img.onload = () => {
        try {
          let w = img.width, h = img.height;
          if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          canvas.toBlob((blob) => {
            if (blob && blob.size < file.size) {
              resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
            } else {
              resolve(file);
            }
          }, 'image/jpeg', quality);
        } catch {
          resolve(file);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Upload image to Supabase Storage, return public URL
async function uploadPostImage(file) {
  if (!sb) { console.error('[Upload] sb is null'); return null; }
  const user = await ensureSession();
  if (!user) { console.error('[Upload] no user'); return null; }
  const compressed = await compressImage(file);
  console.log('[Upload] original:', file.size, 'compressed:', compressed.size);
  const path = `${Date.now()}.jpg`;
  const { data, error } = await sb.storage.from('post-images').upload(path, compressed, { upsert: true });
  if (error) {
    console.error('[Upload] error:', JSON.stringify(error));
    return null;
  }
  const urlData = sb.storage.from('post-images').getPublicUrl(path);
  return urlData.data.publicUrl;
}

async function createPost(content, imageUrl) {
  if (!sb) return null;
  const uid = await getEffectiveUserId();
  if (!uid) return null;
  const row = { user_id: uid, content: content || '', image_url: imageUrl || '' };
  const { data, error } = await sb.from('posts').insert(row).select().single();
  if (error) { console.error('[Supabase] createPost error:', error); return null; }
  return data;
}

async function getFeedPosts(limit = 20, offset = 0) {
  const uid = await getEffectiveUserId();
  if (!uid) return [];

  // Get friend IDs
  const friendIds = await getFriendIds();
  friendIds.push(uid); // Include own posts

  const { data: posts } = await sb.from('posts')
    .select('*')
    .in('user_id', friendIds)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (!posts || posts.length === 0) return [];

  // Get profiles for these posts
  const userIds = [...new Set(posts.map(p => p.user_id))];
  const { data: profiles } = await sb.from('profiles').select('id, nickname, avatar').in('id', userIds);
  const profileMap = {};
  if (profiles) profiles.forEach(p => profileMap[p.id] = p);

  // Get like counts and user likes
  const postIds = posts.map(p => p.id);
  const { data: likes } = await sb.from('post_likes').select('post_id, user_id').in('post_id', postIds).is('deleted_at', null);

  const likeCounts = {};
  const userLikes = new Set();
  if (likes) {
    likes.forEach(l => {
      likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1;
      if (l.user_id === user.id) userLikes.add(l.post_id);
    });
  }

  // Get comment counts
  const { data: comments } = await sb.from('post_comments').select('post_id').in('post_id', postIds).is('deleted_at', null);
  const commentCounts = {};
  if (comments) comments.forEach(c => { commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1; });

  return posts.map(p => ({
    ...p,
    profile: profileMap[p.user_id] || { nickname: '未知用户', avatar: '' },
    likeCount: likeCounts[p.id] || 0,
    liked: userLikes.has(p.id),
    commentCount: commentCounts[p.id] || 0
  }));
}

async function deletePost(postId) {
  const uid = await getEffectiveUserId();
  if (!uid) return false;
  const { error } = await sb.from('posts').update({ deleted_at: new Date().toISOString() }).eq('id', postId).eq('user_id', uid);
  return !error;
}

// ===== Likes =====

let _likeLock = {};

async function toggleLike(postId) {
  const uid = await getEffectiveUserId();
  if (!uid) return false;
  // Prevent double-click race condition
  if (_likeLock[postId]) return false;
  _likeLock[postId] = true;
  try {
    const { data: existing } = await sb.from('post_likes').select('id').eq('post_id', postId).eq('user_id', uid).is('deleted_at', null).maybeSingle();
    if (existing) {
      await sb.from('post_likes').delete().eq('id', existing.id);
      return false;
    } else {
      const { error } = await sb.from('post_likes').insert({ post_id: postId, user_id: uid });
      return !error;
    }
  } finally {
    delete _likeLock[postId];
  }
}

// ===== Comments =====

async function getComments(postId) {
  const { data: comments } = await sb.from('post_comments')
    .select('*')
    .eq('post_id', postId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (!comments || comments.length === 0) return [];

  const userIds = [...new Set(comments.map(c => c.user_id))];
  const { data: profiles } = await sb.from('profiles').select('id, nickname, avatar').in('id', userIds);
  const profileMap = {};
  if (profiles) profiles.forEach(p => profileMap[p.id] = p);

  return comments.map(c => ({
    ...c,
    profile: profileMap[c.user_id] || { nickname: '未知用户', avatar: '' }
  }));
}

async function addComment(postId, content) {
  if (!sb) return null;
  const uid = await getEffectiveUserId();
  if (!uid) return null;
  const { data, error } = await sb.from('post_comments').insert({ post_id: postId, user_id: uid, content }).select().single();
  if (error) { console.error('[Supabase] addComment error:', error); return null; }
  return data;
}

// ===== Friends =====

async function getFriendIds() {
  const uid = await getEffectiveUserId();
  if (!uid) return [];
  const { data } = await sb.from('friendships')
    .select('user_id, friend_id')
    .or(`user_id.eq.${uid},friend_id.eq.${uid}`)
    .eq('status', 'accepted')
    .is('deleted_at', null);
  if (!data) return [];
  return data.map(f => f.user_id === uid ? f.friend_id : f.user_id);
}

async function getFriends() {
  const friendIds = await getFriendIds();
  if (friendIds.length === 0) return [];
  const { data: profiles } = await sb.from('profiles').select('id, nickname, avatar').in('id', friendIds);
  return profiles || [];
}

async function getFriendRequests() {
  const uid = await getEffectiveUserId();
  if (!uid) return [];
  const { data } = await sb.from('friendships')
    .select('*')
    .eq('friend_id', uid)
    .eq('status', 'pending')
    .is('deleted_at', null);
  if (!data || data.length === 0) return [];

  const userIds = data.map(f => f.user_id);
  const { data: profiles } = await sb.from('profiles').select('id, nickname, avatar').in('id', userIds);
  const profileMap = {};
  if (profiles) profiles.forEach(p => profileMap[p.id] = p);

  return data.map(f => ({
    ...f,
    profile: profileMap[f.user_id] || { nickname: '未知用户', avatar: '' }
  }));
}

async function sendFriendRequest(friendId) {
  const uid = await getEffectiveUserId();
  if (!uid) return { error: '未登录' };
  if (uid === friendId) return { error: '不能添加自己' };
  // Check if already friends or pending
  const { data: existing } = await sb.from('friendships')
    .select('id, status')
    .or(`and(user_id.eq.${uid},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${uid})`)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) {
    if (existing.status === 'accepted') return { error: '已经是好友' };
    return { error: '已发送过申请' };
  }
  const { error } = await sb.from('friendships').insert({ user_id: uid, friend_id: friendId });
  return { error: error ? '发送失败' : null };
}

async function acceptFriendRequest(requestId) {
  const { error } = await sb.from('friendships').update({ status: 'accepted' }).eq('id', requestId);
  return !error;
}

async function rejectFriendRequest(requestId) {
  const { error } = await sb.from('friendships').delete().eq('id', requestId);
  return !error;
}

async function removeFriend(friendId) {
  const user = await getCurrentUser();
  if (!user) return false;
  const { error } = await sb.from('friendships').delete()
    .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`);
  return !error;
}

async function getProfileByUserId(userId) {
  if (!sb) return null;
  const { data } = await sb.from('profiles').select('id, nickname, avatar').eq('id', userId).is('deleted_at', null).single();
  return data;
}

// Look up user by display_id (simple numeric ID)
async function getProfileByDisplayId(displayId) {
  if (!sb) return null;
  const numId = parseInt(displayId, 10);
  if (isNaN(numId)) return null;
  const { data } = await sb.from('profiles').select('id, nickname, avatar, display_id').eq('display_id', numId).is('deleted_at', null).maybeSingle();
  return data;
}

// ===== Admin =====

async function isAdmin() {
  // Try with current session
  const user = await ensureSession();
  if (user) {
    const profile = await getProfile(user.id);
    if (profile && profile.display_id === 1) return true;
  }
  // Fallback: check if saved username has display_id=1 profile
  const savedUsername = getSavedUsername();
  if (savedUsername && sb) {
    try {
      const { data } = await sb.from('profiles')
        .select('display_id').eq('username', savedUsername).is('deleted_at', null).maybeSingle();
      if (data && data.display_id === 1) return true;
    } catch {}
  }
  return false;
}

// ===== Data Cleanup =====

async function clearAllSocialData() {
  if (!sb) return { error: '未连接' };
  const user = await ensureSession();
  if (!user) return { error: '未登录' };

  // Call server-side function (bypasses RLS, admin check inside)
  const { error } = await sb.rpc('reset_all_data');
  if (error) return { error: error.message };

  // Delete ALL storage files (paginated)
  try {
    let offset = 0;
    while (true) {
      const { data: files } = await sb.storage.from('post-images').list('', { limit: 100, offset });
      if (!files || files.length === 0) break;
      const paths = files.map(f => f.name);
      await sb.storage.from('post-images').remove(paths);
      if (files.length < 100) break;
      offset += files.length;
    }
  } catch {}

  return { error: null };
}

// ===== Recycle Bin =====

async function getTrashStats() {
  if (!sb) return null;
  const { data, error } = await sb.rpc('get_trash_stats');
  if (error) return null;
  const stats = {};
  let total = 0;
  if (data) data.forEach(r => { stats[r.table_name] = Number(r.count); total += Number(r.count); });
  stats.total = total;
  return stats;
}

async function restoreAllData() {
  if (!sb) return { error: '未连接' };
  const user = await ensureSession();
  if (!user) return { error: '未登录' };
  const { error } = await sb.rpc('restore_all_data');
  return { error: error ? error.message : null };
}

async function emptyTrash() {
  if (!sb) return { error: '未连接' };
  const user = await ensureSession();
  if (!user) return { error: '未登录' };
  const { error } = await sb.rpc('empty_trash');
  return { error: error ? error.message : null };
}

async function resetSelected(tables) {
  if (!sb) return { error: '未连接' };
  const user = await ensureSession();
  if (!user) return { error: '未登录' };
  const { error } = await sb.rpc('reset_selected', { p_tables: tables });
  return { error: error ? error.message : null };
}

async function restoreSelected(tables) {
  if (!sb) return { error: '未连接' };
  const user = await ensureSession();
  if (!user) return { error: '未登录' };
  const { error } = await sb.rpc('restore_selected', { p_tables: tables });
  return { error: error ? error.message : null };
}

async function emptySelected(tables) {
  if (!sb) return { error: '未连接' };
  const user = await ensureSession();
  if (!user) return { error: '未登录' };
  const { error } = await sb.rpc('empty_selected', { p_tables: tables });
  return { error: error ? error.message : null };
}

// ===== Calendar Data Sync =====

const SYNC_ENABLED_KEY = 'calendar-sync-enabled';

function isSyncEnabled() {
  return localStorage.getItem(SYNC_ENABLED_KEY) === 'true';
}

function setSyncEnabled(enabled) {
  localStorage.setItem(SYNC_ENABLED_KEY, enabled ? 'true' : 'false');
}

// Collect all calendar data from localStorage
function collectCalendarData() {
  const data = {};
  try { data.workData = JSON.parse(localStorage.getItem('work-calendar-data')); } catch {}
  try { data.reminders = JSON.parse(localStorage.getItem('calendar-reminders')); } catch {}
  try { data.reminderRecords = JSON.parse(localStorage.getItem('calendar-reminder-records')); } catch {}
  try { data.theme = localStorage.getItem('calendar-theme'); } catch {}
  return data;
}

// Apply synced data to localStorage
function applyCalendarData(data) {
  if (!data) return;
  if (data.workData) localStorage.setItem('work-calendar-data', JSON.stringify(data.workData));
  if (data.reminders) localStorage.setItem('calendar-reminders', JSON.stringify(data.reminders));
  if (data.reminderRecords) localStorage.setItem('calendar-reminder-records', JSON.stringify(data.reminderRecords));
  if (data.theme) localStorage.setItem('calendar-theme', data.theme);
}

// Push local data to cloud
async function pushCalendarData() {
  if (!sb) return { error: '未连接' };
  const uid = await getEffectiveUserId();
  if (!uid) return { error: '未登录' };
  const data = collectCalendarData();
  const { error } = await sb.from('user_data').upsert({
    user_id: uid,
    data: data,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });
  return { error: error ? error.message : null };
}

// Pull cloud data to local
async function pullCalendarData() {
  if (!sb) return { error: '未连接' };
  const uid = await getEffectiveUserId();
  if (!uid) return { error: '未登录' };
  const { data, error } = await sb.from('user_data').select('data').eq('user_id', uid).maybeSingle();
  if (error) return { error: error.message };
  if (data && data.data) {
    applyCalendarData(data.data);
    return { error: null, pulled: true };
  }
  return { error: null, pulled: false };
}

// Smart sync: pull cloud data, merge with local, push back
let _syncing = false;
async function syncCalendarData() {
  if (_syncing) return { error: '同步进行中' };
  _syncing = true;
  try {
    return await _doSyncCalendarData();
  } finally {
    _syncing = false;
  }
}

async function _doSyncCalendarData() {
  if (!sb) return { error: '未连接' };
  const uid = await getEffectiveUserId();
  if (!uid) return { error: '未登录' };

  // Get cloud data
  const { data: cloudRow, error: fetchErr } = await sb.from('user_data')
    .select('data, updated_at').eq('user_id', uid).maybeSingle();
  if (fetchErr) return { error: fetchErr.message };

  const localData = collectCalendarData();

  if (cloudRow && cloudRow.data) {
    const cloudData = cloudRow.data;
    if (cloudData.workData && localData.workData) {
      // Merge days: cloud takes priority for conflicts
      const mergedDays = { ...localData.workData.days, ...cloudData.workData.days };
      cloudData.workData.days = mergedDays;
      // Merge todos: combine by id, cloud version wins
      const todoMap = {};
      if (localData.workData.todos) localData.workData.todos.forEach(t => { if (t && t.id) todoMap[t.id] = t; });
      if (cloudData.workData.todos) cloudData.workData.todos.forEach(t => { if (t && t.id) todoMap[t.id] = t; });
      cloudData.workData.todos = Object.values(todoMap);
    }
    // Merge reminderRecords: union (additive, local entries preserved)
    if (localData.reminderRecords && cloudData.reminderRecords) {
      for (const date of Object.keys(localData.reminderRecords)) {
        if (!cloudData.reminderRecords[date]) {
          cloudData.reminderRecords[date] = localData.reminderRecords[date];
        } else {
          Object.assign(cloudData.reminderRecords[date], localData.reminderRecords[date]);
        }
      }
    }
    // reminders: cloud wins (last-write-wins for config)
    applyCalendarData(cloudData);
  }

  // Push merged/local data to cloud
  const pushData = collectCalendarData();
  const { error: pushErr } = await sb.from('user_data').upsert({
    user_id: uid,
    data: pushData,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });

  return { error: pushErr ? pushErr.message : null };
}

// Auto-sync: push if enabled (debounced, 3s idle)
let _syncTimer = null;
function autoSyncPush() {
  if (!isSyncEnabled() || !sb) return;
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(async () => {
    _syncTimer = null;
    try {
      await pushCalendarData();
    } catch (e) {
      console.log('[Sync] Auto-push failed:', e.message);
    }
  }, 3000);
}
