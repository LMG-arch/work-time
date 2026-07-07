<script setup>
import { ref, onMounted, nextTick, watch, onUnmounted } from 'vue'
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
  <div class="social-content" style="padding:4px 0 16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 4px 12px;">
      <div style="font-size:16px;font-weight:600;">好友圈</div>
      <div style="display:flex;gap:8px;">
        <span v-if="friendRequests > 0" style="background:#e53935;color:#fff;padding:2px 6px;border-radius:10px;font-size:11px;cursor:pointer;" @click="switchToFriends">{{ friendRequests }} 个请求</span>
        <button class="settings-action-btn" style="font-size:12px;padding:4px 10px;" @click="openPostModal">+ 发布</button>
      </div>
    </div>

    <div style="overflow-y:auto;" @scroll="onScroll">
      <div v-for="post in posts" :key="post.id" style="padding:12px 4px;border-bottom:1px solid var(--border,#eee);">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div :style="{ width:'32px',height:'32px',borderRadius:'50%',background:'var(--accent,#333)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:'14px',overflow:'hidden',flexShrink:0 }">
            <img v-if="post.avatar" :src="post.avatar" style="width:100%;height:100%;object-fit:cover;">
            <span v-else>{{ post.nickname?.[0] || '?' }}</span>
          </div>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:500;">{{ post.nickname || '匿名' }}</div>
            <div style="font-size:11px;color:var(--text3,#999);">{{ post.createdAt || '' }}</div>
          </div>
          <span v-if="isMyPost(post)" style="cursor:pointer;font-size:16px;color:var(--text3,#999);" @click="deletePost(post.id)">&times;</span>
        </div>
        <div v-if="post.content" style="font-size:13px;margin-bottom:8px;white-space:pre-wrap;">{{ post.content }}</div>
        <img v-if="post.imageUrl" :src="post.imageUrl" style="max-width:100%;border-radius:8px;margin-bottom:8px;cursor:pointer;">
        <div style="display:flex;gap:16px;font-size:12px;color:var(--text3,#999);">
          <span style="cursor:pointer;" :style="{ color: post.liked ? 'var(--accent)' : '' }" @click="toggleLike(post.id)">👍 {{ post.likes || 0 }}</span>
          <span style="cursor:pointer;" @click="toggleComments(post)">💬 {{ post.commentCount || 0 }}</span>
        </div>
        <div v-if="post.showComments" style="margin-top:8px;padding-left:16px;border-left:2px solid var(--border,#eee);">
          <div v-if="post.comments && post.comments.length > 0">
            <div v-for="c in post.comments" :key="c.id" style="font-size:12px;margin-bottom:4px;">
              <strong>{{ c.profile?.nickname || '匿名' }}:</strong> {{ c.content }}
            </div>
          </div>
          <div v-else style="font-size:12px;color:var(--text3,#999);">暂无评论</div>
          <div style="display:flex;gap:4px;margin-top:4px;">
            <input type="text" v-model="post.newComment" placeholder="写评论..." style="flex:1;padding:4px 8px;border:1px solid var(--border,#ddd);border-radius:4px;font-size:12px;" @keydown.enter="addComment(post.id, post.newComment)">
            <button style="padding:4px 8px;font-size:12px;" @click="addComment(post.id, post.newComment)">发送</button>
          </div>
        </div>
      </div>
      <div v-if="loading" style="text-align:center;padding:20px;color:var(--text2,#999);">加载中...</div>
      <div v-if="!hasMore && posts.length > 0" style="text-align:center;padding:12px;color:var(--text3,#999);font-size:12px;">没有更多了</div>
      <div v-if="!loading && posts.length === 0" style="text-align:center;padding:40px;color:var(--text3,#999);">暂无动态</div>
    </div>

    <!-- Post Modal -->
    <DialogRoot v-model:open="showPostModal" @update:open="v => showPostModal = v">
      <DialogPortal>
        <DialogOverlay class="dialog-overlay" />
        <DialogContent class="dialog-content" @interact-outside="closePostModal">
          <DialogTitle class="dialog-title">发布动态</DialogTitle>
          <textarea v-model="postText" placeholder="分享你的心情..." rows="4" style="width:100%;border:1px solid var(--border,#ddd);border-radius:8px;padding:8px;font-size:13px;resize:vertical;box-sizing:border-box;margin-bottom:8px;"></textarea>
          <div v-if="postImage" style="position:relative;margin-bottom:8px;">
            <img :src="postImageUrl" style="max-width:100%;max-height:200px;border-radius:8px;">
            <span style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.5);color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;" @click="postImage = null">&times;</span>
          </div>
          <div style="margin-bottom:8px;">
            <label style="cursor:pointer;font-size:13px;color:var(--accent);">📷 图片
              <input type="file" accept="image/*" style="display:none;" @change="onImageSelect">
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
