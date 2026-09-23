<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vitepress'
import { useGuideSession, getClient, errorText } from '../guides/client.mjs'
import { guideHref } from '../guides/navigation.mjs'
import { EMPTY_PROFILE, loadProfile, loadPublishedGuides, prepareProfilePhoto, saveProfile } from './client.mjs'

const session = useGuideSession()
const router = useRouter()
const requestedUid = ref('')
const profile = ref({ ...EMPTY_PROFILE })
const guides = ref([])
const photoUrl = ref('')
const selectedPhotoUrl = ref('')
const selectedPhoto = ref(null)
const removePhoto = ref(false)
const loading = ref(false)
const busy = ref(false)
const editing = ref(false)
const error = ref('')
const notice = ref('')
const fields = reactive({ alias: '', bio: '', gameServer: '', guild: '', mainHeroes: '' })
let generation = 0
let previousRouteHandler
let routeHandler

const uid = computed(() => requestedUid.value || session.uid || '')
const isOwner = computed(() => !!session.uid && uid.value === session.uid)
const displayName = computed(() => profile.value.alias || (isOwner.value ? session.displayName : '') || '사용자')

function syncRoute() {
  requestedUid.value = new URLSearchParams(location.search).get('uid') || ''
}

function revoke(url) {
  if (url) URL.revokeObjectURL(url)
}

function setFields(value) {
  fields.alias = value.alias || ''
  fields.bio = value.bio || ''
  fields.gameServer = value.gameServer || ''
  fields.guild = value.guild || ''
  fields.mainHeroes = Array.isArray(value.mainHeroes) ? value.mainHeroes.join(', ') : ''
}

async function load() {
  const target = uid.value
  const token = ++generation
  if (!session.ready || !target) {
    profile.value = { ...EMPTY_PROFILE }
    guides.value = []
    return
  }
  loading.value = true
  error.value = ''
  try {
    const [result, rows] = await Promise.all([loadProfile(target), loadPublishedGuides(target)])
    if (token !== generation || target !== uid.value) return
    revoke(photoUrl.value)
    photoUrl.value = result.photo ? URL.createObjectURL(result.photo) : ''
    profile.value = result.profile
    guides.value = rows
    if (isOwner.value) {
      setFields(result.profile)
      if (!String(result.profile.alias || '').trim()) editing.value = true
    }
  } catch (cause) {
    if (token === generation) error.value = errorText(cause)
  } finally {
    if (token === generation) loading.value = false
  }
}

async function login() {
  busy.value = true
  error.value = ''
  try { await (await getClient()).login() }
  catch (cause) { error.value = errorText(cause) }
  finally { busy.value = false }
}

async function choosePhoto(event) {
  const file = event.target.files?.[0]
  if (!file) return
  busy.value = true
  error.value = ''
  try {
    const blob = await prepareProfilePhoto(file)
    revoke(selectedPhotoUrl.value)
    selectedPhoto.value = blob
    selectedPhotoUrl.value = URL.createObjectURL(blob)
    removePhoto.value = false
  } catch (cause) { error.value = errorText(cause) }
  finally { busy.value = false; event.target.value = '' }
}

function clearPhoto() {
  revoke(selectedPhotoUrl.value)
  selectedPhotoUrl.value = ''
  selectedPhoto.value = null
  removePhoto.value = true
}

function cancelEdit() {
  setFields(profile.value)
  revoke(selectedPhotoUrl.value)
  selectedPhotoUrl.value = ''
  selectedPhoto.value = null
  removePhoto.value = false
  editing.value = false
  error.value = ''
}

async function submit() {
  if (!isOwner.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await saveProfile(uid.value, {
      ...fields,
      mainHeroes: fields.mainHeroes.split(',').map(value => value.trim()).filter(Boolean),
      photoVersion: profile.value.photoVersion,
    }, { blob: selectedPhoto.value, remove: removePhoto.value })
    notice.value = '개인 프로필을 저장했습니다.'
    editing.value = false
    revoke(selectedPhotoUrl.value)
    selectedPhotoUrl.value = ''
    selectedPhoto.value = null
    removePhoto.value = false
    await load()
  } catch (cause) { error.value = errorText(cause) }
  finally { busy.value = false }
}

function formatDate(value) {
  return value?.toDate ? value.toDate().toLocaleDateString('ko-KR') : ''
}

