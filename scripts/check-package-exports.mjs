import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import process from 'node:process'

const root = process.cwd()

const pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'))

const requiredSubpaths = [
  '.',
  './utils',
  './utils/katex-threshold',
  './utils/performance-monitor',
  './utils/safeRaf',
  './index.css',
  './index.px.css',
  './index.tailwind.css',
  './tailwind',
  './workers/katexWorkerClient',
  './workers/mermaidWorkerClient',
  './workers/katexCdnWorker',
  './workers/mermaidCdnWorker',
  './workers/katexRenderer.worker',
  './workers/mermaidParser.worker',
]

const missing = requiredSubpaths.filter(key => !(key in pkg.exports))

if (missing.length > 0) {
  console.error('[package-exports] Missing package export subpaths:')
  for (const key of missing)
    console.error(`  - ${key}`)
  console.error(`\nIf this was intentional, update the requiredSubpaths list in ${relative(root, import.meta.url.slice('file://'.length))}`)
  process.exit(1)
}

console.log(`[package-exports] All ${requiredSubpaths.length} package export subpaths are present.`)
