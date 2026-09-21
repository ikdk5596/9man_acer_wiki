import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
console.log('LOCAL ONLY: demo-acer-wiki emulators; no production guide data.')
const result = spawnSync(process.execPath, [
  resolve(root, 'node_modules/vitepress/bin/vitepress.js'),
  'dev', 'docs', '--host', '127.0.0.1', '--port', '4180', '--strictPort',
], {
  cwd: root,
  env: { ...process.env, WIKI_BASE: '/', WIKI_GUIDES: '1', VITE_GUIDE_EMULATORS: '1' },
  stdio: 'inherit',
})
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
