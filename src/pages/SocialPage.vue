<script setup>
import { ref, onMounted, nextTick, watch, onUnmounted, computed } from 'vue'
import EmptyIllustration from '../components/EmptyIllustration.vue'
import FriendsTab from '../components/FriendsTab.vue'
import ProfileTab from '../components/ProfileTab.vue'
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogClose } from 'reka-ui'

// ===== Tab 管理 =====
const TABS = [
  { key: 'feed', label: '动态' },
  { key: 'friends', label: '好友' },
  { key: 'profile', label: '我的' },
]
const activeTab = ref('feed')

// ===== 动态（Feed）逻辑 =====
const posts = ref([])
const loading = ref(false)
const hasMore = ref(true)
const page = ref(0)
const PAGE_SIZE = 10
const friendRequests = ref(0)
const getFns = () => ({
  getFeedPosts: window.getFeedPosts,
  getFriendRequests: window.getFriendRequests,
  createPost: window.createPost,
  toggleLike: window.toggleLike,
  addComment: window.addComment,
  getComments: window.getComments,
  uploadPostImage: window.uploadPostImage,
  deletePost: window.deletePost,
  getCurrentUserId: window.getCurrentUserId,
  getProfileByUserId: window.getProfileByUserId,
  showToast: window.showToast,
})

onMounted(() => { loadPosts(); checkFriendRequests() })
window.__refreshSocialFeed = () => { posts.value = []; page.value = 0; hasMore.value = true; loadPosts() }

function mapPost(p) {
  return {
    ...p,
    avatar: p.profile?.avatar || '',
    nickname: p.profile?.nickname || '匿名',
    createdAt: p.created_at ? formatRelativeTime(p.created_at) : '',
    imageUrl: p.image_url || '',
    likes: p.likeCount || 0,
    liked: p.liked || false,
    commentCount: p.commentCount || 0,
    comments: null,
    showComments: false,
    newComment: '',
  }
}

function formatRelativeTime(iso) {
  if (!iso) return ''
  const d = new Date(iso); const now = new Date(); const diff = now - d
  if (diff < 6e4) return '刚刚'
  if (diff < 36e5) return Math.floor(diff/6e4) + '分钟前'
  if (diff < 864e5) return Math.floor(diff/36e5) + '小时前'
  if (diff < 6048e5) return Math.floor(diff/864e5) + '天前'
  return `${d.getMonth()+1}月${d.getDate()}日`
}

async function loadPosts() {
  if (loading.value || !hasMore.value) return
  loading.value = true
  try {
    const { getFeedPosts: feedFn } = getFns()
    if (!feedFn) { loading.value = false; return }
    const fresh = await feedFn(PAGE_SIZE, page.value * PAGE_SIZE)
    const mapped = (fresh || []).map(mapPost)
    posts.value = page.value === 0 ? mapped : [...posts.value, ...mapped]
    hasMore.value = mapped.length >= PAGE_SIZE
    page.value++
  } catch (e) { console.error('[SocialPage] loadPosts:', e) }
  loading.value = false
}

async function checkFriendRequests() {
  try {
    const { getFriendRequests: frFn } = getFns()
    if (!frFn) return
    const r = await frFn()
    friendRequests.value = (r || []).length
  } catch (e) { console.warn('[Social] Failed to load pending count:', e.message) }
}

function onScroll(e) {
  const el = e.target
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) loadPosts()
}

// Post creation
const showPostModal = ref(false)
const postText = ref('')
const postImage = ref(null)
const postImageUrl = ref('')

watch(postImage, (newVal, oldVal) => {
  if (oldVal && postImageUrl.value) URL.revokeObjectURL(postImageUrl.value)
  postImageUrl.value = newVal ? URL.createObjectURL(newVal) : ''
})
onUnmounted(() => { if (postImageUrl.value) URL.revokeObjectURL(postImageUrl.value) })

function openPostModal() { showPostModal.value = true; postText.value = ''; postImage.value = null }
function closePostModal() { showPostModal.value = false; postImage.value = null }

