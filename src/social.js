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

async function renderFeed(container) {
  container.innerHTML = '<div class="social-loading">加载中...</div>';
  feedPosts = await getFeedPosts(20, 0);
  feedOffset = 0;

  let html = '';
  if (feedPosts.length === 0) {
    html = '<div class="social-empty">暂无动态<br><span class="social-empty-sub">添加好友后可以看到彼此的动态</span></div>';
  } else {
    html += '<div class="feed-list">';
    for (const post of feedPosts) {
      html += renderPostCard(post);
    }
    html += '</div>';
  }

  // Floating add button
  html += '<button class="fab-btn" id="fab-add-post">✎</button>';
  container.innerHTML = html;

  // Event listeners
  bindPostEvents(container);
  const fab = document.getElementById('fab-add-post');
  if (fab) fab.addEventListener('click', openPostModal);
}

function renderPostCard(post) {
  const time = formatTime(post.created_at);
  const avatar = post.profile.avatar
    ? `<img src="${post.profile.avatar}" class="post-avatar">`
    : `<div class="post-avatar avatar-placeholder">${(post.profile.nickname || '?')[0]}</div>`;

  const isMine = post.profile.id === getCurrentUserId();

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
    <div class="post-actions">
      <span class="post-action-btn like-btn${post.liked ? ' liked' : ''}" data-id="${post.id}">
        ${post.liked ? '❤' : '♡'} ${post.likeCount || ''}
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
        post.likeCount += liked ? 1 : -1;
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

function openPostModal() {
  const modal = document.getElementById('post-modal');
  document.getElementById('post-text-input').value = '';
  modal.style.display = 'flex';
}

function closePostModal() {
  document.getElementById('post-modal').style.display = 'none';
}

async function submitPost() {
  const text = document.getElementById('post-text-input').value.trim();
  if (!text) { showToast('请输入内容'); return; }
  const post = await createPost(text);
  if (post) {
    closePostModal();
    showToast('发布成功');
    renderSocialView();
  } else {
    showToast('发布失败');
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
      <input id="add-friend-input" class="add-friend-input" placeholder="输入好友用户ID">
      <button id="add-friend-btn" class="add-friend-btn">添加</button>
    </div>
  </div>`;

  // Friend list
  html += `<div class="friend-section-title">我的好友 (${friendsList.length})</div>`;
  if (friendsList.length === 0) {
    html += '<div class="social-empty">暂无好友<br><span class="social-empty-sub">输入好友的用户ID添加</span></div>';
  } else {
    for (const f of friendsList) {
      const avatar = f.avatar
        ? `<img src="${f.avatar}" class="post-avatar">`
        : `<div class="post-avatar avatar-placeholder">${(f.nickname || '?')[0]}</div>`;
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
      const userId = input.value.trim();
      if (!userId) { showToast('请输入用户ID'); return; }
      const result = await sendFriendRequest(userId);
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

  const avatar = profile.avatar
    ? `<img src="${profile.avatar}" class="profile-avatar-img">`
    : `<div class="profile-avatar-placeholder">${(profile.nickname || '?')[0]}</div>`;

  let html = `<div class="profile-card">
    ${avatar}
    <div class="profile-nickname">${escapeHtml(profile.nickname)}</div>
    <div class="profile-id">ID: ${profile.id}</div>
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
    navigator.clipboard.writeText(profile.id).then(() => showToast('已复制'));
  });

  document.getElementById('save-nickname-btn').addEventListener('click', async () => {
    const nickname = document.getElementById('edit-nickname-input').value.trim();
    if (!nickname) { showToast('昵称不能为空'); return; }
    await updateProfile({ nickname });
    showToast('昵称已修改');
  });
}

// ===== Helpers =====

let _currentUserId = null;

function getCurrentUserId() {
  return _currentUserId;
}

async function ensureUserId() {
  if (!_currentUserId) {
    const user = await getCurrentUser();
    _currentUserId = user ? user.id : null;
  }
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

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

  // Try to restore session
  const user = await getCurrentUser();
  if (!user) {
    await signIn();
  }
  await ensureUserId();
}
