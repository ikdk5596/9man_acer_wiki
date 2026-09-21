// Every stored document crosses this strict JSON boundary before rendering.
export const MAX_BODY = 100000
export const MAX_IMAGE_BYTES = 1024 * 1024
export const MAX_INPUT_BYTES = 12 * 1024 * 1024
export const CATEGORIES = ['초보자', '병사·조합', '전투', '성장·운영', '기타']
export const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }
const block = ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'codeBlock', 'horizontalRule', 'image', 'table']
const children = { doc: block, paragraph: ['text', 'hardBreak'], heading: ['text', 'hardBreak'], blockquote: block, bulletList: ['listItem'], orderedList: ['listItem'], listItem: block, codeBlock: ['text'], table: ['tableRow'], tableRow: ['tableCell', 'tableHeader'], tableCell: block, tableHeader: block }
const attrs = { paragraph: ['textAlign'], heading: ['level', 'textAlign'], orderedList: ['start', 'type'], codeBlock: ['language'], image: ['src', 'alt', 'title', 'width', 'height'], table: [], tableRow: [], tableCell: ['colspan', 'rowspan', 'colwidth', 'align'], tableHeader: ['colspan', 'rowspan', 'colwidth', 'align'], link: ['href', 'target', 'rel', 'class'], textStyle: ['color'] }
const marks = ['bold', 'italic', 'strike', 'underline', 'code', 'link', 'textStyle']
function fail() { throw new Error('지원하지 않거나 손상된 공략 본문입니다.') }
function record(value) { return value && typeof value === 'object' && !Array.isArray(value) }
function checkAttrs(type, value = {}) {
  if (!record(value)) fail()
  for (const [key, v] of Object.entries(value)) {
    if (!(attrs[type] || []).includes(key)) fail()
    if (v === null && !['src', 'href', 'level'].includes(key)) continue
    if (key === 'src' && !/^guide-image:[0-9]$/.test(v)) fail()
    if (key === 'href' && !safeLink(v)) fail()
    if (key === 'color' && (typeof v !== 'string' || !/^(#[\da-f]{3,8}|rgba?\(\s*[\d.%,\s]+\))$/i.test(v))) fail()
    if (['textAlign', 'align'].includes(key) && !['left', 'center', 'right', 'justify'].includes(v)) fail()
    if (key === 'level' && ![1, 2, 3].includes(v)) fail()
    if (['width', 'height', 'colspan', 'rowspan', 'start'].includes(key) && (!Number.isInteger(v) || v < 1 || v > 1600)) fail()
    if (key === 'colwidth' && (!Array.isArray(v) || v.length > 20 || v.some(n => !Number.isInteger(n) || n < 1 || n > 1600))) fail()
    if (['alt', 'title', 'language', 'type'].includes(key) && (typeof v !== 'string' || v.length > 300)) fail()
    if (key === 'target' && !['_blank', '_self'].includes(v)) fail()
    if (key === 'rel' && (typeof v !== 'string' || !/^[a-z\s-]{0,100}$/.test(v))) fail()
    if (key === 'class' && v !== null) fail()
  }
  if (type === 'image' && typeof value.src !== 'string') fail()
  if (type === 'link' && !safeLink(value.href)) fail()
}
export function safeLink(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value)) return false
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) && !!url.hostname && !url.username && !url.password } catch { return false }
}
export function validateDoc(doc) {
  let count = 0; let imageCount = 0
  function visit(node, depth, parent) {
    if (!record(node) || ++count > 5000 || depth > 24 || typeof node.type !== 'string') fail()
    if (Object.keys(node).some(k => !['type', 'content', 'attrs', 'marks', 'text'].includes(k))) fail()
    if (parent ? !(children[parent] || []).includes(node.type) : node.type !== 'doc') fail()
    checkAttrs(node.type, node.attrs)
    if (node.type === 'image' && ++imageCount > 10) fail()
    if (node.type === 'text') { if (typeof node.text !== 'string' || !node.text.length || node.content) fail() }
    else if ('text' in node) fail()
    if (node.marks !== undefined) {
      if (node.type !== 'text' || !Array.isArray(node.marks) || node.marks.length > 7) fail()
      for (const mark of node.marks) {
        if (!record(mark) || !marks.includes(mark.type) || Object.keys(mark).some(k => !['type', 'attrs'].includes(k))) fail()
        checkAttrs(mark.type, mark.attrs)
      }
    }
    if (node.content !== undefined) {
      if (!Array.isArray(node.content) || !children[node.type]) fail()
      node.content.forEach(child => visit(child, depth + 1, node.type))
    }
  }
  visit(doc, 0)
  return doc
}
export function imageSlots(doc) {
  validateDoc(doc)
  const slots = new Set()
  const visit = n => { if (n.type === 'image') slots.add(Number(n.attrs.src.split(':')[1])); n.content?.forEach(visit) }
  visit(doc); return [...slots].sort((a, b) => a - b)
}
function mapNodes(doc, fn) {
  const node = fn({ ...doc, ...(doc.attrs ? { attrs: { ...doc.attrs } } : {}) })
  if (node.content) node.content = node.content.map(n => mapNodes(n, fn))
  return node
}
export function resolveImages(doc, urls) {
  validateDoc(doc)
  return mapNodes(doc, n => {
    if (n.type !== 'image') return n
    const slot = Number(n.attrs.src.split(':')[1]); const url = urls.get(slot)
    return url ? { ...n, attrs: { ...n.attrs, src: url } } : { type: 'paragraph', content: [{ type: 'text', text: `[사진 ${slot + 1}을 불러오지 못했습니다]` }] }
  })
}
export function serializeEditor(doc, urls) {
  const reverse = new Map([...urls].map(([slot, url]) => [url, slot]))
  return serializeBody(mapNodes(doc, n => {
    if (n.type !== 'image') return n
    if (!reverse.has(n.attrs?.src)) throw new Error('확인되지 않은 사진입니다. 업로드한 사진만 저장할 수 있습니다.')
    return { ...n, attrs: { ...n.attrs, src: `guide-image:${reverse.get(n.attrs.src)}` } }
  }))
}
export function nextImageSlot(persisted, current) {
  const occupied = new Set([...persisted, ...current])
  for (let slot = 0; slot < 10; slot++) if (!occupied.has(slot)) return slot
  return null
}
export function validateMetadata({ nickname, title, category }) {
  nickname = typeof nickname === 'string' ? nickname.trim() : ''
  title = typeof title === 'string' ? title.trim() : ''
  if (!nickname || nickname.length > 30) throw new Error('공개 별명을 1~30자로 입력해 주세요.')
  if (!title || title.length > 120) throw new Error('제목을 1~120자로 입력해 주세요.')
  if (!CATEGORIES.includes(category)) throw new Error('분류를 선택해 주세요.')
  return { nickname, title, category }
}
export function validateImageInput(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPEG, PNG, WebP 사진만 사용할 수 있습니다. SVG와 GIF는 지원하지 않습니다.')
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_INPUT_BYTES) throw new Error('원본 사진은 12 MiB 이하여야 합니다.')
}
export function fitImage(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width * height > 50000000) throw new Error('사진 크기가 올바르지 않거나 너무 큽니다.')
  const scale = Math.min(1, 1600 / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}
export function emulatorEnabled(hostname, search) {
  return ['localhost', '127.0.0.1'].includes(hostname) && new URLSearchParams(search).get('guideEmulator') === '1'
}
export function parseBody(body) {
  if (typeof body !== 'string' || body.length > MAX_BODY) fail()
  return validateDoc(JSON.parse(body))
}
export function serializeBody(doc) {
  validateDoc(doc)
  const body = JSON.stringify(doc)
  if (body.length > MAX_BODY) throw new Error('본문은 100,000자 이하여야 합니다.')
  return body
}