function onImageSelect(e) {
  const file = e.target.files[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) { window.showToast?.('图片不能超过5MB'); e.target.value = ''; return }
  postImage.value = file
}

async function submitPost() {
  if (!postText.value.trim() && !postImage.value) { window.showToast?.('请输入内容或选择图片'); return }
  const { createPost: cpFn, uploadPostImage: upFn } = getFns()
  if (!cpFn) { window.showToast?.('服务未连接'); return }
  try {
    let imageUrl = ''
    if (postImage.value) { window.showToast?.('正在上传图片...'); imageUrl = await upFn(postImage.value) || '' }
    const post = await cpFn(postText.value.trim(), imageUrl)
    if (post) { closePostModal(); window.__refreshSocialFeed?.(); window.showToast?.('动态已发布') }
    else { window.showToast?.('发布失败，请检查网络') }
  } catch (e) { window.showToast?.('发布失败') }
}

// Like/Unlike
async function toggleLike(postId) {
  const { toggleLike: tlFn } = getFns()
  if (!tlFn) return
  const liked = await tlFn(postId)
  const post = posts.value.find(p => p.id === postId)
  if (post) { post.liked = liked; post.likes = Math.max(0, (post.likes || 0) + (liked ? 1 : -1)) }
}

// Comments
async function loadComments(postId) {
  const { getComments: gcFn } = getFns()
  if (!gcFn) return []
  return await gcFn(postId) || []
}
async function addComment(postId, text) {
  if (!text.trim()) return
  const { addComment: acFn } = getFns()
  if (!acFn) return
  await acFn(postId, text.trim())
  const post = posts.value.find(p => p.id === postId)
  if (post) { post.commentCount = (post.commentCount || 0) + 1; post.newComment = ''; post.comments = await loadComments(postId) }
}
async function toggleComments(post) {
  post.showComments = !post.showComments
  if (post.showComments && !post.comments) post.comments = await loadComments(post.id)
}

// Delete post
async function deletePost(postId) {
  if (!confirm('确定删除这条动态？')) return
  const { deletePost: dpFn } = getFns()
  if (!dpFn) return
  const ok = await dpFn(postId)
  if (ok) { posts.value = posts.value.filter(p => p.id !== postId); window.showToast?.('已删除') }
}
function isMyPost(post) {
  const { getCurrentUserId: uidFn } = getFns()
  const uid = uidFn?.()
  return uid && post.user_id === uid
}
</script>

