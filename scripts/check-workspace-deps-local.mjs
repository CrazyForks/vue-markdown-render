#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
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
      console.log('Usage: node scripts/check-workspace-deps-local.mjs --package-json <path>')
      process.exit(0)
    }
    throw new Error(`[check-workspace-deps-local] Unknown argument: ${token}`)
  }

  return args
}

function resolvePackageJsonPath(packageJson) {
  const fromCwd = resolve(process.cwd(), packageJson)
  if (existsSync(fromCwd))
    return fromCwd
  return resolve(root, packageJson)
}

const args = parseArgs(process.argv.slice(2))
const packageJsonPath = resolvePackageJsonPath(args.packageJson)
const rootPackageJson = readJson(packageJsonPath)

for (const dep of workspaceDeps) {
  const dependencyVersion = rootPackageJson.dependencies?.[dep.name]
  if (!dependencyVersion)
    throw new Error(`[check-workspace-deps-local] ${rootPackageJson.name} does not depend on ${dep.name}.`)

  const depPackageJson = readJson(resolve(root, dep.packageJson))
  const targetVersion = depPackageJson.version
  if (!targetVersion || typeof targetVersion !== 'string')
    throw new Error(`[check-workspace-deps-local] Invalid version in ${dep.packageJson}`)

  if (dependencyVersion !== 'workspace:*' && dependencyVersion !== targetVersion) {
    throw new Error(
      `[check-workspace-deps-local] ${dep.name} must use workspace:* or exact local version ${targetVersion}, got ${dependencyVersion}.`,
    )
  }

  console.log(`[check-workspace-deps-local] OK: ${dep.name}@${targetVersion} matches ${dependencyVersion}.`)
}
