import { onMounted, reactive, readonly, watch } from 'vue'
import { getClient, session } from '../guides/client.mjs'

export const ROLE_LABELS = Object.freeze({
  general: '일반사용자',
  writer: '게시글작성권한',
  admin: '관리자',
  webmaster: 'webmaster',
})

const state = reactive({ ready: false, uid: '', role: 'general', canWriteGuides: false, canWriteDetails: false, error: '' })
export const access = readonly(state)
let pending = null
let pendingUid = ''

async function firebase() {
  await getClient()
  const [appSdk, authSdk, dbSdk, storageSdk] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
    import('firebase/storage'),
  ])
  const appName = session.emulator ? 'acer-guides-emulator' : 'acer-guides'
  const app = appSdk.getApps().find(candidate => candidate.name === appName)
  if (!app) throw new Error('Firebase 앱이 초기화되지 않았습니다.')
  return {
    auth: authSdk.getAuth(app),
    db: dbSdk.getFirestore(app),
    storage: storageSdk.getStorage(app),
    dbSdk,
    storageSdk,
  }
}

function requireUser(auth) {
  if (!session.uid || auth.currentUser?.uid !== session.uid) throw new Error('로그인이 필요합니다.')
  return auth.currentUser
}

export function canWriteGuides(role = state.role) {
  return role === 'webmaster' || (role === state.role && state.canWriteGuides)
}

export function canWriteDetails(role = state.role) {
  return role === 'webmaster' || (role === state.role && state.canWriteDetails)
}

export function canManagePosts(role = state.role) {
  return ['admin', 'webmaster'].includes(role)
}

export async function ensureAccess() {
  const uid = session.uid || ''
  if (!uid) {
    pending = null
    pendingUid = ''
    Object.assign(state, { ready: session.ready, uid: '', role: 'general', canWriteGuides: false, canWriteDetails: false, error: '' })
    return state
  }
  if (pending && pendingUid === uid) return pending
  pendingUid = uid
  pending = (async () => {
    state.ready = false
    state.error = ''
    try {
      const { auth, db, dbSdk } = await firebase()
      const user = requireUser(auth)
      const ref = dbSdk.doc(db, 'roles', uid)
      let snap = await dbSdk.getDocFromServer(ref)
      if (!snap.exists()) {
        await dbSdk.setDoc(ref, {
          role: 'general',
          createdAt: dbSdk.serverTimestamp(),
          updatedAt: dbSdk.serverTimestamp(),
          updatedBy: uid,
        })
        snap = await dbSdk.getDocFromServer(ref)
      }
      if (session.uid !== uid || auth.currentUser?.uid !== user.uid) return state
      const role = snap.exists() ? String(snap.data().role || 'general') : 'general'
      const safeRole = ROLE_LABELS[role] ? role : 'general'
      const policy = safeRole === 'webmaster' ? null : await dbSdk.getDocFromServer(dbSdk.doc(db, 'rolePolicies', safeRole))
      Object.assign(state, {
        uid,
        role: safeRole,
        canWriteGuides: safeRole === 'webmaster' || (policy?.exists() && policy.data().canWriteGuides === true),
        canWriteDetails: safeRole === 'webmaster' || (policy?.exists() && policy.data().canWriteDetails === true),
      })
    } catch (error) {
      state.error = error?.message || '권한 정보를 확인하지 못했습니다.'
      Object.assign(state, { uid, role: 'general', canWriteGuides: false, canWriteDetails: false })
    } finally {
      if (session.uid === uid) state.ready = true
    }
    return state
  })().finally(() => {
    if (pendingUid === uid) pending = null
  })
  return pending
}

export function useAccessSession() {
  onMounted(() => { ensureAccess() })
  watch(() => session.epoch, () => { ensureAccess() })
  return access
}

