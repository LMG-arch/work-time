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
      // Try to refresh this session
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

  // Method 3: Create new anonymous user (last resort)
  try {
    const { data, error } = await sb.auth.signInAnonymously();
    if (!error && data.user) {
      setBoundUserId(data.user.id);
      return data.user;
    }
  } catch {}

  return null;
}

// ===== Profile =====

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

// ===== Posts =====

// Compress image: max width 1200px, JPEG quality 0.7
function compressImage(file, maxWidth = 1200, quality = 0.7) {
  return new Promise((resolve) => {
    // Skip small files (< 200KB)
    if (file.size < 200 * 1024) { resolve(file); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if (blob && blob.size < file.size) {
            resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
          } else {
            resolve(file); // compression didn't help, use original
          }
        }, 'image/jpeg', quality);
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
  const user = await ensureSession();
  if (!user) return null;
  const row = { user_id: user.id, content: content || '', image_url: imageUrl || '' };
  const { data, error } = await sb.from('posts').insert(row).select().single();
  if (error) { console.error('[Supabase] createPost error:', error); return null; }
  return data;
}

async function getFeedPosts(limit = 20, offset = 0) {
  const user = await getCurrentUser();
  if (!user) return [];

  // Get friend IDs
  const friendIds = await getFriendIds();
  friendIds.push(user.id); // Include own posts

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
  const user = await getCurrentUser();
  if (!user) return false;
  const { error } = await sb.from('posts').update({ deleted_at: new Date().toISOString() }).eq('id', postId).eq('user_id', user.id);
  return !error;
}

// ===== Likes =====

async function toggleLike(postId) {
  const user = await getCurrentUser();
  if (!user) return false;
  const { data: existing } = await sb.from('post_likes').select('id').eq('post_id', postId).eq('user_id', user.id).is('deleted_at', null).maybeSingle();
  if (existing) {
    await sb.from('post_likes').delete().eq('id', existing.id);
    return false; // unliked
  } else {
    await sb.from('post_likes').insert({ post_id: postId, user_id: user.id });
    return true; // liked
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
  const user = await ensureSession();
  if (!user) return null;
  const { data, error } = await sb.from('post_comments').insert({ post_id: postId, user_id: user.id, content }).select().single();
  if (error) { console.error('[Supabase] addComment error:', error); return null; }
  return data;
}

// ===== Friends =====

async function getFriendIds() {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data } = await sb.from('friendships')
    .select('user_id, friend_id')
    .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
    .eq('status', 'accepted')
    .is('deleted_at', null);
  if (!data) return [];
  return data.map(f => f.user_id === user.id ? f.friend_id : f.user_id);
}

async function getFriends() {
  const friendIds = await getFriendIds();
  if (friendIds.length === 0) return [];
  const { data: profiles } = await sb.from('profiles').select('id, nickname, avatar').in('id', friendIds);
  return profiles || [];
}

async function getFriendRequests() {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data } = await sb.from('friendships')
    .select('*')
    .eq('friend_id', user.id)
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
  const user = await getCurrentUser();
  if (!user || user.id === friendId) return { error: '不能添加自己' };
  // Check if already friends or pending
  const { data: existing } = await sb.from('friendships')
    .select('id, status')
    .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`)
    .maybeSingle();
  if (existing) {
    if (existing.status === 'accepted') return { error: '已经是好友' };
    return { error: '已发送过申请' };
  }
  const { error } = await sb.from('friendships').insert({ user_id: user.id, friend_id: friendId });
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
  const user = await getCurrentUser();
  if (!user) return false;
  const profile = await getProfile(user.id);
  return profile && profile.display_id === 1;
}

// ===== Data Cleanup =====

async function clearAllSocialData() {
  if (!sb) return { error: '未连接' };
  const user = await ensureSession();
  if (!user) return { error: '未登录' };

  // Call server-side function (bypasses RLS, admin check inside)
  const { error } = await sb.rpc('reset_all_data');
  if (error) return { error: error.message };

  // Delete ALL storage files
  try {
    const { data: files } = await sb.storage.from('post-images').list('');
    if (files && files.length > 0) {
      const paths = files.map(f => f.name);
      await sb.storage.from('post-images').remove(paths);
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
  const user = await ensureSession();
  if (!user) return { error: '未登录' };
  const data = collectCalendarData();
  const { error } = await sb.from('user_data').upsert({
    user_id: user.id,
    data: data,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });
  return { error: error ? error.message : null };
}

// Pull cloud data to local
async function pullCalendarData() {
  if (!sb) return { error: '未连接' };
  const user = await ensureSession();
  if (!user) return { error: '未登录' };
  const { data, error } = await sb.from('user_data').select('data').eq('user_id', user.id).maybeSingle();
  if (error) return { error: error.message };
  if (data && data.data) {
    applyCalendarData(data.data);
    return { error: null, pulled: true };
  }
  return { error: null, pulled: false };
}

// ===== Bind Verification =====

async function generateBindCode() {
  if (!sb) return { error: '未连接' };
  const user = await ensureSession();
  if (!user) return { error: '未登录' };
  const { data, error } = await sb.rpc('generate_bind_code');
  if (error) return { error: error.message };
  return { code: data };
}

async function verifyBindCode(targetUserId, inputCode) {
  if (!sb) return { error: '未连接' };
  const user = await ensureSession();
  if (!user) return { error: '未登录' };
  const { data, error } = await sb.rpc('verify_bind_code', { target_user_id: targetUserId, input_code: inputCode });
  if (error) return { error: error.message };
  return { valid: data };
}

// Smart sync: pull cloud data, merge with local, push back
async function syncCalendarData() {
  if (!sb) return { error: '未连接' };
  const user = await ensureSession();
  if (!user) return { error: '未登录' };

  // Get cloud data
  const { data: cloudRow, error: fetchErr } = await sb.from('user_data')
    .select('data, updated_at').eq('user_id', user.id).maybeSingle();
  if (fetchErr) return { error: fetchErr.message };

  const localData = collectCalendarData();

  if (cloudRow && cloudRow.data) {
    // Cloud has data - merge: cloud wins for conflicts, but merge days map
    const cloudData = cloudRow.data;
    if (cloudData.workData && localData.workData) {
      // Merge days: newer entries win (by comparing keys, cloud takes priority)
      const mergedDays = { ...localData.workData.days, ...cloudData.workData.days };
      cloudData.workData.days = mergedDays;
      // Merge todos: combine by id, cloud version wins
      const todoMap = {};
      if (localData.workData.todos) localData.workData.todos.forEach(t => { if (t && t.id) todoMap[t.id] = t; });
      if (cloudData.workData.todos) cloudData.workData.todos.forEach(t => { if (t && t.id) todoMap[t.id] = t; });
      cloudData.workData.todos = Object.values(todoMap);
    }
    applyCalendarData(cloudData);
  }

  // Push merged/local data to cloud
  const pushData = collectCalendarData();
  const { error: pushErr } = await sb.from('user_data').upsert({
    user_id: user.id,
    data: pushData,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });

  return { error: pushErr ? pushErr.message : null };
}

// Auto-sync: push if enabled (called after data changes)
async function autoSyncPush() {
  if (!isSyncEnabled() || !sb) return;
  try {
    await pushCalendarData();
  } catch (e) {
    console.log('[Sync] Auto-push failed:', e.message);
  }
}
