import { withBase } from 'vitepress'

export function profileHref(uid) {
  const params = new URLSearchParams()
  if (uid) params.set('uid', uid)
  if (typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('guideEmulator') === '1') params.set('guideEmulator', '1')
  return withBase('/profile/') + (params.size ? `?${params}` : '')
}
