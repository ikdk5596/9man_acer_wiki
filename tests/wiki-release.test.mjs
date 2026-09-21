import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolveConfig } from 'vitepress'

async function configFor(guides) {
  const previous = process.env.WIKI_GUIDES
  if (guides === undefined) delete process.env.WIKI_GUIDES
  else process.env.WIKI_GUIDES = guides
  try {
    return await resolveConfig('docs', 'build')
  } finally {
    if (previous === undefined) delete process.env.WIKI_GUIDES
    else process.env.WIKI_GUIDES = previous
  }
}

function homepage() {
  return {
    relativePath: 'index.md',
    frontmatter: { features: [
      { title: '정책 도감', link: '/policies/' },
      { title: '병사 도감', link: '/soldiers/' },
      { title: '장비 도감', link: '/equipment/' },
      { title: '영웅 도감', link: '/hero/' },
      { title: '개인공략', link: '/guides/' },
    ] },
  }
}

test('default release excludes board routes, nav and homepage features', async () => {
  const config = await configFor(undefined)
  assert.equal(config.pages.some(page => page.startsWith('guides/')), false)
  assert.equal(config.site.themeConfig.nav.some(item => item.link === '/guides/'), false)
  const page = homepage()
  await config.transformPageData?.(page, { siteConfig: config })
  assert.deepEqual(page.frontmatter.features.map(item => item.link), ['/policies/', '/soldiers/', '/equipment/', '/hero/'])
})

test('wiki theme does not expose GitHub links', async () => {
  const config = await configFor(undefined)
  assert.doesNotMatch(JSON.stringify(config.site.themeConfig), /github\.com|"icon":"github"/i)
})

test('explicit local opt-in retains board routes, nav and homepage feature', async () => {
  const config = await configFor('1')
  assert(config.pages.includes('guides/index.md'))
  assert(config.pages.includes('guides/write.md'))
  assert(config.site.themeConfig.nav.some(item => item.link === '/guides/'))
  const page = homepage()
  await config.transformPageData?.(page, { siteConfig: config })
  assert.equal(page.frontmatter.features.length, 5)
})

test('equipment sidebar exposes every exclusive weapon listed in the catalog', async () => {
  const config = await configFor(undefined)
  const source = readFileSync(new URL('../docs/equipment/index.md', import.meta.url), 'utf8').split('## 전용 무기')[1]
  const expected = [...source.matchAll(/<a class="icon-card" href="([^"]+)">.*?<span class="icon-name">([^<]+)<\/span>/g)].map(match => ({
    text: match[2].replaceAll('&amp;', '&'),
    link: '/equipment/' + match[1].replaceAll('&amp;', '&'),
  }))
  assert.equal(expected.length, 24)
  const group = config.site.themeConfig.sidebar['/equipment/'].find(item => item.text === '전용 무기')
  assert(group, 'exclusive weapon sidebar group missing')
  assert.equal(group.collapsed, true)
  assert.deepEqual(group.items, expected)
})

test('talent source pages are excluded in both release and local mode', async () => {
  for (const guides of [undefined, '1']) {
    const config = await configFor(guides)
    assert.equal(config.pages.some(page => page.startsWith('talents/')), false)
  }
})

test('home hero actions include the hero catalog', () => {
  const source = readFileSync(new URL('../docs/index.md', import.meta.url), 'utf8').split('features:')[0]
  assert.match(source, /text: 영웅 도감 보기\s+link: \/hero\//)
})

test('local search uses Korean labels and keeps both release bases enabled', async () => {
  const previous = process.env.WIKI_BASE
  try {
    for (const base of ['/', '/9man_acer_wiki/']) {
      process.env.WIKI_BASE = base
      const config = await configFor(undefined)
      assert.equal(config.site.themeConfig.search.provider, 'local')
      assert.equal(config.site.themeConfig.search.options?.translations?.button?.buttonText, '검색')
      assert.equal(config.site.themeConfig.search.options?.translations?.modal?.footer?.selectText, '선택')
    }
  } finally {
    if (previous === undefined) delete process.env.WIKI_BASE
    else process.env.WIKI_BASE = previous
  }
})

test('home hero catalog uses the crown icon', () => {
  const source = readFileSync(new URL('../docs/index.md', import.meta.url), 'utf8')
  assert.match(source, /icon: 👑\s+title: 영웅 도감/)
})

test('hero sidebar groups every hero by the catalog troop order', async () => {
  const config = await configFor(undefined)
  const records = JSON.parse(readFileSync(new URL('../scripts/data/heroes.json', import.meta.url), 'utf8'))
  const source = readFileSync(new URL('../docs/hero/index.md', import.meta.url), 'utf8')
  const troops = [...source.matchAll(/^## (.+)$/gm)].map(match => match[1])
  const groups = config.site.themeConfig.sidebar['/hero/'].slice(1)
  const names = Object.values(JSON.parse(readFileSync(new URL('../scripts/data/soldier_names.json', import.meta.url), 'utf8')))
  assert.equal(troops.length, 24)
  assert.deepEqual(groups.map(group => group.text), troops)
  for (const group of groups) {
    assert.equal(group.collapsed, true)
    const expected = records.filter(hero => (names.find(entry => entry.heroTroop === hero.troop)?.name ?? hero.troop) === group.text).map(hero => ({
      text: hero.name,
      link: '/hero/' + hero.name.trim().replace(/\s+/g, '_'),
    }))
    assert.deepEqual(group.items, expected)
  }
  const links = groups.flatMap(group => group.items.map(item => item.link))
  assert.equal(links.length, 59)
  assert.equal(new Set(links).size, 59)
})
