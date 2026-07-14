<script setup>
import { ref, onMounted } from 'vue'
import EmptyIllustration from './EmptyIllustration.vue'

const nickname = ref('')
const displayId = ref('')
const avatar = ref('')
const userId = ref('')
const editNickname = ref('')
const loading = ref(false)
const saving = ref(false)
const copyMsg = ref('')

onMounted(async () => { await loadProfile() })

async function loadProfile() {
  loading.value = true
  try {
    const p = await window.getMyProfile?.()
    if (p) {
      nickname.value = p.nickname || ''
      editNickname.value = p.nickname || ''
      displayId.value = String(p.display_id || p.id || '未分配')
      avatar.value = p.avatar || ''
      userId.value = p.id || ''
    }
  } catch (e) { console.warn('[ProfileTab] load failed:', e.message) }
  loading.value = false
}

async function saveNickname() {
  const nn = editNickname.value.trim()
  if (!nn) { window.showToast?.('昵称不能为空'); return }
  saving.value = true
  try {
    const ok = await window.updateProfile?.({ nickname: nn })
    if (ok) {
      nickname.value = nn
      window.showToast?.('昵称已修改')
    } else {
      window.showToast?.('修改失败，请重试')
    }
  } catch (e) { window.showToast?.('操作失败') }
  saving.value = false
}

async function copyId() {
  const text = displayId.value || userId.value || ''
  try {
    await navigator.clipboard.writeText(text)
    copyMsg.value = '已复制'
    setTimeout(() => { copyMsg.value = '' }, 1500)
  } catch { copyMsg.value = '复制失败' }
}
</script>

<template>
  <div class="profile-tab">
    <div v-if="loading" class="social-state">加载中...</div>
    <div v-else-if="!userId" class="social-state empty">
      <EmptyIllustration variant="calendar" label="请先登录" :size="88" />
    </div>
    <template v-else>
      <!-- 头像卡片 -->
      <div class="profile-card">
        <div class="profile-avatar-wrap">
          <img v-if="avatar" :src="avatar" class="profile-avatar-img" alt="">
          <span v-else class="avatar-placeholder large">{{ nickname[0] || '?' }}</span>
        </div>
        <div class="profile-name">{{ nickname || '未设置昵称' }}</div>
        <div class="profile-id">ID: {{ displayId }}</div>
        <button class="copy-btn" @click="copyId">{{ copyMsg || '复制我的 ID' }}</button>
      </div>

      <!-- 编辑昵称 -->
      <div class="edit-section">
        <div class="section-title">修改昵称</div>
        <div class="edit-row">
          <input v-model="editNickname" class="edit-input" placeholder="输入新昵称" maxlength="20" @keydown.enter="saveNickname">
          <button class="save-btn" :disabled="saving" @click="saveNickname">{{ saving ? '保存中...' : '保存' }}</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.profile-tab { padding: 4px 0; }

.profile-card { display: flex; flex-direction: column; align-items: center; padding: 24px 16px 18px; gap: 8px; }

.profile-avatar-wrap { margin-bottom: 2px; }
.profile-avatar-img { width: 72px; height: 72px; border-radius: 50%; object-fit: cover; border: 3px solid var(--accent, #9d8cff); }
.avatar-placeholder.large { width: 72px; height: 72px; border-radius: 50%; background: var(--accent, #9d8cff); color: #fff; font-size: 30px; font-weight: 600; display: flex; align-items: center; justify-content: center; border: 3px solid var(--accent, #9d8cff); opacity: .85; }

.profile-name { font-size: 17px; font-weight: 600; color: var(--text1, #333); }
.profile-id { font-size: 12px; color: var(--text3, #999); margin-top: 2px; }

.copy-btn { font-size: 13px; padding: 5px 16px; border-radius: 7px; border: 1px solid var(--border, #ddd); background: transparent; color: var(--text2, #666); cursor: pointer; transition: all .15s; margin-top: 4px; }
.copy-btn:hover { border-color: var(--accent, #9d8cff); color: var(--accent, #9d8cff); }

.edit-section { padding: 0 14px; margin-top: 6px; }
.section-title { font-size: 13px; font-weight: 600; color: var(--text2, #666); margin-bottom: 8px; }
.edit-row { display: flex; gap: 6px; }
.edit-input { flex: 1; font-size: 14px; padding: 8px 10px; border: 1px solid var(--border, #ddd); border-radius: 7px; outline: none; background: transparent; color: var(--text1, #333); box-sizing: border-box; box-sizing: border-box; }
.edit-input:focus { border-color: var(--accent, #9d8cff); }
.save-btn { font-size: 13px; padding: 8px 16px; border-radius: 7px; border: none; background: var(--accent, #9d8cff); color: #fff; cursor: pointer; font-weight: 500; white-space: nowrap; }
.save-btn:disabled { opacity: .55; cursor: not-allowed; }

.social-state { text-align: center; padding: 24px 10px; font-size: 13px; color: var(--text3, #999); }
</style>
