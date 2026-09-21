import { validateMetadata, parseBody } from './content.mjs'

// SDK-independent write boundary: the browser adapter performs actual I/O.
export function createGuideApi(io) {
  function guard(uid) {
    if (!uid || io.currentUid() !== uid) throw new Error('로그인 계정이 변경되었습니다. 다시 로그인한 뒤 시도해 주세요.')
  }
  async function owned(id, uid) {
    guard(uid)
    const guide = await io.read(id)
    guard(uid)
    if (!guide || guide.authorId !== uid) throw new Error('본인이 작성한 공략만 수정할 수 있습니다.')
    return guide
  }
  return {
    guard,
    async save(id, fields, uid) {
      guard(uid)
      const metadata = validateMetadata(fields)
      parseBody(fields.body)
      if (!['draft', 'published'].includes(fields.status)) throw new Error('올바르지 않은 공개 상태입니다.')
      const data = { ...metadata, body: fields.body, status: fields.status, updatedAt: io.timestamp() }
      if (id) { await owned(id, uid); guard(uid); await io.update(id, data) }
      else { id = io.newId(); guard(uid); await io.create(id, { ...data, authorId: uid, createdAt: io.timestamp() }) }
      guard(uid)
      const saved = await io.read(id)
      guard(uid)
      if (!saved || saved.body !== data.body || saved.status !== data.status) throw new Error('저장 결과를 확인하지 못했습니다. 내 공략에서 확인해 주세요.')
      return saved
    },
    async remove(id, uid) {
      await owned(id, uid)
      guard(uid)
      await io.remove(id)
      guard(uid)
      // Deleting the document first immediately revokes public image access.
      const failures = []
      for (let slot = 0; slot < 10; slot++) {
        guard(uid)
        try { await io.deleteImage(uid, id, slot) }
        catch (error) { if (error.code !== 'storage/object-not-found') failures.push({ slot, error }) }
      }
      guard(uid)
      if (io.existsOwned ? await io.existsOwned(id, uid) : await io.read(id)) throw new Error('삭제 결과를 확인하지 못했습니다.')
      return failures
    },
  }
}