export async function listUsers() {
  await ensureAccess()
  if (!canManagePosts()) throw new Error('권한관리 접근 권한이 없습니다.')
  const { db, dbSdk } = await firebase()
  const snap = await dbSdk.getDocsFromServer(dbSdk.query(dbSdk.collection(db, 'roles'), dbSdk.limit(100)))
  return Promise.all(snap.docs.map(async roleDoc => {
    const profile = await dbSdk.getDocFromServer(dbSdk.doc(db, 'profiles', roleDoc.id))
    return {
      uid: roleDoc.id,
      role: String(roleDoc.data().role || 'general'),
      alias: profile.exists() ? String(profile.data().alias || '') : '',
    }
  }))
}

export async function changeRole(uid, role) {
  if (!ROLE_LABELS[role]) throw new Error('올바르지 않은 권한입니다.')
  await ensureAccess()
  const { auth, db, dbSdk } = await firebase()
  const user = requireUser(auth)
  if (!canManagePosts()) throw new Error('권한을 변경할 수 없습니다.')
  if (state.role === 'admin' && !['general', 'writer'].includes(role)) throw new Error('관리자는 일반사용자와 게시글작성권한만 지정할 수 있습니다.')
  await dbSdk.updateDoc(dbSdk.doc(db, 'roles', uid), {
    role,
    updatedAt: dbSdk.serverTimestamp(),
    updatedBy: user.uid,
  })
}

const POLICY_DEFAULTS = Object.freeze({
  general: { canWriteGuides: false, canWriteDetails: false },
  writer: { canWriteGuides: true, canWriteDetails: true },
  admin: { canWriteGuides: true, canWriteDetails: true },
  webmaster: { canWriteGuides: true, canWriteDetails: true },
})

export async function listRolePolicies() {
  await ensureAccess()
  if (state.role !== 'webmaster') throw new Error('webmaster만 역할별 작성권한을 설정할 수 있습니다.')
  const { auth, db, dbSdk } = await firebase()
  const user = requireUser(auth)
  const rows = []
  for (const role of Object.keys(POLICY_DEFAULTS)) {
    const ref = dbSdk.doc(db, 'rolePolicies', role)
    let snap = await dbSdk.getDocFromServer(ref)
    if (!snap.exists()) {
      await dbSdk.setDoc(ref, { ...POLICY_DEFAULTS[role], updatedAt: dbSdk.serverTimestamp(), updatedBy: user.uid })
      snap = await dbSdk.getDocFromServer(ref)
    }
    rows.push({ role, ...POLICY_DEFAULTS[role], ...(snap.exists() ? snap.data() : {}) })
  }
  return rows
}

export async function saveRolePolicy(role, values) {
  await ensureAccess()
  if (state.role !== 'webmaster') throw new Error('webmaster만 역할별 작성권한을 설정할 수 있습니다.')
  if (!ROLE_LABELS[role]) throw new Error('올바르지 않은 역할입니다.')
  const { auth, db, dbSdk } = await firebase()
  const user = requireUser(auth)
  const fixed = role === 'webmaster'
    ? { canWriteGuides: true, canWriteDetails: true }
    : { canWriteGuides: values.canWriteGuides === true, canWriteDetails: values.canWriteDetails === true }
  await dbSdk.setDoc(dbSdk.doc(db, 'rolePolicies', role), {
    ...fixed, updatedAt: dbSdk.serverTimestamp(), updatedBy: user.uid,
  })
  return fixed
}

export async function deleteGuideAsManager(guide) {
  await ensureAccess()
  if (!canManagePosts()) throw new Error('게시글 관리 권한이 없습니다.')
  const { auth, db, storage, dbSdk, storageSdk } = await firebase()
  requireUser(auth)
  await dbSdk.deleteDoc(dbSdk.doc(db, 'guides', guide.id))
  const failures = []
  for (let slot = 0; slot < 10; slot++) {
    try { await storageSdk.deleteObject(storageSdk.ref(storage, `guide-images/${guide.authorId}/${guide.id}/${slot}.webp`)) }
    catch (error) { if (error?.code !== 'storage/object-not-found') failures.push({ slot, error }) }
  }
  return failures
}
