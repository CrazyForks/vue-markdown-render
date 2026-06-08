#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const tmp = mkdtempSync(path.join(tmpdir(), 'markstream-shiki-dependent-imports-'))
const tarballs = []

const packages = [
  {
    name: 'stream-markdown-parser',
    dir: 'packages/markdown-parser',
    dist: 'packages/markdown-parser/dist/index.js',
    build: ['run', 'build:parser'],
  },
  {
    name: 'markstream-core',
    dir: 'packages/markstream-core',
    dist: 'packages/markstream-core/dist/index.js',
    build: ['run', 'build:core'],
  },
  {
    name: 'markstream-vue',
    dir: '.',
    dist: 'dist/index.js',
    build: ['run', 'build:pack'],
  },
  {
    name: 'markstream-react',
    dir: 'packages/markstream-react',
    dist: 'packages/markstream-react/dist/index.js',
    build: ['--filter', 'markstream-react', 'run', 'build'],
  },
  {
    name: 'markstream-vue2',
    dir: 'packages/markstream-vue2',
    dist: 'packages/markstream-vue2/dist/index.js',
    build: ['--filter', 'markstream-vue2', 'run', 'build'],
  },
]

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: options.stdio ?? 'inherit',
    encoding: options.encoding ?? 'utf8',
    env: {
      ...process.env,
      CI: '1',
      npm_config_auto_install_peers: 'false',
    },
  })
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function writeProjectFile(file, content) {
  const target = path.join(tmp, file)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, content)
}

function ensureBuiltPackage(pkg) {
  if (process.env.MARKSTREAM_SMOKE_SKIP_BUILD === '1' && existsSync(path.join(repoRoot, pkg.dist)))
    return

  run('pnpm', pkg.build)
}

function parsePnpmPackJsonOutput(output, packageName) {
  const chunks = [
    output.trim(),
    ...output.trim().split(/\r?\n/).reverse(),
  ]

  for (const chunk of chunks) {
    const trimmed = chunk.trim()
    if (!trimmed)
      continue

    const objectStart = trimmed.indexOf('{')
    const arrayStart = trimmed.indexOf('[')
    const start = arrayStart === -1
      ? objectStart
      : objectStart === -1
        ? arrayStart
        : Math.min(arrayStart, objectStart)

    if (start === -1)
      continue

    try {
      return JSON.parse(trimmed.slice(start))
    }
    catch {}
  }

  throw new Error(
    `[smoke-shiki-dependent-imports] Failed to parse pnpm pack --json output for ${packageName}:\n${output}`,
  )
}

