import { getClient, session } from '../guides/client.mjs'
import { access, canManagePosts, ensureAccess } from '../access/client.mjs'
import { HERO_TALENT_CATALOG, HERO_TALENT_MAP } from './catalog.mjs'

const DOC_COLLECTION = 'tierLists'
const DOC_ID = 'talents'

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

function emptyHeroTiers() {
  return { tier1: '', tier2: '', tier3: '' }
}

export function emptyTalentTierState() {
  return Object.fromEntries(
    HERO_TALENT_CATALOG.map(hero => [hero.id, emptyHeroTiers()])
  )
}

function normalizeHeroTiers(heroId, value) {
  const hero = HERO_TALENT_MAP.get(heroId)
  if (!hero) return emptyHeroTiers()

  const allowed = new Set(hero.advancedTalents.map(talent => talent.id))
  const used = new Set()
  const result = emptyHeroTiers()

  for (const key of ['tier1', 'tier2', 'tier3']) {
    const id = String(value?.[key] || '')
    if (id && allowed.has(id) && !used.has(id)) {
      result[key] = id
      used.add(id)
    }
  }

  return result
}

export function normalizeTalentTierState(value) {
  return Object.fromEntries(
    HERO_TALENT_CATALOG.map(hero => [
      hero.id,
      normalizeHeroTiers(hero.id, value?.[hero.id]),
    ])
  )
}

export async function loadHeroTalentTiers() {
  const { db, dbSdk } = await firebase()
  const snap = await dbSdk.getDocFromServer(
    dbSdk.doc(db, DOC_COLLECTION, DOC_ID)
  )

  if (!snap.exists()) {
    return {
      heroes: emptyTalentTierState(),
      updatedAt: null,
      updatedBy: '',
    }
  }

  const data = snap.data()
  return {
    heroes: normalizeTalentTierState(data.heroTiers),
    updatedAt: data.heroTalentUpdatedAt?.toDate?.() || data.updatedAt?.toDate?.() || null,
    updatedBy: String(data.heroTalentUpdatedBy || data.updatedBy || ''),
  }
}

export async function saveHeroTalentTiers(value) {
  await ensureAccess()

  if (!canManagePosts(access.role)) {
    throw new Error('관리자 이상만 영웅 재능 티어를 수정할 수 있습니다.')
  }

  const { auth, db, dbSdk } = await firebase()
  const user = auth.currentUser

  if (!session.uid || user?.uid !== session.uid) {
    throw new Error('로그인이 필요합니다.')
  }

  const heroTiers = normalizeTalentTierState(value)

  await dbSdk.setDoc(
    dbSdk.doc(db, DOC_COLLECTION, DOC_ID),
    {
      heroTiers,
      heroTalentUpdatedAt: dbSdk.serverTimestamp(),
      heroTalentUpdatedBy: user.uid,
    },
    { merge: true }
  )

  return heroTiers
}
