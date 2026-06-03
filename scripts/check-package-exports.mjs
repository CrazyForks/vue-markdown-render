import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = process.cwd()

const pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'))

const requiredSubpaths = [
  '.',
  './utils',
  './utils/katex-threshold',
  './utils/performance-monitor',
  './utils/safeRaf',
  './index.css',
  './index.px.css',
  './index.tailwind.css',
  './tailwind',
  './workers/katexWorkerClient',
  './workers/mermaidWorkerClient',
  './workers/katexCdnWorker',
  './workers/mermaidCdnWorker',
  './workers/katexRenderer.worker',
  './workers/mermaidParser.worker',
]

const requiredCssSubpaths = [
  './index.css',
  './index.px.css',
  './index.tailwind.css',
]

const isolatedRootExports = [
  'MarkdownRender',
  'VueRendererMarkdown',
  'CodeBlockNode',
  'MarkdownCodeBlockNode',
  'MathBlockNode',
  'MathInlineNode',
  'MermaidBlockNode',
  'D2BlockNode',
  'InfographicBlockNode',
  'MarkstreamVirtualTimeline',
  'Tooltip',
  'useMarkstreamVirtualAdapter',
  'useSmoothMarkdownStream',
]

const runtimeSubpathChecks = [
  {
    subpath: './utils',
    exports: ['getLanguageIcon', 'normalizeLanguageIdentifier', 'parseMarkdownToStructure', 'safeRaf'],
    forbiddenExports: isolatedRootExports,
  },
  {
    subpath: './utils/katex-threshold',
    exports: ['recommendWorkerThreshold'],
    forbiddenExports: isolatedRootExports,
  },
  {
    subpath: './utils/performance-monitor',
    exports: ['disablePerfMonitoring', 'enablePerfMonitoring', 'getPerfReport'],
    forbiddenExports: isolatedRootExports,
  },
  {
    subpath: './utils/safeRaf',
    exports: ['safeCancelRaf', 'safeRaf'],
    forbiddenExports: isolatedRootExports,
  },
  {
    subpath: './workers/katexWorkerClient',
    exports: ['renderKaTeXInWorker'],
    forbiddenExports: isolatedRootExports,
  },
  {
    subpath: './workers/mermaidWorkerClient',
    exports: ['findPrefixOffthread'],
    forbiddenExports: isolatedRootExports,
  },
  {
    subpath: './workers/katexCdnWorker',
    exports: ['createKaTeXWorkerFromCDN'],
    forbiddenExports: isolatedRootExports,
  },
  {
    subpath: './workers/mermaidCdnWorker',
    exports: ['createMermaidWorkerFromCDN'],
    forbiddenExports: isolatedRootExports,
  },
]

