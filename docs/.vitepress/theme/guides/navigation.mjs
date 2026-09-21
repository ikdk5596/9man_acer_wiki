import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, withBase } from 'vitepress'

export function guideHref(path = '/guides/', id) {
  const params = new URLSearchParams()
  if (id) params.set('id', id)
  if (typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('guideEmulator') === '1') params.set('guideEmulator', '1')
  return withBase(path) + (params.size ? `?${params}` : '')
}
export function useGuideId() {
  const id = ref('')
  const router = useRouter()
  let previous, handler
  onMounted(() => {
    const sync = () => { id.value = new URLSearchParams(location.search).get('id') || '' }
    sync()
    previous = router.onAfterRouteChange
    handler = async href => { await previous?.(href); sync() }
    router.onAfterRouteChange = handler
  })
  onBeforeUnmount(() => { if (router.onAfterRouteChange === handler) router.onAfterRouteChange = previous })
  return id
}
