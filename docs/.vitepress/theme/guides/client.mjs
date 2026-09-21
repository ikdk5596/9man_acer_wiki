import { reactive, readonly, onMounted } from 'vue'
import { createGuideApi } from './api.mjs'
import { validateDownloadedImage } from './images.mjs'
import { emulatorEnabled, MAX_IMAGE_BYTES, imageSlots, parseBody } from './content.mjs'

const state = reactive({ ready: false, uid: null, displayName: '', photoURL: '', error: '', epoch: 0, emulator: false })
export const session = readonly(state)
let pending
export function errorText(error) {
  const code = error?.code || ''
  const messages = {
    'auth/popup-closed-by-user': '로그인 창이 닫혔습니다.',
    'auth/popup-blocked': '팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요.',
    'auth/unauthorized-domain': '이 도메인에서는 아직 Google 로그인이 설정되지 않았습니다.',
    'permission-denied': '접근 권한이 없거나 서비스 보안 설정이 준비되지 않았습니다.',
    'unavailable': '서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.',
    'storage/unauthorized': '사진에 접근할 권한이 없습니다.',
    'failed-precondition': '목록 색인 등 서버 설정이 준비되지 않았습니다.',
  }
  return messages[code] ? `${messages[code]} (${code})` : `${error?.message || '요청을 처리하지 못했습니다.'}${code ? ` (${code})` : ''}`
}
export function useGuideSession() {
  onMounted(() => { getClient().catch(error => { state.error = errorText(error); state.ready = true }) })
  return session
}
export function getClient() {
  if (typeof window === 'undefined') return Promise.reject(new Error('브라우저에서만 이용할 수 있습니다.'))
  if (!pending) pending = initialize().catch(error => { pending = null; throw error })
  return pending
}
async function initialize() {
  const [appSdk, authSdk, dbSdk, storageSdk, configModule] = await Promise.all([
    import('firebase/app'), import('firebase/auth'), import('firebase/firestore'), import('firebase/storage'), import('../../firebase-config.json'),
  ])
  const emulator = emulatorEnabled(location.hostname, import.meta.env.VITE_GUIDE_EMULATORS === '1' ? '?guideEmulator=1' : location.search)
  const config = emulator ? { apiKey: 'demo-key', projectId: 'demo-acer-wiki', authDomain: 'demo-acer-wiki.firebaseapp.com', storageBucket: 'demo-acer-wiki.appspot.com', appId: 'demo-acer-wiki' } : configModule.default
  if (!config?.apiKey || !config?.projectId) throw new Error('공략 서비스의 Firebase 설정이 아직 준비되지 않았습니다.')
  const name = emulator ? 'acer-guides-emulator' : 'acer-guides'
  const app = appSdk.getApps().find(app => app.name === name) || appSdk.initializeApp(config, name)
  const auth = authSdk.initializeAuth(app, { persistence: authSdk.browserLocalPersistence, popupRedirectResolver: authSdk.browserPopupRedirectResolver })
  const db = dbSdk.getFirestore(app)
  const storage = storageSdk.getStorage(app)
  if (emulator) {
    authSdk.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    dbSdk.connectFirestoreEmulator(db, '127.0.0.1', 8180)
    storageSdk.connectStorageEmulator(storage, '127.0.0.1', 9199)
  }
  state.emulator = emulator
  const verifiedUid = () => {
    const user = auth.currentUser
    return user?.emailVerified && user.providerData.some(p => p.providerId === 'google.com') ? user.uid : null
  }
  authSdk.onAuthStateChanged(auth, user => {
    state.uid = verifiedUid()
    const googleProfile = user?.providerData?.find(provider => provider.providerId === 'google.com')

    state.displayName = state.uid
      ? (user?.displayName || googleProfile?.displayName || user?.email?.split('@')[0] || '사용자')
      : ''

    state.photoURL = state.uid
      ? (user?.photoURL || googleProfile?.photoURL || '')
      : ''

    state.epoch++
    state.ready = true
    state.error = user && !state.uid
      ? '이메일이 확인된 Google 계정으로 로그인해 주세요.'
      : ''
  }, error => {
    state.error = errorText(error)
    state.ready = true
  })
  await auth.authStateReady()
  const guideRef = id => {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('올바르지 않은 공략 주소입니다.')
    return dbSdk.doc(db, 'guides', id)
  }
  const imageRef = (uid, id, slot) => {
    guideRef(id)
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(uid) || !Number.isInteger(slot) || slot < 0 || slot > 9) throw new Error('올바르지 않은 사진 경로입니다.')
    return storageSdk.ref(storage, `guide-images/${uid}/${id}/${slot}.webp`)
  }
  async function read(id) {
    const snap = await dbSdk.getDocFromServer(guideRef(id))
    return snap.exists() ? { ...snap.data(), id: snap.id } : null
  }
  const api = createGuideApi({
    currentUid: verifiedUid, timestamp: dbSdk.serverTimestamp, read,
    newId: () => dbSdk.doc(dbSdk.collection(db, 'guides')).id,
    create: (id, data) => dbSdk.setDoc(guideRef(id), data),
    update: (id, data) => dbSdk.updateDoc(guideRef(id), data),
    remove: id => dbSdk.deleteDoc(guideRef(id)),
    // Missing documents cannot be read under owner/public rules. Query this
    // exact ID with the owner filter to verify deletion without relaxing rules.
    existsOwned: async (id, uid) => {
      const snap = await dbSdk.getDocsFromServer(dbSdk.query(dbSdk.collection(db, 'guides'), dbSdk.where('authorId', '==', uid), dbSdk.where(dbSdk.documentId(), '==', id), dbSdk.limit(1)))
      return !snap.empty
    },
    deleteImage: (uid, id, slot) => storageSdk.deleteObject(imageRef(uid, id, slot)),
  })
  return {
    ...api, read,
    async login() {
      await authSdk.setPersistence(auth, authSdk.browserLocalPersistence)
      const provider = new authSdk.GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      await authSdk.signInWithPopup(auth, provider)
    },
    async logout() {
      state.uid = null; state.epoch++
      await authSdk.signOut(auth)
    },
    async list(mine, uid, cursor) {
      if (mine) api.guard(uid)
      const constraints = [dbSdk.where(mine ? 'authorId' : 'status', '==', mine ? uid : 'published'), dbSdk.orderBy('updatedAt', 'desc')]
      if (cursor) constraints.push(dbSdk.startAfter(cursor))
      constraints.push(dbSdk.limit(20))
      const snap = await dbSdk.getDocsFromServer(dbSdk.query(dbSdk.collection(db, 'guides'), ...constraints))
      if (mine) api.guard(uid)
      return { rows: snap.docs.map(d => ({ ...d.data(), id: d.id })), cursor: snap.docs.at(-1) || null, more: snap.size === 20 }
    },
    async image(guide, slot) {
      const blob = await storageSdk.getBlob(imageRef(guide.authorId, guide.id, slot), MAX_IMAGE_BYTES)
      return validateDownloadedImage(blob)
    },
    async upload(id, slot, blob, uid) {
      api.guard(uid)
      const guide = await read(id)
      api.guard(uid)
      if (!guide || guide.authorId !== uid) throw new Error('사진을 추가하기 전에 내 공략을 저장해 주세요.')
      if (imageSlots(parseBody(guide.body)).includes(slot)) throw new Error('저장된 글에서 사용하는 사진은 덮어쓸 수 없습니다. 사진을 제거한 뒤 먼저 저장해 주세요.')
      if (blob.type !== 'image/webp' || blob.size > MAX_IMAGE_BYTES) throw new Error('사진은 1 MiB 이하 WebP여야 합니다.')
      await storageSdk.uploadBytes(imageRef(uid, id, slot), blob, { contentType: 'image/webp', cacheControl: 'private, no-store' })
      api.guard(uid)
      return this.image({ id, authorId: uid }, slot)
    },
  }
}
