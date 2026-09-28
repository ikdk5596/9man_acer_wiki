import { getClient, session } from '../guides/client.mjs'

const PARTY_TYPES = new Set(['rank', 'free'])
const APPLICATION_STATUSES = new Set(['pending', 'approved', 'rejected'])

function requiredText(value, name, max) {
  const result = String(value || '').trim()
  if (!result || result.length > max) {
    throw new Error(`${name}은(는) 1~${max}자로 입력해 주세요.`)
  }
  return result
}

function optionalText(value, name, max) {
  const result = String(value || '').trim()
  if (result.length > max) {
    throw new Error(`${name}은(는) ${max}자 이하로 입력해 주세요.`)
  }
  return result
}

function partyType(value) {
  const result = String(value || '').trim()
  if (!PARTY_TYPES.has(result)) throw new Error('파티 타입이 올바르지 않습니다.')
  return result
}

function capacity(value) {
  const result = Number(value)
  if (!Number.isInteger(result) || result < 1 || result > 40) {
    throw new Error('모집인원은 1~40명으로 입력해 주세요.')
  }
  return result
}

function dateText(value) {
  const result = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) {
    throw new Error('출발날짜가 올바르지 않습니다.')
  }

  const [year, month, day] = result.split('-').map(Number)
  const check = new Date(Date.UTC(year, month - 1, day))

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error('출발날짜가 올바르지 않습니다.')
  }

  return result
}

export function koreaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const values = Object.fromEntries(
    parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value])
  )

  return `${values.year}-${values.month}-${values.day}`
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

  return {
    auth: authSdk.getAuth(app),
    db: dbSdk.getFirestore(app),
    dbSdk,
  }
}

function requireUser(auth) {
  if (!session.uid || auth.currentUser?.uid !== session.uid) {
    throw new Error('로그인이 필요합니다.')
  }
  return auth.currentUser
}

async function requireAlias(db, dbSdk, uid) {
  const snap = await dbSdk.getDocFromServer(dbSdk.doc(db, 'profiles', uid))
  const alias = snap.exists() ? String(snap.data().alias || '').trim() : ''

  if (!alias) {
    throw new Error('먼저 내 프로필에서 공개 별명을 설정해 주세요.')
  }

  return alias
}

export async function listParties() {
  const { db, dbSdk } = await firebase()
  const today = koreaToday()

  const query = dbSdk.query(
    dbSdk.collection(db, 'partyPosts'),
    dbSdk.where('departureDate', '>=', today),
    dbSdk.orderBy('departureDate', 'asc'),
    dbSdk.limit(100),
  )

  const snap = await dbSdk.getDocsFromServer(query)

  return snap.docs.map(partyDoc => ({
    id: partyDoc.id,
    ...partyDoc.data(),
    approvedCount: Number(partyDoc.data().approvedCount || 0),
  }))
}
export async function getParty(partyId) {
  const id = requiredText(partyId, '파티 식별자', 100)
  const { db, dbSdk } = await firebase()

  const snap = await dbSdk.getDocFromServer(
    dbSdk.doc(db, 'partyPosts', id)
  )

  if (!snap.exists()) throw new Error('파티 모집글이 없습니다.')

  return {
    id: snap.id,
    ...snap.data(),
    approvedCount: Number(snap.data().approvedCount || 0),
  }
}
export async function createParty(values) {
  const { auth, db, dbSdk } = await firebase()
  const user = requireUser(auth)
  const leaderName = await requireAlias(db, dbSdk, user.uid)

  const departureDate = dateText(values.departureDate)
  if (departureDate < koreaToday()) {
    throw new Error('출발날짜는 오늘 이후로 선택해 주세요.')
  }

  const ref = dbSdk.doc(dbSdk.collection(db, 'partyPosts'))

  await dbSdk.setDoc(ref, {
    leaderId: user.uid,
    leaderName,
    name: requiredText(values.name, '파티이름', 60),
    type: partyType(values.type),
    departureDate,
    capacity: capacity(values.capacity),
    approvedCount: 0,
    description: optionalText(values.description, '간단소개글', 1000),
    createdAt: dbSdk.serverTimestamp(),
    updatedAt: dbSdk.serverTimestamp(),
  })

  return ref.id
}

export async function updateParty(partyId, values) {
  const id = requiredText(partyId, '파티 식별자', 100)
  const { auth, db, dbSdk } = await firebase()
  requireUser(auth)

  const departureDate = dateText(values.departureDate)
  if (departureDate < koreaToday()) {
    throw new Error('출발날짜는 오늘 이후로 선택해 주세요.')
  }

  await dbSdk.updateDoc(dbSdk.doc(db, 'partyPosts', id), {
    name: requiredText(values.name, '파티이름', 60),
    type: partyType(values.type),
    departureDate,
    capacity: capacity(values.capacity),
    description: optionalText(values.description, '간단소개글', 1000),
    updatedAt: dbSdk.serverTimestamp(),
  })
}

export async function deleteParty(partyId) {
  const id = requiredText(partyId, '파티 식별자', 100)
  const { auth, db, dbSdk } = await firebase()
  requireUser(auth)

  await dbSdk.deleteDoc(dbSdk.doc(db, 'partyPosts', id))
}

export async function getMyApplication(partyId) {
  if (!session.uid) return null

  const id = requiredText(partyId, '파티 식별자', 100)
  const { auth, db, dbSdk } = await firebase()
  const user = requireUser(auth)

  const snap = await dbSdk.getDocFromServer(
    dbSdk.doc(db, 'partyPosts', id, 'applications', user.uid)
  )

  return snap.exists()
    ? { id: snap.id, ...snap.data() }
    : null
}

