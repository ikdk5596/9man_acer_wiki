import { validateImageInput, fitImage, MAX_IMAGE_BYTES, imageSlots, parseBody } from './content.mjs'

export async function validateDownloadedImage(blob) {
  // Bounded Firebase getBlob() calls slice the Blob without preserving its MIME.
  if (blob.size > MAX_IMAGE_BYTES || (blob.type && blob.type !== 'image/webp')) throw new Error('올바른 WebP 사진이 아닙니다.')
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  if (String.fromCharCode(...header.slice(0, 4)) !== 'RIFF' || String.fromCharCode(...header.slice(8, 12)) !== 'WEBP') throw new Error('사진 데이터가 손상되었습니다.')
  return blob.type ? blob : blob.slice(0, blob.size, 'image/webp')
}

export async function compressImage(file) {
  validateImageInput(file)
  const bitmap = await createImageBitmap(file)
  try {
    let { width, height } = fitImage(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    for (let shrink = 0; shrink < 4; shrink++) {
      canvas.width = width; canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('이 브라우저에서 사진을 변환할 수 없습니다.')
      context.drawImage(bitmap, 0, 0, width, height)
      for (const quality of [0.86, 0.72, 0.55, 0.38]) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality))
        if (!blob || blob.type !== 'image/webp') throw new Error('이 브라우저는 WebP 변환을 지원하지 않습니다.')
        if (blob.size <= MAX_IMAGE_BYTES) return blob
      }
      width = Math.max(1, Math.round(width * 0.75)); height = Math.max(1, Math.round(height * 0.75))
    }
    throw new Error('사진을 1 MiB 이하로 줄일 수 없습니다. 더 작은 사진을 선택해 주세요.')
  } finally { bitmap.close() }
}
export function revokeImages(urls) {
  for (const url of urls.values()) URL.revokeObjectURL(url)
  urls.clear()
}
export async function loadImages(client, guide, isCurrent = () => true) {
  const urls = new Map(); const errors = []
  const doc = parseBody(guide.body)
  for (const slot of imageSlots(doc)) {
    if (!isCurrent()) break
    try {
      const blob = await client.image(guide, slot)
      if (!isCurrent()) break
      urls.set(slot, URL.createObjectURL(blob))
    } catch (error) { errors.push(`사진 ${slot + 1}: ${error.message}${error.code ? ` (${error.code})` : ''}`) }
  }
  if (!isCurrent()) revokeImages(urls)
  return { doc, urls, errors }
}
