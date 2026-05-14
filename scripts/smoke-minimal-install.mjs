import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const tmp = mkdtempSync(join(tmpdir(), 'markstream-vue-minimal-'))
let packedTarball = ''
let packedParserTarball = ''
let packedCoreTarball = ''

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

  const candidateTarballs = [
    resolve(packedFilename),
    resolve(tmp, basename(packedFilename)),
  ]
  const tarball = candidateTarballs.find(existsSync) ?? ''
  if (!tarball)
    throw new Error(`Packed tarball not found: ${packedFilename}`)
  return tarball
}

function readTarString(buffer) {
  const end = buffer.indexOf(0)
  return buffer.subarray(0, end === -1 ? buffer.length : end).toString('utf8').trim()
}

function readTgzEntry(tarball, entryName) {
  const archive = gunzipSync(readFileSync(tarball))
  let offset = 0
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0))
      break

    const name = readTarString(header.subarray(0, 100))
    const prefix = readTarString(header.subarray(345, 500))
    const path = prefix ? `${prefix}/${name}` : name
    const size = Number.parseInt(readTarString(header.subarray(124, 136)) || '0', 8)
    const bodyOffset = offset + 512

    if (path === entryName)
      return archive.subarray(bodyOffset, bodyOffset + size).toString('utf8')

    offset = bodyOffset + Math.ceil(size / 512) * 512
  }
  throw new Error(`Packed tarball entry not found: ${entryName}`)
}

function ensureBuiltArtifacts() {
  const parserDist = join(root, 'packages/markdown-parser/dist/index.js')
  const coreDist = join(root, 'packages/markstream-core/dist/index.js')
  const rootDist = join(root, 'dist/index.js')

  if (!existsSync(parserDist))
    run('pnpm', ['run', 'build:parser'])

  if (!existsSync(coreDist))
    run('pnpm', ['run', 'build:core'])

  if (!existsSync(rootDist))
    run('pnpm', ['run', 'build'])
}

