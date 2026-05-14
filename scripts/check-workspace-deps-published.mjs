#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

const workspaceDeps = [
  {
    name: 'markstream-core',
    packageJson: 'packages/markstream-core/package.json',
  },
  {
    name: 'stream-markdown-parser',
    packageJson: 'packages/markdown-parser/package.json',
  },
]

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function npmViewVersion(packageName, version) {
  const output = execFileSync(
    'npm',
    ['view', `${packageName}@${version}`, 'version', '--json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim()

  if (!output)
    return null

  const parsed = JSON.parse(output)
  if (typeof parsed === 'string')
    return parsed
  if (Array.isArray(parsed))
    return parsed[parsed.length - 1] ?? null
  return null
}

const rootPackageJson = readJson(resolve(root, 'package.json'))

for (const dep of workspaceDeps) {
  const dependencyVersion = rootPackageJson.dependencies?.[dep.name]
  if (!dependencyVersion)
    throw new Error(`[check-workspace-deps-published] ${rootPackageJson.name} does not depend on ${dep.name}.`)

  const depPackageJson = readJson(resolve(root, dep.packageJson))
  const targetVersion = depPackageJson.version
  if (!targetVersion || typeof targetVersion !== 'string')
    throw new Error(`[check-workspace-deps-published] Invalid version in ${dep.packageJson}`)

  if (!String(dependencyVersion).startsWith('workspace:') && dependencyVersion !== targetVersion) {
    throw new Error(
      `[check-workspace-deps-published] ${dep.name} must use workspace:* or exact local version ${targetVersion}, got ${dependencyVersion}.`,
    )
  }

  let publishedVersion = null
  try {
    publishedVersion = npmViewVersion(dep.name, targetVersion)
  }
  catch {
    throw new Error(
      `[check-workspace-deps-published] ${dep.name}@${targetVersion} is not published yet. Publish ${dep.name} first.`,
    )
  }

  if (publishedVersion !== targetVersion) {
    throw new Error(
      `[check-workspace-deps-published] Expected ${dep.name}@${targetVersion} on npm, got ${publishedVersion || 'none'}. Publish ${dep.name} first.`,
    )
  }

  console.log(`[check-workspace-deps-published] OK: ${dep.name}@${targetVersion} is published.`)
}
