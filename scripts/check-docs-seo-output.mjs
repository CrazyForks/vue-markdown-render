import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const distDir = resolve(root, 'docs/.vitepress/dist')
const newHost = 'https://markstream.simonhe.me'
const oldHost = 'https://markstream-vue-docs.simonhe.me'

const htmlPages = [
  ['index.html', `${newHost}/`],
  ['frameworks/react.html', `${newHost}/frameworks/react`],
  ['frameworks/vue.html', `${newHost}/frameworks/vue`],
  ['frameworks/next.html', `${newHost}/frameworks/next`],
]

const hostFiles = [
  ...htmlPages.map(([file]) => file),
  'sitemap.xml',
  'robots.txt',
]

const failures = []

for (const file of hostFiles) {
  const filePath = resolve(distDir, file)

  if (!existsSync(filePath)) {
    failures.push(`${file} is missing from ${relative(root, distDir)}`)
    continue
  }

  const content = readFileSync(filePath, 'utf8')

  if (content.includes(oldHost))
    failures.push(`${file} still contains old docs host ${oldHost}`)

  if (!content.includes(newHost))
    failures.push(`${file} does not contain new docs host ${newHost}`)
}

for (const [file, canonicalUrl] of htmlPages) {
  const filePath = resolve(distDir, file)

  if (!existsSync(filePath))
    continue

  const content = readFileSync(filePath, 'utf8')
  const canonicalTag = `<link rel="canonical" href="${canonicalUrl}">`
  const ogUrlTag = `<meta property="og:url" content="${canonicalUrl}">`

  if (!content.includes(canonicalTag))
    failures.push(`${file} is missing canonical ${canonicalUrl}`)

  if (!content.includes(ogUrlTag))
    failures.push(`${file} is missing og:url ${canonicalUrl}`)
}

if (failures.length > 0) {
  console.error('[docs-seo-output] failed:')
  for (const failure of failures)
    console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('[docs-seo-output] canonical, sitemap, robots, and JSON-LD use the current docs host.')
