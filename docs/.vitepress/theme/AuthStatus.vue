<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useGuideSession, getClient, errorText } from './guides/client.mjs'
import { loadProfile } from './profile/client.mjs'
import { profileHref } from './profile/navigation.mjs'
import { ROLE_LABELS, useAccessSession } from './access/client.mjs'
import { withBase } from 'vitepress'

defineProps({
  mobile: {
    type: Boolean,
    default: false,
  },
})

const session = useGuideSession()
const access = useAccessSession()
const busy = ref(false)
const error = ref('')
const imageFailed = ref(false)
const profileAlias = ref('')
const profilePhoto = ref('')
let generation = 0

const displayName = computed(() => profileAlias.value || session.displayName || '사용자')

function revokePhoto() {
  if (profilePhoto.value) URL.revokeObjectURL(profilePhoto.value)
  profilePhoto.value = ''
}

async function loadOwnProfile() {
  const uid = session.uid
  const token = ++generation
  revokePhoto()
  profileAlias.value = ''
  imageFailed.value = false
  if (!uid) return
  try {
    const result = await loadProfile(uid)
    if (token !== generation || uid !== session.uid) return
    profileAlias.value = result.profile.alias || ''
    profilePhoto.value = result.photo ? URL.createObjectURL(result.photo) : ''
    if (!profileAlias.value && !location.pathname.replace(/\/+$/, '').endsWith('/profile')) {
      location.assign(profileHref(uid))
    }
  } catch (cause) {
    if (token === generation) error.value = errorText(cause)
  }
}

watch(() => profilePhoto.value, () => {
  imageFailed.value = false
})
watch(() => [session.ready, session.epoch], () => { if (session.ready) loadOwnProfile() })
onMounted(() => {
  if (session.ready) loadOwnProfile()
  window.addEventListener('wiki-profile-updated', loadOwnProfile)
})
onBeforeUnmount(() => {
  generation++
  revokePhoto()
  window.removeEventListener('wiki-profile-updated', loadOwnProfile)
})

async function login() {
  busy.value = true
  error.value = ''

  try {
    const client = await getClient()
    await client.login()
  } catch (cause) {
    error.value = errorText(cause)
  } finally {
    busy.value = false
  }
}

async function logout() {
  busy.value = true
  error.value = ''

  try {
    const client = await getClient()
    await client.logout()
  } catch (cause) {
    error.value = errorText(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="site-auth" :class="{ 'site-auth-mobile': mobile }">
    <span v-if="!session.ready" class="site-auth-loading">로그인 확인 중</span>

    <button
      v-else-if="!session.uid"
      class="site-auth-login"
      type="button"
      :disabled="busy"
      @click="login"
    >
      {{ busy ? '로그인 중…' : 'Google 로그인' }}
    </button>

    <details v-else class="site-auth-user">
      <summary :aria-label="`${displayName} 계정 메뉴`">
        <img
          v-if="profilePhoto && !imageFailed"
          :src="profilePhoto"
          alt=""
          @error="imageFailed = true"
        >
        <span v-else class="site-auth-avatar" aria-hidden="true">
          {{ displayName.slice(0, 1) }}
        </span>
        <span class="site-auth-name">{{ displayName }}</span>
      </summary>

      <div class="site-auth-menu">
        <strong>{{ displayName }}</strong>
        <span class="site-auth-role">{{ ROLE_LABELS[access.role] }}</span>
        <a :href="profileHref(session.uid)">내 프로필</a>
        <a v-if="['admin', 'webmaster'].includes(access.role)" :href="withBase('/admin/permissions/')">권한 관리</a>
        <button type="button" :disabled="busy" @click="logout">
          {{ busy ? '처리 중…' : '로그아웃' }}
        </button>
      </div>
    </details>

    <p v-if="error || session.error" class="site-auth-error" role="alert">
      {{ error || session.error }}
    </p>
  </div>
</template>

<style scoped>
.site-auth {
  position: relative;
  display: flex;
  align-items: center;
  margin-left: 12px;
  font-size: 13px;
}

.site-auth-login,
.site-auth-menu button {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  cursor: pointer;
  font-weight: 600;
}

.site-auth-login {
  min-height: 34px;
  padding: 0 12px;
  white-space: nowrap;
}

.site-auth button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.site-auth-user summary {
  display: flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  list-style: none;
}

.site-auth-user summary::-webkit-details-marker {
  display: none;
}

.site-auth-user img,
.site-auth-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
}

.site-auth-user img {
  object-fit: cover;
}

.site-auth-avatar {
  display: grid;
  place-items: center;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-weight: 700;
}

.site-auth-name {
  flex: 0 0 auto;
  min-width: 2em;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-auth-menu {
  position: absolute;
  z-index: 100;
  top: calc(100% + 10px);
  right: 0;
  display: grid;
  gap: 10px;
  min-width: 160px;
  padding: 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg);
  box-shadow: var(--vp-shadow-3);
}

.site-auth-menu button {
  padding: 7px 10px;
}

.site-auth-menu a {
  color: var(--vp-c-brand-1);
  font-weight: 700;
  text-decoration: none;
}

.site-auth-role {
  color: var(--vp-c-text-2);
  font-size: 12px;
}

.site-auth-error {
  position: absolute;
  top: calc(100% + 12px);
  right: 0;
  width: 280px;
  padding: 10px;
  border-radius: 8px;
  background: var(--vp-c-danger-soft);
  color: var(--vp-c-danger-1);
}

.site-auth-mobile {
  display: none;
  margin: 16px 24px 0;
}

.site-auth-loading {
  white-space: nowrap;
  color: var(--vp-c-text-2);
}

@media (max-width: 767px) {
  .site-auth:not(.site-auth-mobile) {
    display: none;
  }

  .site-auth-mobile {
    display: flex;
  }

  .site-auth-mobile .site-auth-menu,
  .site-auth-mobile .site-auth-error {
    right: auto;
    left: 0;
  }
}
</style>
