#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

function parseArgs(argv) {
  const args = {
    packageJson: 'package.json',
    corePackageJson: '',
    corePackageName: 'markstream-core',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--package-json') {
      args.packageJson = argv[index + 1] ?? args.packageJson
      index += 1
      continue
    }
    if (token === '--core-package-json') {
      args.corePackageJson = argv[index + 1] ?? args.corePackageJson
      index += 1
      continue
    }
    if (token === '--core-package-name') {
      args.corePackageName = argv[index + 1] ?? args.corePackageName
      index += 1
    }
  }

  return args
}

function findRepoRoot(startDir) {
  let current = path.resolve(startDir)
  while (true) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml')))
      return current
    const parent = path.dirname(current)
    if (parent === current)
      return null
    current = parent
  }
}

function readJson(jsonPath) {
  const raw = fs.readFileSync(jsonPath, 'utf8')
  return JSON.parse(raw)
}

function resolvePath(baseDir, targetPath) {
  return path.isAbsolute(targetPath) ? targetPath : path.resolve(baseDir, targetPath)
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

let cachedDiffBase = null

function runGit(repoRoot, args, { ignoreStderr = false } = {}) {
  return execFileSync(
    'git',
    args,
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', ignoreStderr ? 'ignore' : 'pipe'],
    },
  ).trim()
}

function hasGitCommit(repoRoot, ref) {
  try {
    runGit(repoRoot, ['cat-file', '-e', `${ref}^{commit}`], { ignoreStderr: true })
    return true
  }
  catch {
    return false
  }
}

function ensureGitCommitAvailable(repoRoot, ref) {
  if (!ref || hasGitCommit(repoRoot, ref))
    return

  for (const remote of ['origin', 'upstream']) {
    try {
      runGit(repoRoot, ['fetch', '--no-tags', '--depth=1', remote, ref], {
        ignoreStderr: true,
      })

      if (hasGitCommit(repoRoot, ref))
        return
    }
    catch {
      // Try next remote.
    }
  }
}

function getExplicitDiffBase() {
  const direct = (
    process.env.GITHUB_BASE_SHA
    || process.env.MARKSTREAM_RELEASE_BASE_SHA
    || process.env.MARKSTREAM_DIFF_BASE
    || ''
  )
  if (direct)
    return direct

  const eventPath = process.env.GITHUB_EVENT_PATH
  if (eventPath && fs.existsSync(eventPath)) {
    try {
      const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'))
      const pullRequestBase = event?.pull_request?.base?.sha
      const pushBase = event?.before

      if (typeof pullRequestBase === 'string' && pullRequestBase)
        return pullRequestBase
      if (typeof pushBase === 'string' && pushBase && !/^0+$/.test(pushBase))
        return pushBase
    }
    catch {
      // Fall through to local refs.
    }
  }

  return ''
}

function getDiffBase(repoRoot) {
  const explicit = getExplicitDiffBase()
  if (explicit) {
    ensureGitCommitAvailable(repoRoot, explicit)

    if (hasGitCommit(repoRoot, explicit))
      return explicit
  }

  if (cachedDiffBase)
    return cachedDiffBase

  const refs = [
    process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : '',
    'origin/main',
    'origin/master',
    'upstream/main',
    'upstream/master',
    '@{upstream}',
  ].filter(Boolean)

  for (const ref of refs) {
    try {
      runGit(repoRoot, ['rev-parse', '--verify', ref], { ignoreStderr: true })
      const mergeBase = runGit(repoRoot, ['merge-base', 'HEAD', ref], { ignoreStderr: true })
      if (mergeBase) {
        cachedDiffBase = mergeBase
        return cachedDiffBase
      }
    }
    catch {
      // Ref not available locally.
    }
  }

  throw new Error(
    '[check-core-published] Unable to determine git diff base. '
    + 'Fetch origin/main or set GITHUB_BASE_SHA / MARKSTREAM_RELEASE_BASE_SHA / MARKSTREAM_DIFF_BASE.',
  )
}

function formatError(err) {
  return err instanceof Error ? err.message : String(err)
}

