// Social UI - 好友圈
let socialTab = 'feed'; // feed | friends | profile
let feedPosts = [];
let feedOffset = 0;
let friendsList = [];
let friendRequests = [];

async function renderSocialView() {
  updateMonthLabel();
  const container = document.getElementById('social-content');

  // Check if Supabase is configured
  const config = getSupabaseConfig();
  if (!config.url || !config.key) {
    container.innerHTML = `<div class="social-empty" style="text-align:left;padding:20px;">
      <div style="font-size:16px;font-weight:600;margin-bottom:12px;">⚙️ 需要先配置服务</div>
      <div style="font-size:13px;color:var(--text2);line-height:1.8;">
        <p>请先到 <b>设置</b> 页面配置好友圈服务：</p>
        <ol style="padding-left:20px;">
          <li>到 <a href="https://supabase.com" target="_blank" style="color:var(--accent);">supabase.com</a> 免费注册</li>
          <li>创建一个项目，获取 URL 和 Anon Key</li>
          <li>在设置页面填入并保存</li>
          <li>首次使用需执行 supabase-setup.sql 创建数据表</li>
        </ol>
      </div>
    </div>`;
    return;
  }

  // Check if database is set up
  const dbReady = await checkDatabaseSetup();
  if (!dbReady) {
    container.innerHTML = `<div class="social-empty" style="text-align:left;padding:20px;">
      <div style="font-size:16px;font-weight:600;margin-bottom:12px;">⚙️ 首次使用设置</div>
      <div style="font-size:13px;color:var(--text2);line-height:1.8;">
        <p>需要先在 Supabase 中创建数据库表：</p>
        <ol style="padding-left:20px;">
          <li>打开 <a href="https://supabase.com/dashboard" target="_blank" style="color:var(--accent);">Supabase Dashboard</a></li>
          <li>进入你的项目 → 左侧菜单 <b>SQL Editor</b></li>
          <li>复制项目根目录 <b>supabase-setup.sql</b> 的内容</li>
          <li>粘贴执行即可</li>
        </ol>
      </div>
    </div>`;
    return;
  }

  let html = '';

  // Tabs
  html += '<div class="social-tabs">';
  html += `<span class="social-tab${socialTab === 'feed' ? ' active' : ''}" data-tab="feed">动态</span>`;
  html += `<span class="social-tab${socialTab === 'friends' ? ' active' : ''}" data-tab="friends">好友</span>`;
  html += `<span class="social-tab${socialTab === 'profile' ? ' active' : ''}" data-tab="profile">我的</span>`;
  html += '</div>';

  html += '<div id="social-tab-content"></div>';
  container.innerHTML = html;

  container.querySelectorAll('.social-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      socialTab = tab.dataset.tab;
      renderSocialView();
    });
  });

  renderSocialTabContent();
}

async function renderSocialTabContent() {
  const container = document.getElementById('social-tab-content');
  if (!container) return;

  if (socialTab === 'feed') {
    await renderFeed(container);
  } else if (socialTab === 'friends') {
    await renderFriends(container);
  } else {
    await renderProfile(container);
  }
}

// ===== Feed =====

// Feed cache helpers
const FEED_CACHE_KEY = 'social-feed-cache';

