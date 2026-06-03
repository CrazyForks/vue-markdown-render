import { readdir, rm } from 'node:fs/promises'
import { join, relative } from 'node:path'
import process from 'node:process'

// `styles-entry.ts` exists only to force Vite to emit the explicit CSS file
// exported through `markstream-vue/index.css`. The JS entry itself must never
// be published or imported by consumers.
const distDir = 'dist'
const forbiddenStyleEntryArtifactPattern = /^(?:styles|styles-entry)(?:[.-]|$)/

async function collectStyleEntryArtifacts(dir, artifacts = []) {
  let entries = []

  try {
    entries = await readdir(dir, { withFileTypes: true })
  }
  catch (error) {
    if (error?.code === 'ENOENT')
      return artifacts
    throw error
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      await collectStyleEntryArtifacts(fullPath, artifacts)
      continue
    }

    if (entry.isFile() && forbiddenStyleEntryArtifactPattern.test(entry.name))
      artifacts.push(fullPath)
  }

  return artifacts
}

const artifacts = await collectStyleEntryArtifacts(distDir)

await Promise.all(artifacts.map(artifact => rm(artifact, { force: true })))

for (const artifact of artifacts)
  console.log(`[cleanup-style-entry] Removed ${relative(process.cwd(), artifact)}`)
