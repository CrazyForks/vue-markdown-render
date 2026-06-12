import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, extname, relative, resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const docsDir = resolve(root, 'docs')
const publicDir = resolve(docsDir, 'public')
const distDir = resolve(docsDir, '.vitepress/dist')
const newHost = 'https://markstream.simonhe.me'
const oldHost = 'https://markstream-vue-docs.simonhe.me'
const oldHostRedirect = `${oldHost}/*  ${newHost}/:splat  301`

const scannedExtensions = new Set(['.html', '.xml', '.txt'])
const primaryLandingPaths = [
  '/',
  '/frameworks',
  '/frameworks/vue',
  '/frameworks/nuxt',
  '/frameworks/react',
  '/frameworks/next',
  '/frameworks/svelte',
  '/frameworks/angular',
  '/compare',
  '/compare/react-markdown',
  '/compare/streamdown',
  '/compare/marked-markdown-it',
  '/use-cases',
  '/use-cases/ai-chat-streaming',
  '/use-cases/sse-websocket',
  '/use-cases/mobile-webview',
  '/zh',
  '/zh/frameworks',
  '/zh/frameworks/vue',
  '/zh/frameworks/nuxt',
  '/zh/frameworks/react',
  '/zh/frameworks/next',
  '/zh/frameworks/svelte',
  '/zh/frameworks/angular',
  '/zh/compare/react-markdown',
  '/zh/compare/streamdown',
  '/zh/compare/marked-markdown-it',
  '/zh/use-cases/ai-chat-streaming',
  '/zh/use-cases/sse-websocket',
  '/zh/use-cases/mobile-webview',
]

const failures = []

function walkFiles(dir, ignoredNames = new Set()) {
  if (!existsSync(dir))
    return []

  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignoredNames.has(entry.name))
      continue

    const filePath = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(filePath, ignoredNames))
      continue
    }

    if (entry.isFile())
      files.push(filePath)
  }

  return files
}

function distRelative(filePath) {
  return relative(distDir, filePath).replace(/\\/g, '/')
}

function docsRelative(filePath) {
  return relative(docsDir, filePath).replace(/\\/g, '/')
}

function readDistFile(relativePath) {
  const filePath = resolve(distDir, relativePath)
  if (!existsSync(filePath)) {
    failures.push(`${relativePath} is missing from ${relative(root, distDir)}`)
    return null
  }

  return readFileSync(filePath, 'utf8')
}

function markdownRoutePath(filePath) {
  let route = `/${docsRelative(filePath).replace(/\.md$/, '')}`
  route = route.replace(/\/index$/, '')
  return route || '/'
}

function htmlFileForMarkdown(filePath) {
  return docsRelative(filePath).replace(/\.md$/, '.html')
}

function htmlFileForRoute(routePath) {
  if (routePath === '/')
    return 'index.html'

  const routePart = routePath.slice(1)
  const routeIndexFile = resolve(docsDir, routePart, 'index.md')
  if (existsSync(routeIndexFile))
    return `${routePart}/index.html`

  return `${routePart}.html`
}

function readFrontmatter(filePath) {
  const source = readFileSync(filePath, 'utf8')
  if (!source.startsWith('---\n'))
    return ''

  const endIndex = source.indexOf('\n---', 4)
  if (endIndex === -1)
    return ''

  return source.slice(4, endIndex)
}

function hasFrontmatterKey(frontmatter, key) {
  return new RegExp(`^${key}:`, 'm').test(frontmatter)
}

function hasStructuredDataType(content, type) {
  return content.includes(`"@type":"${type}"`)
    || content.includes(`&quot;@type&quot;:&quot;${type}&quot;`)
}

function expectContains(content, relativePath, marker, message) {
  if (!content.includes(marker))
    failures.push(`${relativePath} ${message}`)
}

if (!existsSync(distDir)) {
  console.error(`[docs-seo-output] ${relative(root, distDir)} does not exist. Run docs:build first.`)
  process.exit(1)
}