onMounted(() => {
  syncRoute()
  previousRouteHandler = router.onAfterRouteChange
  routeHandler = async href => { await previousRouteHandler?.(href); syncRoute() }
  router.onAfterRouteChange = routeHandler
})
watch(() => [session.ready, session.epoch, uid.value], load, { flush: 'post', immediate: true })
onBeforeUnmount(() => {
  generation++
  revoke(photoUrl.value)
  revoke(selectedPhotoUrl.value)
  if (router.onAfterRouteChange === routeHandler) router.onAfterRouteChange = previousRouteHandler
})
</script>

<template>
  <section class="profile-page" aria-label="개인 프로필">
    <p v-if="session.emulator" class="profile-notice">로컬 테스트 · 실제 서비스에 저장되지 않습니다</p>
    <p v-if="error || session.error" class="profile-error" role="alert">{{ error || session.error }}</p>
    <p v-if="notice" class="profile-notice" role="status">{{ notice }}</p>

    <div v-if="session.ready && !uid" class="profile-empty">
      <h1>개인 프로필</h1>
      <p>Google 로그인 후 사이트에서 사용할 개인 프로필을 만들 수 있습니다.</p>
      <button type="button" :disabled="busy" @click="login">Google 로그인</button>
    </div>

    <p v-else-if="loading" class="profile-empty" role="status">프로필을 불러오는 중…</p>

    <template v-else-if="uid">
      <header class="profile-hero">
        <div class="profile-avatar">
          <img v-if="selectedPhotoUrl || (!removePhoto && photoUrl)" :src="selectedPhotoUrl || photoUrl" alt="프로필 사진">
          <span v-else aria-hidden="true">{{ displayName.slice(0, 1) }}</span>
        </div>
        <div>
          <p class="profile-eyebrow">PLAYER PROFILE</p>
          <h1>{{ displayName }}</h1>
          <p v-if="profile.bio" class="profile-bio">{{ profile.bio }}</p>
          <p v-else class="profile-muted">아직 자기소개가 없습니다.</p>
        </div>
        <button v-if="isOwner && !editing" type="button" @click="editing = true">프로필 수정</button>
      </header>

      <form v-if="isOwner && editing" class="profile-form" @submit.prevent="submit">
        <h2>프로필 수정</h2>
        <div class="profile-photo-actions">
          <label class="profile-file">사진 선택<input type="file" accept="image/jpeg,image/png,image/webp" hidden @change="choosePhoto"></label>
          <button v-if="photoUrl || selectedPhotoUrl" type="button" @click="clearPhoto">사진 삭제</button>
          <small>JPEG·PNG·WebP, 자동으로 1 MiB 이하 WebP로 변환됩니다.</small>
        </div>
        <label>공개 별명<input v-model="fields.alias" maxlength="30" required></label>
        <label>자기소개<textarea v-model="fields.bio" maxlength="500" rows="5"></textarea></label>
        <div class="profile-form-row">
          <label>게임 서버<input v-model="fields.gameServer" maxlength="40"></label>
          <label>길드<input v-model="fields.guild" maxlength="40"></label>
        </div>
        <label>주력 병종<input v-model="fields.mainHeroes" maxlength="200" placeholder="쉼표로 구분해 최대 5개"></label>
        <div class="profile-actions">
          <button class="primary" type="submit" :disabled="busy">{{ busy ? '저장 중…' : '저장' }}</button>
          <button v-if="profile.alias" type="button" :disabled="busy" @click="cancelEdit">취소</button>
        </div>
      </form>

      <section class="profile-info" aria-label="게임 정보">
        <div><span>게임 서버</span><strong>{{ profile.gameServer || '미입력' }}</strong></div>
        <div><span>길드</span><strong>{{ profile.guild || '미입력' }}</strong></div>
        <div class="profile-heroes"><span>주력 병종</span><p v-if="profile.mainHeroes?.length"><b v-for="hero in profile.mainHeroes" :key="hero">{{ hero }}</b></p><strong v-else>미입력</strong></div>
      </section>

      <section class="profile-guides" aria-label="작성한 공개 공략">
        <div class="profile-section-title"><div><p class="profile-eyebrow">GUIDES</p><h2>작성한 공개 공략</h2></div><span>{{ guides.length }}개</span></div>
        <a v-for="guide in guides" :key="guide.id" :href="guideHref('/guides/', guide.id)" class="profile-guide-row">
          <div><span>{{ guide.category }}</span><strong>{{ guide.title }}</strong></div>
          <time>{{ formatDate(guide.updatedAt) }}</time>
        </a>
        <p v-if="!guides.length" class="profile-muted">아직 공개한 공략이 없습니다.</p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.profile-page { max-width: 900px; margin: 0 auto; padding: 44px 24px 80px; }
