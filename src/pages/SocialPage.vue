<script setup>
import { ref, onMounted, nextTick, watch, onUnmounted } from 'vue'
import EmptyIllustration from '../components/EmptyIllustration.vue'
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogClose } from 'reka-ui'

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

// 将 getFeedPosts 返回的数据映射到模板期望的字段
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
  if (oldVal && postImageUrl.value) {
    URL.revokeObjectURL(postImageUrl.value)
  }
  postImageUrl.value = newVal ? URL.createObjectURL(newVal) : ''
})
onUnmounted(() => {
  if (postImageUrl.value) URL.revokeObjectURL(postImageUrl.value)
})

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
    if (postImage.value) {
      window.showToast?.('正在上传图片...')
      imageUrl = await upFn(postImage.value) || ''
    }
    const post = await cpFn(postText.value.trim(), imageUrl)
    if (post) {
      closePostModal()
      window.__refreshSocialFeed?.()
      window.showToast?.('动态已发布')
    } else {
      window.showToast?.('发布失败，请检查网络')
    }
  } catch (e) { window.showToast?.('发布失败') }
}

// Like/Unlike
async function toggleLike(postId) {
  const { toggleLike: tlFn } = getFns()
  if (!tlFn) return
  const liked = await tlFn(postId)
  const post = posts.value.find(p => p.id === postId)
  if (post) {
    post.liked = liked
    post.likes = Math.max(0, (post.likes || 0) + (liked ? 1 : -1))
  }
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
  if (post) {
    post.commentCount = (post.commentCount || 0) + 1
    post.newComment = ''
    post.comments = await loadComments(postId)
  }
}

async function toggleComments(post) {
  post.showComments = !post.showComments
  if (post.showComments && !post.comments) {
    post.comments = await loadComments(post.id)
  }
}

// Delete post
async function deletePost(postId) {
  if (!confirm('确定删除这条动态？')) return
  const { deletePost: dpFn } = getFns()
  if (!dpFn) return
  const ok = await dpFn(postId)
  if (ok) {
    posts.value = posts.value.filter(p => p.id !== postId)
    window.showToast?.('已删除')
  }
}

function isMyPost(post) {
  const { getCurrentUserId: uidFn } = getFns()
  const uid = uidFn?.()
  return uid && post.user_id === uid
}

// 好友申请红点点击：跳转到传统好友圈视图（切换 social tab 到 friends）
function switchToFriends() {
  // 传统 social.js 使用 socialTab 变量控制 tab
  if (typeof window.socialTab !== 'undefined') {
    window.socialTab = 'friends'
  }
  // 调用传统 renderSocialView 刷新
  if (typeof window.renderSocialView === 'function') {
    window.renderSocialView()
  }
}
</script>

<template>
  <div class="social-content">
    <div class="social-header">
      <div class="social-title">好友圈</div>
      <div class="social-header-actions">
        <span v-if="friendRequests > 0" class="friend-req-badge" @click="switchToFriends">{{ friendRequests }} 个请求</span>
        <button class="settings-action-btn btn-xs" @click="openPostModal">+ 发布</button>
      </div>
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
            <div v-for="c in post.comments" :key="c.id" class="comment-item">
              <strong>{{ c.profile?.nickname || '匿名' }}:</strong> {{ c.content }}
            </div>
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
          <div>
            <label class="post-add-image">📷 图片
              <input type="file" accept="image/*" @change="onImageSelect">
            </label>
          </div>
          <div class="modal-actions">
            <DialogClose class="modal-btn cancel">取消</DialogClose>
            <button class="modal-btn confirm" @click="submitPost">发布</button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </div>
</template>
