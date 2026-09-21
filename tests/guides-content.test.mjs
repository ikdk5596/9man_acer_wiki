import test from 'node:test'
import assert from 'node:assert/strict'
import * as content from '../docs/.vitepress/theme/guides/content.mjs'

test('untrusted bodies reject executable URLs, HTML, alien nodes and attributes', () => {
  const invalid = [
    { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://evil.example/pixel' } }] },
    { type: 'doc', content: [{ type: 'image', attrs: { src: 'guide-image:10' } }] },
    { type: 'doc', content: [{ type: 'script', text: 'alert(1)' }] },
    { type: 'doc', content: [{ type: 'paragraph', attrs: { onclick: 'alert(1)' } }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'textStyle', attrs: { color: 'url(https://evil)' } }] }] }] },
    { type: 'doc', content: [{ type: 'text', text: 'invalid direct child' }] },
  ]
  for (const doc of invalid) assert.throws(() => content.parseBody(JSON.stringify(doc)))
  assert.throws(() => content.parseBody('<img onerror=alert(1)>'))
  assert.throws(() => content.parseBody(JSON.stringify(paragraph('x'.repeat(100001)))))
  let deep = { type: 'paragraph' }; for (let i = 0; i < 40; i++) deep = { type: 'blockquote', content: [deep] }
  assert.throws(() => content.serializeBody({ type: 'doc', content: [deep] }))
  assert.throws(() => content.serializeBody({ type: 'doc', content: Array.from({ length: 5001 }, () => ({ type: 'paragraph' })) }))
})

test('image slots resolve only through a current-guide map and never persist blob URLs', () => {
  const doc = { type: 'doc', content: [{ type: 'image', attrs: { src: 'guide-image:2', alt: '진형' } }] }
  const map = new Map([[2, 'blob:local-image']])
  const resolved = content.resolveImages(doc, map)
  assert.equal(resolved.content[0].attrs.src, 'blob:local-image')
  assert.equal(content.serializeEditor(resolved, map), JSON.stringify(doc))
  assert.throws(() => content.serializeEditor(resolved, new Map()))
  assert.deepEqual(content.imageSlots(doc), [2])
  assert.equal(content.nextImageSlot([0, 1], [2, 3]), 4)
  assert.equal(content.nextImageSlot([0,1,2,3,4,5,6,7,8,9], []), null)
  assert.equal(content.resolveImages(doc, new Map()).content[0].type, 'paragraph')
})

test('metadata, raster limits and emulator opt-in are bounded', () => {
  assert.deepEqual(content.validateMetadata({ nickname: ' 별명 ', title: ' 공략 ', category: '기타' }), { nickname: '별명', title: '공략', category: '기타' })
  for (const nickname of ['', 'x'.repeat(31)]) assert.throws(() => content.validateMetadata({ nickname, title: 'x', category: '기타' }))
  assert.throws(() => content.validateMetadata({ nickname: 'a', title: 'x', category: 'unknown' }))
  for (const type of ['image/svg+xml', 'image/gif', 'text/plain']) assert.throws(() => content.validateImageInput({ type, size: 10 }))
  assert.throws(() => content.validateImageInput({ type: 'image/png', size: 13 * 1024 * 1024 }))
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) assert.doesNotThrow(() => content.validateImageInput({ type, size: 100 }))
  assert.deepEqual(content.fitImage(3200, 800), { width: 1600, height: 400 })
  assert.equal(content.emulatorEnabled('localhost', '?guideEmulator=1'), true)
  assert.equal(content.emulatorEnabled('evil.example', '?guideEmulator=1'), false)
  assert.equal(content.emulatorEnabled('localhost', ''), false)
})

test('write boundary preserves owner/createdAt and checks account races', async () => {
  const { createGuideApi } = await import('../docs/.vitepress/theme/guides/api.mjs')
  let uid = 'alice'; const calls = []; let stored
  const io = {
    currentUid: () => uid,
    timestamp: () => 'SERVER_TIME',
    newId: () => 'new-guide',
    read: async () => stored,
    create: async (id, data) => { calls.push(['create', id, data]); stored = { id, ...data } },
    update: async (id, data) => { calls.push(['update', id, data]); stored = { ...stored, ...data } },
    remove: async () => { calls.push(['remove']); stored = null },
    deleteImage: async (owner, id, slot) => { calls.push(['deleteImage', slot]) },
  }
  const api = createGuideApi(io)
  const fields = { nickname: '닉네임', title: '제목', category: '기타', body: JSON.stringify(paragraph()), status: 'draft' }
  const saved = await api.save(null, fields, 'alice')
  assert.equal(saved.id, 'new-guide')
  assert.deepEqual(Object.keys(calls[0][2]).sort(), ['authorId','nickname','title','category','body','status','createdAt','updatedAt'].sort())
  await api.save(saved.id, { ...fields, status: 'published' }, 'alice')
  assert.equal('createdAt' in calls[1][2], false)
  assert.equal('authorId' in calls[1][2], false)
  uid = 'bob'
  await assert.rejects(() => api.save(saved.id, fields, 'alice'), /계정/)
  uid = 'alice'; await api.remove(saved.id, 'alice')
  assert.equal(calls[2][0], 'remove')
  assert.equal(calls.filter(c => c[0] === 'deleteImage').length, 10)
})

test('editor schema supports safe tables, links and headings without external image parsing', async () => {
  const { getSchema } = await import('@tiptap/core')
  const { guideExtensions } = await import('../docs/.vitepress/theme/guides/extensions.mjs')
  const schema = getSchema(guideExtensions())
  const doc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [{ type: 'text', text: '전투', marks: [{ type: 'bold' }] }] }, { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph' }] }, { type: 'tableCell', content: [{ type: 'paragraph' }] }] }] }] }
  schema.nodeFromJSON(doc).check()
  content.serializeBody(schema.nodeFromJSON(doc).toJSON())
  assert.equal(schema.nodes.image.spec.parseDOM.length, 0)
})

const paragraph = (text = '공략입니다') => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

test('bounded SDK downloads retain valid WebP images after Blob.slice drops MIME', async () => {
  const { validateDownloadedImage } = await import('../docs/.vitepress/theme/guides/images.mjs')
  const original = new Blob(['RIFF', new Uint8Array(4), 'WEBP'], { type: 'image/webp' })
  const downloaded = original.slice(0, content.MAX_IMAGE_BYTES)
  assert.equal(downloaded.type, '')
  const validated = await validateDownloadedImage(downloaded)
  assert.equal(validated.type, 'image/webp')
  assert.deepEqual(await validated.arrayBuffer(), await original.arrayBuffer())
  await assert.rejects(() => validateDownloadedImage(new Blob(['not a WebP image'])))
  await assert.rejects(() => validateDownloadedImage(new Blob([original], { type: 'text/html' })))
  await assert.rejects(() => validateDownloadedImage(new Blob([original, new Uint8Array(content.MAX_IMAGE_BYTES)])))
})

test('normal Korean formatting round-trips as safe JSON', () => {
  const doc = paragraph()
  doc.content[0].attrs = { textAlign: 'center' }
  doc.content[0].content[0].marks = [{ type: 'bold' }, { type: 'textStyle', attrs: { color: '#c9862b' } }, { type: 'link', attrs: { href: 'https://example.com/공략', target: '_blank', rel: 'noopener noreferrer nofollow', class: null } }]
  assert.deepEqual(content.parseBody(content.serializeBody(doc)), doc)
})
