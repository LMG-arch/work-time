<script setup>
import { ref, onMounted } from 'vue'
import EmptyIllustration from './EmptyIllustration.vue'

const friends = ref([])
const requests = ref([])
const loading = ref(false)
const addIdInput = ref('')
const addMsg = ref('')

onMounted(async () => { await loadAll() })

async function loadAll() {
  loading.value = true
  try {
    friends.value = (await window.getFriends?.()) || []
    requests.value = (await window.getFriendRequests?.()) || []
  } catch (e) { console.warn('[FriendsTab] load failed:', e.message) }
  loading.value = false
}

async function acceptReq(id) {
  if (!await window.acceptFriendRequest?.(id)) return
  window.showToast?.('已同意')
  await loadAll()
}

async function rejectReq(id) {
  if (!await window.rejectFriendRequest?.(id)) return
  window.showToast?.('已拒绝')
  await loadAll()
}

async function removeFriend(id) {
  if (!confirm('确定删除该好友？')) return
  if (!await window.removeFriend?.(id)) return
  window.showToast?.('已删除')
  await loadAll()
}

async function addFriend() {
  const did = addIdInput.value.trim()
  if (!did) { window.showToast?.('请输入好友的数字ID'); return }
  addMsg.value = ''
  try {
    const target = await window.getProfileByDisplayId?.(did)
    if (!target) { addMsg.value = '找不到该用户，请检查ID'; return }
    if (target.id === window.getCurrentUserId?.()) { addMsg.value = '不能添加自己'; return }
    const ok = await window.sendFriendRequest?.(target.id)
    if (ok) { addMsg.value = '已发送好友请求'; addIdInput.value = '' }
    else addMsg.value = '发送失败，可能已是好友'
  } catch (e) { addMsg.value = '操作失败: ' + e.message }
}
</script>

<template>
  <div class="friends-tab">
    <!-- 好友申请 -->
    <div v-if="requests.length > 0" class="friend-section">
      <div class="section-title">好友申请 ({{ requests.length }})</div>
      <div v-for="req in requests" :key="req.id" class="friend-item">
        <div class="friend-info">
          <div class="post-avatar avatar-placeholder">{{ (req.profile?.nickname || '?')[0] }}</div>
          <span class="friend-name">{{ req.profile?.nickname || '未知' }}</span>
        </div>
        <div class="friend-actions">
          <button class="friend-btn accept" @click="acceptReq(req.id)">同意</button>
          <button class="friend-btn reject" @click="rejectReq(req.id)">拒绝</button>
        </div>
      </div>
    </div>

    <!-- 添加好友 -->
    <div class="add-friend-section">
      <div class="section-title">添加好友</div>
      <div class="add-friend-row">
        <input v-model="addIdInput" class="add-friend-input" placeholder="输入好友的数字ID" @keydown.enter="addFriend">
        <button class="add-friend-btn" @click="addFriend">添加</button>
      </div>
      <div v-if="addMsg" class="add-msg" :class="{ error: addMsg.includes('失败') || addMsg.includes('不能') || addMsg.includes('找不到') }">{{ addMsg }}</div>
    </div>

    <!-- 好友列表 -->
    <div class="friend-section">
      <div class="section-title">我的好友 ({{ friends.length }})</div>
      <div v-if="loading" class="social-state">加载中...</div>
      <div v-else-if="friends.length === 0" class="social-state empty">
        <EmptyIllustration variant="calendar" label="暂无好友" :size="88" />
        <p class="empty-hint">输入好友的数字ID发送请求</p>
      </div>
      <div v-else class="friend-list">
        <div v-for="f in friends" :key="f.id" class="friend-item">
          <div class="friend-info">
            <img v-if="f.avatar" :src="f.avatar" class="post-avatar" alt="">
            <span v-else class="post-avatar avatar-placeholder">{{ (f.nickname || '?')[0] }}</span>
            <span class="friend-name">{{ f.nickname || '未知' }}</span>
          </div>
          <span class="friend-remove-btn" @click="removeFriend(f.id)" title="删除好友">&times;</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.friends-tab { padding: 0; }
.section-title { font-size: 13px; font-weight: 600; color: var(--text2, #666); margin: 14px 10px 8px; }
.friend-section:first-child .section-title { margin-top: 6px; }

.friend-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-radius: 8px; margin: 2px 8px; background: var(--bg-card, rgba(0,0,0,0.03)); transition: background .15s; }
.friend-item:hover { background: var(--hover, rgba(0,0,0,0.06)); }
.friend-info { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.friend-info .post-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.friend-info .avatar-placeholder { width: 36px; height: 36px; border-radius: 50%; background: var(--accent, #9d8cff); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 600; flex-shrink: 0; }
.friend-name { font-size: 14px; color: var(--text1, #333); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.friend-actions { display: flex; gap: 6px; flex-shrink: 0; }
.friend-btn { font-size: 12px; padding: 4px 12px; border-radius: 6px; border: none; cursor: pointer; font-weight: 500; }
.friend-btn.accept { background: var(--work, #4caf50); color: #fff; }
.friend-btn.reject { background: #e53935; color: #fff; }

.friend-remove-btn { font-size: 18px; color: #999; cursor: pointer; padding: 2px 6px; line-height: 1; flex-shrink: 0; }
.friend-remove-btn:hover { color: #e53935; }

/* Add friend */
.add-friend-section { margin: 4px 8px; }
.add-friend-row { display: flex; gap: 6px; }
.add-friend-input { flex: 1; font-size: 13px; padding: 7px 10px; border: 1px solid var(--border, #ddd); border-radius: 7px; outline: none; background: transparent; color: var(--text1, #333); box-sizing: border-box; }
.add-friend-input:focus { border-color: var(--accent, #9d8cff); }
.add-friend-btn { font-size: 13px; padding: 7px 14px; border-radius: 7px; border: none; background: var(--accent, #9d8cff); color: #fff; cursor: pointer; font-weight: 500; white-space: nowrap; }
.add-msg { font-size: 12px; margin-top: 4px; color: var(--work, #4caf50); }
.add-msg.error { color: #e53935; }

.social-state { text-align: center; padding: 20px 10px; font-size: 13px; color: var(--text3, #999); }
.empty-hint { margin: 4px 0 0; font-size: 12px; color: var(--text3, #aaa); }
</style>
