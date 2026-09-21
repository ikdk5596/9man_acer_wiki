import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'docs/.vitepress/dist')
const origin = 'https://acer-wiki.web.app'

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

const files = walk(dist)
const pages = files.filter(file => file.endsWith('.html'))
assert(pages.length > 0, 'Build the wiki before checking it')
let references = 0
for (const file of pages) {
  const html = readFileSync(file, 'utf8')
  const page = relative(dist, file).split(sep).join('/')
  const route = page.endsWith('index.html') ? page.slice(0, -10) : page.slice(0, -5)
  for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) {
    const href = match[1].replaceAll('&amp;', '&')
    if (/^(?:#|data:|mailto:|tel:|javascript:)/i.test(href)) continue
    const url = new URL(href, `${origin}/${route}`)
    if (url.origin !== origin) continue
    const path = decodeURIComponent(url.pathname)
    assert(!path.startsWith('/9man_acer_wiki/'), `Old Pages prefix in ${page}: ${href}`)
    const target = resolve(dist, `.${path}`)
    assert(target === dist || target.startsWith(dist + sep), `Invalid path: ${href}`)
    assert(
      existsSync(target) || existsSync(target + '.html') || existsSync(resolve(target, 'index.html')),
      `Missing internal link/asset in ${page}: ${href}`,
    )
    references++
  }
}
const home = readFileSync(resolve(dist, 'index.html'), 'utf8')
assert(home.includes('href="/favicon.svg"'), 'Firebase favicon must use the site root')
assert(!existsSync(resolve(dist, 'guides')), 'Unfinished board routes must not be deployed')
for (const file of files.filter(file => /\.(?:html|js|json)$/.test(file))) {
  const name = relative(dist, file).split(sep).join('/')
  assert(!/GuideBoard|GuideEditor|guides_(?:index|write)/.test(name), `Board bundle must not be deployed: ${name}`)
  const content = readFileSync(file, 'utf8')
  assert(!/\/guides\/|acer-guides|guide-images\//.test(content), `Board link or client leaked into production: ${name}`)
}
const config = JSON.parse(readFileSync(resolve(root, 'firebase.json'), 'utf8'))
const rc = JSON.parse(readFileSync(resolve(root, '.firebaserc'), 'utf8'))
assert.equal(config.hosting.target, 'wiki')
assert.equal(config.hosting.public, 'docs/.vitepress/dist')
assert.equal(config.hosting.cleanUrls, true)
assert(!config.hosting.rewrites, 'Do not replace missing wiki pages with an SPA homepage')
assert.equal(rc.projects.default, 'acer-wiki')
assert.deepEqual(rc.targets['acer-wiki'].hosting.wiki, ['acer-wiki'])
console.log(`PASS: Firebase build — ${pages.length} HTML pages, ${references} local references, root favicon, exact hosting target; unfinished board excluded.`)
