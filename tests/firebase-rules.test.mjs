import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query,
  serverTimestamp, setDoc, Timestamp, updateDoc, where,
} from 'firebase/firestore';
import { deleteObject, getBytes, list, ref, uploadBytes } from 'firebase/storage';

// Never inherit a production project, bucket, or network destination.
const PROJECT = 'demo-acer-wiki';
const BUCKET = `gs://${PROJECT}.appspot.com`;
for (const name of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT']) {
  if (process.env[name] && process.env[name] !== PROJECT) {
    throw new Error(`Refusing non-demo ${name}: ${process.env[name]}`);
  }
}
for (const [name, expected] of Object.entries({
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
})) {
  assert.equal(process.env[name], expected, `Run via the loopback emulator config; unsafe/missing ${name}`);
}
let env;
const google = { email_verified: true, firebase: { sign_in_provider: 'google.com' } };
const oldTime = Timestamp.fromMillis(1000);
const body = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
const actor = (uid = 'alice', claims = google) => env.authenticatedContext(uid, claims);
const anon = () => env.unauthenticatedContext();
const guide = (overrides = {}) => ({
  authorId: 'alice', nickname: 'Synthetic Author', title: 'Synthetic guide',
  category: '초보자', body, status: 'draft',
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...overrides,
});
const guideRef = (context, id = 'guide') => doc(context.firestore(), 'guides', id);
const seed = async (id = 'guide', overrides = {}) => env.withSecurityRulesDisabled(async context => {
  await setDoc(guideRef(context, id), guide({ createdAt: oldTime, updatedAt: oldTime, ...overrides }));
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { host: '127.0.0.1', port: 8180, rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
    storage: { host: '127.0.0.1', port: 9199, rules: await readFile(new URL('../storage.rules', import.meta.url), 'utf8') },
  });
});
beforeEach(async () => {
  await env.clearStorage();
  await env.clearFirestore();
});
after(async () => { await env?.cleanup(); });

const deniedActors = [
  ['anonymous', () => anon()],
  ['password provider', () => actor('alice', { email_verified: true, firebase: { sign_in_provider: 'password' } })],
  ['unverified Google', () => actor('alice', { email_verified: false, firebase: { sign_in_provider: 'google.com' } })],
  ['missing verification', () => actor('alice', { firebase: { sign_in_provider: 'google.com' } })],
  ['missing provider', () => actor('alice', { email_verified: true })],
];
for (const [name, context] of deniedActors) {
  test(`Firestore: ${name} cannot create`, async () => {
    await assertFails(setDoc(guideRef(context()), guide()));
  });
}
test('Firestore: cannot forge another author', async () => {
  await assertFails(setDoc(guideRef(actor('bob')), guide()));
});

const invalidFields = [
  ['nickname empty', { nickname: '' }], ['nickname oversized', { nickname: 'x'.repeat(31) }],
  ['title empty', { title: '' }], ['title oversized', { title: 'x'.repeat(121) }],
  ['body oversized', { body: 'x'.repeat(100001) }],
  ['invalid category', { category: 'admin' }], ['invalid status', { status: 'hidden' }],
  ['extra field', { role: 'admin' }],
  ['past creation timestamp', { createdAt: oldTime }], ['past update timestamp', { updatedAt: oldTime }],
];
const wrongTypes = {
  authorId: 42, nickname: 42, title: [], category: 42, body: {},
  status: false, createdAt: 'now', updatedAt: 42,
};
for (const field of Object.keys(wrongTypes)) {
  invalidFields.push([`${field} null`, { [field]: null }]);
  invalidFields.push([`${field} wrong type`, { [field]: wrongTypes[field] }]);
}
for (const [name, overrides] of invalidFields) {
  test(`Firestore: rejects create ${name}`, async () => {
    await assertFails(setDoc(guideRef(actor()), guide(overrides)));
  });
}
for (const field of Object.keys(guide())) {
  test(`Firestore: rejects missing ${field}`, async () => {
    const data = guide();
    delete data[field];
    await assertFails(setDoc(guideRef(actor()), data));
  });
}
test('Firestore: accepts exact string upper boundaries', async () => {
  await assertSucceeds(setDoc(guideRef(actor()), guide({
    nickname: 'x'.repeat(30), title: 'x'.repeat(120), body: 'x'.repeat(100000), status: 'published',
  })));
});
for (const category of ['초보자', '병사·조합', '전투', '성장·운영', '기타']) {
  test(`Firestore: accepts category ${category}`, async () => {
    await assertSucceeds(setDoc(guideRef(actor()), guide({ category, nickname: 'x', title: 'x' })));
  });
}

