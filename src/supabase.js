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

function initSupabase() {
  const config = getSupabaseConfig();
  if (!config.url || !config.key) return null;
  if (!window.supabase || !window.supabase.createClient) {
    console.error('[Supabase] CDN library not loaded - window.supabase is undefined');
    return null;
  }
  try {
    sb = window.supabase.createClient(config.url, config.key);
  } catch (e) {
    console.error('[Supabase] createClient failed:', e);
    return null;
  }
  return sb;
}

// ===== Auth =====

async function signIn() {
  if (!sb) return null;
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) return null;
  return data.user;
}

async function getCurrentUser() {
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getUser();
    return data.user;
  } catch {
    return null;
  }
}

// Ensure we have a valid session, re-auth if needed
async function ensureSession() {
  if (!sb) return null;
  let user = await getCurrentUser();
  if (!user) {
    user = await signIn();
  }
  return user;
}

// ===== Profile =====

async function getProfile(userId) {
  if (!sb) return null;
  const { data } = await sb.from('profiles').select('*').eq('id', userId).single();
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
  const { data: likes } = await sb.from('post_likes').select('post_id, user_id').in('post_id', postIds);

  const likeCounts = {};
  const userLikes = new Set();
  if (likes) {
    likes.forEach(l => {
      likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1;
      if (l.user_id === user.id) userLikes.add(l.post_id);
    });
  }

  // Get comment counts
  const { data: comments } = await sb.from('post_comments').select('post_id').in('post_id', postIds);
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
  const { error } = await sb.from('posts').delete().eq('id', postId).eq('user_id', user.id);
  return !error;
}

// ===== Likes =====

async function toggleLike(postId) {
  const user = await getCurrentUser();
  if (!user) return false;
  const { data: existing } = await sb.from('post_likes').select('id').eq('post_id', postId).eq('user_id', user.id).maybeSingle();
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
    .eq('status', 'accepted');
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
    .eq('status', 'pending');
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
  const { data } = await sb.from('profiles').select('id, nickname, avatar').eq('id', userId).single();
  return data;
}

// Look up user by display_id (simple numeric ID)
async function getProfileByDisplayId(displayId) {
  if (!sb) return null;
  const numId = parseInt(displayId, 10);
  if (isNaN(numId)) return null;
  const { data } = await sb.from('profiles').select('id, nickname, avatar, display_id').eq('display_id', numId).maybeSingle();
  return data;
}

// ===== Data Cleanup =====

async function clearAllSocialData() {
  if (!sb) return { error: '未连接' };
  const errors = [];
  // Delete in order to respect foreign keys
  const tables = ['post_comments', 'post_likes', 'posts', 'friendships', 'profiles'];
  for (const table of tables) {
    const { error } = await sb.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) errors.push(table + ': ' + error.message);
  }
  // Clear storage
  try {
    const { data: files } = await sb.storage.from('post-images').list();
    if (files && files.length > 0) {
      const paths = files.map(f => f.name);
      await sb.storage.from('post-images').remove(paths);
    }
  } catch {}
  return errors.length > 0 ? { error: errors.join('; ') } : { error: null };
}
