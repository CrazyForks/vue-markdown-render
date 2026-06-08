#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const npmViewAttempts = 30
const npmViewDelayMs = 2000

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

function parseArgs(argv) {
  const args = {
    packageJson: 'package.json',
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--package-json') {
      args.packageJson = argv[i + 1] ?? args.packageJson
      i += 1
      continue
    }
    if (token === '--help' || token === '-h') {
      console.log('Usage: node scripts/check-workspace-deps-published.mjs --package-json <path>')
      process.exit(0)
    }
    throw new Error(`[check-workspace-deps-published] Unknown argument: ${token}`)
  }

  return args
}

function resolvePackageJsonPath(packageJson) {
  const fromCwd = resolve(process.cwd(), packageJson)
  if (existsSync(fromCwd))
    return fromCwd
  return resolve(root, packageJson)
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

async function waitForPublishedVersion(packageName, version) {
  let publishedVersion = null
  let sawNpmViewError = false

  for (let attempt = 1; attempt <= npmViewAttempts; attempt++) {
    try {
      publishedVersion = npmViewVersion(packageName, version)
      if (publishedVersion === version)
        return publishedVersion
    }
    catch {
      sawNpmViewError = true
    }

    if (attempt < npmViewAttempts)
      await new Promise(resolve => setTimeout(resolve, npmViewDelayMs))
  }

  if (sawNpmViewError && !publishedVersion) {
    throw new Error(
      `[check-workspace-deps-published] ${packageName}@${version} is not visible on npm after ${npmViewAttempts} attempts. Publish ${packageName} first.`,
    )
  }

  throw new Error(
    `[check-workspace-deps-published] Expected ${packageName}@${version} on npm, got ${publishedVersion || 'none'} after ${npmViewAttempts} attempts. Publish ${packageName} first.`,
  )
}

const args = parseArgs(process.argv.slice(2))
const packageJsonPath = resolvePackageJsonPath(args.packageJson)
const packageJson = readJson(packageJsonPath)
let checked = 0

for (const dep of workspaceDeps) {
  const dependencyVersion = packageJson.dependencies?.[dep.name]
  if (!dependencyVersion)
    continue

  checked += 1

  const depPackageJson = readJson(resolve(root, dep.packageJson))
  const targetVersion = depPackageJson.version
  if (!targetVersion || typeof targetVersion !== 'string')
    throw new Error(`[check-workspace-deps-published] Invalid version in ${dep.packageJson}`)

  if (dependencyVersion !== 'workspace:*' && dependencyVersion !== targetVersion) {
    throw new Error(
      `[check-workspace-deps-published] ${dep.name} must use workspace:* or exact local version ${targetVersion}, got ${dependencyVersion}.`,
    )
  }

  await waitForPublishedVersion(dep.name, targetVersion)

  console.log(`[check-workspace-deps-published] OK: ${packageJson.name} -> ${dep.name}@${targetVersion} is published.`)
}

if (checked === 0)
  console.log(`[check-workspace-deps-published] Skip: ${packageJson.name} has no tracked workspace deps.`)