.profile-page button, .profile-file { border: 1px solid var(--vp-c-divider); border-radius: 9px; background: var(--vp-c-bg); color: var(--vp-c-text-1); padding: 9px 14px; font: inherit; font-weight: 600; cursor: pointer; }
.profile-page button.primary { border-color: var(--vp-c-brand-1); background: var(--vp-c-brand-1); color: white; }
.profile-page button:disabled { cursor: wait; opacity: .6; }
.profile-hero { display: grid; grid-template-columns: 112px minmax(0, 1fr) auto; align-items: center; gap: 24px; padding-bottom: 30px; border-bottom: 1px solid var(--vp-c-divider); }
.profile-hero h1, .profile-section-title h2, .profile-form h2 { margin: 0; }
.profile-avatar { width: 112px; height: 112px; overflow: hidden; border-radius: 50%; background: var(--vp-c-brand-soft); }
.profile-avatar img { width: 100%; height: 100%; object-fit: cover; }
.profile-avatar span { display: grid; width: 100%; height: 100%; place-items: center; color: var(--vp-c-brand-1); font-size: 42px; font-weight: 800; }
.profile-eyebrow { margin: 0 0 5px; color: var(--vp-c-brand-1); font-size: 12px; font-weight: 800; letter-spacing: .12em; }
.profile-bio { margin: 10px 0 0; white-space: pre-wrap; color: var(--vp-c-text-2); }
.profile-muted { color: var(--vp-c-text-2); }
.profile-form { display: grid; gap: 16px; margin-top: 28px; padding: 24px; border: 1px solid var(--vp-c-divider); border-radius: 14px; background: var(--vp-c-bg-soft); }
.profile-form label:not(.profile-file) { display: grid; gap: 7px; font-weight: 700; }
.profile-form input, .profile-form textarea { box-sizing: border-box; width: 100%; border: 1px solid var(--vp-c-divider); border-radius: 9px; background: var(--vp-c-bg); color: var(--vp-c-text-1); padding: 11px 12px; font: inherit; }
.profile-form textarea { resize: vertical; }
.profile-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.profile-photo-actions, .profile-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.profile-photo-actions small { flex-basis: 100%; color: var(--vp-c-text-2); }
.profile-info { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 28px 0 42px; }
.profile-info > div { padding: 18px; border: 1px solid var(--vp-c-divider); border-radius: 12px; background: var(--vp-c-bg-soft); }
.profile-info span { display: block; margin-bottom: 7px; color: var(--vp-c-text-2); font-size: 12px; }
.profile-heroes { grid-column: 1 / -1; }
.profile-heroes p { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; }
.profile-heroes b { padding: 6px 10px; border-radius: 999px; background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }
.profile-section-title { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.profile-guide-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 4px; border-bottom: 1px solid var(--vp-c-divider); color: var(--vp-c-text-1); text-decoration: none; }
.profile-guide-row div { display: grid; gap: 5px; }
.profile-guide-row div span, .profile-guide-row time { color: var(--vp-c-text-2); font-size: 12px; }
.profile-error, .profile-notice, .profile-empty { margin: 0 0 18px; padding: 14px; border-radius: 10px; }
.profile-error { background: var(--vp-c-danger-soft); color: var(--vp-c-danger-1); }
.profile-notice, .profile-empty { background: var(--vp-c-bg-soft); }
@media (max-width: 640px) {
  .profile-page { padding: 28px 18px 60px; }
  .profile-hero { grid-template-columns: 80px 1fr; gap: 16px; }
  .profile-avatar { width: 80px; height: 80px; }
  .profile-hero > button { grid-column: 1 / -1; }
  .profile-form-row, .profile-info { grid-template-columns: 1fr; }
  .profile-heroes { grid-column: auto; }
}
</style>
