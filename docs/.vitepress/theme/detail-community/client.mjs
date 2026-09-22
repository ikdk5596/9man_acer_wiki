import { getClient, session } from '../guides/client.mjs'

const allowedTypes = new Set(['soldier', 'exclusive-weapon'])

function resourceKey(type, id) {
  if (!allowedTypes.has(type)) throw new Error('지원하지 않는 상세 페이지입니다.')
  const value = String(id || '').trim()
  if (!value || value.length > 100) throw new Error('상세 페이지 식별자가 올바르지 않습니다.')
  return `${type}:${value}`
}

function text(value, name, max) {
  const result = String(value || '').trim()
  if (!result || result.length > max) throw new Error(`${name}은(는) 1~${max}자로 입력해 주세요.`)
  return result
}

async function firebase() {
  await getClient()
  const [appSdk, authSdk, dbSdk] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
  ])
  const appName = session.emulator ? 'acer-guides-emulator' : 'acer-guides'
  const app = appSdk.getApps().find(candidate => candidate.name === appName)
  if (!app) throw new Error('Firebase 앱이 초기화되지 않았습니다.')
  return { auth: authSdk.getAuth(app), db: dbSdk.getFirestore(app), dbSdk }
}

function requireUser(auth) {
  if (!session.uid || auth.currentUser?.uid !== session.uid) throw new Error('로그인이 필요합니다.')
  return auth.currentUser
}

export async function loadAlias(uid) {
  if (!uid) return ''
  const { db, dbSdk } = await firebase()
  const snap = await dbSdk.getDocFromServer(dbSdk.doc(db, 'profiles', uid))
  return snap.exists() ? String(snap.data().alias || '') : ''
}

async function requireAlias(db, dbSdk, uid) {
  const snap = await dbSdk.getDocFromServer(dbSdk.doc(db, 'profiles', uid))
  const alias = snap.exists() ? String(snap.data().alias || '').trim() : ''
  if (!alias) throw new Error('먼저 내 프로필에서 공개 별명을 설정해 주세요.')
  return alias
}

export async function listPosts(type, id) {
  const key = resourceKey(type, id)
  const { db, dbSdk } = await firebase()
  const query = dbSdk.query(
    dbSdk.collection(db, 'detailPosts'),
    dbSdk.where('resourceKey', '==', key),
    dbSdk.orderBy('createdAt', 'desc'),
    dbSdk.limit(30),
  )
  const snap = await dbSdk.getDocsFromServer(query)
  const rows = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  const authorIds = [...new Set(rows.map(row => row.authorId))]
  const profiles = new Map(await Promise.all(authorIds.map(async uid => {
    const profile = await dbSdk.getDocFromServer(dbSdk.doc(db, 'profiles', uid))
    return [uid, profile.exists() ? String(profile.data().alias || '') : '']
  })))
  return rows.map(row => ({ ...row, authorLabel: profiles.get(row.authorId) || row.authorName || '사용자' }))
}

export async function createPost(type, id, title, body) {
  const key = resourceKey(type, id)
  const { auth, db, dbSdk } = await firebase()
  const user = requireUser(auth)
  const authorName = await requireAlias(db, dbSdk, user.uid)
  await dbSdk.addDoc(dbSdk.collection(db, 'detailPosts'), {
    resourceType: type,
    resourceId: String(id).trim(),
    resourceKey: key,
    authorId: user.uid,
    authorName,
    title: text(title, '제목', 100),
    body: text(body, '본문', 5000),
    createdAt: dbSdk.serverTimestamp(),
    updatedAt: dbSdk.serverTimestamp(),
  })
}

export async function updatePost(postId, title, body) {
  const { auth, db, dbSdk } = await firebase()
  requireUser(auth)
  const postRef = dbSdk.doc(db, 'detailPosts', postId)
  const post = await dbSdk.getDocFromServer(postRef)
  if (!post.exists()) throw new Error('수정할 글이 없습니다.')
  const authorName = await requireAlias(db, dbSdk, String(post.data().authorId || ''))
  await dbSdk.updateDoc(postRef, {
    authorName,
    title: text(title, '제목', 100),
    body: text(body, '본문', 5000),
    updatedAt: dbSdk.serverTimestamp(),
  })
}

export async function deletePost(postId) {
  const { auth, db, dbSdk } = await firebase()
  requireUser(auth)
  await dbSdk.deleteDoc(dbSdk.doc(db, 'detailPosts', postId))
}
