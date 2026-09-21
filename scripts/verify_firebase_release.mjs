import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout } from 'node:timers/promises'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'docs/.vitepress/dist')
const origin = 'https://acer-wiki.web.app'
const checked = []

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

async function verify(route, file, expectedStatus = 200) {
  const expected = readFileSync(file)
  let failure
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const url = new URL(route, origin)
      url.searchParams.set('verify', `${Date.now()}-${attempt}`)
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) })
      assert.equal(response.status, expectedStatus, `${route}: HTTP status`)
      assert.equal(new URL(response.url).origin, origin, `${route}: unexpected redirect`)
      const actual = Buffer.from(await response.arrayBuffer())
      assert(actual.equals(expected), `${route}: live bytes differ from local release`)
      checked.push(route)
      return
    } catch (error) {
      failure = error
      if (attempt < 2) await setTimeout(1500)
    }
  }
  throw failure
}

async function batch(tasks) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(8, tasks.length) }, async () => {
    while (next < tasks.length) {
      const task = tasks[next++]
      await verify(...task)
    }
  }))
}

const pages = walk(dist).filter(file => file.endsWith('.html') && relative(dist, file) !== '404.html')
await batch(pages.map(file => {
  const name = relative(dist, file).split(sep).join('/')
  const route = '/' + (name.endsWith('index.html') ? name.slice(0, -10) : name.slice(0, -5))
  return [route, file]
}))
const pageCount = checked.length
const home = readFileSync(resolve(dist, 'index.html'), 'utf8')
assert(home.includes('Thanks to') && home.includes('Cellob (목양)'), 'Updated acknowledgments missing')
assert(!home.includes('도움 주신 분들') && !home.includes('/guides/'), 'Old heading or board link leaked')

const assets = new Set(['/favicon.svg'])
for (const file of pages) {
  const html = readFileSync(file, 'utf8')
  for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
    const path = match[1].replaceAll('&amp;', '&')
    if (path.startsWith('/assets/') || path.startsWith('/images/')) assets.add(path)
  }
}
await batch([...assets].map(path => [path, resolve(dist, '.' + decodeURIComponent(path))]))
const excluded = ['/guides/', '/guides/write', '/guides/index.html', '/guides/write.html']
await batch(excluded.map(route => [route, resolve(dist, '404.html'), 404]))
const excludedSources = [
  '/images/soldiers/_roster_raw2/roster_full.png',
  '/images/soldiers/roster/01_infantry.jpg',
  '/images/soldiers/detail_icons/장창.png',
  '/images/hero_tmp/bandicam 2026-09-20 19-24-17-414.jpg',
  '/images/panda.gif',
]
await batch(excludedSources.map(route => [route, resolve(dist, '404.html'), 404]))
console.log(JSON.stringify({ origin, pages: pageCount, assets: assets.size, excludedBoardRoutes: excluded.length, excludedSourceRoutes: excludedSources.length, acknowledgments: 'Thanks to: bono · 뚜시 · 휴가좋아 · Cellob (목양)', result: 'PASS: live HTML/assets match the local release; board and archived-source URLs return the built 404 page.' }, null, 2))
