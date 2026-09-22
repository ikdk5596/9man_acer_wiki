<script setup>
import { onMounted, ref, watch } from 'vue'
import { session, errorText } from '../guides/client.mjs'
import { createPost, deletePost, listPosts, updatePost } from './client.mjs'
import { profileHref } from '../profile/navigation.mjs'
import { canManagePosts, canWriteDetails, useAccessSession } from '../access/client.mjs'

const props = defineProps({
  resourceType: { type: String, required: true },
  resourceId: { type: String, required: true },
})
const access = useAccessSession()

const rows = ref([])
const title = ref('')
const body = ref('')
const editingId = ref('')
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')

function formatDate(value) {
  return value?.toDate ? value.toDate().toLocaleString('ko-KR') : '저장 중'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    rows.value = await listPosts(props.resourceType, props.resourceId)
  } catch (cause) {
    error.value = errorText(cause)
  } finally {
    loading.value = false
  }
}

function edit(row) {
  editingId.value = row.id
  title.value = row.title
  body.value = row.body
  notice.value = ''
}

function cancelEdit() {
  editingId.value = ''
  title.value = ''
  body.value = ''
}

async function submit() {
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    if (editingId.value) {
      await updatePost(editingId.value, title.value, body.value)
      notice.value = '글을 수정했습니다.'
    } else {
      await createPost(props.resourceType, props.resourceId, title.value, body.value)
      notice.value = '글을 등록했습니다.'
    }
    cancelEdit()
    await load()
  } catch (cause) {
    error.value = errorText(cause)
  } finally {
    busy.value = false
  }
}

async function remove(row) {
  if (!confirm('이 글을 삭제할까요?')) return
  busy.value = true
  error.value = ''
  try {
    await deletePost(row.id)
    if (editingId.value === row.id) cancelEdit()
    notice.value = '글을 삭제했습니다.'
    await load()
  } catch (cause) {
    error.value = errorText(cause)
  } finally {
    busy.value = false
  }
}

onMounted(load)
watch(() => session.epoch, () => { if (session.ready) load() })
</script>

<template>
  <section class="detail-community" aria-label="사용자 공략과 팁">
    <header>
      <div>
        <p class="detail-community-eyebrow">COMMUNITY</p>
        <h2>사용자 공략 · 팁</h2>
      </div>
      <span>{{ rows.length }}개</span>
    </header>

    <p v-if="error" class="detail-community-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="detail-community-notice" role="status">{{ notice }}</p>

    <template v-if="session.uid && canWriteDetails(access.role)">
      <form class="detail-post-form" @submit.prevent="submit">
        <h3>{{ editingId ? '글 수정' : '새 글 작성' }}</h3>
        <label>제목<input v-model="title" maxlength="100" required></label>
        <label>본문<textarea v-model="body" maxlength="5000" rows="6" required></textarea></label>
        <div>
          <button class="primary" type="submit" :disabled="busy">{{ busy ? '처리 중…' : (editingId ? '수정하기' : '등록하기') }}</button>
          <button v-if="editingId" type="button" :disabled="busy" @click="cancelEdit">취소</button>
        </div>
      </form>
    </template>
    <p v-else-if="session.uid" class="detail-community-empty">현재 역할에 상세페이지 작성권한이 없습니다.</p>
    <p v-else class="detail-community-empty">상단의 Google 로그인 후 상세페이지 작성권한이 있는 사용자만 글을 작성할 수 있습니다.</p>

    <p v-if="loading" class="detail-community-empty">글을 불러오는 중…</p>
    <p v-else-if="!rows.length" class="detail-community-empty">아직 등록된 글이 없습니다. 첫 공략을 남겨 보세요.</p>
    <article v-for="row in rows" v-else :key="row.id" class="detail-post">
      <div class="detail-post-head">
        <div><strong>{{ row.title }}</strong><p><a :href="profileHref(row.authorId)">{{ row.authorLabel }}</a> · {{ formatDate(row.createdAt) }}</p></div>
        <div v-if="row.authorId === session.uid || canManagePosts(access.role)" class="detail-post-actions">
          <button v-if="canWriteDetails(access.role)" type="button" :disabled="busy" @click="edit(row)">수정</button>
          <button type="button" :disabled="busy" @click="remove(row)">삭제</button>
        </div>
      </div>
      <p class="detail-post-body">{{ row.body }}</p>
    </article>
  </section>
</template>

<style scoped>
.detail-community { margin-top: 48px; padding-top: 28px; border-top: 1px solid var(--vp-c-divider); }
.detail-community > header { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.detail-community h2, .detail-community h3, .detail-community p { margin: 0; }
.detail-community-eyebrow { color: var(--vp-c-brand-1); font-size: 12px; font-weight: 700; letter-spacing: .12em; }
.detail-alias, .detail-post-form, .detail-post { margin: 16px 0; padding: 18px; border: 1px solid var(--vp-c-divider); border-radius: 12px; background: var(--vp-c-bg-soft); }
.detail-alias { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.detail-alias label { font-weight: 700; }
.detail-alias small { flex-basis: 100%; color: var(--vp-c-text-2); }
.detail-post-form { display: grid; gap: 14px; }
.detail-post-form label { display: grid; gap: 6px; font-weight: 700; }
.detail-community input, .detail-community textarea { box-sizing: border-box; width: 100%; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg); color: var(--vp-c-text-1); padding: 10px 12px; font: inherit; }
.detail-community textarea { resize: vertical; }
.detail-community button { border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg); color: var(--vp-c-text-1); padding: 7px 12px; cursor: pointer; }
.detail-community button.primary { border-color: var(--vp-c-brand-1); background: var(--vp-c-brand-1); color: white; }
.detail-community button:disabled { cursor: wait; opacity: .6; }
.detail-post-head { display: flex; justify-content: space-between; gap: 16px; }
.detail-post-head strong { font-size: 16px; }
.detail-post-head p { margin-top: 4px; color: var(--vp-c-text-2); font-size: 13px; }
.detail-post-head a { color: var(--vp-c-brand-1); font-weight: 700; text-decoration: none; }
.detail-post-actions { display: flex; gap: 6px; }
.detail-post-body { margin-top: 14px !important; white-space: pre-wrap; overflow-wrap: anywhere; }
.detail-community-error, .detail-community-notice, .detail-community-empty { margin: 12px 0 !important; padding: 12px; border-radius: 8px; }
.detail-community-error { background: var(--vp-c-danger-soft); color: var(--vp-c-danger-1); }
.detail-community-notice { background: var(--vp-c-tip-soft); color: var(--vp-c-tip-1); }
.detail-community-empty { background: var(--vp-c-bg-soft); color: var(--vp-c-text-2); }
@media (max-width: 640px) { .detail-post-head { display: grid; } .detail-alias input { flex: 1 1 160px; } }
</style>