const failures = []
const bareStaticImportSpecifierPattern = /\bimport\s*["']([^"']+)["']/g
const fromStaticImportSpecifierPattern = /\b(?:import|export)[^'"]+\bfrom\s*["']([^"']+)["']/g

function normalizeTargets(entry) {
  if (typeof entry === 'string')
    return [{ condition: 'default', target: entry }]

  if (!entry || typeof entry !== 'object')
    return []

  return Object.entries(entry)
    .filter(([, value]) => typeof value === 'string')
    .map(([condition, target]) => ({ condition, target }))
}

function assertTargetExists(subpath, condition, target) {
  if (!target.startsWith('./'))
    return

  const fullPath = join(root, target)
  if (!existsSync(fullPath)) {
    failures.push(
      `${subpath} condition "${condition}" points to missing file: ${target}`,
    )
  }
}

function getPackageSpecifier(subpath) {
  if (subpath === '.')
    return pkg.name

  return `${pkg.name}/${subpath.slice(2)}`
}

function stripImportQuery(specifier) {
  return String(specifier).split(/[?#]/, 1)[0]
}

function isJsTarget(target) {
  const cleanTarget = stripImportQuery(target)
  return /\.(?:mjs|js)$/.test(cleanTarget)
}

function getPackageJsTargets(subpath) {
  return normalizeTargets(pkg.exports?.[subpath])
    .filter(({ target }) => typeof target === 'string' && isJsTarget(target))
}

function isCssSpecifier(specifier) {
  return stripImportQuery(specifier).endsWith('.css')
}

function isRelativeSpecifier(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../')
}

function getStaticImportSpecifiers(source) {
  const specifiers = []
  bareStaticImportSpecifierPattern.lastIndex = 0
  fromStaticImportSpecifierPattern.lastIndex = 0

  let match
  while ((match = bareStaticImportSpecifierPattern.exec(source)))
    specifiers.push(match[1])

  while ((match = fromStaticImportSpecifierPattern.exec(source)))
    specifiers.push(match[1])

  return specifiers
}

function resolveLocalJsImport(importerPath, specifier) {
  const cleanSpecifier = stripImportQuery(specifier)

  if (!isRelativeSpecifier(cleanSpecifier))
    return null

  const basename = cleanSpecifier.split('/').pop() ?? ''
  if (basename.includes('.') && !/\.(?:mjs|js)$/.test(basename))
    return null

  const resolved = resolve(dirname(importerPath), cleanSpecifier)
  const candidates = /\.(?:mjs|js)$/.test(basename)
    ? [resolved]
    : [
        resolved,
        `${resolved}.js`,
        `${resolved}.mjs`,
        join(resolved, 'index.js'),
        join(resolved, 'index.mjs'),
      ]

  return candidates.find(candidate => existsSync(candidate)) ?? null
}

function collectStaticCssImports(entryPath) {
  const queue = [entryPath]
  const visited = new Set()
  const cssImports = []

  while (queue.length > 0) {
    const current = queue.pop()
    const fullPath = resolve(current)

    if (visited.has(fullPath) || !existsSync(fullPath))
      continue

    visited.add(fullPath)

    const source = readFileSync(fullPath, 'utf8')
    for (const specifier of getStaticImportSpecifiers(source)) {
      if (isCssSpecifier(specifier)) {
        cssImports.push({
          importer: fullPath,
          specifier,
        })
        continue
      }

      const resolvedImport = resolveLocalJsImport(fullPath, specifier)
      if (resolvedImport)
        queue.push(resolvedImport)
    }
  }

  return cssImports
}

const rootJsTargets = getPackageJsTargets('.')
const rootJsTargetSet = new Set(rootJsTargets.map(({ target }) => target))

for (const subpath of requiredSubpaths) {
  const entry = pkg.exports?.[subpath]

  if (!entry) {
    failures.push(`missing package export subpath: ${subpath}`)
    continue
  }

  const targets = normalizeTargets(entry)

  if (targets.length === 0) {
    failures.push(`package export subpath has no string targets: ${subpath}`)
    continue
  }

  for (const { condition, target } of targets)
    assertTargetExists(subpath, condition, target)

  if (
    subpath !== '.'
    && typeof entry === 'object'
    && typeof entry.import === 'string'
    && rootJsTargetSet.has(entry.import)
  ) {
    failures.push(`${subpath} should not import the root bundle (${entry.import})`)
  }
}

for (const subpath of requiredCssSubpaths) {
  const entry = pkg.exports?.[subpath]
  if (!entry)
    continue

  for (const { condition, target } of normalizeTargets(entry)) {
    if (!target.endsWith('.css')) {
      failures.push(
        `${subpath} condition "${condition}" should point to a CSS file, got ${target}`,
      )
    }
  }
}

for (const { condition, target } of rootJsTargets) {
  const rootImportPath = join(root, target)
  if (!existsSync(rootImportPath))
    continue

  const cssImports = collectStaticCssImports(rootImportPath)
  if (cssImports.length > 0) {
    failures.push([
      `. condition "${condition}" target ${target} should not statically import CSS; keep styles on explicit CSS subpaths.`,
      ...cssImports.map(({ importer, specifier }) => {
        return `    ${relative(root, importer)} imports ${specifier}`
      }),
    ].join('\n'))
  }
}

async function checkRootRuntimeExports() {
  try {
    const mod = await import(getPackageSpecifier('.'))

    if (!('default' in mod))
      failures.push('. is missing runtime export "default"')
    if (!('MarkdownRender' in mod))
      failures.push('. is missing runtime export "MarkdownRender"')
    if (!('VueRendererMarkdown' in mod))
      failures.push('. is missing runtime export "VueRendererMarkdown"')

    if ('default' in mod && 'MarkdownRender' in mod && mod.default !== mod.MarkdownRender)
      failures.push('. default export should reference MarkdownRender')
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    failures.push(`. failed runtime import check: ${message}`)
  }
}

await checkRootRuntimeExports()

for (const { subpath, exports: requiredExports, forbiddenExports = [] } of runtimeSubpathChecks) {
  const specifier = getPackageSpecifier(subpath)

  try {
    const mod = await import(specifier)

    for (const exportName of requiredExports) {
      if (!(exportName in mod))
        failures.push(`${subpath} is missing runtime export "${exportName}"`)
    }

    for (const exportName of forbiddenExports) {
      if (exportName in mod)
        failures.push(`${subpath} unexpectedly exposes root export "${exportName}"`)
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    failures.push(`${subpath} failed runtime import check: ${message}`)
  }
}

if (failures.length > 0) {
  console.error('[package-exports] Package export check failed:')
  for (const failure of failures)
    console.error(`  - ${failure}`)
  console.error(`\nIf this was intentional, update the requiredSubpaths list in ${relative(root, fileURLToPath(import.meta.url))}`)
  process.exit(1)
}

console.log(`[package-exports] All ${requiredSubpaths.length} package export subpaths, targets, and runtime imports are valid.`)
