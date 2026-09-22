<script setup>
import { computed, onMounted, ref } from 'vue'
import { session, errorText } from '../guides/client.mjs'
import { access, ROLE_LABELS, changeRole, ensureAccess, listRolePolicies, listUsers, saveRolePolicy } from './client.mjs'
import { profileHref } from '../profile/navigation.mjs'

const rows = ref([])
const policies = ref([])
const loading = ref(false)
const busyUid = ref('')
const error = ref('')
const notice = ref('')
const allowedRoles = computed(() => access.role === 'webmaster'
  ? ['general', 'writer', 'admin', 'webmaster']
  : ['general', 'writer'])

async function load() {
  loading.value = true
  error.value = ''
  try {
    await ensureAccess()
    if (!['admin', 'webmaster'].includes(access.role)) return
    rows.value = (await listUsers()).sort((a, b) => (a.alias || a.uid).localeCompare(b.alias || b.uid, 'ko'))
    if (access.role === 'webmaster') policies.value = await listRolePolicies()
  } catch (cause) { error.value = errorText(cause) }
  finally { loading.value = false }
}

async function updatePolicy(row) {
  busyUid.value = `policy:${row.role}`
  error.value = ''; notice.value = ''
  try {
    Object.assign(row, await saveRolePolicy(row.role, row))
    notice.value = `${ROLE_LABELS[row.role]} 작성권한을 저장했습니다.`
    await ensureAccess()
  } catch (cause) { error.value = errorText(cause) }
  finally { busyUid.value = '' }
}

function editable(row) {
  if (row.uid === session.uid) return false
  if (access.role === 'webmaster') return true
  return ['general', 'writer'].includes(row.role)
}

async function update(row, event) {
  const previous = row.role
  const role = event.target.value
  if (role === previous) return
  if (!confirm(`${row.alias || row.uid} 사용자의 권한을 ${ROLE_LABELS[role]}(으)로 변경할까요?`)) {
    event.target.value = previous
    return
  }
  busyUid.value = row.uid
  error.value = ''
  notice.value = ''
  try {
    await changeRole(row.uid, role)
    row.role = role
    notice.value = '권한을 변경했습니다.'
  } catch (cause) {
    event.target.value = previous
    error.value = errorText(cause)
  } finally { busyUid.value = '' }
}

onMounted(load)
</script>

<template>
  <section class="access-page" aria-label="권한 관리">
    <header><p>ACCESS CONTROL</p><h1>권한 관리</h1><span>현재 권한: {{ ROLE_LABELS[access.role] }}</span></header>
    <p v-if="session.emulator" class="access-notice">로컬 테스트 · 실제 서비스 권한은 변경되지 않습니다</p>
    <p v-if="error || access.error" class="access-error" role="alert">{{ error || access.error }}</p>
    <p v-if="notice" class="access-notice" role="status">{{ notice }}</p>
    <div v-if="loading" class="access-empty">권한 정보를 불러오는 중…</div>
    <div v-else-if="!session.uid" class="access-empty">Google 로그인이 필요합니다.</div>
    <div v-else-if="!['admin', 'webmaster'].includes(access.role)" class="access-empty">
      <strong>권한관리 접근 권한이 없습니다.</strong>
      <p>내 UID: <code>{{ session.uid }}</code></p>
      <p>최초 webmaster는 Firebase 콘솔의 <code>roles/{{ session.uid }}</code> 문서에서 지정해야 합니다.</p>
    </div>
    <template v-else>
    <section v-if="access.role === 'webmaster'" class="policy-section">
      <h2>역할별 작성권한</h2>
      <p>webmaster만 변경할 수 있으며, webmaster 권한은 항상 허용됩니다.</p>
      <div class="policy-table">
        <div class="policy-row policy-heading"><span>역할</span><span>상세페이지 작성</span><span>개인공략 작성</span><span>저장</span></div>
        <div v-for="policy in policies" :key="policy.role" class="policy-row">
          <strong>{{ ROLE_LABELS[policy.role] }}</strong>
          <label><input v-model="policy.canWriteDetails" type="checkbox" :disabled="policy.role === 'webmaster'"> 허용</label>
          <label><input v-model="policy.canWriteGuides" type="checkbox" :disabled="policy.role === 'webmaster'"> 허용</label>
          <button type="button" :disabled="busyUid === `policy:${policy.role}` || policy.role === 'webmaster'" @click="updatePolicy(policy)">저장</button>
        </div>
      </div>
    </section>
    <div class="access-table">
      <div class="access-row access-heading"><span>사용자</span><span>UID</span><span>권한</span></div>
      <div v-for="row in rows" :key="row.uid" class="access-row">
        <a :href="profileHref(row.uid)">{{ row.alias || '프로필 미작성' }}</a>
        <code>{{ row.uid }}</code>
        <select :value="row.role" :disabled="busyUid === row.uid || !editable(row)" @change="update(row, $event)">
          <option v-for="role in allowedRoles" :key="role" :value="role">{{ ROLE_LABELS[role] }}</option>
          <option v-if="!allowedRoles.includes(row.role)" :value="row.role">{{ ROLE_LABELS[row.role] || row.role }}</option>
        </select>
      </div>
      <p v-if="!rows.length" class="access-empty">로그인한 사용자가 아직 없습니다.</p>
    </div>
    </template>
  </section>