function isGitWorktree(repoRoot) {
  try {
    return runGit(repoRoot, ['rev-parse', '--is-inside-work-tree'], { ignoreStderr: true }) === 'true'
  }
  catch {
    return false
  }
}

function hasGitChanges(repoRoot, relativePath) {
  const base = getDiffBase(repoRoot)
  ensureGitCommitAvailable(repoRoot, base)

  try {
    const output = runGit(
      repoRoot,
      ['diff', '--name-only', `${base}...HEAD`, '--', relativePath],
      { ignoreStderr: true },
    ).trim()
    return output.length > 0
  }
  catch (err) {
    throw new Error(
      `[check-core-published] Unable to diff ${relativePath} against ${base}: ${formatError(err)}`,
    )
  }
}

function hasPackageVersionChanged(repoRoot, packageJsonRelativePath, targetVersion) {
  const base = getDiffBase(repoRoot)
  ensureGitCommitAvailable(repoRoot, base)

  try {
    const previousRaw = runGit(
      repoRoot,
      ['show', `${base}:${packageJsonRelativePath}`],
      { ignoreStderr: true },
    )
    const previousPackageJson = JSON.parse(previousRaw)
    return previousPackageJson.version !== targetVersion
  }
  catch (err) {
    throw new Error(
      `[check-core-published] Unable to read previous ${packageJsonRelativePath} from ${base}: ${formatError(err)}`,
    )
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const cwd = process.cwd()
  const repoRoot = findRepoRoot(cwd)

  const packageJsonPath = resolvePath(cwd, args.packageJson)
  const defaultCorePackageJsonPath = repoRoot
    ? path.join(repoRoot, 'packages/markstream-core/package.json')
    : path.resolve(cwd, 'packages/markstream-core/package.json')
  const corePackageJsonPath = resolvePath(cwd, args.corePackageJson || defaultCorePackageJsonPath)

  const packageJson = readJson(packageJsonPath)
  const dependencyVersion = packageJson.dependencies?.[args.corePackageName]

  if (!dependencyVersion) {
    console.log(`[check-core-published] Skip: ${packageJson.name} does not depend on ${args.corePackageName}.`)
    return
  }

  const corePackageJson = readJson(corePackageJsonPath)
  const targetVersion = corePackageJson.version
  if (!targetVersion || typeof targetVersion !== 'string') {
    throw new Error(`[check-core-published] Invalid version in ${corePackageJsonPath}`)
  }

  let publishedVersion = null
  try {
    publishedVersion = npmViewVersion(args.corePackageName, targetVersion)
  }
  catch {
    throw new Error(
      `[check-core-published] ${args.corePackageName}@${targetVersion} is not published yet. Publish ${args.corePackageName} first.`,
    )
  }

  if (publishedVersion !== targetVersion) {
    throw new Error(
      `[check-core-published] Expected ${args.corePackageName}@${targetVersion} on npm, got ${publishedVersion || 'none'}. Publish ${args.corePackageName} first.`,
    )
  }

  const isRepoGitWorktree = Boolean(repoRoot && isGitWorktree(repoRoot))
  const shouldCheckCoreSourceChanges = Boolean(
    isRepoGitWorktree
    && (
      process.env.CI === '1'
      || process.env.CI === 'true'
      || getExplicitDiffBase()
    ),
  )

  if (
    shouldCheckCoreSourceChanges
    && hasGitChanges(repoRoot, path.relative(repoRoot, path.dirname(corePackageJsonPath)))
    && !hasPackageVersionChanged(repoRoot, path.relative(repoRoot, corePackageJsonPath), targetVersion)
  ) {
    throw new Error(
      `[check-core-published] ${args.corePackageName}@${targetVersion} is already published, but local core files changed. Bump ${args.corePackageName} before publishing dependents.`,
    )
  }
  else if (isRepoGitWorktree && !shouldCheckCoreSourceChanges) {
    console.warn(
      '[check-core-published] Skip local core source diff guard because no CI/diff base was provided. '
      + 'Set GITHUB_BASE_SHA / MARKSTREAM_RELEASE_BASE_SHA / MARKSTREAM_DIFF_BASE to enable it locally.',
    )
  }

  console.log(`[check-core-published] OK: ${args.corePackageName}@${targetVersion} is published.`)
}

main()
