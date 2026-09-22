import { getClient, session } from '../guides/client.mjs'
import { compressImage } from '../guides/images.mjs'

export const EMPTY_PROFILE = Object.freeze({
  alias: '',
  bio: '',
  gameServer: '',
  guild: '',
  mainHeroes: [],
  photoVersion: 0,
})

function cleanText(value, name, max, required = false) {
  const result = String(value || '').trim()
  if (required && !result) throw new Error(`${name}을(를) 입력해 주세요.`)
  if (result.length > max) throw new Error(`${name}은(는) ${max}자 이하여야 합니다.`)
  return result
}

function cleanHeroes(value) {
  const heroes = Array.from(new Set((Array.isArray(value) ? value : String(value || '').split(','))
    .map(item => cleanText(item, '주력 영웅', 40))
    .filter(Boolean)))
  if (heroes.length > 5) throw new Error('주력 영웅은 최대 5명까지 입력할 수 있습니다.')
  return heroes
}

function cleanProfile(value) {
  return {
    alias: cleanText(value.alias, '별명', 30, true),
    bio: cleanText(value.bio, '자기소개', 500),
    gameServer: cleanText(value.gameServer, '게임 서버', 40),
    guild: cleanText(value.guild, '길드', 40),
    mainHeroes: cleanHeroes(value.mainHeroes),
    photoVersion: Number.isInteger(value.photoVersion) && value.photoVersion >= 0 ? value.photoVersion : 0,
  }
}

function validUid(uid) {
  const value = String(uid || '')
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error('올바르지 않은 프로필 주소입니다.')
  return value
}

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

function requireOwner(auth, uid) {
  if (!session.uid || auth.currentUser?.uid !== session.uid || session.uid !== uid) throw new Error('본인 프로필만 수정할 수 있습니다.')
}

function photoRef(storageSdk, storage, uid) {
  return storageSdk.ref(storage, `profile-images/${validUid(uid)}/profile.webp`)
}

export async function loadProfile(uid) {
  uid = validUid(uid)
  const { db, storage, dbSdk, storageSdk } = await firebase()
  const snap = await dbSdk.getDocFromServer(dbSdk.doc(db, 'profiles', uid))
  const profile = snap.exists() ? { ...EMPTY_PROFILE, ...snap.data() } : { ...EMPTY_PROFILE }
  let photo = null
  if (profile.photoVersion > 0) {
    try {
      photo = await storageSdk.getBlob(photoRef(storageSdk, storage, uid), 1048576)
      if (photo.type && photo.type !== 'image/webp') throw new Error('올바른 WebP 프로필 사진이 아닙니다.')
    } catch (error) {
      if (error?.code !== 'storage/object-not-found') throw error
    }
  }
  return { profile, photo }
}

export async function loadPublishedGuides(uid) {
  uid = validUid(uid)
  const { db, dbSdk } = await firebase()
  const query = dbSdk.query(
    dbSdk.collection(db, 'guides'),
    dbSdk.where('authorId', '==', uid),
    dbSdk.where('status', '==', 'published'),
    dbSdk.orderBy('updatedAt', 'desc'),
    dbSdk.limit(20),
  )
  const snap = await dbSdk.getDocsFromServer(query)
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
}

export async function prepareProfilePhoto(file) {
  if (!file) return null
  return compressImage(file)
}

export async function saveProfile(uid, fields, photoChange = null) {
  uid = validUid(uid)
  const { auth, db, storage, dbSdk, storageSdk } = await firebase()
  requireOwner(auth, uid)
  const data = cleanProfile(fields)
  if (photoChange?.remove) {
    try { await storageSdk.deleteObject(photoRef(storageSdk, storage, uid)) }
    catch (error) { if (error?.code !== 'storage/object-not-found') throw error }
    data.photoVersion = 0
  } else if (photoChange?.blob) {
    const blob = photoChange.blob
    if (blob.type !== 'image/webp' || blob.size > 1048576) throw new Error('프로필 사진은 1 MiB 이하 WebP여야 합니다.')
    await storageSdk.uploadBytes(photoRef(storageSdk, storage, uid), blob, { contentType: 'image/webp', cacheControl: 'public, max-age=3600' })
    data.photoVersion = Date.now()
  }
  requireOwner(auth, uid)
  await dbSdk.setDoc(dbSdk.doc(db, 'profiles', uid), {
    ...data,
    updatedAt: dbSdk.serverTimestamp(),
  }, { merge: true })
  window.dispatchEvent(new CustomEvent('wiki-profile-updated', { detail: { uid } }))
  return data
}

export async function removeProfile(uid) {
  uid = validUid(uid)
  const { auth, db, storage, dbSdk, storageSdk } = await firebase()
  requireOwner(auth, uid)
  try { await storageSdk.deleteObject(photoRef(storageSdk, storage, uid)) }
  catch (error) { if (error?.code !== 'storage/object-not-found') throw error }
  requireOwner(auth, uid)
  await dbSdk.deleteDoc(dbSdk.doc(db, 'profiles', uid))
  window.dispatchEvent(new CustomEvent('wiki-profile-updated', { detail: { uid } }))
}
