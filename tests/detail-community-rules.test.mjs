import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, beforeEach, test } from 'node:test'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query,
  serverTimestamp, setDoc, Timestamp, updateDoc, where,
} from 'firebase/firestore'

const PROJECT = 'demo-acer-wiki'
for (const name of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT']) {
  if (process.env[name] && process.env[name] !== PROJECT) {
    throw new Error(`Refusing non-demo ${name}: ${process.env[name]}`)
  }
}
assert.equal(
  process.env.FIRESTORE_EMULATOR_HOST,
  '127.0.0.1:8180',
  'Run only via the loopback Firestore emulator config',
)

let env
const google = { email_verified: true, firebase: { sign_in_provider: 'google.com' } }
const oldTime = Timestamp.fromMillis(1000)
const actor = (uid = 'alice', claims = google) => env.authenticatedContext(uid, claims)
const anon = () => env.unauthenticatedContext()
const post = (overrides = {}) => ({
  resourceType: 'soldier',
  resourceId: '장창',
  resourceKey: 'soldier:장창',
  authorId: 'alice',
  authorName: 'Google Alice',
  title: '장창 운용 팁',
  body: '테스트 본문',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
})
const postRef = (context, id = 'post') => doc(context.firestore(), 'detailPosts', id)
const profileRef = (context, uid = 'alice') => doc(context.firestore(), 'profiles', uid)
const seedPost = async (id = 'post', overrides = {}) => env.withSecurityRulesDisabled(async context => {
  await setDoc(postRef(context, id), post({
    createdAt: oldTime,
    updatedAt: oldTime,
    ...overrides,
  }))
})

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      host: '127.0.0.1',
      port: 8180,
      rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  })
})
beforeEach(async () => { await env.clearFirestore() })
after(async () => { await env?.cleanup() })

test('Detail posts: anonymous user can read a post', async () => {
  await seedPost()
  const saved = await assertSucceeds(getDoc(postRef(anon())))
  assert.equal(saved.data().title, '장창 운용 팁')
})

test('Detail posts: public resource query with limit succeeds', async () => {
  await seedPost('first')
  await seedPost('second', { title: '두 번째 팁' })
  const target = query(
    collection(anon().firestore(), 'detailPosts'),
    where('resourceKey', '==', 'soldier:장창'),
    orderBy('createdAt', 'desc'),
    limit(30),
  )
  assert.equal((await assertSucceeds(getDocs(target))).size, 2)
})

test('Detail posts: list without a limit or above 30 is denied', async () => {
  const db = anon().firestore()
  await assertFails(getDocs(collection(db, 'detailPosts')))
  await assertFails(getDocs(query(collection(db, 'detailPosts'), limit(31))))
})

const deniedActors = [
  ['anonymous', () => anon()],
  ['password provider', () => actor('alice', { email_verified: true, firebase: { sign_in_provider: 'password' } })],
  ['unverified Google', () => actor('alice', { email_verified: false, firebase: { sign_in_provider: 'google.com' } })],
]
for (const [name, context] of deniedActors) {
  test(`Detail posts: ${name} cannot create`, async () => {
    await assertFails(setDoc(postRef(context()), post()))
  })
}

test('Detail posts: verified Google author can create', async () => {
  await assertSucceeds(setDoc(postRef(actor()), post()))
})

test('Detail posts: cannot forge another author', async () => {
  await assertFails(setDoc(postRef(actor('bob')), post()))
})

for (const [name, overrides] of [
  ['invalid resource type', { resourceType: 'hero', resourceKey: 'hero:장창' }],
  ['mismatched resource key', { resourceKey: 'soldier:다른값' }],
  ['empty resource id', { resourceId: '', resourceKey: 'soldier:' }],
  ['oversized resource id', { resourceId: 'x'.repeat(101), resourceKey: `soldier:${'x'.repeat(101)}` }],
  ['empty author name', { authorName: '' }],
  ['oversized author name', { authorName: 'x'.repeat(101) }],
  ['empty title', { title: '' }],
  ['oversized title', { title: 'x'.repeat(101) }],
  ['empty body', { body: '' }],
  ['oversized body', { body: 'x'.repeat(5001) }],
  ['extra field', { role: 'admin' }],
  ['past creation timestamp', { createdAt: oldTime }],
  ['past update timestamp', { updatedAt: oldTime }],
]) {
  test(`Detail posts: rejects ${name}`, async () => {
    await assertFails(setDoc(postRef(actor()), post(overrides)))
  })
}

