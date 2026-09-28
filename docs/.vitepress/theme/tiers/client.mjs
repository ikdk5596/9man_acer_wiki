import { getClient, session } from '../guides/client.mjs'
import { access, canManagePosts, ensureAccess } from '../access/client.mjs'
import { catalogFor, TIER_KEYS } from './catalog.mjs'

export const BOARD_KEYS = Object.freeze(['overall', 'pvp', 'pve', 'beginner'])

const DEFAULT_BOARD_META = Object.freeze({
  soldiers: Object.freeze({
    overall: Object.freeze({
      tabLabel: '기본(종합)',
      title: '종합 병종 티어',
    }),
    pvp: Object.freeze({
      tabLabel: 'PVP 전용',
      title: 'PVP 병종 티어',
    }),
    pve: Object.freeze({
      tabLabel: 'PVE 전용',
      title: 'PVE 병종 티어',
    }),
    beginner: Object.freeze({
      tabLabel: '초반 추천',
      title: '초반 추천 병종 티어',
    }),
  }),

  heroes: Object.freeze({
    overall: Object.freeze({
      tabLabel: '기본(종합)',
      title: '종합 영웅 티어',
    }),
    pvp: Object.freeze({
      tabLabel: 'PVP 전용',
      title: 'PVP 영웅 티어',
    }),
    pve: Object.freeze({
      tabLabel: 'PVE 전용',
      title: 'PVE 영웅 티어',
    }),
    beginner: Object.freeze({
      tabLabel: '초반 추천',
      title: '초반 추천 영웅 티어',
    }),
  }),
})

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

function validateKind(kind) {
  if (!['soldiers', 'heroes', 'policies'].includes(kind)) {
    throw new Error('올바르지 않은 등급표 종류입니다.')
  }
  return kind
}

function cleanText(value, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
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

export function defaultBoard(kind, boardKey) {
  const meta = DEFAULT_BOARD_META[kind]?.[boardKey] || {
    tabLabel: boardKey,
    title: boardKey,
  }

  return {
    tabLabel: meta.tabLabel,
    title: meta.title,
    tiers: emptyTiers(),
  }
}

export function emptyBoards(kind) {
  return Object.fromEntries(
    BOARD_KEYS.map(boardKey => [boardKey, defaultBoard(kind, boardKey)])
  )
}

function normalizeBoard(kind, boardKey, value, legacyTiers = null) {
  const defaults = defaultBoard(kind, boardKey)

  /*
   * 기존 데이터 구조:
   *
   * tierLists/{kind}
   *   tiers: { S: [], A: [], ... }
   *
   * 신규 boards가 아직 없는 경우 기존 tiers를 overall에만 연결한다.
   */
  const tierSource =
    value?.tiers ??
    (boardKey === 'overall' ? legacyTiers : null) ??
    emptyTiers()

  return {
    tabLabel: cleanText(value?.tabLabel, defaults.tabLabel),
    title: cleanText(value?.title, defaults.title),
    tiers: normalizeTiers(kind, tierSource),
  }
}

export function normalizeBoards(kind, value, legacyTiers = null) {
  return Object.fromEntries(
    BOARD_KEYS.map(boardKey => [
      boardKey,
      normalizeBoard(kind, boardKey, value?.[boardKey], legacyTiers),
    ])
  )
}

export async function loadTierList(kind) {
  validateKind(kind)

  const { db, dbSdk } = await firebase()
  const snap = await dbSdk.getDocFromServer(
    dbSdk.doc(db, 'tierLists', kind)
  )

  if (!snap.exists()) {
    return {
      boards: emptyBoards(kind),
      tiers: emptyTiers(),
      updatedAt: null,
      updatedBy: '',
    }
  }

  const data = snap.data()
  const legacyTiers = normalizeTiers(kind, data.tiers)
  const boards = normalizeBoards(kind, data.boards, legacyTiers)

  return {
    boards,

    // 기존 코드와의 호환성을 위해 유지한다.
    tiers: boards.overall.tiers,

    updatedAt: data.updatedAt?.toDate?.() || null,
    updatedBy: String(data.updatedBy || ''),
  }
}

export async function saveTierList(kind, value) {
  validateKind(kind)
  await ensureAccess()

  if (!canManagePosts(access.role)) {
    throw new Error('관리자 이상만 등급표를 수정할 수 있습니다.')
  }

  const { auth, db, dbSdk } = await firebase()
  const user = auth.currentUser

  if (!session.uid || user?.uid !== session.uid) {
    throw new Error('로그인이 필요합니다.')
  }

  /*
   * 신규 TierBoard는 { boards: ... } 형태로 전달한다.
   * 혹시 기존 호출 코드가 tiers 자체를 전달해도 overall로 처리한다.
   */
  let boards

  if (value?.boards) {
    boards = normalizeBoards(kind, value.boards)
  } else {
    const current = await loadTierList(kind)
    boards = normalizeBoards(kind, current.boards)

    boards.overall = {
      ...boards.overall,
      tiers: normalizeTiers(kind, value),
    }
  }

  await dbSdk.setDoc(
    dbSdk.doc(db, 'tierLists', kind),
    {
      boards,

      /*
       * 기존 구조를 사용하는 코드가 있어도 깨지지 않도록
       * overall을 legacy tiers에도 동기화한다.
       */
      tiers: boards.overall.tiers,

      updatedAt: dbSdk.serverTimestamp(),
      updatedBy: user.uid,
    },
    { merge: true }
  )

  return boards
}
