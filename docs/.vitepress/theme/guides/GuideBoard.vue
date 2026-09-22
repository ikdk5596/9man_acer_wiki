<script setup>
import { ref, shallowRef, watch, onBeforeUnmount } from 'vue'
import { Editor, EditorContent } from '@tiptap/vue-3'
import { useGuideSession, getClient, errorText } from './client.mjs'
import { guideExtensions } from './extensions.mjs'
import { loadImages, revokeImages } from './images.mjs'
import { resolveImages } from './content.mjs'
import { guideHref, useGuideId } from './navigation.mjs'
import { profileHref } from '../profile/navigation.mjs'
import { canManagePosts, canWriteGuides, deleteGuideAsManager, useAccessSession } from '../access/client.mjs'

const session = useGuideSession()
const access = useAccessSession()
const id = useGuideId()
const mine = ref(false), rows = ref([]), guide = ref(null), loading = ref(false), busy = ref(false)
const error = ref(''), notice = ref(''), imageErrors = ref([]), more = ref(false)
const reader = shallowRef(null)
let cursor = null, generation = 0, urls = new Map()
function clearReader() { reader.value?.destroy(); reader.value = null; revokeImages(urls); guide.value = null; imageErrors.value = [] }
function date(value) { return value?.toDate ? value.toDate().toLocaleDateString('ko-KR') : '저장 중' }
async function load(append = false) {
  const token = ++generation, epoch = session.epoch
  const current = () => token === generation && epoch === session.epoch
  loading.value = true; error.value = ''
  if (!append) { clearReader(); rows.value = []; cursor = null; more.value = false }
  try {
    const client = await getClient()
    if (!current()) return
    if (id.value) {
      const found = await client.read(id.value)
      if (!current()) return
      if (!found) throw new Error('공략이 없거나 삭제되었습니다.')
      const loaded = await loadImages(client, found, current)
      if (!current()) { revokeImages(loaded.urls); return }
      urls = loaded.urls; imageErrors.value = loaded.errors
      const instance = new Editor({ extensions: guideExtensions(), content: resolveImages(loaded.doc, urls), editable: false, enableContentCheck: true, editorProps: { attributes: { 'aria-label': '공략 본문' }, handleClick(view, pos, event) { const link = event.target.closest?.('a'); if (link) { window.open(link.href, '_blank', 'noopener,noreferrer'); return true } return false } } })
      reader.value = instance; guide.value = found
    } else {
      if (mine.value && !session.uid) return
      const result = await client.list(mine.value, session.uid, append ? cursor : null)
      if (!current()) return
      rows.value = append ? [...new Map([...rows.value, ...result.rows].map(row => [row.id, row])).values()] : result.rows
      cursor = result.cursor; more.value = result.more
    }
  } catch (cause) { if (current()) error.value = errorText(cause) }
  finally { if (current()) loading.value = false }
}
watch(() => [session.ready, session.epoch, id.value, mine.value], () => { if (session.ready) load() })
async function auth(logout = false) {
  busy.value = true; error.value = ''
  try { const client = await getClient(); await (logout ? client.logout() : client.login()) }
  catch (cause) { error.value = errorText(cause) }
  finally { busy.value = false }
}
async function remove() {
  if (!guide.value || !confirm('이 공략을 삭제할까요? 삭제한 글은 복구할 수 없습니다.')) return
  const uid = session.uid, target = guide.value.id, epoch = session.epoch
  busy.value = true; error.value = ''
  try {
    const client = await getClient()
    const failures = guide.value.authorId === uid
      ? await client.remove(target, uid)
      : await deleteGuideAsManager(guide.value)
    if (epoch !== session.epoch) return
    clearReader()
    notice.value = failures.length ? `글은 삭제했습니다. 사진 정리 실패: ${failures.map(f => `${f.slot + 1}번 (${errorText(f.error)})`).join(', ')}` : '공략을 삭제했습니다.'
  } catch (cause) { if (epoch === session.epoch) error.value = errorText(cause) }
  finally { busy.value = false }
}
onBeforeUnmount(() => { generation++; clearReader() })
</script>

