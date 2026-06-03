import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

// `styles-entry.ts` exists only to force Vite to emit the explicit CSS file
// exported through `markstream-vue/index.css`. The JS entry itself must never
// be published or imported by consumers.
const distDir = 'dist'
const forbiddenStyleEntryArtifactPattern = /^styles(?:\.|$)/

let entries = []

try {
  entries = await readdir(distDir)
}
catch (error) {
  if (error?.code !== 'ENOENT')
    throw error
}

await Promise.all(
  entries
    .filter(name => forbiddenStyleEntryArtifactPattern.test(name))
    .map(name => rm(join(distDir, name), { recursive: true, force: true })),
)
