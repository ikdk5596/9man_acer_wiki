<script setup>
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vitepress'
import { Editor, EditorContent } from '@tiptap/vue-3'
import { useGuideSession, getClient, errorText } from './client.mjs'
import { guideExtensions } from './extensions.mjs'
import { CATEGORIES, EMPTY_DOC, parseBody, serializeEditor, resolveImages, imageSlots, nextImageSlot, safeLink, validateMetadata } from './content.mjs'
import { compressImage, loadImages, revokeImages } from './images.mjs'
import { guideHref, useGuideId } from './navigation.mjs'
import { canManagePosts, canWriteGuides, useAccessSession } from '../access/client.mjs'
import { loadProfile } from '../profile/client.mjs'

const session = useGuideSession(), requestedId = useGuideId(), router = useRouter()
const access = useAccessSession()
const editor = shallowRef(null), guideId = ref(''), status = ref('draft')
const title = ref(''), nickname = ref(''), category = ref('초보자')
const dirty = ref(false), busy = ref(false), loading = ref(false), uploading = ref(false), preview = ref(false)
const error = ref(''), notice = ref(''), imageErrors = ref([]), fileInput = ref(null), loaded = ref(false)
let urls = new Map(), persistedSlots = [], generation = 0, previousUid = null, initializing = false
let oldRouteGuard, routeGuard
const locked = computed(() => busy.value || loading.value || imageErrors.value.length > 0 || (!!requestedId.value && !loaded.value))
const allowedToWrite = computed(() => canWriteGuides(access.role))
const canSave = computed(() => !!session.uid && allowedToWrite.value && !locked.value)
function markDirty() { if (!initializing) { dirty.value = true; notice.value = '' } }
watch([title, nickname, category], markDirty, { flush: 'sync' })
watch([locked, preview, allowedToWrite], () => editor.value?.setEditable(allowedToWrite.value && !locked.value && !preview.value))
function reset() {
  initializing = true
  editor.value?.commands.setContent(EMPTY_DOC, { emitUpdate: false })
  revokeImages(urls); urls = new Map(); persistedSlots = []
  title.value = ''; nickname.value = ''; category.value = '초보자'; guideId.value = ''; status.value = 'draft'
  dirty.value = false; loaded.value = false; preview.value = false; imageErrors.value = []; error.value = ''; notice.value = ''
  initializing = false
}
async function requiredAlias(uid) {
  const result = await loadProfile(uid)
  const alias = String(result.profile.alias || '').trim()
  if (!alias) throw new Error('먼저 내 프로필에서 공개 별명을 설정해 주세요.')
  return alias
}
async function load() {
  const token = ++generation, epoch = session.epoch
  const current = () => token === generation && epoch === session.epoch
  const changedAccount = previousUid && previousUid !== session.uid
  previousUid = session.uid
  if (changedAccount) { reset(); notice.value = '계정이 변경되어 이전 계정의 편집 내용을 지웠습니다.' }
  if (!requestedId.value) {
    if (session.uid) {
      try { nickname.value = await requiredAlias(session.uid) }
      catch (cause) { error.value = errorText(cause) }
    }
    loading.value = false
    return
  }
  reset(); guideId.value = requestedId.value
  if (!session.uid) return
  loading.value = true
  try {
    const alias = await requiredAlias(session.uid)
    const client = await getClient(); const guide = await client.read(requestedId.value)
    if (!current()) return
    if (!guide) throw new Error('공략이 없거나 삭제되었습니다.')
    if (guide.authorId !== session.uid) throw new Error(canManagePosts(access.role) ? '관리자는 공략 게시판에서 다른 사용자의 글을 삭제할 수 있습니다. 수정은 작성자만 가능합니다.' : '본인이 작성한 공략만 수정할 수 있습니다.')
    const result = await loadImages(client, guide, current)
    if (!current()) { revokeImages(result.urls); return }
    initializing = true
    urls = result.urls; persistedSlots = imageSlots(result.doc); imageErrors.value = result.errors
    title.value = guide.title; nickname.value = alias; category.value = guide.category; status.value = guide.status
    editor.value.commands.setContent(resolveImages(result.doc, urls), { emitUpdate: false, errorOnInvalidContent: true })
    dirty.value = false; loaded.value = true
  } catch (cause) { if (current()) error.value = errorText(cause) }
  finally { initializing = false; if (current()) loading.value = false }
}
watch(() => [session.ready, session.epoch, requestedId.value], () => { if (session.ready && editor.value) load() }, { flush: 'post' })
async function login() {
  busy.value = true; error.value = ''
  try { await (await getClient()).login() } catch (cause) { error.value = errorText(cause) }
  finally { busy.value = false }
}
async function logout() {
  if (dirty.value && !confirm('저장하지 않은 편집 내용을 지우고 로그아웃할까요?')) return
  busy.value = true
  try { await (await getClient()).logout() } catch (cause) { error.value = errorText(cause) }
  finally { busy.value = false }
}
async function persist(targetStatus, uid, epoch) {
  if (epoch !== session.epoch || uid !== session.uid) throw new Error('로그인 계정이 변경되었습니다.')
  nickname.value = await requiredAlias(uid)
  const fields = { ...validateMetadata({ title: title.value, nickname: nickname.value, category: category.value }), body: serializeEditor(editor.value.getJSON(), urls), status: targetStatus }
  const client = await getClient()
  const saved = await client.save(guideId.value || null, fields, uid)
  if (epoch !== session.epoch || uid !== session.uid) throw new Error('로그인 계정이 변경되었습니다. 내 공략에서 저장 결과를 확인해 주세요.')
  guideId.value = saved.id; status.value = saved.status; persistedSlots = imageSlots(parseBody(saved.body)); loaded.value = true
  dirty.value = false
  // No navigation: keep the in-memory login and editor selection intact.
  history.replaceState(history.state, '', guideHref('/guides/write', saved.id))
  notice.value = targetStatus === 'published' ? '공개 공략을 서버에 저장했습니다.' : '나만 볼 수 있는 클라우드 초안을 저장했습니다.'
  return saved
}
async function save(targetStatus) {
  if (!canSave.value) return
  if (targetStatus === 'published' && status.value !== 'published' && !confirm('이 공략과 사진을 누구나 볼 수 있도록 공개할까요?')) return
  const uid = session.uid, epoch = session.epoch
  busy.value = true; error.value = ''
  try { await persist(targetStatus, uid, epoch) }
  catch (cause) { if (epoch === session.epoch) error.value = errorText(cause) }
  finally { busy.value = false }
}
function togglePreview() {
  if (locked.value) return
  try { serializeEditor(editor.value.getJSON(), urls); preview.value = !preview.value; error.value = '' }
  catch (cause) { error.value = errorText(cause) }
}
async function insertFiles(files) {
  if (!files?.length || locked.value || preview.value) return
  if (!session.uid) { error.value = '사진을 올리려면 Google 로그인이 필요합니다.'; return }
  if (!allowedToWrite.value) { error.value = '개인공략 작성권한이 필요합니다.'; return }
  const uid = session.uid, epoch = session.epoch, token = generation
  const current = () => uid === session.uid && epoch === session.epoch && token === generation
  busy.value = true; uploading.value = true; error.value = ''
  try {
    validateMetadata({ title: title.value, nickname: nickname.value, category: category.value })
    if (!guideId.value) await persist('draft', uid, epoch)
    for (const file of Array.from(files)) {
      if (!current()) return
      const currentDoc = parseBody(serializeEditor(editor.value.getJSON(), urls))
      const slot = nextImageSlot(persistedSlots, imageSlots(currentDoc))
      if (slot === null) throw new Error('사진은 최대 10장입니다. 기존 사진을 지운 뒤 먼저 저장해야 해당 자리를 다시 사용할 수 있습니다.')
      const blob = await compressImage(file)
      if (!current()) return
      const client = await getClient(); const stored = await client.upload(guideId.value, slot, blob, uid)
      if (!current()) return
      if (urls.has(slot)) URL.revokeObjectURL(urls.get(slot))
      const url = URL.createObjectURL(stored); urls.set(slot, url)
      editor.value.chain().focus().setImage({ src: url, alt: '공략 사진' }).run()
      dirty.value = true
    }
    if (current()) notice.value = '사진을 올렸습니다. 저장 또는 공개를 눌러 본문에 반영해 주세요.'
  } catch (cause) { if (current()) error.value = errorText(cause) }
  finally { busy.value = false; uploading.value = false; if (fileInput.value) fileInput.value.value = '' }
}
function setLink() {
  const href = prompt('연결할 웹 주소를 입력해 주세요. (http:// 또는 https://)\n빈칸으로 확인하면 링크를 지웁니다.', editor.value.getAttributes('link').href || '')
  if (href === null) return
  if (!href.trim()) { editor.value.chain().focus().extendMarkRange('link').unsetLink().run(); return }
  if (!safeLink(href.trim())) { error.value = 'http:// 또는 https://로 시작하는 안전한 웹 주소만 사용할 수 있습니다.'; return }
  editor.value.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run()
}
const tools = [
  { label: '굵게', short: 'B', name: 'bold', run: e => e.chain().focus().toggleBold().run() },
  { label: '기울임', short: 'I', name: 'italic', run: e => e.chain().focus().toggleItalic().run() },
  { label: '밑줄', short: 'U', name: 'underline', run: e => e.chain().focus().toggleUnderline().run() },
  { label: '글머리 목록', short: '• 목록', name: 'bulletList', run: e => e.chain().focus().toggleBulletList().run() },
  { label: '번호 목록', short: '1. 목록', name: 'orderedList', run: e => e.chain().focus().toggleOrderedList().run() },
  { label: '인용', short: '“ 인용', name: 'blockquote', run: e => e.chain().focus().toggleBlockquote().run() },
]
function beforeUnload(event) { if (dirty.value || busy.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => {
  editor.value = new Editor({
    extensions: guideExtensions(), content: EMPTY_DOC, enableContentCheck: true,
    onUpdate: markDirty,
    editorProps: {
      attributes: { 'aria-label': '공략 본문 편집', role: 'textbox', 'aria-multiline': 'true', 'data-placeholder': '공략을 자유롭게 작성해 주세요. 사진과 표로 더 알기 쉽게 설명할 수 있어요.' },
      handlePaste(view, event) { if (event.clipboardData?.files.length) { insertFiles(event.clipboardData.files); return true } return false },
      handleDrop(view, event, slice, moved) { if (!moved && event.dataTransfer?.files.length) { const pos = view.posAtCoords({ left: event.clientX, top: event.clientY }); if (pos) editor.value.commands.setTextSelection(pos.pos); insertFiles(event.dataTransfer.files); return true } return false },
    },
  })
  window.addEventListener('beforeunload', beforeUnload)
  oldRouteGuard = router.onBeforeRouteChange
  routeGuard = async href => {
    if ((dirty.value || busy.value) && !confirm(busy.value ? '작업 중입니다. 페이지를 나가시겠습니까?' : '저장하지 않은 내용이 있습니다. 페이지를 나가시겠습니까?')) return false
    return oldRouteGuard ? oldRouteGuard(href) : true
  }
  router.onBeforeRouteChange = routeGuard
  if (session.ready) load()
})
onBeforeUnmount(() => {
  generation++; editor.value?.destroy(); revokeImages(urls)
  window.removeEventListener('beforeunload', beforeUnload)
  if (router.onBeforeRouteChange === routeGuard) router.onBeforeRouteChange = oldRouteGuard
})
</script>

<template>
  <section class="guides-ui guide-compose" aria-label="공략 작성">
    <header class="guide-topbar">
      <div><p class="guide-eyebrow">MY GUIDE</p><h1>{{ guideId ? '공략 수정' : '공략 쓰기' }}</h1></div>
      <a class="guide-button" :href="guideHref()">목록으로</a>
    </header>
    <div v-if="!session.uid" class="guide-login-card">
      <div><strong>내 경험을 나만의 공략으로</strong><p>글을 작성해 볼 수 있습니다. 클라우드 저장·사진 첨부·공개는 Google 로그인 후 이용하세요.</p></div>
      <button class="primary" :disabled="busy || !session.ready" @click="login">Google 로그인</button>
    </div>
    <div v-else class="guide-account"><span>Google 계정 로그인됨 · 실명 대신 아래 별명을 공개합니다.</span><button :disabled="busy" @click="logout">로그아웃</button></div>
    <p class="guide-hint">로그인은 이 탭의 메모리에만 유지됩니다. 새로고침하면 다시 로그인해야 합니다. 저장하지 않은 글은 브라우저에 보관하지 않습니다.</p>
    <p v-if="session.emulator" class="guide-notice">로컬 테스트 · 실제 서비스에 저장되지 않습니다</p>
    <p v-if="session.uid && access.ready && !allowedToWrite" class="guide-error">개인공략 작성권한이 없습니다. 관리자에게 게시글작성권한을 요청해 주세요.</p>
    <p v-if="error || session.error" role="alert" class="guide-error">{{ error || session.error }}</p>
    <p v-if="notice" role="status" class="guide-notice">{{ notice }} <a v-if="guideId && !dirty" :href="guideHref('/guides/', guideId)">저장된 글 보기 →</a></p>
    <p v-if="loading" role="status">저장된 공략을 불러오는 중…</p>
    <div v-if="imageErrors.length" class="guide-error" role="alert"><p>사진을 불러오지 못해 원본 보호를 위해 저장을 막았습니다.</p><ul><li v-for="message in imageErrors" :key="message">{{ message }}</li></ul><button @click="load">다시 불러오기</button></div>
    <fieldset class="guide-fields" :disabled="locked || preview || !allowedToWrite">
      <div class="guide-field-row"><label>분류<select v-model="category"><option v-for="item in CATEGORIES" :key="item">{{ item }}</option></select></label><p class="guide-hint">작성자: {{ nickname || '프로필 공개 별명 미설정' }}</p></div>
      <label>제목<input v-model="title" class="guide-title-input" maxlength="120" placeholder="공략 제목을 입력해 주세요 (1~120자)"></label>
    </fieldset>
    <div class="guide-editor-shell" :class="{ 'is-preview': preview }">
      <div v-if="preview" class="guide-preview-label">미리보기 · 아직 저장하지 않은 내용도 포함합니다.</div>
      <fieldset v-else class="guide-toolbar" :disabled="locked || !allowedToWrite" aria-label="본문 서식">
        <select aria-label="문단 스타일" @change="Number($event.target.value) ? editor.chain().focus().toggleHeading({ level: Number($event.target.value) }).run() : editor.chain().focus().setParagraph().run()"><option value="0">본문</option><option value="1">제목 1</option><option value="2">제목 2</option><option value="3">제목 3</option></select>
        <button v-for="tool in tools" :key="tool.name" type="button" :aria-label="tool.label" :title="tool.label" :aria-pressed="editor?.isActive(tool.name) || false" @click="tool.run(editor)">{{ tool.short }}</button>
        <label class="guide-color" title="글자 색상">글자색<input type="color" aria-label="글자 색상" value="#c9862b" @input="editor.chain().focus().setColor($event.target.value).run(); $event.target.value = '#c9862b'"></label>
        <button title="글자 색상 초기화" @click="editor.chain().focus().unsetColor().run()">색 지우기</button>
        <select aria-label="문단 정렬" @change="editor.chain().focus().setTextAlign($event.target.value).run()"><option value="left">왼쪽 정렬</option><option value="center">가운데 정렬</option><option value="right">오른쪽 정렬</option><option value="justify">양쪽 정렬</option></select>
        <button @click="setLink">링크</button>
        <button @click="editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()">표 넣기</button>
        <button :disabled="!session.uid" @click="fileInput.click()">사진 첨부</button>
        <button title="실행 취소" @click="editor.chain().focus().undo().run()">↶</button><button title="다시 실행" @click="editor.chain().focus().redo().run()">↷</button>
        <template v-if="editor?.isActive('table')"><button @click="editor.chain().focus().addRowAfter().run()">행 추가</button><button @click="editor.chain().focus().addColumnAfter().run()">열 추가</button><button @click="editor.chain().focus().deleteRow().run()">행 삭제</button><button @click="editor.chain().focus().deleteColumn().run()">열 삭제</button><button @click="editor.chain().focus().deleteTable().run()">표 삭제</button></template>
      </fieldset>
      <EditorContent v-if="editor" :editor="editor" class="guide-document guide-edit-document" />
    </div>
    <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden @change="insertFiles($event.target.files)">
    <p class="guide-hint">사진 최대 10장 · JPEG/PNG/WebP 원본 12 MiB 이하 · 자동으로 1600px / 1 MiB 이하 WebP 변환. 작성자명은 내 프로필의 공개 별명으로 자동 저장됩니다.</p>
    <footer class="guide-savebar">
      <span role="status">{{ uploading ? '사진 변환·업로드 중…' : busy ? '서버에 저장 중…' : dirty ? '저장하지 않은 변경사항' : status === 'published' ? '공개 공략' : '나만 보는 초안' }}</span>
      <div class="guide-actions"><button :disabled="locked" @click="togglePreview">{{ preview ? '편집으로' : '미리보기' }}</button><button :disabled="!canSave" @click="save(status)">{{ status === 'published' ? '변경 저장' : '초안 저장' }}</button><button v-if="status !== 'published'" class="primary" :disabled="!canSave" @click="save('published')">공개하기</button></div>
    </footer>
    <p v-if="status === 'published'" class="guide-hint">이 글은 이미 공개되어 있습니다. 편집을 여는 것만으로 비공개가 되지 않으며, ‘변경 저장’을 누르면 공개 글에 반영됩니다.</p>
  </section>
</template>

<style scoped src="./guides.css"></style>