function packPackage(pkg) {
  const output = execFileSync('pnpm', ['pack', '--pack-destination', tmp, '--json'], {
    cwd: path.join(repoRoot, pkg.dir),
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
  const parsed = parsePnpmPackJsonOutput(output, pkg.name)
  const filename = Array.isArray(parsed) ? parsed[0]?.filename : parsed?.filename
  if (!filename)
    throw new Error(`[smoke-shiki-dependent-imports] pnpm pack returned no filename for ${pkg.name}.`)

  const candidates = [
    path.resolve(filename),
    path.resolve(tmp, path.basename(filename)),
  ]
  const tarball = candidates.find(existsSync)
  if (!tarball)
    throw new Error(`[smoke-shiki-dependent-imports] Packed tarball not found for ${pkg.name}: ${filename}`)

  tarballs.push(tarball)
  return tarball
}

function readPackedPackageJson(tarball) {
  const raw = execFileSync(
    process.platform === 'win32' ? 'tar.exe' : 'tar',
    ['-xOf', tarball, 'package/package.json'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  return JSON.parse(raw)
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function rangeMentionsExactVersion(range, version) {
  const escapedVersion = escapeRegExp(version)
  return new RegExp(`(^|[^0-9A-Za-z.-])${escapedVersion}($|[^0-9A-Za-z.-])`).test(String(range))
}

function assertDependsOnPackedCore(packageName, tarball, expectedCoreVersion) {
  if (packageName === 'markstream-core' || packageName === 'stream-markdown-parser')
    return

  const manifest = readPackedPackageJson(tarball)
  const actual = manifest.dependencies?.['markstream-core']

  if (!actual)
    throw new Error(`[smoke-shiki-dependent-imports] ${packageName} package.json does not depend on markstream-core.`)

  if (!rangeMentionsExactVersion(actual, expectedCoreVersion)) {
    throw new Error(
      `[smoke-shiki-dependent-imports] ${packageName} depends on markstream-core@${actual}, expected a range containing ${expectedCoreVersion}.`,
    )
  }
}

try {
  const rootPackageJson = readJson(path.join(repoRoot, 'package.json'))
  const corePackageJson = readJson(path.join(repoRoot, 'packages/markstream-core/package.json'))
  const packed = new Map()

  for (const pkg of packages) {
    ensureBuiltPackage(pkg)
    const tarball = packPackage(pkg)
    assertDependsOnPackedCore(pkg.name, tarball, corePackageJson.version)
    packed.set(pkg.name, tarball)
  }

  writeProjectFile('package.json', `${JSON.stringify({
    private: true,
    type: 'module',
    packageManager: rootPackageJson.packageManager,
    scripts: {
      smoke: 'node smoke.mjs',
    },
    dependencies: {
      'markstream-vue': `file:${packed.get('markstream-vue')}`,
      'markstream-react': `file:${packed.get('markstream-react')}`,
      'markstream-core': `file:${packed.get('markstream-core')}`,
      'stream-markdown-parser': `file:${packed.get('stream-markdown-parser')}`,
      'stream-markdown': '^0.0.15',
      'shiki': '^4.0.2',
      'vue': '^3.5.31',
      'react': '^19.2.0',
      'react-dom': '^19.2.0',
    },
    pnpm: {
      overrides: {
        'markstream-core': `file:${packed.get('markstream-core')}`,
        'stream-markdown-parser': `file:${packed.get('stream-markdown-parser')}`,
      },
    },
  }, null, 2)}\n`)

  writeProjectFile('smoke.mjs', `import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const dependentPackages = [
  'markstream-vue',
  'markstream-react',
]

for (const name of dependentPackages) {
  const mod = await import(name)
  if (!mod || Object.keys(mod).length === 0)
    throw new Error(\`[smoke-shiki-dependent-imports] failed to import \${name}\`)
}

const core = await import('markstream-core')
for (const key of ['normalizeShikiLanguage', 'registerHighlightOnce', 'getRegisterHighlightOptions']) {
  if (!(key in core))
    throw new Error(\`[smoke-shiki-dependent-imports] markstream-core missing \${key}\`)
}

const registerOptions = core.getRegisterHighlightOptions(undefined, ['ts', 'js', 'ts'])
if (JSON.stringify(registerOptions) !== JSON.stringify({ langs: ['javascript', 'typescript'] }))
  throw new Error('[smoke-shiki-dependent-imports] markstream-core did not normalize Shiki langs.')

const streamMarkdown = await import('stream-markdown')
for (const key of ['registerHighlight', 'createShikiStreamRenderer']) {
  if (typeof streamMarkdown[key] !== 'function')
    throw new Error(\`[smoke-shiki-dependent-imports] stream-markdown missing \${key}\`)
}
`)

  writeProjectFile('vue2/package.json', `${JSON.stringify({
    private: true,
    type: 'module',
    packageManager: rootPackageJson.packageManager,
    scripts: {
      smoke: 'node smoke.mjs',
    },
    dependencies: {
      'markstream-vue2': `file:${packed.get('markstream-vue2')}`,
      'markstream-core': `file:${packed.get('markstream-core')}`,
      'stream-markdown-parser': `file:${packed.get('stream-markdown-parser')}`,
      'stream-markdown': '^0.0.15',
      'shiki': '^4.0.2',
      'vue': '2.6.14',
      '@vue/composition-api': '^1.7.2',
      'vue-demi': '^0.14.10',
    },
    pnpm: {
      overrides: {
        'markstream-core': `file:${packed.get('markstream-core')}`,
        'stream-markdown-parser': `file:${packed.get('stream-markdown-parser')}`,
      },
    },
  }, null, 2)}\n`)

  writeProjectFile('vue2/smoke.mjs', `import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const vue = require('vue')
if (!String(vue.version || '').startsWith('2.'))
  throw new Error(\`[smoke-shiki-dependent-imports] expected Vue 2, got \${vue.version}\`)

const cjsCompositionApi = require('@vue/composition-api')
const esmCompositionApi = await import('@vue/composition-api')
vue.use(cjsCompositionApi.default || cjsCompositionApi)
vue.use(esmCompositionApi.default || esmCompositionApi)

const vueDemi = require('vue-demi')
if (vueDemi.isVue2 !== true)
  throw new Error('[smoke-shiki-dependent-imports] vue-demi is not in Vue 2 mode')

const esm = await import('markstream-vue2')
const cjs = require('markstream-vue2')

for (const [format, mod] of [['esm', esm], ['cjs', cjs]]) {
  for (const key of ['MarkdownRender', 'MarkdownCodeBlockNode', 'useSmoothMarkdownStream']) {
    if (!(key in mod))
      throw new Error(\`[smoke-shiki-dependent-imports] markstream-vue2 \${format} missing \${key}\`)
  }
}
`)

  run('pnpm', ['install', '--ignore-workspace', '--strict-peer-dependencies=false'], { cwd: tmp })
  run('pnpm', ['run', 'smoke'], { cwd: tmp })

  const vue2Tmp = path.join(tmp, 'vue2')
  run('pnpm', ['install', '--ignore-workspace', '--strict-peer-dependencies=false'], { cwd: vue2Tmp })
  run('pnpm', ['exec', 'vue-demi-switch', '2'], { cwd: vue2Tmp })
  run('pnpm', ['run', 'smoke'], { cwd: vue2Tmp })

  console.log('[smoke-shiki-dependent-imports] Packed dependent imports passed.')
}
finally {
  for (const tarball of tarballs) {
    if (existsSync(tarball))
      rmSync(tarball)
  }
  if (process.env.KEEP_MARKSTREAM_SMOKE_DIR !== '1')
    rmSync(tmp, { recursive: true, force: true })
  else
    console.log(`[smoke-shiki-dependent-imports] Preserved ${tmp}`)
}
