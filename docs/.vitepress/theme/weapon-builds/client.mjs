import { getClient, session } from '../guides/client.mjs'
import { access, canManagePosts, ensureAccess } from '../access/client.mjs'
import {
  EXCLUSIVE_WEAPONS,
  EXCLUSIVE_WEAPON_MAP,
  NORMAL_EQUIPMENT_MAP,
} from './catalog.mjs'

const DOC_COLLECTION = 'tierLists'
const DOC_ID = 'weapon-builds'
const GROUP_KEYS = ['core', 'recommended', 'usable']

async function firebase() {
  await getClient()

  const [appSdk, authSdk, dbSdk] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
  ])

  const appName = session.emulator ? 'acer-guides-emulator' : 'acer-guides'
  const app = appSdk.getApps().find(candidate => candidate.name === appName)

  if (!app) {
    throw new Error('Firebase 앱이 초기화되지 않았습니다.')
  }

  return {
    auth: authSdk.getAuth(app),
    db: dbSdk.getFirestore(app),
    dbSdk,
  }
}

function emptyWeaponBuild() {
  return {
    core: [],
    recommended: [],
    usable: [],
  }
}

export function emptyWeaponBuildState() {
  return Object.fromEntries(
    EXCLUSIVE_WEAPONS.map(weapon => [
      weapon.id,
      emptyWeaponBuild(),
    ])
  )
}

function normalizeEquipmentIds(value, used) {
  if (!Array.isArray(value)) {
    return []
  }

  const result = []

  for (const rawId of value) {
    const id = String(rawId || '')

    if (!id) continue
    if (!Object.prototype.hasOwnProperty.call(NORMAL_EQUIPMENT_MAP, id)) continue
    if (used.has(id)) continue

    used.add(id)
    result.push(id)
  }

  return result
}

function normalizeWeaponBuild(weaponId, value) {
  if (!Object.prototype.hasOwnProperty.call(EXCLUSIVE_WEAPON_MAP, weaponId)) {
    return emptyWeaponBuild()
  }

  const used = new Set()
  const result = emptyWeaponBuild()

  for (const key of GROUP_KEYS) {
    result[key] = normalizeEquipmentIds(value?.[key], used)
  }

  return result
}

export function normalizeWeaponBuildState(value) {
  return Object.fromEntries(
    EXCLUSIVE_WEAPONS.map(weapon => [
      weapon.id,
      normalizeWeaponBuild(weapon.id, value?.[weapon.id]),
    ])
  )
}

export async function loadWeaponBuilds() {
  const { db, dbSdk } = await firebase()

  const snap = await dbSdk.getDocFromServer(
    dbSdk.doc(db, DOC_COLLECTION, DOC_ID)
  )

  if (!snap.exists()) {
    return {
      builds: emptyWeaponBuildState(),
      updatedAt: null,
      updatedBy: '',
    }
  }

  const data = snap.data()

  return {
    builds: normalizeWeaponBuildState(data.weaponBuilds),
    updatedAt:
      data.weaponBuildUpdatedAt?.toDate?.() ||
      null,
    updatedBy: String(data.weaponBuildUpdatedBy || ''),
  }
}

export async function saveWeaponBuilds(value) {
  await ensureAccess()

  if (!canManagePosts(access.role)) {
    throw new Error('관리자 이상만 전용무기 추천 빌드를 수정할 수 있습니다.')
  }

  const { auth, db, dbSdk } = await firebase()
  const user = auth.currentUser

  if (!session.uid || user?.uid !== session.uid) {
    throw new Error('로그인이 필요합니다.')
  }

  const weaponBuilds = normalizeWeaponBuildState(value)

  await dbSdk.setDoc(
    dbSdk.doc(db, DOC_COLLECTION, DOC_ID),
    {
      weaponBuilds,
      weaponBuildUpdatedAt: dbSdk.serverTimestamp(),
      weaponBuildUpdatedBy: user.uid,
    },
    { merge: true }
  )

  return weaponBuilds
}