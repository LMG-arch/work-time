// supabase-social.js — 用户资料、动态、点赞、评论、好友、管理员、回收站

// ===== Profile =====

let _globalUserId = null;

// Get the effective user ID, following linked_id chain (for RLS compatibility)
// Does NOT filter deleted_at — if user's profile was soft-deleted and recreated,
// we still need to follow the linked_id chain from the original profile.
// The linked_id itself is set at registration time and never changes.
async function getEffectiveUserId() {
  const user = await ensureSession();
  if (!user) return null;
  const { data: profile } = await window.sb.from('profiles').select('linked_id').eq('id', user.id).maybeSingle();
  if (profile && profile.linked_id && profile.linked_id !== user.id) {
    _globalUserId = profile.linked_id;
    return profile.linked_id;
  }
  _globalUserId = user.id;
  return user.id;
}

async function getProfile(userId) {
  if (!window.sb) return null;
  const { data } = await window.sb.from('profiles').select('*').eq('id', userId).is('deleted_at', null).single();
  return data;
}

async function getMyProfile() {
  const user = await ensureSession();
  if (!user) return null;
  // 不过滤 deleted_at — 清除数据后自己的 profile 可能被软删除
  const { data: profile } = await window.sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!profile) {
    // Create default profile
    const nickname = localStorage.getItem('social-nickname') || '用户' + user.id.slice(0, 4);
    const { data, error } = await window.sb.from('profiles').insert({ id: user.id, nickname }).select().single();
    if (error) { console.error('[Supabase] getMyProfile insert error:', error); return null; }
    return data;
  }
  // Follow linked_id for multi-device support
  if (profile.linked_id && profile.linked_id !== user.id) {
    const { data: linkedProfile } = await window.sb.from('profiles').select('*').eq('id', profile.linked_id).maybeSingle();
    if (linkedProfile) return linkedProfile;
  }
  return profile;
}

async function updateProfile(updates) {
  if (!window.sb) return null;
  const user = await ensureSession();
  if (!user) return null;
  if (updates.nickname) localStorage.setItem('social-nickname', updates.nickname);
  const { data, error } = await window.sb.from('profiles').update(updates).eq('id', user.id).select().single();
  if (error) { console.error('[Supabase] updateProfile error:', error); return null; }
  return data;
}

// Upload avatar image and update profile
// 使用 'post-images' 桶的 'avatars/' 子路径存储头像
// （supabase-setup.sql 仅创建 post-images 桶，头像通过路径前缀隔离）
async function uploadAvatar(file) {
  if (!window.sb) return { error: '未连接' };
  const profile = await getMyProfile();
  if (!profile) return { error: '未登录' };
  const compressed = await compressImage(file, 400, 0.8);
  const ext = compressed.name.split('.').pop() || 'jpg';
  const path = `avatars/${profile.id}-${Date.now()}.${ext}`;
  const { error: uploadErr } = await window.sb.storage.from('post-images').upload(path, compressed, { upsert: true });
  if (uploadErr) {
    console.error('[Supabase] Avatar upload error:', uploadErr);
    return { error: uploadErr.message };
  }
  const urlData = window.sb.storage.from('post-images').getPublicUrl(path);
  const avatarUrl = urlData.data.publicUrl;
  const { error: updateErr } = await window.sb.from('profiles').update({ avatar: avatarUrl }).eq('id', profile.id);
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
  if (!window.sb) { console.error('[Upload] sb is null'); return null; }
  const user = await ensureSession();
  if (!user) { console.error('[Upload] no user'); return null; }
  const compressed = await compressImage(file);
  console.log('[Upload] original:', file.size, 'compressed:', compressed.size);
  // 路径必须以用户 ID 开头，符合存储策略
  const path = `${user.id}/${Date.now()}.jpg`;
  const { data, error } = await window.sb.storage.from('post-images').upload(path, compressed, { upsert: true });
  if (error) {
    console.error('[Upload] error:', JSON.stringify(error));
    return null;
  }
  const urlData = window.sb.storage.from('post-images').getPublicUrl(path);
  return urlData.data.publicUrl;
}

async function createPost(content, imageUrl) {
  if (!window.sb) return null;
  const uid = await getEffectiveUserId();
  if (!uid) return null;
  const row = { user_id: uid, content: content || '', image_url: imageUrl || '' };
  const { data, error } = await window.sb.from('posts').insert(row).select().single();
  if (error) { console.error('[Supabase] createPost error:', error); return null; }
  return data;
}