// Single-document reads intentionally do not require query constraints.
test('Firestore: anonymous reader can get published guide', async () => {
  await seed('guide', { status: 'published' });
  assert.equal((await assertSucceeds(getDoc(guideRef(anon())))).data().status, 'published');
});
test('Firestore: verified owner can get draft', async () => {
  await seed();
  assert.equal((await assertSucceeds(getDoc(guideRef(actor())))).data().status, 'draft');
});
for (const [name, context] of [...deniedActors, ['other Google user', () => actor('bob')]]) {
  test(`Firestore: ${name} cannot get draft`, async () => {
    await seed();
    await assertFails(getDoc(guideRef(context())));
  });
  test(`Firestore: ${name} cannot update or delete another guide`, async () => {
    await seed();
    const target = guideRef(context());
    await assertFails(updateDoc(target, { title: 'Hacked', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(target));
  });
}
test('Firestore: author can edit, publish, unpublish and delete own guide', async () => {
  await seed();
  const target = guideRef(actor());
  for (const status of ['published', 'draft']) {
    await assertSucceeds(updateDoc(target, { title: 'Updated', status, updatedAt: serverTimestamp() }));
    const saved = (await getDoc(target)).data();
    assert.equal(saved.status, status);
    assert.equal(saved.createdAt.toMillis(), oldTime.toMillis());
    assert.ok(saved.updatedAt.toMillis() > oldTime.toMillis());
  }
  await assertSucceeds(deleteDoc(target));
  await env.withSecurityRulesDisabled(async context => {
    assert.equal((await getDoc(guideRef(context))).exists(), false);
  });
});
for (const [name, overrides] of [
  ['author changed', { authorId: 'bob' }],
  ['creation time changed', { createdAt: serverTimestamp() }],
  ['update time omitted', {}],
  ...invalidFields.filter(([name]) => name !== 'past creation timestamp'),
]) {
  test(`Firestore: rejects update ${name}`, async () => {
    await seed();
    const changes = name === 'update time omitted' ? { title: 'Edited' } : { updatedAt: serverTimestamp(), ...overrides };
    await assertFails(updateDoc(guideRef(actor()), changes));
  });
}
for (const field of Object.keys(guide())) {
  test(`Firestore: rejects replacement missing ${field}`, async () => {
    await seed();
    const replacement = guide({ createdAt: oldTime });
    delete replacement[field];
    await assertFails(setDoc(guideRef(actor()), replacement));
  });
}
const guidesQuery = (context, ...constraints) => query(collection(context.firestore(), 'guides'), ...constraints);
test('Firestore: public published query accepts limit 20 and newest ordering', async () => {
  await seed('public', { status: 'published' });
  await seed('private');
  const results = await assertSucceeds(getDocs(guidesQuery(anon(), where('status', '==', 'published'), orderBy('updatedAt', 'desc'), limit(20))));
  assert.deepEqual(results.docs.map(item => item.id), ['public']);
});
test('Firestore: own-author query includes drafts with limit 20', async () => {
  await seed('mine');
  await seed('theirs', { authorId: 'bob' });
  const results = await assertSucceeds(getDocs(guidesQuery(actor(), where('authorId', '==', 'alice'), orderBy('updatedAt', 'desc'), limit(20))));
  assert.deepEqual(results.docs.map(item => item.id), ['mine']);
});
for (const [name, context, constraints] of [
  ['public missing limit', () => anon(), [where('status', '==', 'published')]],
  ['public limit 21', () => anon(), [where('status', '==', 'published'), limit(21)]],
  ['owner missing limit', () => actor(), [where('authorId', '==', 'alice')]],
  ['owner limit 21', () => actor(), [where('authorId', '==', 'alice'), limit(21)]],
  ['public unscoped', () => anon(), [limit(20)]],
  ['owner unscoped', () => actor(), [limit(20)]],
  ['other author', () => actor('bob'), [where('authorId', '==', 'alice'), limit(20)]],
  ['public draft query', () => anon(), [where('status', '==', 'draft'), limit(20)]],
  ['mixed-status query', () => anon(), [where('status', 'in', ['draft', 'published']), limit(20)]],
  ['non-Google owner query', () => actor('alice', { email_verified: true, firebase: { sign_in_provider: 'password' } }), [where('authorId', '==', 'alice'), limit(20)]],
]) {
  test(`Firestore: denies list ${name} even if collection empty`, async () => {
    await assertFails(getDocs(guidesQuery(context(), ...constraints)));
  });
}
test('Firestore: no access to other collections or guide subcollections', async () => {
  for (const path of ['users/alice', 'roles/alice', 'guides/guide/private/secret']) {
    await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), path), { secret: true }));
    for (const context of [actor(), anon()]) {
      const target = doc(context.firestore(), path);
      await assertFails(getDoc(target));
      await assertFails(setDoc(target, { secret: false }));
      await assertFails(deleteDoc(target));
    }
  }
});

