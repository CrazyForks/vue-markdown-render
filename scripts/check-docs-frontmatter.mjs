import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const docsDefaultDescription = 'Streaming Markdown renderers for AI apps across Vue, React, Svelte, Angular, Nuxt, and Next.js'

const requiredGuideRoutes = [
  '/guide/react-next-ssr',
  '/guide/vitepress-docs-integration',
  '/guide/ai-chat-streaming',
  '/guide/performance',
  '/guide/security',
  '/guide/troubleshooting-path',
  '/guide/react-markdown-migration',
  '/guide/installation',
  '/guide/usage',
  '/guide/component-overrides',
]

const failures = []

function repoRelative(filePath) {
  return relative(root, filePath).replace(/\\/g, '/')
}

function markdownFileForRoute(route) {
  if (route === '/')
    return resolve(root, 'docs/index.md')

  const directFile = resolve(root, `docs${route}.md`)
  if (existsSync(directFile))
    return directFile

  return resolve(root, `docs${route}/index.md`)
}

function parseFrontmatter(filePath) {
  const source = readFileSync(filePath, 'utf8')
  if (!source.startsWith('---\n'))
    return { raw: '', body: source }

  const endIndex = source.indexOf('\n---', 4)
  if (endIndex === -1)
    return { raw: '', body: source }

  return {
    raw: source.slice(4, endIndex),
    body: source.slice(endIndex + 4),
  }
}

function frontmatterStringValue(frontmatter, key) {
  const line = frontmatter.split('\n').find(line => line.startsWith(`${key}:`))
  if (!line)
    return null

  let value = line.slice(key.length + 1).trim()
  if (
    value
    && (value.startsWith('\'') || value.startsWith('"'))
    && value.endsWith(value[0])
  ) {
    value = value.slice(1, -1)
  }

  return value || null
}

function hasFrontmatterList(frontmatter, key) {
  const lines = frontmatter.split('\n')
  const startIndex = lines.findIndex(line => line === `${key}:`)
  if (startIndex === -1)
    return false

  for (const line of lines.slice(startIndex + 1)) {
    if (/^\S[^:]*:/.test(line))
      return false

    if (/^\s+-\s+\S/.test(line))
      return true
  }

  return false
}

function stripFencedCodeBlocks(markdown) {
  const lines = markdown.split('\n')
  const keptLines = []
  let fenceChar = null

  for (const line of lines) {
    const fenceMatch = line.match(/^(`{3,}|~{3,})/)
    if (fenceMatch) {
      const currentFenceChar = fenceMatch[1][0]
      if (!fenceChar) {
        fenceChar = currentFenceChar
      }
      else if (fenceChar === currentFenceChar) {
        fenceChar = null
      }

      keptLines.push('')
      continue
    }

    keptLines.push(fenceChar ? '' : line)
  }

  return keptLines.join('\n')
}

function countH1(body) {
  return stripFencedCodeBlocks(body)
    .split('\n')
    .filter(line => /^#\s+\S/.test(line))
    .length
}

function rememberUnique(seenValues, value, route, label) {
  const normalizedValue = value.toLowerCase()
  const existingRoute = seenValues.get(normalizedValue)
  if (existingRoute) {
    failures.push(`${route} duplicates ${label} from ${existingRoute}: ${value}`)
    return
  }

  seenValues.set(normalizedValue, route)
}

const titles = new Map()
const descriptions = new Map()

for (const route of requiredGuideRoutes) {
  const filePath = markdownFileForRoute(route)
  if (!existsSync(filePath)) {
    failures.push(`${route} is missing source Markdown file`)
    continue
  }

  const { raw, body } = parseFrontmatter(filePath)
  const relativePath = repoRelative(filePath)
  const title = frontmatterStringValue(raw, 'title')
  const description = frontmatterStringValue(raw, 'description')

  if (!title) {
    failures.push(`${relativePath} is missing frontmatter title`)
  }
  else {
    if (title === 'Markstream')
      failures.push(`${relativePath} title must not be the generic site title`)

    rememberUnique(titles, title, route, 'title')
  }

  if (!description) {
    failures.push(`${relativePath} is missing frontmatter description`)
  }
  else {
    if (description === docsDefaultDescription)
      failures.push(`${relativePath} must not reuse the default docs description`)

    rememberUnique(descriptions, description, route, 'description')
  }

  if (!hasFrontmatterList(raw, 'keywords'))
    failures.push(`${relativePath} is missing frontmatter keywords list`)

  const h1Count = countH1(body)
  if (h1Count !== 1)
    failures.push(`${relativePath} must have exactly one visible H1; found ${h1Count}`)
}

if (failures.length > 0) {
  console.error('[docs-frontmatter] failed:')
  for (const failure of failures)
    console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('[docs-frontmatter] Source SEO frontmatter checks passed.')
