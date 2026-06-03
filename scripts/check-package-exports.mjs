import { readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

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

const requiredCssMarkers = {
  './index.css': ['--ms-background:', '--ms-foreground:', '--code-bg:'],
  './index.px.css': ['--ms-background:', '--ms-foreground:', '--code-bg:'],
  './index.tailwind.css': ['--ms-background:', '--ms-foreground:'],
}

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

function normalizeTargets(entry) {
  if (typeof entry === 'string')
    return [{ condition: 'default', target: entry }]

  if (!entry || typeof entry !== 'object')
    return []

  return Object.entries(entry)
    .filter(([, value]) => typeof value === 'string')
    .map(([condition, target]) => ({ condition, target }))
}

function isExistingFile(path) {
  try {
    return statSync(path).isFile()
  }
  catch {
    return false
  }
}

function assertTargetExists(subpath, condition, target) {
  if (!target.startsWith('./'))
    return

  const fullPath = resolve(root, target)
  if (!isExistingFile(fullPath)) {
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

function getScriptKind(filename) {
  if (/\.[cm]?tsx$/.test(filename))
    return ts.ScriptKind.TSX
  if (/\.[cm]?ts$/.test(filename))
    return ts.ScriptKind.TS
  return ts.ScriptKind.JS
}

function getLiteralSpecifier(node) {
  if (!node)
    return null
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text
  return null
}

function isImportMetaUrl(node) {
  return ts.isPropertyAccessExpression(node)
    && node.name.text === 'url'
    && ts.isMetaProperty(node.expression)
    && node.expression.keywordToken === ts.SyntaxKind.ImportKeyword
    && node.expression.name.text === 'meta'
}

function getModuleReferences(source, filename) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filename),
  )
  const references = []

  function pushReference(specifier, kind) {
    if (!specifier)
      return
    references.push({ specifier, kind })
  }

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
    ) {
      pushReference(getLiteralSpecifier(node.moduleSpecifier), 'static')
    }

    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      pushReference(getLiteralSpecifier(node.arguments[0]), 'dynamic')
    }

    if (
      ts.isNewExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'URL'
      && node.arguments?.length >= 2
      && isImportMetaUrl(node.arguments[1])
    ) {
      pushReference(getLiteralSpecifier(node.arguments[0]), 'asset')
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return references
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

  return candidates.find(isExistingFile) ?? null
}

function isRootPackageSpecifier(specifier) {
  return specifier === pkg.name
}

function collectImportGraph(entryPath) {
  const queue = [entryPath]
  const jsFiles = new Set()
  const cssImports = []
  const rootPackageReferences = []
  const relativeDynamicJsImports = []

  while (queue.length > 0) {
    const current = queue.pop()
    const fullPath = resolve(current)

    if (jsFiles.has(fullPath) || !isExistingFile(fullPath))
      continue

    jsFiles.add(fullPath)

    const source = readFileSync(fullPath, 'utf8')
    for (const { specifier, kind } of getModuleReferences(source, fullPath)) {
      if (isCssSpecifier(specifier)) {
        cssImports.push({
          importer: fullPath,
          specifier,
          kind,
        })
        continue
      }

      if (isRootPackageSpecifier(specifier)) {
        rootPackageReferences.push({
          importer: fullPath,
          specifier,
          kind,
        })
        continue
      }

      const resolvedImport = resolveLocalJsImport(fullPath, specifier)
      if (!resolvedImport)
        continue

      if (kind === 'dynamic') {
        relativeDynamicJsImports.push({
          importer: fullPath,
          specifier,
          resolved: resolvedImport,
        })
        queue.push(resolvedImport)
        continue
      }

      if (kind === 'static')
        queue.push(resolvedImport)
    }
  }

  return {
    jsFiles,
    cssImports,
    rootPackageReferences,
    relativeDynamicJsImports,
  }
}

function resolvePackageTarget(target) {
  if (!target.startsWith('./'))
    return target
  return resolve(root, target)
}