function getCachedFeed() {
  try {
    const raw = localStorage.getItem(FEED_CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function setCachedFeed(posts) {
  try {
    localStorage.setItem(FEED_CACHE_KEY, JSON.stringify(posts));
  } catch {}
}

function renderFeedPosts(container, posts) {
  let html = '';
  if (posts.length === 0) {
    html = '<div class="social-empty">暂无动态<br><span class="social-empty-sub">发布一条动态或添加好友吧</span></div>';
  } else {
    html += '<div class="feed-list">';
    for (const post of posts) {
      html += renderPostCard(post);
    }
    html += '</div>';
  }
  html += '<button class="fab-btn" id="fab-add-post">✎</button>';
  container.innerHTML = html;
  bindPostEvents(container);
  const fab = document.getElementById('fab-add-post');
  if (fab) fab.addEventListener('click', openPostModal);
}

async function renderFeed(container) {
  // 1. Show cached data instantly
  const cached = getCachedFeed();
  if (cached && cached.length > 0) {
    feedPosts = cached;
    feedOffset = 0;
    renderFeedPosts(container, feedPosts);
  } else {
    container.innerHTML = '<div class="social-loading">加载中...</div>';
  }

  // 2. Fetch fresh data in background
  try {
    const fresh = await getFeedPosts(20, 0);
    feedPosts = fresh;
    feedOffset = 0;
    setCachedFeed(fresh);
    // Re-render only if container still shows feed tab
    const tabContent = document.getElementById('social-tab-content');
    if (tabContent && socialTab === 'feed') {
      renderFeedPosts(tabContent, feedPosts);
    }
  } catch (e) {
    console.log('[Feed] Background refresh failed:', e.message);
    // If no cache was shown, show error
    if (!cached || cached.length === 0) {
      container.innerHTML = '<div class="social-empty">加载失败，请检查网络</div>';
    }
  }
}

function renderPostCard(post) {
  const time = formatTime(post.created_at);
  const safeAvatar = sanitizeUrl(post.profile.avatar);
  const avatar = safeAvatar
    ? `<img src="${safeAvatar}" class="post-avatar">`
    : `<div class="post-avatar avatar-placeholder">${escapeHtml((post.profile.nickname || '?')[0])}</div>`;

  const isMine = post.profile.id === getCurrentUserId();
  const likeCount = Math.max(0, post.likeCount || 0);

  return `<div class="post-card" data-id="${post.id}">
    <div class="post-header">
      ${avatar}
      <div class="post-user-info">
        <span class="post-nickname">${escapeHtml(post.profile.nickname)}</span>
        <span class="post-time">${time}</span>
      </div>
      ${isMine ? `<span class="post-delete" data-id="${post.id}">&times;</span>` : ''}
    </div>
    <div class="post-content">${escapeHtml(post.content)}</div>
    ${post.image_url ? `<div class="post-image"><img src="${sanitizeUrl(post.image_url)}" loading="lazy"></div>` : ''}
    <div class="post-actions">
      <span class="post-action-btn like-btn${post.liked ? ' liked' : ''}" data-id="${post.id}">
        ${post.liked ? '❤' : '♡'} ${likeCount || ''}
      </span>
      <span class="post-action-btn comment-btn" data-id="${post.id}">
        💬 ${post.commentCount || ''}
      </span>
    </div>
    <div class="post-comments" id="comments-${post.id}" style="display:none"></div>
  </div>`;
}

function bindPostEvents(container) {
  container.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const postId = btn.dataset.id;
      const liked = await toggleLike(postId);
      const post = feedPosts.find(p => p.id === postId);
      if (post) {
        post.liked = liked;
        post.likeCount = Math.max(0, (post.likeCount || 0) + (liked ? 1 : -1));
        btn.className = 'post-action-btn like-btn' + (liked ? ' liked' : '');
        btn.innerHTML = `${liked ? '❤' : '♡'} ${post.likeCount || ''}`;
      }
    });
  });

  container.querySelectorAll('.comment-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const postId = btn.dataset.id;
      const panel = document.getElementById(`comments-${postId}`);
      if (panel.style.display === 'none') {
        panel.style.display = '';
        await renderCommentsPanel(postId, panel);
      } else {
        panel.style.display = 'none';
      }
    });
  });

  container.querySelectorAll('.post-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('确定删除这条动态？')) return;
      const ok = await deletePost(btn.dataset.id);
      if (ok) {
        showToast('已删除');
        renderSocialView();
      }
    });
  });
}

async function renderCommentsPanel(postId, panel) {
  const comments = await getComments(postId);
  let html = '<div class="comment-list">';
  for (const c of comments) {
    html += `<div class="comment-item">
      <span class="comment-nick">${escapeHtml(c.profile.nickname)}</span>
      <span class="comment-text">${escapeHtml(c.content)}</span>
    </div>`;
  }
  html += '</div>';
  html += `<div class="comment-input-row">
    <input class="comment-input" placeholder="写评论..." maxlength="200">
    <button class="comment-send-btn" data-id="${postId}">发送</button>
  </div>`;
  panel.innerHTML = html;

  panel.querySelector('.comment-send-btn').addEventListener('click', async () => {
    const input = panel.querySelector('.comment-input');
    const text = input.value.trim();
    if (!text) return;
    await addComment(postId, text);
    input.value = '';
    await renderCommentsPanel(postId, panel);
    // Update comment count
    const post = feedPosts.find(p => p.id === postId);
    if (post) post.commentCount = (post.commentCount || 0) + 1;
  });
}