<template>
  <div class="social-content">
    <!-- 顶部 Tab 栏 -->
    <div class="social-tab-bar">
      <div v-for="tab in TABS" :key="tab.key"
        class="social-tab" :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key">
        {{ tab.label }}
        <span v-if="tab.key === 'friends' && friendRequests > 0" class="tab-badge">{{ friendRequests }}</span>
      </div>
    </div>

    <!-- 动态 Feed -->
    <template v-if="activeTab === 'feed'">
      <div class="social-header">
        <span></span>
        <button class="settings-action-btn btn-xs" @click="openPostModal">+ 发布</button>
      </div>

      <div class="social-scroll" @scroll="onScroll">
        <div v-for="post in posts" :key="post.id" class="post-card" data-tilt data-tilt-max="5" data-tilt-lift="4">
          <div class="post-author-row">
            <div class="feed-avatar">
              <img v-if="post.avatar" :src="post.avatar" alt="">
              <span v-else>{{ post.nickname?.[0] || '?' }}</span>
            </div>
            <div class="post-meta">
              <div class="post-nickname">{{ post.nickname || '匿名' }}</div>
              <div class="post-time">{{ post.createdAt || '' }}</div>
            </div>
            <span v-if="isMyPost(post)" class="post-delete" @click="deletePost(post.id)">&times;</span>
          </div>
          <div v-if="post.content" class="post-text">{{ post.content }}</div>
          <img v-if="post.imageUrl" :src="post.imageUrl" class="post-image" alt="">
          <div class="post-actions">
            <span class="post-action" :class="{ 'is-liked': post.liked }" @click="toggleLike(post.id)">👍 {{ post.likes || 0 }}</span>
            <span class="post-action" @click="toggleComments(post)">💬 {{ post.commentCount || 0 }}</span>
          </div>
          <div v-if="post.showComments" class="post-comments">
            <div v-if="post.comments && post.comments.length > 0">
              <div v-for="c in post.comments" :key="c.id" class="comment-item"><strong>{{ c.profile?.nickname || '匿名' }}:</strong> {{ c.content }}</div>
            </div>
            <div v-else class="comment-empty">暂无评论</div>
            <div class="comment-input-row">
              <input type="text" v-model="post.newComment" class="comment-input" placeholder="写评论..." @keydown.enter="addComment(post.id, post.newComment)">
              <button class="comment-send" @click="addComment(post.id, post.newComment)">发送</button>
            </div>
          </div>
        </div>
        <div v-if="loading" class="social-state">加载中...</div>
        <div v-if="!hasMore && posts.length > 0" class="social-state end">没有更多了</div>
        <div v-if="!loading && posts.length === 0" class="social-state empty"><EmptyIllustration variant="calendar" label="暂无动态" :size="108" /></div>
      </div>
    </template>

    <!-- 好友 -->
    <FriendsTab v-else-if="activeTab === 'friends'" />

    <!-- 个人 -->
    <ProfileTab v-else-if="activeTab === 'profile'" />

    <!-- Post Modal -->
    <DialogRoot v-model:open="showPostModal" @update:open="v => showPostModal = v">
      <DialogPortal>
        <DialogOverlay class="dialog-overlay" />
        <DialogContent class="dialog-content" @interact-outside="closePostModal">
          <DialogTitle class="dialog-title">发布动态</DialogTitle>
          <textarea v-model="postText" placeholder="分享你的心情..." rows="4" class="post-textarea"></textarea>
          <div v-if="postImage" class="post-image-preview">
            <img :src="postImageUrl" class="post-image-preview-img" alt="">
            <span class="post-image-remove" @click="postImage = null">&times;</span>
          </div>
          <div><label class="post-add-image">📷 图片<input type="file" accept="image/*" @change="onImageSelect"></label></div>
          <div class="modal-actions">
            <DialogClose class="modal-btn cancel">取消</DialogClose>
            <button class="modal-btn confirm" @click="submitPost">发布</button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </div>
</template>

