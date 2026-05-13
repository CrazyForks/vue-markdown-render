import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const tmp = mkdtempSync(join(tmpdir(), 'markstream-vue-minimal-'))
let packedTarball = ''

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

try {
  run('pnpm', ['build'])

  const packOutput = execFileSync('pnpm', ['pack', '--pack-destination', tmp, '--json'], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  }).trim()
  const packInfo = JSON.parse(packOutput)
  const packedFilename = Array.isArray(packInfo) ? packInfo[0]?.filename : packInfo?.filename
  if (!packedFilename)
    throw new Error('pnpm pack did not return a tarball name')
  packedTarball = packedFilename

  const packedPackageJson = JSON.parse(execFileSync('tar', ['-xOf', packedTarball, 'package/package.json'], { encoding: 'utf8' }))
  for (const [name, version] of Object.entries(packedPackageJson.dependencies ?? {})) {
    if (String(version).startsWith('workspace:'))
      throw new Error(`Packed dependency leaked workspace protocol: ${name}@${version}`)
  }

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const smokePackage = {
    private: true,
    type: 'module',
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
  }
  smokePackage.scripts['ssr:import'] = 'node ./ssr-import.mjs'
  smokePackage.dependencies['@vitejs/plugin-vue'] = '^5.2.4'
  writeProjectFile('package.json', `${JSON.stringify(smokePackage, null, 2)}\n`)

  writeProjectFile('index.html', '<div id="app"></div><script type="module" src="/src/main.ts"></script>\n')
  writeProjectFile('vite.config.ts', `import vue from '@vitejs/plugin-vue'\nimport { defineConfig } from 'vite'\n\nexport default defineConfig({ plugins: [vue()] })\n`)
  writeProjectFile('src/main.ts', `import { createApp } from 'vue'\nimport MarkdownRender from 'markstream-vue'\nimport 'markstream-vue/index.css'\nimport App from './App.vue'\n\ncreateApp(App).component('MarkdownRender', MarkdownRender).mount('#app')\n`)
  writeProjectFile('src/App.vue', `<script setup lang="ts">\nconst content = '# Hello\\\\n\\\\n~~~ts\\\\nconsole.log(1)\\\\n~~~\\\\n\\\\n<div><a href="javascript:alert(1)">bad</a><span>safe</span></div>'\n</script>\n\n<template>\n  <MarkdownRender :content="content" :final="true" :render-code-blocks-as-pre="true" />\n</template>\n`)
  writeProjectFile('ssr-import.mjs', `import { existsSync } from 'node:fs'\nimport { fileURLToPath } from 'node:url'\n\nconst mod = await import('markstream-vue')\nif (!mod.default || !mod.MarkdownRender)\n  throw new Error('Root package import did not expose MarkdownRender')\n\nconst cssUrl = import.meta.resolve('markstream-vue/index.css')\nif (!existsSync(fileURLToPath(cssUrl)))\n  throw new Error('CSS export did not resolve to a file')\n`)

  run('pnpm', ['install', '--ignore-workspace'], { cwd: tmp })
  run('pnpm', ['run', 'build'], { cwd: tmp })
  run('pnpm', ['run', 'ssr:import'], { cwd: tmp })

  console.log(`[smoke-minimal-install] Passed in ${tmp}`)
}
finally {
  if (packedTarball && existsSync(packedTarball))
    rmSync(packedTarball)
  if (process.env.KEEP_MARKSTREAM_SMOKE_DIR !== '1')
    rmSync(tmp, { recursive: true, force: true })
  else
    console.log(`[smoke-minimal-install] Preserved ${pathToFileURL(tmp).href} (${basename(tmp)})`)
}