const imagePath = (uid = 'alice', id = 'guide', filename = '0.webp') => `guide-images/${uid}/${id}/${filename}`;
const imageRef = (context, path = imagePath()) => ref(context.storage(BUCKET), path);
// Deliberately synthetic bytes: these rules validate declared MIME, not file content.
const imageBytes = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);
const upload = (context, path = imagePath(), bytes = imageBytes, contentType = 'image/webp') =>
  uploadBytes(imageRef(context, path), bytes, { contentType });
const seedImage = async (path = imagePath()) => env.withSecurityRulesDisabled(async context => {
  await upload(context, path);
});

test('Storage: verified owner uploads to existing own guide', async () => {
  await seed();
  await assertSucceeds(upload(actor()));
  await env.withSecurityRulesDisabled(async context => {
    assert.deepEqual(new Uint8Array(await getBytes(imageRef(context))), imageBytes);
  });
});
for (const [name, context] of [...deniedActors, ['other Google user', () => actor('bob')]]) {
  test(`Storage: ${name} cannot create or overwrite owner image`, async () => {
    await seed();
    await assertFails(upload(context()));
    await seedImage();
    await assertFails(upload(context()));
    await assertFails(deleteObject(imageRef(context())));
  });
}
test('Storage: owner can overwrite own image', async () => {
  await seed();
  await seedImage();
  const changed = new Uint8Array([1, 2, 3]);
  await assertSucceeds(upload(actor(), imagePath(), changed));
  await env.withSecurityRulesDisabled(async context => {
    assert.deepEqual(new Uint8Array(await getBytes(imageRef(context))), changed);
  });
});
test('Storage: exact 1 MiB uploads accepted', async () => {
  await seed();
  await assertSucceeds(upload(actor(), imagePath(), new Uint8Array(1048576)));
});
for (const [name, bytes, contentType] of [
  ['oversized file', new Uint8Array(1048577), 'image/webp'],
  ['PNG type', imageBytes, 'image/png'],
  ['HTML type', imageBytes, 'text/html'],
  ['parameterized type', imageBytes, 'image/webp; charset=utf-8'],
]) {
  test(`Storage: rejects ${name} on create and overwrite`, async () => {
    await seed();
    await assertFails(upload(actor(), imagePath(), bytes, contentType));
    await seedImage();
    await assertFails(upload(actor(), imagePath(), bytes, contentType));
  });
}
test('Storage: rejects unspecified MIME type', async () => {
  await seed();
  await assertFails(uploadBytes(imageRef(actor()), imageBytes));
});
test('Storage: accepts only the ten numbered slots', async () => {
  await seed();
  for (let slot = 0; slot < 10; slot++) {
    await assertSucceeds(upload(actor(), imagePath('alice', 'guide', `${slot}.webp`)));
  }
});
for (const filename of ['10.webp', '-1.webp', '00.webp', 'x.webp', '0.png', '0.WEBP', '0.webp.exe', '0xwebp', 'nested/0.webp']) {
  test(`Storage: rejects filename ${filename}`, async () => {
    await seed();
    await assertFails(upload(actor(), imagePath('alice', 'guide', filename)));
  });
}
test('Storage: rejects upload without an existing parent', async () => {
  await assertFails(upload(actor()));
});
test('Storage: uid prefix cannot contradict parent author', async () => {
  await seed('guide', { authorId: 'bob', status: 'published' });
  await assertFails(upload(actor()));
  await seedImage();
  await assertFails(getBytes(imageRef(anon())));
  await assertFails(getBytes(imageRef(actor())));
});
test('Storage: author cannot upload under somebody else UID prefix', async () => {
  await seed();
  await assertFails(upload(actor(), imagePath('bob')));
});
test('Storage: existing orphan cannot be overwritten', async () => {
  await seedImage();
  await assertFails(upload(actor()));
});
test('Storage: published image can be fetched anonymously', async () => {
  await seed('guide', { status: 'published' });
  await seedImage();
  assert.deepEqual(new Uint8Array(await assertSucceeds(getBytes(imageRef(anon())))), imageBytes);
});
test('Storage: draft image readable only by verified Google owner', async () => {
  await seed();
  await seedImage();
  assert.deepEqual(new Uint8Array(await assertSucceeds(getBytes(imageRef(actor())))), imageBytes);
  for (const [, context] of [...deniedActors, ['other user', () => actor('bob')]]) {
    await assertFails(getBytes(imageRef(context())));
  }
});
test('Storage: unpublishing revokes new anonymous image downloads', async () => {
  await seed('guide', { status: 'published' });
  await seedImage();
  await assertSucceeds(getBytes(imageRef(anon())));
  await assertSucceeds(updateDoc(guideRef(actor()), { status: 'draft', updatedAt: serverTimestamp() }));
  await assertFails(getBytes(imageRef(anon())));
  await assertSucceeds(getBytes(imageRef(actor())));
});
test('Storage: parent removal revokes all reads but owner can clean up', async () => {
  await seed('guide', { status: 'published' });
  await seedImage();
  await assertSucceeds(deleteDoc(guideRef(actor())));
  await assertFails(getBytes(imageRef(actor())));
  await assertFails(getBytes(imageRef(anon())));
  await assertFails(deleteObject(imageRef(actor('bob'))));
  await assertSucceeds(deleteObject(imageRef(actor())));
  await env.withSecurityRulesDisabled(async context => {
    await assert.rejects(getBytes(imageRef(context)), { code: 'storage/object-not-found' });
  });
});
test('Storage: owner can delete image while parent still exists', async () => {
  await seed();
  await seedImage();
  await assertSucceeds(deleteObject(imageRef(actor())));
});
test('Storage: object listing denied including owner and public parent', async () => {
  await seed('guide', { status: 'published' });
  await seedImage();
  for (const context of [anon(), actor(), actor('bob')]) {
    for (const path of ['', 'guide-images', 'guide-images/alice', 'guide-images/alice/guide']) {
      await assertFails(list(imageRef(context, path), { maxResults: 10 }));
    }
  }
});
test('Storage: all other paths and invalid filenames deny read/write/delete', async () => {
  await seed('guide', { status: 'published' });
  for (const path of ['other/alice/guide/0.webp', 'guide-images/alice/guide/10.webp', 'guide-images/alice/0.webp']) {
    await assertFails(upload(actor(), path));
    await seedImage(path);
    for (const context of [actor(), anon()]) {
      await assertFails(getBytes(imageRef(context, path)));
      await assertFails(deleteObject(imageRef(context, path)));
    }
  }
});

test('Firestore: verified Google author can create a draft with server timestamps', async () => {
  await assertSucceeds(setDoc(guideRef(actor()), guide()));
  await env.withSecurityRulesDisabled(async context => {
    const saved = await getDoc(guideRef(context));
    assert.equal(saved.data().authorId, 'alice');
    assert.equal(saved.data().status, 'draft');
    assert.equal(saved.data().createdAt.toMillis(), saved.data().updatedAt.toMillis());
    assert.ok(saved.data().createdAt.toMillis() > oldTime.toMillis());
  });
});