// ===== Post Modal =====

let _postImageFile = null;

function openPostModal() {
  document.getElementById('post-text-input').value = '';
  _postImageFile = null;
  document.getElementById('post-image-preview').style.display = 'none';
  document.getElementById('post-image-input').value = '';
  document.getElementById('post-modal').style.display = 'flex';
}

function closePostModal() {
  document.getElementById('post-modal').style.display = 'none';
  _postImageFile = null;
}

function setupPostImagePicker() {
  const input = document.getElementById('post-image-input');
  const preview = document.getElementById('post-image-preview');
  const previewImg = document.getElementById('post-image-preview-img');
  const removeBtn = document.getElementById('post-image-remove');

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('图片不能超过5MB'); input.value = ''; return; }
    _postImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  });

  removeBtn.addEventListener('click', () => {
    _postImageFile = null;
    preview.style.display = 'none';
    input.value = '';
  });
}

async function submitPost() {
  const text = document.getElementById('post-text-input').value.trim();
  if (!text && !_postImageFile) { showToast('请输入内容或选择图片'); return; }
  const btn = document.getElementById('post-modal-submit');
  btn.disabled = true;
  btn.textContent = '发布中...';
  try {
    // Upload image first if selected
    let imageUrl = '';
    if (_postImageFile) {
      showToast('正在上传图片...');
      imageUrl = await uploadPostImage(_postImageFile);
      if (!imageUrl) {
        showToast('图片上传失败，请在Supabase中创建存储桶');
        return;
      }
    }
    const post = await createPost(text, imageUrl);
    if (post) {
      closePostModal();
      showToast('发布成功');
      renderSocialView();
    } else {
      showToast('发布失败，请检查网络或重新打开应用');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '发布';
  }
}

// ===== Friends =====

async function renderFriends(container) {
  container.innerHTML = '<div class="social-loading">加载中...</div>';
  friendsList = await getFriends();
  friendRequests = await getFriendRequests();

  let html = '';

  // Pending requests
  if (friendRequests.length > 0) {
    html += '<div class="friend-section-title">好友申请</div>';
    for (const req of friendRequests) {
      html += `<div class="friend-item">
        <div class="friend-info">
          <div class="post-avatar avatar-placeholder">${(req.profile.nickname || '?')[0]}</div>
          <span class="friend-name">${escapeHtml(req.profile.nickname)}</span>
        </div>
        <div class="friend-actions">
          <button class="friend-accept-btn" data-id="${req.id}">同意</button>
          <button class="friend-reject-btn" data-id="${req.id}">拒绝</button>
        </div>
      </div>`;
    }
  }

  // Add friend
  html += `<div class="add-friend-section">
    <div class="add-friend-row">
      <input id="add-friend-input" class="add-friend-input" placeholder="输入好友的数字ID">
      <button id="add-friend-btn" class="add-friend-btn">添加</button>
    </div>
  </div>`;

  // Friend list
  html += `<div class="friend-section-title">我的好友 (${friendsList.length})</div>`;
  if (friendsList.length === 0) {
    html += '<div class="social-empty">暂无好友<br><span class="social-empty-sub">输入好友的数字ID添加</span></div>';
  } else {
    for (const f of friendsList) {
      const safeAvatar = sanitizeUrl(f.avatar);
      const avatar = safeAvatar
        ? `<img src="${safeAvatar}" class="post-avatar">`
        : `<div class="post-avatar avatar-placeholder">${escapeHtml((f.nickname || '?')[0])}</div>`;
      html += `<div class="friend-item">
        <div class="friend-info">
          ${avatar}
          <span class="friend-name">${escapeHtml(f.nickname)}</span>
        </div>
        <span class="friend-remove" data-id="${f.id}">&times;</span>
      </div>`;
    }
  }

  container.innerHTML = html;

  // Bind events
  container.querySelectorAll('.friend-accept-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (await acceptFriendRequest(btn.dataset.id)) {
        showToast('已同意');
        renderSocialView();
      }
    });
  });

  container.querySelectorAll('.friend-reject-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (await rejectFriendRequest(btn.dataset.id)) {
        showToast('已拒绝');
        renderSocialView();
      }
    });
  });

  container.querySelectorAll('.friend-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('确定删除该好友？')) return;
      if (await removeFriend(btn.dataset.id)) {
        showToast('已删除');
        renderSocialView();
      }
    });
  });

  const addBtn = document.getElementById('add-friend-btn');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      const input = document.getElementById('add-friend-input');
      const displayId = input.value.trim();
      if (!displayId) { showToast('请输入好友ID'); return; }
      // Look up user by display_id
      const friendProfile = await getProfileByDisplayId(displayId);
      if (!friendProfile) {
        showToast('找不到该用户，请检查ID');
        return;
      }
      if (friendProfile.id === getCurrentUserId()) {
        showToast('不能添加自己');
        return;
      }
      const result = await sendFriendRequest(friendProfile.id);
      if (result.error) {
        showToast(result.error);
      } else {
        showToast('申请已发送');
        input.value = '';
      }
    });
  }
}