export async function applyToParty(partyId, values) {
  const id = requiredText(partyId, '파티 식별자', 100)
  const { auth, db, dbSdk } = await firebase()
  const user = requireUser(auth)

  const partyRef = dbSdk.doc(db, 'partyPosts', id)
  const applicationRef = dbSdk.doc(
    db,
    'partyPosts',
    id,
    'applications',
    user.uid
  )

  await dbSdk.runTransaction(db, async transaction => {
    const partySnap = await transaction.get(partyRef)
    if (!partySnap.exists()) throw new Error('파티 모집글이 없습니다.')

    const party = partySnap.data()

    if (party.leaderId === user.uid) {
      throw new Error('파티장은 자신의 파티에 신청할 수 없습니다.')
    }

    if (String(party.departureDate || '') < koreaToday()) {
      throw new Error('출발일이 지난 파티에는 신청할 수 없습니다.')
    }

    const applicationSnap = await transaction.get(applicationRef)

    if (applicationSnap.exists()) {
      throw new Error('이미 이 파티에 신청했습니다.')
    }

    transaction.set(applicationRef, {
      applicantId: user.uid,

      gameNickname: requiredText(
        values.gameNickname,
        '실제 게임 닉네임',
        30
      ),

      gameUid: requiredText(
        values.gameUid,
        '게임 UID',
        50
      ),

      rank: requiredText(
        values.rank,
        '랭크',
        30
      ),

      primaryTroop: requiredText(
        values.primaryTroop,
        '1병종',
        100
      ),

      secondaryTroop: optionalText(
        values.secondaryTroop,
        '2병종',
        100
      ),

      battleTime: requiredText(
        values.battleTime,
        '전투참여 시간',
        100
      ),

      note: optionalText(
        values.note,
        '비고',
        500
      ),

      status: 'pending',

      createdAt: dbSdk.serverTimestamp(),
      updatedAt: dbSdk.serverTimestamp(),
    })
  })
}

export async function updateMyApplication(partyId, values) {
  const id = requiredText(partyId, '파티 식별자', 100)
  const { auth, db, dbSdk } = await firebase()
  const user = requireUser(auth)

  await dbSdk.updateDoc(
    dbSdk.doc(db, 'partyPosts', id, 'applications', user.uid),
    {
      gameNickname: requiredText(
        values.gameNickname,
        '실제 게임 닉네임',
        30
      ),

      gameUid: requiredText(
        values.gameUid,
        '게임 UID',
        50
      ),

      rank: requiredText(
        values.rank,
        '랭크',
        30
      ),

      primaryTroop: requiredText(
        values.primaryTroop,
        '1병종',
        100
      ),

      secondaryTroop: optionalText(
        values.secondaryTroop,
        '2병종',
        100
      ),

      battleTime: requiredText(
        values.battleTime,
        '전투참여 시간',
        100
      ),

      note: optionalText(
        values.note,
        '비고',
        500
      ),

      updatedAt: dbSdk.serverTimestamp(),
    }
  )
}

export async function cancelMyApplication(partyId) {
  const id = requiredText(partyId, '파티 식별자', 100)
  const { auth, db, dbSdk } = await firebase()
  const user = requireUser(auth)

  await dbSdk.deleteDoc(
    dbSdk.doc(db, 'partyPosts', id, 'applications', user.uid)
  )
}

export async function listApplications(partyId) {
  const id = requiredText(partyId, '파티 식별자', 100)
  const { auth, db, dbSdk } = await firebase()
  requireUser(auth)

  const query = dbSdk.query(
    dbSdk.collection(db, 'partyPosts', id, 'applications'),
    dbSdk.orderBy('createdAt', 'asc'),
    dbSdk.limit(20),
  )

  const snap = await dbSdk.getDocsFromServer(query)

  return snap.docs.map(applicationDoc => ({
    id: applicationDoc.id,
    ...applicationDoc.data(),
  }))
}

export async function setApplicationStatus(
  partyId,
  applicantId,
  nextStatus
) {
  const id = requiredText(partyId, '파티 식별자', 100)
  const uid = requiredText(applicantId, '신청자 식별자', 128)
  const status = String(nextStatus || '').trim()

  if (!APPLICATION_STATUSES.has(status)) {
    throw new Error('신청 상태가 올바르지 않습니다.')
  }

  const { auth, db, dbSdk } = await firebase()
  requireUser(auth)

  const partyRef = dbSdk.doc(db, 'partyPosts', id)
  const applicationRef = dbSdk.doc(
    db,
    'partyPosts',
    id,
    'applications',
    uid
  )

  await dbSdk.runTransaction(db, async transaction => {
    const partySnap = await transaction.get(partyRef)

    if (!partySnap.exists()) {
      throw new Error('파티 모집글이 없습니다.')
    }

    const applicationSnap = await transaction.get(applicationRef)

    if (!applicationSnap.exists()) {
      throw new Error('신청 정보가 없습니다.')
    }

    const party = partySnap.data()
    const application = applicationSnap.data()

    const previousStatus = String(application.status || '')
    const currentCount = Number(party.approvedCount || 0)
    const maxCount = Number(party.capacity || 0)

    if (previousStatus === status) return

    let nextCount = currentCount

    if (previousStatus !== 'approved' && status === 'approved') {
      if (currentCount >= maxCount) {
        throw new Error('모집인원이 이미 가득 찼습니다.')
      }

      nextCount += 1
    }

    if (previousStatus === 'approved' && status !== 'approved') {
      nextCount = Math.max(0, currentCount - 1)
    }

    transaction.update(applicationRef, {
      status,
      updatedAt: dbSdk.serverTimestamp(),
    })

    if (nextCount !== currentCount) {
      transaction.update(partyRef, {
        approvedCount: nextCount,
        updatedAt: dbSdk.serverTimestamp(),
      })
    }
  })
}