<style scoped>
/* ===== Tab 栏 ===== */
.social-tab-bar { display: flex; gap: 0; padding: 8px 12px 0; border-bottom: 1px solid var(--border, rgba(0,0,0,0.08)); margin-bottom: 2px; flex-shrink: 0; }
.social-tab { flex: 1; text-align: center; padding: 9px 0; font-size: 14px; font-weight: 500; color: var(--text3, #999); cursor: pointer; position: relative; transition: color .2s; user-select: none; -webkit-tap-highlight-color: transparent; }
.social-tab.active { color: var(--accent, #9d8cff); font-weight: 600; }
.social-tab.active::after { content: ''; position: absolute; bottom: 0; left: 20%; right: 20%; height: 2.5px; background: var(--accent, #9d8cff); border-radius: 2px; }
.tab-badge { display: inline-block; min-width: 16px; height: 16px; line-height: 16px; padding: 0 5px; font-size: 11px; border-radius: 8px; background: #e53935; color: #fff; margin-left: 4px; vertical-align: top; }

/* 保持原有样式 */
.social-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px 6px; flex-shrink: 0; }
.social-title { font-size: 17px; font-weight: 700; color: var(--text1, #333); }
.social-header-actions { display: flex; align-items: center; gap: 8px; }
.friend-req-badge { font-size: 12px; color: #e53935; cursor: pointer; font-weight: 600; padding: 2px 6px; background: rgba(229,57,53,0.08); border-radius: 8px; }
.btn-xs { font-size: 13px; padding: 5px 12px; border-radius: 7px; border: none; background: var(--accent, #9d8cff); color: #fff; cursor: pointer; font-weight: 500; }

.social-scroll { overflow-y: auto; flex: 1; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; padding: 0 0 8px; }

.post-card { margin: 8px 10px; padding: 12px; border-radius: 12px; background: var(--bg-card, rgba(0,0,0,0.02)); transition: transform .15s; }
.post-author-row { display: flex; align-items: center; gap: 10px; }
.feed-avatar { width: 38px; height: 38px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: linear-gradient(135deg, var(--accent,#9d8cff), #b388ff); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 16px; font-weight: 600; }
.feed-avatar img { width: 100%; height: 100%; object-fit: cover; }
.post-meta { flex: 1; min-width: 0; }
.post-nickname { font-size: 14px; font-weight: 600; color: var(--text1, #333); }
.post-time { font-size: 11px; color: var(--text3, #bbb); margin-top: 1px; }
.post-delete { font-size: 18px; color: #ccc; cursor: pointer; padding: 2px; line-height: 1; }
.post-delete:hover { color: #e53935; }
.post-text { margin-top: 8px; font-size: 14px; line-height: 1.55; color: var(--text1, #333); word-break: break-all; white-space: pre-wrap; }
.post-image { width: 100%; border-radius: 8px; margin-top: 8px; display: block; }
.post-actions { display: flex; gap: 20px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border, rgba(0,0,0,0.06)); }
.post-action { font-size: 13px; color: var(--text3, #888); cursor: pointer; user-select: none; }
.post-action.is-liked { color: var(--accent, #9d8cff); font-weight: 600; }
.post-comments { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border, rgba(0,0,0,0.06)); }
.comment-item { font-size: 13px; padding: 4px 0; color: var(--text2, #666); line-height: 1.45; }
.comment-empty { font-size: 12px; color: var(--text3, #aaa); padding: 6px 0; }
.comment-input-row { display: flex; gap: 6px; margin-top: 8px; }
.comment-input { flex: 1; font-size: 13px; padding: 6px 10px; border: 1px solid var(--border, #ddd); border-radius: 7px; outline: none; background: transparent; color: var(--text1, #333); box-sizing: border-box; }
.comment-send { font-size: 13px; padding: 6px 14px; border-radius: 7px; border: none; background: var(--accent, #9d8cff); color: #fff; cursor: pointer; font-weight: 500; white-space: nowrap; }

.social-state { text-align: center; padding: 24px 10px; font-size: 13px; color: var(--text3, #999); }
.social-state.end { color: var(--text3, #ccc); font-size: 12px; }

/* Post Modal */
.dialog-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 100; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
.dialog-content { background: var(--bg, #fff); border-radius: 14px; padding: 20px; width: calc(100vw - 40px); max-width: 380px; box-shadow: 0 12px 40px rgba(0,0,0,.2); z-index: 101; }
.dialog-title { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: var(--text1, #333); }
.post-textarea { width: 100%; min-height: 80px; resize: vertical; border: 1px solid var(--border, #ddd); border-radius: 9px; padding: 10px; font-size: 14px; font-family: inherit; color: var(--text1, #333); box-sizing: border-box; outline: none; box-sizing: border-box; }
.post-textarea:focus { border-color: var(--accent, #9d8cff); }
.post-image-preview { margin-top: 10px; position: relative; }
.post-image-preview-img { max-width: 100%; border-radius: 8px; display: block; }
.post-image-remove { position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; border-radius: 50%; background: rgba(0,0,0,.5); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 14px; }
.post-add-image { display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; border-radius: 7px; border: 1px dashed var(--border, #ddd); color: var(--text3, #888); cursor: pointer; font-size: 13px; margin-top: 8px; transition: all .15s; }
.post-add-image:hover { border-color: var(--accent, #9d8cff); color: var(--accent, #9d8cff); }
.post-add-image input { display: none; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.modal-btn { font-size: 13px; padding: 7px 18px; border-radius: 8px; border: none; cursor: pointer; font-weight: 500; }
.modal-btn.cancel { background: transparent; color: var(--text3, #888); border: 1px solid var(--border, #ddd); }
.modal-btn.confirm { background: var(--accent, #9d8cff); color: #fff; }
</style>