async function getFeedPosts(limit = 20, offset = 0) {
  const uid = await getEffectiveUserId();
  if (!uid) return [];

  // Get friend IDs (pass uid to avoid redundant getEffectiveUserId call)
  const friendIds = await getFriendIds(uid);
  friendIds.push(uid); // Include own posts

  // Fetch posts + profiles in parallel with likes + comments
  const [postsRes, likesRes, commentsRes] = await Promise.all([
    window.sb.from('posts').select('*').in('user_id', friendIds).is('deleted_at', null)
      .order('created_at', { ascending: false }).range(offset, offset + limit - 1),
    window.sb.from('post_likes').select('post_id, user_id').in('user_id', friendIds).is('deleted_at', null),
    window.sb.from('post_comments').select('post_id').in('user_id', friendIds).is('deleted_at', null)
  ]);

  const posts = postsRes.data;
  if (!posts || posts.length === 0) return [];

  // Fetch profiles for post authors
  const userIds = [...new Set(posts.map(p => p.user_id))];
  const { data: profiles } = await window.sb.from('profiles').select('id, nickname, avatar').in('id', userIds);
  const profileMap = {};
  if (profiles) profiles.forEach(p => profileMap[p.id] = p);

  // Build like/comment counts
  const likeCounts = {};
  const userLikes = new Set();
  if (likesRes.data) {
    likesRes.data.forEach(l => {
      likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1;
      if (l.user_id === uid) userLikes.add(l.post_id);
    });
  }
  const commentCounts = {};
  if (commentsRes.data) commentsRes.data.forEach(c => { commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1; });

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
  const { error } = await window.sb.from('posts').update({ deleted_at: new Date().toISOString() }).eq('id', postId).eq('user_id', uid);
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
    const { data: existing } = await window.sb.from('post_likes').select('id').eq('post_id', postId).eq('user_id', uid).is('deleted_at', null).maybeSingle();
    if (existing) {
      await window.sb.from('post_likes').update({ deleted_at: new Date().toISOString() }).eq('id', existing.id);
      return false;
    } else {
      const { error } = await window.sb.from('post_likes').insert({ post_id: postId, user_id: uid });
      return !error;
    }
  } finally {
    delete _likeLock[postId];
  }
}

// ===== Comments =====

async function getComments(postId) {
  const { data: comments } = await window.sb.from('post_comments')
    .select('*')
    .eq('post_id', postId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (!comments || comments.length === 0) return [];

  const userIds = [...new Set(comments.map(c => c.user_id))];
  const { data: profiles } = await window.sb.from('profiles').select('id, nickname, avatar').in('id', userIds);
  const profileMap = {};
  if (profiles) profiles.forEach(p => profileMap[p.id] = p);

  return comments.map(c => ({
    ...c,
    profile: profileMap[c.user_id] || { nickname: '未知用户', avatar: '' }
  }));
}

async function addComment(postId, content) {
  if (!window.sb) return null;
  const uid = await getEffectiveUserId();
  if (!uid) return null;
  const { data, error } = await window.sb.from('post_comments').insert({ post_id: postId, user_id: uid, content }).select().single();
  if (error) { console.error('[Supabase] addComment error:', error); return null; }
  return data;
}

// ===== Friends =====

async function getFriendIds(precomputedUid) {
  const uid = precomputedUid || await getEffectiveUserId();
  if (!uid) return [];
  const { data } = await window.sb.from('friendships')
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
  const { data: profiles } = await window.sb.from('profiles').select('id, nickname, avatar').in('id', friendIds);
  return profiles || [];
}

async function getFriendRequests() {
  const uid = await getEffectiveUserId();
  if (!uid) return [];
  const { data } = await window.sb.from('friendships')
    .select('*')
    .eq('friend_id', uid)
    .eq('status', 'pending')
    .is('deleted_at', null);
  if (!data || data.length === 0) return [];

  const userIds = data.map(f => f.user_id);
  const { data: profiles } = await window.sb.from('profiles').select('id, nickname, avatar').in('id', userIds);
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
  const { data: existing } = await window.sb.from('friendships')
    .select('id, status')
    .or(`and(user_id.eq.${uid},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${uid})`)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) {
    if (existing.status === 'accepted') return { error: '已经是好友' };
    return { error: '已发送过申请' };
  }
  const { error } = await window.sb.from('friendships').insert({ user_id: uid, friend_id: friendId });
  return { error: error ? '发送失败' : null };
}

async function acceptFriendRequest(requestId) {
  const { error } = await window.sb.from('friendships').update({ status: 'accepted' }).eq('id', requestId);
  return !error;
}

async function rejectFriendRequest(requestId) {
  const { error } = await window.sb.from('friendships').delete().eq('id', requestId);
  return !error;
}

