import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const distDir = resolve(root, 'playground/dist')
const requiredMarkers = [
  '--ms-background:',
  '--ms-foreground:',
  '--code-bg:',
]

function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  }
  catch {
    return false
  }
}

function collectCssFiles(dir, files = []) {
  let entries = []

  try {
    entries = readdirSync(dir, { withFileTypes: true })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`[playground-css] Unable to read ${relative(root, dir)}: ${message}`)
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      collectCssFiles(fullPath, files)
      continue
    }

    if (entry.isFile() && entry.name.endsWith('.css'))
      files.push(fullPath)
  }

  return files
}

if (!isDirectory(distDir)) {
  console.error(
    '[playground-css] Missing playground/dist. Run `pnpm play:build` before this check.',
  )
  process.exit(1)
}

const cssFiles = collectCssFiles(distDir)

if (cssFiles.length === 0) {
  console.error('[playground-css] playground/dist contains no CSS assets.')
  process.exit(1)
}

const combinedCss = cssFiles
  .map(file => readFileSync(file, 'utf8'))
  .join('\n')

const missingMarkers = requiredMarkers.filter(marker => !combinedCss.includes(marker))

if (missingMarkers.length > 0) {
  console.error('[playground-css] Markstream CSS markers are missing from playground deploy assets:')
  for (const marker of missingMarkers)
    console.error(`  - ${marker}`)
  console.error('\nCSS assets checked:')
  for (const file of cssFiles)
    console.error(`  - ${relative(root, file)}`)
  process.exit(1)
}

console.log(
  `[playground-css] Found Markstream CSS markers in ${cssFiles.length} playground CSS asset(s).`,
)
