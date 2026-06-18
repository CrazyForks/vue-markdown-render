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
  '/frameworks/vue2',
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
  '/zh/frameworks/vue2',
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
const jsonLdNodesByRelativePath = new Map()

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

function decodeHtmlEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#x22;/gi, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&#x27;/gi, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function structuredDataTypes(node) {
  const type = node?.['@type']
  if (typeof type === 'string')
    return [type]

  return Array.isArray(type) ? type.filter(item => typeof item === 'string') : []
}

function hasStructuredDataType(nodes, type) {
  return nodes.some(node => structuredDataTypes(node).includes(type))
}

function collectStructuredDataNodes(jsonLd) {
  if (Array.isArray(jsonLd))
    return jsonLd.flatMap(item => collectStructuredDataNodes(item))

  if (!jsonLd || typeof jsonLd !== 'object')
    return []

  if (Array.isArray(jsonLd['@graph']))
    return jsonLd['@graph'].filter(item => item && typeof item === 'object')

  return [jsonLd]
}

function parseStructuredDataNodes(content, relativePath) {
  const nodes = []
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  let match

  while ((match = scriptPattern.exec(content))) {
    const [, attrs, body] = match
    if (!/\btype=(["'])application\/ld\+json\1/i.test(attrs))
      continue

    try {
      nodes.push(...collectStructuredDataNodes(JSON.parse(decodeHtmlEntities(body.trim()))))
    }
    catch (error) {
      failures.push(`${relativePath} has invalid JSON-LD: ${error.message}`)
    }
  }

  return nodes
}

function hasNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function hasStringArray(value) {
  return Array.isArray(value) && value.some(item => hasNonEmptyString(item))
}

function hasOfferPrice(value) {
  const offers = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : []
  return offers.some(offer => hasNonEmptyString(offer.price))
}

function validateSoftwareApplicationNode(node, relativePath) {
  if (!hasNonEmptyString(node.name))
    failures.push(`${relativePath} SoftwareApplication is missing name`)

  if (!hasOfferPrice(node.offers))
    failures.push(`${relativePath} SoftwareApplication is missing offers.price`)

  if (!node.aggregateRating && !node.review)
    failures.push(`${relativePath} SoftwareApplication is missing aggregateRating or review`)

  if (node.softwareVersion === 'latest')
    failures.push(`${relativePath} SoftwareApplication uses non-specific softwareVersion "latest"`)
}

function validateSoftwareSourceCodeNode(node, relativePath) {
  for (const field of ['name', 'description', 'url', 'codeRepository', 'license', 'applicationCategory']) {
    if (!hasNonEmptyString(node[field]))
      failures.push(`${relativePath} SoftwareSourceCode is missing ${field}`)
  }

  if (!hasStringArray(node.programmingLanguage))
    failures.push(`${relativePath} SoftwareSourceCode is missing programmingLanguage`)

  if (!hasStringArray(node.sameAs))
    failures.push(`${relativePath} SoftwareSourceCode is missing sameAs`)
}

function validateFaqPageNode(node, relativePath) {
  if (!Array.isArray(node.mainEntity) || node.mainEntity.length === 0) {
    failures.push(`${relativePath} FAQPage is missing mainEntity`)
    return
  }

  for (const item of node.mainEntity) {
    if (!item || typeof item !== 'object' || !structuredDataTypes(item).includes('Question')) {
      failures.push(`${relativePath} FAQPage contains a non-Question mainEntity`)
      continue
    }

    if (!hasNonEmptyString(item.name))
      failures.push(`${relativePath} FAQPage Question is missing name`)

    const answer = item.acceptedAnswer
    if (!answer || typeof answer !== 'object' || !structuredDataTypes(answer).includes('Answer') || !hasNonEmptyString(answer.text))
      failures.push(`${relativePath} FAQPage Question is missing acceptedAnswer.text`)
  }
}

function validateArticleNode(node, relativePath, lastVerified) {
  for (const field of ['headline', 'description', 'url', 'mainEntityOfPage']) {
    if (!hasNonEmptyString(node[field]))
      failures.push(`${relativePath} Article is missing ${field}`)
  }

  if (lastVerified && node.dateModified !== lastVerified)
    failures.push(`${relativePath} is missing Article dateModified ${lastVerified}`)
}

function validateStructuredDataNodes(relativePath, nodes) {
  for (const node of nodes) {
    if (structuredDataTypes(node).includes('SoftwareApplication'))
      validateSoftwareApplicationNode(node, relativePath)
  }
}

function findStructuredDataNode(nodes, type) {
  return nodes.find(node => structuredDataTypes(node).includes(type))
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

  if (extname(filePath) === '.html') {
    const nodes = parseStructuredDataNodes(content, relativePath)
    jsonLdNodesByRelativePath.set(relativePath, nodes)
    validateStructuredDataNodes(relativePath, nodes)
  }
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

  if (hasFrontmatterKey(frontmatter, 'softwarePackage')) {
    checks.push(['SoftwareSourceCode', 'structured data'])
  }

  if (isArticle)
    checks.push(['Article', 'structured data'])

  if (checks.length === 0)
    continue

  const content = readDistFile(relativePath)
  if (!content)
    continue

  const structuredDataNodes = jsonLdNodesByRelativePath.get(relativePath) ?? parseStructuredDataNodes(content, relativePath)

  for (const [marker, label] of checks) {
    const found = label === 'visible FAQ section'
      ? content.includes(marker)
      : hasStructuredDataType(structuredDataNodes, marker)

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
  const softwareSourceCodeNode = findStructuredDataNode(structuredDataNodes, 'SoftwareSourceCode')
  if (softwareSourceCodeNode)
    validateSoftwareSourceCodeNode(softwareSourceCodeNode, relativePath)

  const faqPageNode = findStructuredDataNode(structuredDataNodes, 'FAQPage')
  if (faqPageNode)
    validateFaqPageNode(faqPageNode, relativePath)

  const articleNode = findStructuredDataNode(structuredDataNodes, 'Article')
  if (articleNode) {
    validateArticleNode(articleNode, relativePath, lastVerified)
  }
}

if (failures.length > 0) {
  console.error('[docs-seo-output] failed:')
  for (const failure of failures)
    console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('[docs-seo-output] Docs host output, redirects, canonical tags, LLM files, visible FAQ content, and JSON-LD nodes are valid.')
