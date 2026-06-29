<script setup>
import { ref, computed, onMounted } from 'vue'

const posts = ref([])
const loading = ref(false)
const hasMore = ref(true)
const page = ref(0)
const PAGE_SIZE = 10
const friendRequests = ref(0)

onMounted(() => {
  loadPosts()
  checkFriendRequests()
})

// 监听 data-changed 事件
window.__refreshSocialFeed = () => { posts.value = []; page.value = 0; hasMore.value = true; loadPosts() }

async function loadPosts() {
  if (loading.value || !hasMore.value) return
  loading.value = true
  if (typeof window.loadSocialPosts === 'function') {
    const result = await window.loadSocialPosts(page.value, PAGE_SIZE)
    if (result && result.posts) {
      posts.value = page.value === 0 ? result.posts : [...posts.value, ...result.posts]
      hasMore.value = result.hasMore !== false
    }
  }
  loading.value = false
}

async function checkFriendRequests() {
  if (typeof window.getPendingFriendRequests === 'function') {
    const r = await window.getPendingFriendRequests()
    friendRequests.value = r?.count || 0
  }
}

function onScroll(e) {
  const el = e.target
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) loadPosts()
}

// Post creation
const showPostModal = ref(false)
const postText = ref('')
const postImage = ref(null)

function openPostModal() { showPostModal.value = true; postText.value = ''; postImage.value = null }
function closePostModal() { showPostModal.value = false; postImage.value = null }

function onImageSelect(e) {
  const file = e.target.files[0]
  if (!file) return
  postImage.value = file
}

async function submitPost() {
  if (!postText.value.trim()) { window.showToast?.('请输入内容'); return }
  if (typeof window.createSocialPost === 'function') {
    await window.createSocialPost(postText.value.trim(), postImage.value)
    closePostModal()
    window.__refreshSocialFeed?.()
    window.showToast?.('动态已发布')
  }
}

// Like/Unlike
async function toggleLike(postId) { if (typeof window.togglePostLike === 'function') { await window.togglePostLike(postId); window.__refreshSocialFeed?.() } }
async function addComment(postId, text) { if (typeof window.addPostComment === 'function') { await window.addPostComment(postId, text); window.__refreshSocialFeed?.() } }
</script>

<template>
  <div class="social-content">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;">
      <div style="font-size:16px;font-weight:600;">好友圈</div>
      <div style="display:flex;gap:8px;">
        <span v-if="friendRequests > 0" style="background:#e53935;color:#fff;padding:2px 6px;border-radius:10px;font-size:11px;cursor:pointer;" @click="switchView('social-friends')">{{ friendRequests }} 个请求</span>
        <button class="settings-action-btn" style="font-size:12px;padding:4px 10px;" @click="openPostModal">+ 发布</button>
      </div>
    </div>

    <div style="max-height:calc(100vh - 120px);overflow-y:auto;" @scroll="onScroll">
      <div v-for="post in posts" :key="post.id" style="padding:12px 16px;border-bottom:1px solid var(--border,#eee);">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div :style="{ width:'32px',height:'32px',borderRadius:'50%',background:'var(--accent,#333)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:'14px',overflow:'hidden' }">
            <img v-if="post.avatar" :src="post.avatar" style="width:100%;height:100%;object-fit:cover;">
            <span v-else>{{ post.nickname?.[0] || '?' }}</span>
          </div>
          <div>
            <div style="font-size:13px;font-weight:500;">{{ post.nickname || '匿名' }}</div>
            <div style="font-size:11px;color:var(--text-secondary,#999);">{{ post.createdAt || '' }}</div>
          </div>
        </div>
        <div v-if="post.content" style="font-size:13px;margin-bottom:8px;white-space:pre-wrap;">{{ post.content }}</div>
        <img v-if="post.imageUrl" :src="post.imageUrl" style="max-width:100%;border-radius:8px;margin-bottom:8px;cursor:pointer;" @click="window.open?.(post.imageUrl)">
        <div style="display:flex;gap:16px;font-size:12px;color:var(--text-secondary,#999);">
          <span style="cursor:pointer;" :style="{ color: post.liked ? 'var(--accent)' : '' }" @click="toggleLike(post.id)">👍 {{ post.likes || 0 }}</span>
          <span style="cursor:pointer;" @click="post.showComments = !post.showComments">💬 {{ post.commentCount || 0 }}</span>
        </div>
        <div v-if="post.showComments && post.comments" style="margin-top:8px;padding-left:16px;border-left:2px solid var(--border,#eee);">
          <div v-for="c in post.comments" :key="c.id" style="font-size:12px;margin-bottom:4px;">
            <strong>{{ c.nickname || '匿名' }}:</strong> {{ c.content }}
          </div>
          <div style="display:flex;gap:4px;margin-top:4px;">
            <input type="text" v-model="post.newComment" placeholder="写评论..." style="flex:1;padding:4px 8px;border:1px solid var(--border,#ddd);border-radius:4px;font-size:12px;" @keydown.enter="post.newComment && addComment(post.id, post.newComment) && (post.newComment = '')">
            <button style="padding:4px 8px;font-size:12px;" @click="post.newComment && addComment(post.id, post.newComment) && (post.newComment = '')">发送</button>
          </div>
        </div>
      </div>
      <div v-if="loading" style="text-align:center;padding:20px;color:var(--text-secondary);">加载中...</div>
      <div v-if="!hasMore && posts.length > 0" style="text-align:center;padding:12px;color:var(--text-secondary,#999);font-size:12px;">没有更多了</div>
      <div v-if="!loading && posts.length === 0" style="text-align:center;padding:40px;color:var(--text-secondary,#999);">暂无动态</div>
    </div>

    <!-- Post Modal -->
    <Teleport to="body">
      <div v-if="showPostModal" class="modal" style="display:flex;" @click.self="closePostModal">
        <div class="modal-content">
          <div class="modal-title">发布动态</div>
          <textarea v-model="postText" placeholder="分享你的心情..." rows="4" style="width:100%;border:1px solid var(--border,#ddd);border-radius:8px;padding:8px;font-size:13px;resize:vertical;box-sizing:border-box;margin-bottom:8px;"></textarea>
          <div v-if="postImage" style="position:relative;margin-bottom:8px;">
            <img :src="URL.createObjectURL(postImage)" style="max-width:100%;max-height:200px;border-radius:8px;">
            <span style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.5);color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;" @click="postImage = null">&times;</span>
          </div>
          <div style="margin-bottom:8px;">
            <label style="cursor:pointer;font-size:13px;color:var(--accent);">📷 图片
              <input type="file" accept="image/*" style="display:none;" @change="onImageSelect">
            </label>
          </div>
          <div class="modal-actions">
            <button class="modal-btn cancel" @click="closePostModal">取消</button>
            <button class="modal-btn confirm" @click="submitPost">发布</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