for (const filePath of walkFiles(distDir)) {
  if (!scannedExtensions.has(extname(filePath)))
    continue

  const relativePath = distRelative(filePath)
  const content = readFileSync(filePath, 'utf8')

  if (content.includes(oldHost))
    failures.push(`${relativePath} still contains old docs host ${oldHost}`)
}

const requiredNewHostFiles = [
  'sitemap.xml',
  'robots.txt',
  ...walkFiles(publicDir)
    .map(filePath => relative(publicDir, filePath).replace(/\\/g, '/'))
    .filter(filePath => basename(filePath).startsWith('llms') && filePath.endsWith('.txt')),
]

for (const relativePath of requiredNewHostFiles) {
  const content = readDistFile(relativePath)
  if (content && !content.includes(newHost))
    failures.push(`${relativePath} does not contain new docs host ${newHost}`)
}

const redirects = readDistFile('_redirects')
if (redirects)
  expectContains(redirects, '_redirects', oldHostRedirect, `is missing old docs host redirect ${oldHostRedirect}`)

for (const routePath of primaryLandingPaths) {
  const relativePath = htmlFileForRoute(routePath)
  const content = readDistFile(relativePath)
  if (!content)
    continue

  const canonicalUrl = `${newHost}${routePath === '/' ? '/' : routePath}`
  expectContains(content, relativePath, `<link rel="canonical" href="${canonicalUrl}">`, `is missing canonical ${canonicalUrl}`)
  expectContains(content, relativePath, `<meta property="og:url" content="${canonicalUrl}">`, `is missing og:url ${canonicalUrl}`)
}

for (const filePath of walkFiles(docsDir, new Set(['.vitepress', 'node_modules']))) {
  if (!filePath.endsWith('.md'))
    continue

  const frontmatter = readFrontmatter(filePath)
  const routePath = markdownRoutePath(filePath)
  const relativePath = htmlFileForMarkdown(filePath)
  const checks = []
  const isArticle = routePath.startsWith('/compare/') || routePath.startsWith('/zh/compare/')

  if (hasFrontmatterKey(frontmatter, 'faq')) {
    checks.push(['FAQPage', 'structured data'])
    checks.push(['markstream-faq', 'visible FAQ section'])
  }

  if (hasFrontmatterKey(frontmatter, 'softwarePackage'))
    checks.push(['SoftwareSourceCode', 'structured data'])

  if (isArticle)
    checks.push(['Article', 'structured data'])

  if (checks.length === 0)
    continue

  const content = readDistFile(relativePath)
  if (!content)
    continue

  for (const [marker, label] of checks) {
    const found = label === 'visible FAQ section'
      ? content.includes(marker)
      : hasStructuredDataType(content, marker)

    if (!found)
      failures.push(`${relativePath} is missing ${marker} ${label}`)
  }

  const lastVerifiedLine = frontmatter.split('\n').find(line => line.startsWith('lastVerified:'))
  let lastVerified = lastVerifiedLine ? lastVerifiedLine.slice('lastVerified:'.length).trim() : null
  if (
    lastVerified
    && (lastVerified.startsWith('\'') || lastVerified.startsWith('"'))
    && lastVerified.endsWith(lastVerified[0])
  ) {
    lastVerified = lastVerified.slice(1, -1)
  }
  const dateModifiedMarker = `"dateModified":"${lastVerified}"`
  if (
    isArticle
    && lastVerified
    && !content.includes(dateModifiedMarker)
    && !content.includes(dateModifiedMarker.replaceAll('"', '&quot;'))
  ) {
    failures.push(`${relativePath} is missing Article dateModified ${lastVerified}`)
  }
}

if (failures.length > 0) {
  console.error('[docs-seo-output] failed:')
  for (const failure of failures)
    console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('[docs-seo-output] Docs host output, redirects, canonical tags, LLM files, visible FAQ content, and JSON-LD types are valid.')