const rootJsTargets = getPackageJsTargets('.')
const rootJsTargetSet = new Set(rootJsTargets.map(({ target }) => resolvePackageTarget(target)))

function checkSourceRootEntryDoesNotImportCss() {
  const sourceEntry = resolve(root, 'src/exports.ts')
  if (!isExistingFile(sourceEntry))
    return

  const cssReferences = getModuleReferences(readFileSync(sourceEntry, 'utf8'), sourceEntry)
    .filter(({ specifier }) => isCssSpecifier(specifier))
    .map(({ specifier, kind }) => ({
      importer: sourceEntry,
      specifier,
      kind,
    }))

  if (cssReferences.length > 0) {
    failures.push([
      'src/exports.ts should not import CSS; keep renderer styles on explicit package CSS subpaths.',
      ...formatImportTrace(cssReferences),
    ].join('\n'))
  }
}

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

function checkCssSubpathContent() {
  for (const [subpath, markers] of Object.entries(requiredCssMarkers)) {
    const entry = pkg.exports?.[subpath]
    if (!entry)
      continue

    for (const { condition, target } of normalizeTargets(entry)) {
      if (!target.endsWith('.css'))
        continue

      const fullPath = resolve(root, target)
      if (!isExistingFile(fullPath))
        continue

      const css = readFileSync(fullPath, 'utf8')
      for (const marker of markers) {
        if (!css.includes(marker)) {
          failures.push(
            `${subpath} condition "${condition}" target ${target} is missing CSS marker "${marker}". Did src/index.css get included in the CSS build entry?`,
          )
        }
      }
    }
  }
}

checkCssSubpathContent()
checkSourceRootEntryDoesNotImportCss()

function formatImportTrace(imports) {
  return imports.map(({ importer, specifier, kind = 'static' }) => {
    const verb = kind === 'asset'
      ? 'references'
      : 'imports'
    return `    ${relative(root, importer)} ${verb} ${specifier} (${kind})`
  })
}

function formatReachedRootTargets(targets) {
  return targets.map((target) => {
    return `    reaches ${relative(root, target)}`
  })
}

function formatDynamicImportTrace(imports) {
  return imports.map(({ importer, specifier, resolved }) => {
    return `    ${relative(root, importer)} dynamically imports ${specifier} -> ${relative(root, resolved)}`
  })
}

const packageJsTargetChecks = []

for (const subpath of requiredSubpaths) {
  for (const { condition, target } of getPackageJsTargets(subpath)) {
    const entryPath = resolvePackageTarget(target)
    if (!isExistingFile(entryPath))
      continue

    packageJsTargetChecks.push({
      subpath,
      condition,
      target,
      graph: collectImportGraph(entryPath),
    })
  }
}

for (const { subpath, condition, target, graph } of packageJsTargetChecks) {
  if (graph.cssImports.length > 0) {
    failures.push([
      `${subpath} condition "${condition}" target ${target} should not import CSS; keep styles on explicit CSS subpaths.`,
      ...formatImportTrace(graph.cssImports),
    ].join('\n'))
  }

  if (subpath === '.')
    continue

  const reachedRootTargets = [...rootJsTargetSet]
    .filter(rootTarget => graph.jsFiles.has(rootTarget))
  const dynamicRootReferences = graph.relativeDynamicJsImports
    .filter(({ resolved }) => rootJsTargetSet.has(resolve(resolved)))

  if (
    reachedRootTargets.length > 0
    || graph.rootPackageReferences.length > 0
    || dynamicRootReferences.length > 0
  ) {
    failures.push([
      `${subpath} condition "${condition}" target ${target} should not import or dynamically import the root bundle.`,
      ...formatReachedRootTargets(reachedRootTargets),
      ...formatImportTrace(graph.rootPackageReferences),
      ...formatDynamicImportTrace(dynamicRootReferences),
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
    else if (typeof mod.VueRendererMarkdown?.install !== 'function')
      failures.push('. runtime export "VueRendererMarkdown" should be a Vue plugin with install(app, options)')

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