// ===== Profile =====

async function renderProfile(container) {
  container.innerHTML = '<div class="social-loading">加载中...</div>';
  const profile = await getMyProfile();
  if (!profile) {
    container.innerHTML = '<div class="social-empty">加载失败</div>';
    return;
  }

  const safeProfileAvatar = sanitizeUrl(profile.avatar);
  const avatar = safeProfileAvatar
    ? `<img src="${safeProfileAvatar}" class="profile-avatar-img">`
    : `<div class="profile-avatar-placeholder">${escapeHtml((profile.nickname || '?')[0])}</div>`;

  const myDisplayId = profile.display_id || '未分配';
  let html = `<div class="profile-card">
    ${avatar}
    <div class="profile-nickname">${escapeHtml(profile.nickname)}</div>
    <div class="profile-id">ID: ${myDisplayId}</div>
    <button class="profile-copy-btn" id="copy-my-id">复制我的ID</button>
  </div>`;

  html += `<div class="profile-edit-section">
    <div class="profile-edit-row">
      <label>修改昵称</label>
      <input id="edit-nickname-input" class="profile-edit-input" value="${escapeHtml(profile.nickname)}" maxlength="20">
      <button id="save-nickname-btn" class="profile-save-btn">保存</button>
    </div>
  </div>`;

  container.innerHTML = html;

  document.getElementById('copy-my-id').addEventListener('click', () => {
    const copyText = String(profile.display_id || profile.id);
    navigator.clipboard.writeText(copyText).then(() => showToast('已复制')).catch(() => showToast('复制失败'));
  });

  document.getElementById('save-nickname-btn').addEventListener('click', async () => {
    const nickname = document.getElementById('edit-nickname-input').value.trim();
    if (!nickname) { showToast('昵称不能为空'); return; }
    const result = await updateProfile({ nickname });
    if (result) {
      showToast('昵称已修改');
    } else {
      showToast('修改失败，请重试');
    }
  });
}

// ===== Helpers =====

let _currentUserId = null;

function getCurrentUserId() {
  return _currentUserId;
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

// ===== Setup Check =====

async function checkDatabaseSetup() {
  if (!sb) return false;
  try {
    const { error } = await sb.from('profiles').select('id').limit(1);
    if (error && error.code === '42P01') return false; // table doesn't exist
    return true;
  } catch {
    return false;
  }
}

// ===== Init =====

async function initSocial() {
  const config = getSupabaseConfig();
  if (!config.url || !config.key) return; // Not configured yet

  if (!sb) {
    sb = initSupabase();
  }
  if (!sb) return;

  // Use improved session restoration (tries multiple methods before creating new user)
  const user = await ensureSession();

  if (user) {
    _currentUserId = user.id;
    console.log('[Social] User session:', user.id.slice(0, 8));
  } else {
    console.warn('[Social] Failed to establish session');
  }

  // Auto-restore account login (migrates data if session changed)
  if (typeof restoreAccount === 'function') {
    const restored = await restoreAccount();
    if (restored) console.log('[Social] Account restored');
  }

  // Auto-pull calendar data on login if sync enabled
  if (typeof isSyncEnabled === 'function' && isSyncEnabled()) {
    try {
      await pullCalendarData();
      console.log('[Social] Calendar data synced from cloud');
    } catch (e) {
      console.log('[Social] Calendar sync failed:', e.message);
    }
  }
}
