import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import process from 'node:process'
import ts from 'typescript'

const root = process.cwd()
const dtsPath = join(root, 'dist', 'index.d.ts')
const snapshotPath = join(root, 'test', 'public-api', 'public-api.snapshot.txt')
const shouldUpdate = process.argv.includes('--update')

if (!existsSync(dtsPath))
  fail(`Missing ${relative(root, dtsPath)}. Run pnpm build first.`)

const nextSnapshot = `${collectPublicApiSnapshot(dtsPath).join('\n')}\n`

if (shouldUpdate) {
  mkdirSync(dirname(snapshotPath), { recursive: true })
  writeFileSync(snapshotPath, nextSnapshot, 'utf8')
  console.log(`[public-api] Updated ${relative(root, snapshotPath)}`)
  process.exit(0)
}

if (!existsSync(snapshotPath))
  fail(`Missing ${relative(root, snapshotPath)}. Run pnpm test:api:update to create it.`)

const currentSnapshot = normalizeSnapshot(readFileSync(snapshotPath, 'utf8'))

if (currentSnapshot !== nextSnapshot)
  fail(formatSnapshotDiff(currentSnapshot, nextSnapshot))

console.log(`[public-api] Snapshot matches ${relative(root, snapshotPath)}`)

function collectPublicApiSnapshot(entryPath) {
  const compilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ESNext,
    types: ['node'],
  }
  const host = ts.createCompilerHost(compilerOptions, true)
  const program = ts.createProgram([entryPath], compilerOptions, host)
  const diagnostics = ts.getPreEmitDiagnostics(program)

  if (diagnostics.length > 0) {
    const formatHost = {
      getCanonicalFileName: fileName => fileName,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    }

    fail(ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost))
  }

  const sourceFile = program.getSourceFile(entryPath)

  if (!sourceFile)
    fail(`Unable to read ${relative(root, entryPath)}`)

  const checker = program.getTypeChecker()
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile)

  if (!moduleSymbol)
    fail(`Unable to resolve exports for ${relative(root, entryPath)}`)

  return checker
    .getExportsOfModule(moduleSymbol)
    .map((symbol) => {
      const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
      const kinds = []

      if (resolved.flags & ts.SymbolFlags.Value)
        kinds.push('value')
      if (resolved.flags & ts.SymbolFlags.Type)
        kinds.push('type')
      if (resolved.flags & ts.SymbolFlags.Namespace)
        kinds.push('namespace')

      return `${symbol.getName()} [${kinds.join('+') || 'unknown'}]`
    })
    .sort((left, right) => left.localeCompare(right))
}

function normalizeSnapshot(snapshot) {
  return snapshot.replace(/\r\n/g, '\n')
}

function formatSnapshotDiff(currentSnapshot, nextSnapshot) {
  const currentLines = new Set(currentSnapshot.trim().split('\n').filter(Boolean))
  const nextLines = new Set(nextSnapshot.trim().split('\n').filter(Boolean))
  const added = [...nextLines].filter(line => !currentLines.has(line)).sort()
  const removed = [...currentLines].filter(line => !nextLines.has(line)).sort()
  const sections = ['[public-api] Snapshot mismatch. Run pnpm test:api:update to accept the change.']

  if (added.length > 0)
    sections.push(`\nAdded:\n${added.map(line => `+ ${line}`).join('\n')}`)

  if (removed.length > 0)
    sections.push(`\nRemoved:\n${removed.map(line => `- ${line}`).join('\n')}`)

  return sections.join('\n')
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
