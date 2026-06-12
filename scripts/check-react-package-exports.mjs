import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const packageRoot = resolve(root, 'packages/markstream-react')
const pkg = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'))
const failures = []

const requiredSubpaths = [
  '.',
  './next',
  './server',
  './index.css',
  './index.px.css',
  './index.tailwind.css',
  './tailwind',
  './workers/katexRenderer.worker',
  './workers/mermaidParser.worker',
]

const cssContracts = {
  './index.css': ['.markstream-react', '--background:', '--foreground:', '--markstream-code-fallback-bg:'],
  './index.px.css': ['.markstream-react', '--background:', '--foreground:', '--markstream-code-fallback-bg:'],
  './index.tailwind.css': ['.markstream-react', '--background:', '--foreground:'],
}

function normalizeTargets(entry) {
  if (typeof entry === 'string')
    return [{ condition: 'default', target: entry }]

  if (!entry || typeof entry !== 'object')
    return []

  return Object.entries(entry)
    .filter(([, target]) => typeof target === 'string')
    .map(([condition, target]) => ({ condition, target }))
}

function isExistingFile(filePath) {
  try {
    return statSync(filePath).isFile()
  }
  catch {
    return false
  }
}

function stripImportQuery(specifier) {
  return String(specifier).split(/[?#]/, 1)[0]
}

function isCssSpecifier(specifier) {
  return stripImportQuery(specifier).endsWith('.css')
}

function getLiteralSpecifier(node) {
  if (!node)
    return null
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text
  return null
}

function collectCssModuleReferences(source, filename) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  )
  const references = []

  function pushReference(specifier, kind) {
    if (!specifier || !isCssSpecifier(specifier))
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
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'require'
    ) {
      pushReference(getLiteralSpecifier(node.arguments[0]), 'require')
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return references
}

function packageSpecifier(subpath) {
  return subpath === '.' ? pkg.name : `${pkg.name}/${subpath.slice(2)}`
}

function runNodeSmoke(label, source) {
  try {
    execFileSync(process.execPath, ['-e', source], {
      cwd: packageRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    })
  }
  catch (error) {
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : ''
    const stdout = typeof error?.stdout === 'string' ? error.stdout.trim() : ''
    failures.push(`${label} failed${stderr || stdout ? `: ${stderr || stdout}` : ''}`)
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

  for (const { condition, target } of targets) {
    if (!target.startsWith('./'))
      continue

    if (!isExistingFile(resolve(packageRoot, target))) {
      failures.push(`${subpath} condition "${condition}" points to missing file: ${target}`)
    }
  }
}

const uncheckedExportSubpaths = Object.keys(pkg.exports ?? {})
  .filter(subpath => !requiredSubpaths.includes(subpath))
  .sort()

if (uncheckedExportSubpaths.length > 0) {
  failures.push([
    'package.json exports contains subpaths not covered by scripts/check-react-package-exports.mjs:',
    ...uncheckedExportSubpaths.map(subpath => `  - ${subpath}`),
  ].join('\n'))
}

for (const [subpath, markers] of Object.entries(cssContracts)) {
  for (const { condition, target } of normalizeTargets(pkg.exports?.[subpath])) {
    if (!target.endsWith('.css')) {
      failures.push(`${subpath} condition "${condition}" should point to a CSS file, got ${target}`)
      continue
    }

    const cssPath = resolve(packageRoot, target)
    if (!isExistingFile(cssPath))
      continue

    const css = readFileSync(cssPath, 'utf8')
    for (const marker of markers) {
      if (!css.includes(marker))
        failures.push(`${subpath} condition "${condition}" target ${target} is missing CSS marker "${marker}"`)
    }
  }
}

for (const subpath of ['.', './next', './server']) {
  for (const { condition, target } of normalizeTargets(pkg.exports?.[subpath])) {
    if (!/\.(?:mjs|js|cjs)$/.test(stripImportQuery(target)))
      continue

    const jsPath = resolve(packageRoot, target)
    if (!isExistingFile(jsPath))
      continue

    const cssReferences = collectCssModuleReferences(readFileSync(jsPath, 'utf8'), jsPath)
    if (cssReferences.length > 0) {
      failures.push([
        `${subpath} condition "${condition}" target ${target} should not import CSS; keep styles on explicit CSS subpaths.`,
        ...cssReferences.map(({ specifier, kind }) => `  - ${kind}: ${specifier}`),
      ].join('\n'))
    }
  }
}

runNodeSmoke('root import', `import('${packageSpecifier('.')}')`)
runNodeSmoke('next import', `import('${packageSpecifier('./next')}')`)
runNodeSmoke('server import', `import('${packageSpecifier('./server')}')`)
runNodeSmoke(
  'tailwind import',
  `import('${packageSpecifier('./tailwind')}').then((m) => { if (typeof (m.default || m.safeList) !== 'string') process.exit(1) })`,
)
runNodeSmoke(
  'tailwind require',
  `const m = require('${packageSpecifier('./tailwind')}'); if (typeof (m.default || m.safeList || m) !== 'string') process.exit(1)`,
)

if (failures.length > 0) {
  console.error('[react-package-exports] Package export check failed:')
  for (const failure of failures)
    console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(`[react-package-exports] All ${requiredSubpaths.length} React package export subpaths, targets, CSS files, and runtime imports are valid.`)
