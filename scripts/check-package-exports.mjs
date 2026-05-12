import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
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

const failures = []

function normalizeTargets(entry) {
  if (typeof entry === 'string')
    return [{ condition: 'default', target: entry }]

  if (!entry || typeof entry !== 'object')
    return []

  return Object.entries(entry)
    .filter(([, value]) => typeof value === 'string')
    .map(([condition, target]) => ({ condition, target }))
}

function assertTargetExists(subpath, condition, target) {
  if (!target.startsWith('./'))
    return

  const fullPath = join(root, target)
  if (!existsSync(fullPath)) {
    failures.push(
      `${subpath} condition "${condition}" points to missing file: ${target}`,
    )
  }
}

for (const subpath of requiredSubpaths) {
  const entry = pkg.exports?.[subpath]

  if (!entry) {
    failures.push(`missing package export subpath: ${subpath}`)
    continue
  }

  const targets = normalizeTargets(entry)

  if (targets.length === 0) {
    failures.push(`package export subpath has no string targets: ${subpath}`)
    continue
  }

  for (const { condition, target } of targets)
    assertTargetExists(subpath, condition, target)
}

if (failures.length > 0) {
  console.error('[package-exports] Package export check failed:')
  for (const failure of failures)
    console.error(`  - ${failure}`)
  console.error(`\nIf this was intentional, update the requiredSubpaths list in ${relative(root, import.meta.url.slice('file://'.length))}`)
  process.exit(1)
}

console.log(`[package-exports] All ${requiredSubpaths.length} package export subpaths and targets are valid.`)