async function removeFriend(friendId) {
  const uid = await getEffectiveUserId();
  if (!uid) return false;
  const { error } = await window.sb.from('friendships').delete()
    .or(`and(user_id.eq.${uid},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${uid})`);
  return !error;
}

async function getProfileByUserId(userId) {
  if (!window.sb) return null;
  const { data } = await window.sb.from('profiles').select('id, nickname, avatar').eq('id', userId).is('deleted_at', null).single();
  return data;
}

// Look up user by display_id (simple numeric ID)
async function getProfileByDisplayId(displayId) {
  if (!window.sb) return null;
  const numId = parseInt(displayId, 10);
  if (isNaN(numId)) return null;
  const { data } = await window.sb.from('profiles').select('id, nickname, avatar, display_id').eq('display_id', numId).is('deleted_at', null).maybeSingle();
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
  if (savedUsername && window.sb) {
    try {
      const { data } = await window.sb.from('profiles')
        .select('display_id').eq('username', savedUsername).is('deleted_at', null).maybeSingle();
      if (data && data.display_id === 1) return true;
    } catch (e) { console.debug('[Admin] Fallback profile query failed:', e.message); }
  }
  return false;
}

// ===== Data Cleanup =====

async function clearAllSocialData() {
  if (!window.sb) return { error: '未连接' };
  const user = await ensureSession();
  if (!user) return { error: '未登录' };
  // 客户端二次确认管理员身份（服务端 RPC 也应做权限校验）
  if (!await isAdmin()) return { error: '无管理员权限' };

  // Call server-side function (soft delete only, no storage deletion)
  const { error } = await window.sb.rpc('reset_all_data');
  if (error) return { error: error.message };

  return { error: null };
}

// Permanently delete storage files (only called from emptyTrash)
async function deleteAllStorageFiles() {
  if (!window.sb) return;
  try {
    let offset = 0;
    while (true) {
      const { data: files } = await window.sb.storage.from('post-images').list('', { limit: 100, offset });
      if (!files || files.length === 0) break;
      const paths = files.map(f => f.name);
      await window.sb.storage.from('post-images').remove(paths);
      if (files.length < 100) break;
      offset += files.length;
    }
  } catch (e) { console.warn('[Storage] deleteAllStorageFiles failed:', e.message); }
}

// ===== Recycle Bin =====

async function getTrashStats() {
  if (!window.sb) return null;
  const { data, error } = await window.sb.rpc('get_trash_stats');
  if (error) return null;
  const stats = {};
  let total = 0;
  if (data) data.forEach(r => { stats[r.table_name] = Number(r.count); total += Number(r.count); });
  stats.total = total;
  return stats;
}

async function restoreAllData() {
  if (!window.sb) return { error: '未连接' };
  const user = await ensureSession();
  if (!user) return { error: '未登录' };
  if (!await isAdmin()) return { error: '无管理员权限' };
  const { error } = await window.sb.rpc('restore_all_data');
  return { error: error ? error.message : null };
}

async function emptyTrash() {
  if (!window.sb) return { error: '未连接' };
  const user = await ensureSession();
  if (!user) return { error: '未登录' };
  if (!await isAdmin()) return { error: '无管理员权限' };
  const { error } = await window.sb.rpc('empty_trash');
  if (error) return { error: error.message };
  // Also delete storage files when permanently deleting posts
  await deleteAllStorageFiles();
  return { error: null };
}

async function resetSelected(tables) {
  if (!window.sb) return { error: '未连接' };
  const user = await ensureSession();
  if (!user) return { error: '未登录' };
  if (!await isAdmin()) return { error: '无管理员权限' };
  const { error } = await window.sb.rpc('reset_selected', { p_tables: tables });
  return { error: error ? error.message : null };
}

async function restoreSelected(tables) {
  if (!window.sb) return { error: '未连接' };
  const user = await ensureSession();
  if (!user) return { error: '未登录' };
  if (!await isAdmin()) return { error: '无管理员权限' };
  const { error } = await window.sb.rpc('restore_selected', { p_tables: tables });
  return { error: error ? error.message : null };
}

async function emptySelected(tables) {
  if (!window.sb) return { error: '未连接' };
  const user = await ensureSession();
  if (!user) return { error: '未登录' };
  if (!await isAdmin()) return { error: '无管理员权限' };
  const { error } = await window.sb.rpc('empty_selected', { p_tables: tables });
  return { error: error ? error.message : null };
}

async function getTrashSizes() {
  if (!window.sb) return null;
  const { data, error } = await window.sb.rpc('get_trash_sizes');
  if (error) return null;
  return data;
}