test('Detail posts: accepts exact upper boundaries and exclusive weapon type', async () => {
  await assertSucceeds(setDoc(postRef(actor()), post({
    resourceType: 'exclusive-weapon',
    resourceId: 'x'.repeat(100),
    resourceKey: `exclusive-weapon:${'x'.repeat(100)}`,
    authorName: 'x'.repeat(100),
    title: 'x'.repeat(100),
    body: 'x'.repeat(5000),
  })))
})

test('Detail posts: owner can edit and delete own post', async () => {
  await seedPost()
  const target = postRef(actor())
  await assertSucceeds(updateDoc(target, {
    title: '수정된 제목',
    body: '수정된 본문',
    updatedAt: serverTimestamp(),
  }))
  const saved = (await getDoc(target)).data()
  assert.equal(saved.title, '수정된 제목')
  assert.equal(saved.createdAt.toMillis(), oldTime.toMillis())
  await assertSucceeds(deleteDoc(target))
})

test('Detail posts: another user cannot edit or delete a post', async () => {
  await seedPost()
  const target = postRef(actor('bob'))
  await assertFails(updateDoc(target, { title: '탈취', updatedAt: serverTimestamp() }))
  await assertFails(deleteDoc(target))
})

for (const [name, changes] of [
  ['resource type', { resourceType: 'exclusive-weapon', resourceKey: 'exclusive-weapon:장창' }],
  ['resource id', { resourceId: '다른병사', resourceKey: 'soldier:다른병사' }],
  ['resource key', { resourceKey: 'soldier:다른병사' }],
  ['author id', { authorId: 'bob' }],
  ['author name', { authorName: '변조된 이름' }],
  ['created timestamp', { createdAt: serverTimestamp() }],
]) {
  test(`Detail posts: owner cannot change immutable ${name}`, async () => {
    await seedPost()
    await assertFails(updateDoc(postRef(actor()), { ...changes, updatedAt: serverTimestamp() }))
  })
}

test('Profiles: public can read alias but cannot list profiles', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(profileRef(context), { alias: '창병왕', updatedAt: oldTime })
  })
  const saved = await assertSucceeds(getDoc(profileRef(anon())))
  assert.equal(saved.data().alias, '창병왕')
  await assertFails(getDocs(query(collection(anon().firestore(), 'profiles'), limit(1))))
})

test('Profiles: verified Google owner can create, update and delete alias', async () => {
  const target = profileRef(actor())
  await assertSucceeds(setDoc(target, { alias: '창병왕', updatedAt: serverTimestamp() }))
  await assertSucceeds(setDoc(target, { alias: '', updatedAt: serverTimestamp() }))
  await assertSucceeds(deleteDoc(target))
})

test('Profiles: another user cannot write or delete profile', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(profileRef(context), { alias: '창병왕', updatedAt: oldTime })
  })
  const target = profileRef(actor('bob'))
  await assertFails(setDoc(target, { alias: '탈취', updatedAt: serverTimestamp() }))
  await assertFails(deleteDoc(target))
})

for (const [name, data] of [
  ['oversized alias', { alias: 'x'.repeat(31), updatedAt: serverTimestamp() }],
  ['extra field', { alias: '정상', role: 'admin', updatedAt: serverTimestamp() }],
  ['past timestamp', { alias: '정상', updatedAt: oldTime }],
  ['wrong alias type', { alias: 123, updatedAt: serverTimestamp() }],
]) {
  test(`Profiles: rejects ${name}`, async () => {
    await assertFails(setDoc(profileRef(actor()), data))
  })
}
