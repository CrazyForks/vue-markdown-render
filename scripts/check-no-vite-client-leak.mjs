#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const roots = [
  'dist',
  'packages/markstream-react/dist',
  'packages/markstream-vue2/dist',
].filter(existsSync)

const files = []

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name)
    const stat = statSync(file)

    if (stat.isDirectory()) {
      walk(file)
      continue
    }

    if (
      file.endsWith('.d.ts')
      || file.endsWith('.d.mts')
      || file.endsWith('.d.cts')
    ) {
      files.push(file)
    }
  }
}

for (const root of roots)
  walk(root)

const leaking = files.filter(file =>
  readFileSync(file, 'utf8').includes('vite/client'),
)

if (leaking.length > 0) {
  throw new Error(
    `[check-no-vite-client-leak] Published declarations reference vite/client:\n${leaking.join('\n')}`,
  )
}