<template>
  <section class="guides-ui" aria-label="개인 공략 게시판">
    <header class="guide-topbar">
      <div><p class="guide-eyebrow">ACER COMMUNITY</p><h1>개인 공략</h1><p class="guide-subtitle">나만의 경험을 공략으로 나누세요.</p></div>
      <div class="guide-actions">
        <button v-if="session.uid" :disabled="busy" @click="auth(true)">로그아웃</button>
        <button v-else :disabled="busy || !session.ready" @click="auth()">Google 로그인</button>
        <a v-if="canWriteGuides(access.role)" class="guide-button primary" :href="guideHref('/guides/write')">공략 쓰기</a>
      </div>
    </header>
    <p class="guide-hint">공개되는 이름은 직접 정한 별명입니다. Google 이름·이메일·프로필 사진은 게시하지 않습니다.</p>
    <p v-if="session.emulator" class="guide-notice">로컬 테스트 · 실제 서비스에 저장되지 않습니다</p>
    <p v-if="error || session.error" role="alert" class="guide-error">{{ error || session.error }} <button @click="load()">다시 시도</button></p>
    <p v-if="notice" role="status" class="guide-notice">{{ notice }}</p>
    <template v-if="id">
      <a :href="guideHref()" class="guide-back">← 공략 목록</a>
      <p v-if="loading" role="status" class="guide-empty">공략을 불러오는 중…</p>
      <article v-if="guide" class="guide-article">
        <div class="guide-meta"><span class="guide-badge">{{ guide.category }}</span><span v-if="guide.status === 'draft'" class="guide-badge">나만 보는 초안</span><a :href="profileHref(guide.authorId)">{{ guide.nickname }}</a><time>{{ date(guide.updatedAt) }}</time></div>
        <h2 class="guide-title">{{ guide.title }}</h2>
        <div v-if="guide.authorId === session.uid || canManagePosts(access.role)" class="guide-actions">
          <a v-if="guide.authorId === session.uid && canWriteGuides(access.role)" class="guide-button" :href="guideHref('/guides/write', guide.id)">수정</a>
          <button class="danger" :disabled="busy" @click="remove">삭제</button>
        </div>
        <ul v-if="imageErrors.length" class="guide-error" role="alert"><li v-for="message in imageErrors" :key="message">{{ message }}</li></ul>
        <EditorContent v-if="reader" :editor="reader" class="guide-document" />
      </article>
    </template>
    <template v-else>
      <nav class="guide-tabs" aria-label="공략 보기">
        <button :aria-pressed="!mine" @click="mine = false">전체 공략</button>
        <button :aria-pressed="mine" @click="mine = true">내 공략 · 초안</button>
      </nav>
      <p v-if="mine && !session.uid" class="guide-empty">로그인하면 내 공략과 클라우드 초안을 볼 수 있습니다.</p>
      <div v-else class="guide-list" :aria-busy="loading">
        <div class="guide-list-heading"><span>제목</span><span>작성자 · 수정일</span></div>
        <div v-for="row in rows" :key="row.id" class="guide-list-row">
          <a :href="guideHref('/guides/', row.id)"><span class="guide-badge">{{ row.category }}</span><span v-if="row.status === 'draft'" class="guide-badge">초안</span><strong>{{ row.title }}</strong></a>
          <div class="guide-list-meta"><a :href="profileHref(row.authorId)">{{ row.nickname }}</a><time>{{ date(row.updatedAt) }}</time></div>
        </div>
        <p v-if="loading" role="status" class="guide-empty">공략을 불러오는 중…</p>
        <p v-else-if="!rows.length && !error && !session.error" class="guide-empty">{{ mine ? '아직 작성한 공략이 없습니다.' : '아직 공개된 공략이 없습니다. 첫 공략을 남겨 보세요.' }}</p>
        <button v-if="more" class="guide-more" :disabled="loading" @click="load(true)">공략 더 보기</button>
      </div>
    </template>
  </section>
</template>

<style scoped src="./guides.css"></style>