try {
  if (process.env.MARKSTREAM_SMOKE_SKIP_BUILD !== '1') {
    run('pnpm', ['run', 'build:parser'])
    run('pnpm', ['build'])
  }
  else {
    ensureBuiltArtifacts()
  }

  packedParserTarball = packWorkspacePackage(join(root, 'packages/markdown-parser'))
  packedCoreTarball = packWorkspacePackage(join(root, 'packages/markstream-core'))
  packedTarball = packWorkspacePackage(root)

  const packedPackageJson = JSON.parse(readTgzEntry(packedTarball, 'package/package.json'))
  const dependencySections = [
    'dependencies',
    'peerDependencies',
    'optionalDependencies',
    'devDependencies',
  ]
  for (const section of dependencySections) {
    for (const [name, version] of Object.entries(packedPackageJson[section] ?? {})) {
      if (String(version).startsWith('workspace:'))
        throw new Error(`Packed ${section} leaked workspace protocol: ${name}@${version}`)
    }
  }
  for (const name of ['stream-markdown-parser', 'markstream-core']) {
    const version = packedPackageJson.dependencies?.[name]
    if (!version)
      throw new Error(`${name} missing from packed dependencies`)
    if (String(version).startsWith('workspace:'))
      throw new Error(`${name} leaked workspace protocol`)
    if (String(version).startsWith('file:'))
      throw new Error(`${name} leaked file protocol`)
  }

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const smokePackage = {
    private: true,
    type: 'module',
    packageManager: pkg.packageManager,
    scripts: {
      build: 'vite build',
    },
    dependencies: {
      [pkg.name]: `file:${packedTarball}`,
      typescript: '^5.9.3',
      vite: '^7.3.1',
      vue: '^3.5.31',
    },
    devDependencies: {},
    pnpm: {
      onlyBuiltDependencies: ['esbuild'],
      overrides: {
        'stream-markdown-parser': `file:${packedParserTarball}`,
        'markstream-core': `file:${packedCoreTarball}`,
      },
    },
  }
  smokePackage.scripts['ssr:import'] = 'node ./ssr-import.mjs'
  smokePackage.dependencies['stream-markdown-parser'] = `file:${packedParserTarball}`
  smokePackage.dependencies['markstream-core'] = `file:${packedCoreTarball}`
  smokePackage.dependencies['@vue/server-renderer'] = '^3.5.31'
  smokePackage.dependencies['@vitejs/plugin-vue'] = '^5.2.4'
  writeProjectFile('package.json', `${JSON.stringify(smokePackage, null, 2)}\n`)

  writeProjectFile('index.html', '<div id="app"></div><script type="module" src="/src/main.ts"></script>\n')
  writeProjectFile('vite.config.ts', `import vue from '@vitejs/plugin-vue'\nimport { defineConfig } from 'vite'\n\nexport default defineConfig({ plugins: [vue()] })\n`)
  writeProjectFile('src/main.ts', `import { createApp } from 'vue'\nimport MarkdownRender from 'markstream-vue'\nimport 'markstream-vue/index.css'\nimport App from './App.vue'\n\ncreateApp(App).component('MarkdownRender', MarkdownRender).mount('#app')\n`)
  const smokeMarkdown = [
    '# Hello',
    '',
    '~~~ts',
    'console.log(1)',
    '~~~',
    '',
    '<div><a href="javascript:alert(1)">bad</a><span>safe</span></div>',
  ].join('\n')
  writeProjectFile('src/App.vue', `<script setup lang="ts">\nconst content = ${JSON.stringify(smokeMarkdown)}\n</script>\n\n<template>\n  <MarkdownRender :content="content" :final="true" :render-code-blocks-as-pre="true" />\n  <MarkdownRender :content="content" :final="true" />\n</template>\n`)
  const ssrMarkdown = [
    '~~~ts',
    'console.log(1)',
    '~~~',
    '',
    '<a href="javascript:alert(1)">bad</a>',
  ].join('\n')
  writeProjectFile('ssr-import.mjs', `import { existsSync } from 'node:fs'\nimport { fileURLToPath } from 'node:url'\nimport { createSSRApp, h } from 'vue'\nimport { renderToString } from '@vue/server-renderer'\nimport MarkdownRender, { MarkdownRender as NamedMarkdownRender } from 'markstream-vue'\n\nconst mod = await import('markstream-vue')\nif (!mod.default || !mod.MarkdownRender || !NamedMarkdownRender)\n  throw new Error('Root package import did not expose MarkdownRender')\n\nconst cssUrl = import.meta.resolve('markstream-vue/index.css')\nif (!existsSync(fileURLToPath(cssUrl)))\n  throw new Error('CSS export did not resolve to a file')\n\nconst html = await renderToString(createSSRApp({\n  render: () => h(MarkdownRender, {\n    content: ${JSON.stringify(ssrMarkdown)},\n    final: true,\n  }),\n}))\n\nif (!html || !html.includes('console.log'))\n  throw new Error('SSR render did not include code content')\n\nif (/javascript:alert/i.test(html))\n  throw new Error('SSR render kept unsafe javascript URL')\n`)

  run('pnpm', ['install', '--ignore-workspace'], { cwd: tmp })
  run('pnpm', ['run', 'build'], { cwd: tmp })
  run('pnpm', ['run', 'ssr:import'], { cwd: tmp })

  console.log(`[smoke-minimal-install] Passed in ${tmp}`)
}
finally {
  for (const tarball of [packedTarball, packedParserTarball, packedCoreTarball]) {
    if (tarball && existsSync(tarball))
      rmSync(tarball)
  }
  if (process.env.KEEP_MARKSTREAM_SMOKE_DIR !== '1')
    rmSync(tmp, { recursive: true, force: true })
  else
    console.log(`[smoke-minimal-install] Preserved ${pathToFileURL(tmp).href} (${basename(tmp)})`)
}
