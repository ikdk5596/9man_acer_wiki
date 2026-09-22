import { getClient, session } from '../guides/client.mjs'
import { access, canManagePosts, ensureAccess } from '../access/client.mjs'
import { catalogFor, TIER_KEYS } from './catalog.mjs'

async function firebase() {
  await getClient()
  const [appSdk, authSdk, dbSdk] = await Promise.all([
    import('firebase/app'), import('firebase/auth'), import('firebase/firestore'),
  ])
  const appName = session.emulator ? 'acer-guides-emulator' : 'acer-guides'
  const app = appSdk.getApps().find(candidate => candidate.name === appName)
  if (!app) throw new Error('Firebase 앱이 초기화되지 않았습니다.')
  return { auth: authSdk.getAuth(app), db: dbSdk.getFirestore(app), dbSdk }
}

function validateKind(kind) {
  if (!['soldiers', 'policies'].includes(kind)) throw new Error('올바르지 않은 등급표 종류입니다.')
  return kind
}

export function emptyTiers() {
  return Object.fromEntries(TIER_KEYS.map(tier => [tier, []]))
}

export function normalizeTiers(kind, value) {
  const allowed = new Set(catalogFor(kind).map(item => item.id))
  const used = new Set()
  const result = emptyTiers()
  for (const tier of TIER_KEYS) {
    const rows = Array.isArray(value?.[tier]) ? value[tier] : []
    for (const rawId of rows) {
      const id = String(rawId)
      if (allowed.has(id) && !used.has(id)) {
        result[tier].push(id)
        used.add(id)
      }
    }
  }
  return result
}

export async function loadTierList(kind) {
  validateKind(kind)
  const { db, dbSdk } = await firebase()
  const snap = await dbSdk.getDocFromServer(dbSdk.doc(db, 'tierLists', kind))
  if (!snap.exists()) return { tiers: emptyTiers(), updatedAt: null, updatedBy: '' }
  const data = snap.data()
  return {
    tiers: normalizeTiers(kind, data.tiers),
    updatedAt: data.updatedAt?.toDate?.() || null,
    updatedBy: String(data.updatedBy || ''),
  }
}

export async function saveTierList(kind, tiers) {
  validateKind(kind)
  await ensureAccess()
  if (!canManagePosts(access.role)) throw new Error('관리자 이상만 등급표를 수정할 수 있습니다.')
  const { auth, db, dbSdk } = await firebase()
  const user = auth.currentUser
  if (!session.uid || user?.uid !== session.uid) throw new Error('로그인이 필요합니다.')
  const normalized = normalizeTiers(kind, tiers)
  await dbSdk.setDoc(dbSdk.doc(db, 'tierLists', kind), {
    tiers: normalized,
    updatedAt: dbSdk.serverTimestamp(),
    updatedBy: user.uid,
  })
  return normalized
}
