import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// Research captures and obsolete crops must not re-enter the public directory.
const publicAssets = spawnSync('python', ['-B', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_public_assets.py'], {
  cwd: root,
  stdio: 'inherit',
})
if (publicAssets.error) console.error(publicAssets.error.message)
if (publicAssets.status !== 0) process.exit(publicAssets.status ?? 1)
// Talent sources are maintained separately from the published hero pages.
const talents = spawnSync('python', [resolve(root, 'scripts/sync_hero_talents.py')], {
  cwd: root,
  stdio: 'inherit',
})
if (talents.error) console.error(talents.error.message)
if (talents.status !== 0) process.exit(talents.status ?? 1)
// Remove old local-board output before creating a Hosting release.
rmSync(resolve(root, 'docs/.vitepress/dist'), { recursive: true, force: true })
const result = spawnSync(process.execPath, [resolve(root, 'node_modules/vitepress/bin/vitepress.js'), 'build', 'docs'], {
  cwd: root,
  env: { ...process.env, WIKI_BASE: '/', WIKI_GUIDES: '0', VITE_GUIDE_EMULATORS: '0' },
  stdio: 'inherit',
})
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