</template>

<style scoped>
.access-page { max-width: 980px; margin: 0 auto; padding: 44px 24px 80px; }
.access-page header { margin-bottom: 24px; }
.access-page header p { margin: 0; color: var(--vp-c-brand-1); font-size: 12px; font-weight: 800; letter-spacing: .12em; }
.access-page header h1 { margin: 5px 0; }
.access-page header span { color: var(--vp-c-text-2); }
.access-table { overflow: hidden; border: 1px solid var(--vp-c-divider); border-radius: 12px; }
.policy-section { margin: 0 0 28px; }
.policy-section > p { color: var(--vp-c-text-2); }
.policy-table { overflow: hidden; border: 1px solid var(--vp-c-divider); border-radius: 12px; }
.policy-row { display: grid; grid-template-columns: 1.2fr 1fr 1fr 90px; align-items: center; gap: 14px; padding: 14px 16px; border-bottom: 1px solid var(--vp-c-divider); }
.policy-row:last-child { border-bottom: 0; }
.policy-heading { background: var(--vp-c-bg-soft); color: var(--vp-c-text-2); font-size: 12px; font-weight: 700; }
.policy-row button { border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg); color: var(--vp-c-text-1); padding: 8px; cursor: pointer; }
.access-row { display: grid; grid-template-columns: minmax(130px, 1fr) minmax(220px, 2fr) 190px; align-items: center; gap: 14px; padding: 14px 16px; border-bottom: 1px solid var(--vp-c-divider); }
.access-row:last-child { border-bottom: 0; }
.access-heading { background: var(--vp-c-bg-soft); color: var(--vp-c-text-2); font-size: 12px; font-weight: 700; }
.access-row a { color: var(--vp-c-brand-1); font-weight: 700; text-decoration: none; }
.access-row code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.access-row select { width: 100%; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg); color: var(--vp-c-text-1); padding: 8px; }
.access-error, .access-notice, .access-empty { margin: 14px 0; padding: 14px; border-radius: 9px; }
.access-error { background: var(--vp-c-danger-soft); color: var(--vp-c-danger-1); }
.access-notice, .access-empty { background: var(--vp-c-bg-soft); }
@media (max-width: 720px) {
  .access-page { padding: 28px 18px 60px; }
  .access-heading { display: none; }
  .access-row { grid-template-columns: 1fr; gap: 8px; }
  .policy-heading { display: none; }
  .policy-row { grid-template-columns: 1fr; gap: 8px; }
}
</style>
