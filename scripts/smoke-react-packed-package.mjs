import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const tmp = mkdtempSync(join(tmpdir(), 'markstream-react-pack-'))
const packedTarballs = []

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: options.cwd ?? root,
    stdio: options.stdio ?? 'inherit',
    encoding: options.encoding ?? 'utf8',
    env: {
      ...process.env,
      CI: '1',
      npm_config_auto_install_peers: 'false',
    },
  })
}

function writeProjectFile(path, content) {
  const fullPath = join(tmp, path)
  mkdirSync(join(fullPath, '..'), { recursive: true })
  writeFileSync(fullPath, content)
}

function packWorkspacePackage(cwd) {
  const packOutput = execFileSync('pnpm', ['pack', '--pack-destination', tmp, '--json'], {
    cwd,
    encoding: 'utf8',
    env: process.env,
  }).trim()
  const packInfo = JSON.parse(packOutput)
  const packedFilename = Array.isArray(packInfo) ? packInfo[0]?.filename : packInfo?.filename
  if (!packedFilename)
    throw new Error('pnpm pack did not return a tarball name')

  const tarball = [
    resolve(packedFilename),
    resolve(tmp, basename(packedFilename)),
  ].find(existsSync)

  if (!tarball)
    throw new Error(`Packed tarball not found: ${packedFilename}`)

  packedTarballs.push(tarball)
  return tarball
}

try {
  if (!existsSync(join(root, 'packages/markdown-parser/dist/index.js')))
    run('pnpm', ['run', 'build:parser'])

  if (!existsSync(join(root, 'packages/markstream-core/dist/index.js')))
    run('pnpm', ['run', 'build:core'])

  if (!existsSync(join(root, 'packages/markstream-react/dist/index.js')))
    run('pnpm', ['--filter', 'markstream-react', 'build'])

  const packedParserTarball = packWorkspacePackage(join(root, 'packages/markdown-parser'))
  const packedCoreTarball = packWorkspacePackage(join(root, 'packages/markstream-core'))
  const packedReactTarball = packWorkspacePackage(join(root, 'packages/markstream-react'))
  const rootPackageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

  writeProjectFile('package.json', `${JSON.stringify({
    private: true,
    type: 'module',
    packageManager: rootPackageJson.packageManager,
    dependencies: {
      'markstream-react': `file:${packedReactTarball}`,
      'react': '^18.3.1',
      'react-dom': '^18.3.1',
      'typescript': '^5.9.3',
    },
    pnpm: {
      overrides: {
        'markstream-core': `file:${packedCoreTarball}`,
        'stream-markdown-parser': `file:${packedParserTarball}`,
      },
    },
  }, null, 2)}\n`)

  writeProjectFile('smoke.mjs', `import { existsSync } from 'node:fs'\nimport { createRequire } from 'node:module'\nimport { fileURLToPath } from 'node:url'\n\nconst root = await import('markstream-react')\nif (!root.default || !root.NodeRenderer)\n  throw new Error('markstream-react root import did not expose NodeRenderer')\n\nconst next = await import('markstream-react/next')\nif (!next.default || !next.NodeRenderer)\n  throw new Error('markstream-react/next import did not expose NodeRenderer')\n\nconst server = await import('markstream-react/server')\nif (!server.default || !server.NodeRenderer)\n  throw new Error('markstream-react/server import did not expose NodeRenderer')\n\nconst tailwind = await import('markstream-react/tailwind')\nif (typeof (tailwind.default || tailwind.safeList) !== 'string')\n  throw new Error('markstream-react/tailwind import did not expose the generated safelist')\n\nconst require = createRequire(import.meta.url)\nconst tailwindCjs = require('markstream-react/tailwind')\nif (typeof (tailwindCjs.default || tailwindCjs.safeList || tailwindCjs) !== 'string')\n  throw new Error('markstream-react/tailwind require did not expose the generated safelist')\n\nfor (const specifier of [\n  'markstream-react/index.css',\n  'markstream-react/index.px.css',\n  'markstream-react/index.tailwind.css',\n  'markstream-react/workers/katexRenderer.worker',\n  'markstream-react/workers/mermaidParser.worker',\n]) {\n  const fileUrl = import.meta.resolve(specifier)\n  if (!existsSync(fileURLToPath(fileUrl)))\n    throw new Error(\`\${specifier} did not resolve to an installed file\`)\n}\n`)

  run('pnpm', ['install', '--ignore-workspace'], { cwd: tmp })
  run('node', ['smoke.mjs'], { cwd: tmp })

  console.log(`[smoke-react-packed-package] Packed React package smoke passed in ${tmp}`)
}
finally {
  for (const tarball of packedTarballs) {
    if (existsSync(tarball))
      rmSync(tarball)
  }

  if (process.env.KEEP_MARKSTREAM_SMOKE_DIR !== '1')
    rmSync(tmp, { recursive: true, force: true })
  else
    console.log(`[smoke-react-packed-package] Preserved ${tmp}`)
}
