#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function parseArgs(argv) {
  const args = {
    packageJson: 'package.json',
    dryRun: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const current = argv[i]
    if (current === '--package-json') {
      args.packageJson = argv[++i]
    }
    else if (current === '--dry-run') {
      args.dryRun = true
    }
    else if (current === '--help' || current === '-h') {
      console.log('Usage: node scripts/publish-current-package.mjs --package-json <path> [--dry-run]')
      process.exit(0)
    }
    else {
      throw new Error(`Unknown argument: ${current}`)
    }
  }

  return args
}

function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
  })

  if (result.status !== 0)
    process.exit(result.status ?? 1)
}

function packageVersionExists(name, version) {
  const result = spawnSync('npm', ['view', `${name}@${version}`, 'version'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return result.status === 0 && result.stdout.trim() === version
}

const args = parseArgs(process.argv.slice(2))
const packageJsonPath = path.resolve(repoRoot, args.packageJson)
const packageDir = path.dirname(packageJsonPath)
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

console.log(`[publish-current] ${packageJson.name}@${packageJson.version}`)
run('pnpm', ['-C', packageDir, 'run', 'build'])
run('npm', ['config', 'get', 'registry'], packageDir)
const published = !args.dryRun && packageVersionExists(packageJson.name, packageJson.version)
if (published) {
  console.log(`[publish-current] ${packageJson.name}@${packageJson.version} already exists on npm; skipping publish.`)
}
else {
  if (!args.dryRun)
    run('npm', ['whoami'], packageDir)
  if (packageDir === repoRoot)
    run('pnpm', ['publish', '--access', 'public', ...(args.dryRun ? ['--dry-run'] : [])], packageDir)
  else
    run('npm', ['publish', '--access', 'public', ...(args.dryRun ? ['--dry-run'] : [])], packageDir)
}
run('node', ['scripts/tag-package.mjs', '--package-json', path.relative(repoRoot, packageJsonPath), ...(args.dryRun ? ['--dry-run', '--allow-dirty'] : ['--push'])])
