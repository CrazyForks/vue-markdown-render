#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { arch, cpus, platform, release, totalmem, type } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const outputDir = path.resolve(repoRoot, process.env.MARKSTREAM_BENCHMARK_OUTPUT_DIR || 'benchmark')

const diagnosticSamples = (process.env.MARKSTREAM_BENCHMARK_SAMPLES || 'baseline,thinking,diff,stress')
  .split(',')
  .map(sample => sample.trim())
  .filter(Boolean)

const scenarios = [
  ...diagnosticSamples.map(sample => ({
    id: `diagnostic-${sample}`,
    title: `Diagnostic Studio / ${sample}`,
    command: ['node', ['scripts/e2e-playground-performance.mjs']],
    env: { PLAYGROUND_SAMPLE: sample },
    notes: 'Runs /test in MarkdownCodeBlock and Monaco modes, then scrolls the preview surface.',
  })),
  {
    id: 'main-playground-chat',
    title: 'Main Playground / reverse-flex chat',
    command: ['node', ['scripts/e2e-main-playground-performance.mjs']],
    env: {},
    notes: 'Runs the main AI chat playground, full-scrolls the reverse-flex viewport, and replays streaming.',
  },
]

function readPackageVersion(packageJsonPath) {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, packageJsonPath), 'utf8'))
  return packageJson.version
}

function formatBytes(bytes) {
  if (bytes == null)
    return '-'
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatMs(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(1)
    : '-'
}

function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(Math.round(value))
    : '-'
}

async function resolveChromeVersion() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (!existsSync(candidate))
      continue
    try {
      return {
        executablePath: candidate,
        version: (await spawnText(candidate, ['--version'])).trim() || 'unknown',
      }
    }
    catch {
      return {
        executablePath: candidate,
        version: 'unknown',
      }
    }
  }

  return {
    executablePath: process.env.PLAYWRIGHT_CHROME_PATH || 'chrome channel',
    version: 'unknown',
  }
}

function spawnText(command, args) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  const chunks = []
  const errors = []
  child.stdout.on('data', chunk => chunks.push(String(chunk)))
  child.stderr.on('data', chunk => errors.push(String(chunk)))
  return new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0)
        resolve(chunks.join(''))
      else
        reject(new Error(errors.join('') || `${command} exited with ${code}`))
    })
  })
}

async function runCommand(command, args, env) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...env,
        CI: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0)
        resolve({ stdout, stderr })
      else
        reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}\n${stderr}\n${stdout}`))
    })
  })
}

function parseJsonOutput(stdout) {
  const start = stdout.indexOf('{')
  const end = stdout.lastIndexOf('}')
  if (start < 0 || end < start)
    throw new Error('Benchmark command did not print a JSON object.')
  return JSON.parse(stdout.slice(start, end + 1))
}

function heavyBlockSummary(row, scope = 'all') {
  const parts = []
  const visible = scope === 'visible'
  const mermaidCount = visible ? row.visibleMermaidCount : row.mermaidCount
  const infographicCount = visible ? row.visibleInfographicCount : row.infographicCount
  const d2Count = visible ? row.visibleD2Count : row.d2Count
  if (typeof mermaidCount === 'number')
    parts.push(`Mermaid ${(visible ? row.visibleRenderedMermaidCount : row.renderedMermaidCount) ?? '-'}/${mermaidCount}`)
  if (typeof infographicCount === 'number')
    parts.push(`Infographic ${(visible ? row.visibleRenderedInfographicCount : row.renderedInfographicCount) ?? '-'}/${infographicCount}`)
  if (typeof d2Count === 'number')
    parts.push(`D2 ${(visible ? row.visibleRenderedD2Count : row.renderedD2Count) ?? '-'}/${d2Count}`)
  return parts.length ? parts.join('<br>') : '-'
}

function fallbackSummary(row) {
  if (typeof row.visibleFallbackCount === 'number')
    return `${row.visibleFallbackCount} visible / ${row.fallbackCount ?? 0} total`
  if (typeof row.fallbackCount === 'number')
    return String(row.fallbackCount)
  return '-'
}

function scenarioRows(entry) {
  const rows = []
  const result = entry.result

  if (entry.id.startsWith('diagnostic-')) {
    for (const mode of ['markdown', 'monaco']) {
      const row = result[mode]
      if (!row)
        continue
      rows.push({
        scenario: entry.title,
        phase: `${mode} initial`,
        row,
        heavyBlockScope: 'visible',
        memoryAfterUnmountBytes: row.memoryAfterUnmountBytes,
      })
      if (row.fullScroll) {
        rows.push({
          scenario: entry.title,
          phase: `${mode} full scroll`,
          row: row.fullScroll,
          heavyBlockScope: 'all',
          memoryAfterUnmountBytes: row.memoryAfterUnmountBytes,
        })
      }
    }
    return rows
  }

  if (entry.id === 'main-playground-chat') {
    rows.push({ scenario: entry.title, phase: 'initial', row: result.initial, heavyBlockScope: 'visible', memoryAfterUnmountBytes: result.memoryAfterUnmountBytes })
    rows.push({ scenario: entry.title, phase: 'full scroll', row: result.fullScroll, heavyBlockScope: 'all', memoryAfterUnmountBytes: result.memoryAfterUnmountBytes })
    rows.push({ scenario: entry.title, phase: 'stream replay', row: result.replay, heavyBlockScope: 'all', memoryAfterUnmountBytes: result.memoryAfterUnmountBytes })
  }

  return rows
}

function renderMarkdownReport(report) {
  const lines = []
  lines.push('# markstream-vue 1.0 Benchmark Report')
  lines.push('')
  lines.push(`Generated at: ${report.generatedAt}`)
  lines.push('')
  lines.push('## Environment')
  lines.push('')
  lines.push('| Field | Value |')
  lines.push('| --- | --- |')
  lines.push(`| markstream-vue | ${report.versions.markstreamVue} |`)
  lines.push(`| markstream-core | ${report.versions.markstreamCore} |`)
  lines.push(`| stream-markdown-parser | ${report.versions.streamMarkdownParser} |`)
  lines.push(`| Node | ${report.environment.node} |`)
  lines.push(`| OS | ${report.environment.os} |`)
  lines.push(`| CPU | ${report.environment.cpu} |`)
  lines.push(`| Memory | ${formatBytes(report.environment.totalMemoryBytes)} |`)
  lines.push(`| Browser | ${report.environment.browser.version} |`)
  lines.push(`| Browser executable | \`${report.environment.browser.executablePath}\` |`)
  lines.push('| Viewport | 1600 x 1200 |')
  lines.push(`| Server mode | ${report.environment.serverMode}, CI=1 |`)
  lines.push('')
  lines.push('## Results')
  lines.push('')
  lines.push('| Scenario | Phase | LCP ms | CLS | Settle ms | Frame interval p95 ms | Max long task ms | DOM nodes | Fallbacks | Heavy blocks readiness | Scroll drift px | Heap after component unmount + GC |')
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |')

  for (const entry of report.scenarios) {
    for (const item of scenarioRows(entry)) {
      const row = item.row ?? {}
      lines.push(`| ${item.scenario} | ${item.phase} | ${formatMs(row.lcpMs)} | ${typeof row.cls === 'number' ? row.cls.toFixed(4) : '-'} | ${formatMs(row.settleTimeMs)} | ${formatMs(row.frameP95Ms)} | ${formatMs(row.longTaskMaxMs)} | ${formatNumber(row.domNodeCount)} | ${fallbackSummary(row)} | ${heavyBlockSummary(row, item.heavyBlockScope)} | ${formatMs(row.scrollDriftPx)} | ${formatBytes(item.memoryAfterUnmountBytes)} |`)
    }
  }

  lines.push('')
  lines.push('## Scenario Notes')
  lines.push('')
  for (const entry of report.scenarios)
    lines.push(`- **${entry.title}**: ${entry.notes}`)
  lines.push('')
  lines.push('This report records measured release evidence from the shipped playgrounds. Frame interval is the p95 `requestAnimationFrame` delta, and heap after component unmount is best-effort Chrome-only `performance.memory` after unmount plus GC. Keep benchmark claims tied to this environment disclosure and rerun before publishing 1.0.')
  return `${lines.join('\n')}\n`
}

async function run() {
  mkdirSync(outputDir, { recursive: true })

  const browser = await resolveChromeVersion()
  const serverMode = 'Vite production preview after playground build'
  const report = {
    generatedAt: new Date().toISOString(),
    versions: {
      markstreamVue: readPackageVersion('package.json'),
      markstreamCore: readPackageVersion('packages/markstream-core/package.json'),
      streamMarkdownParser: readPackageVersion('packages/markdown-parser/package.json'),
    },
    environment: {
      node: process.version,
      os: `${type()} ${release()} (${platform()} ${arch()})`,
      cpu: cpus()[0]?.model ?? 'unknown',
      totalMemoryBytes: totalmem(),
      browser,
      serverMode,
    },
    scenarios: [],
  }

  if (process.env.MARKSTREAM_BENCHMARK_SKIP_BUILD !== '1') {
    console.error('[benchmark:1.0] Build playground')
    await runCommand('pnpm', ['-C', 'playground', 'build'], {})
  }

  for (const scenario of scenarios) {
    const [command, args] = scenario.command
    console.error(`[benchmark:1.0] ${scenario.title}`)
    const { stdout } = await runCommand(command, args, {
      ...scenario.env,
      PLAYGROUND_PERFORMANCE_SERVER: 'preview',
    })
    report.scenarios.push({
      id: scenario.id,
      title: scenario.title,
      notes: scenario.notes,
      env: scenario.env,
      result: parseJsonOutput(stdout),
    })
  }

  const slug = `${report.versions.markstreamVue}.chrome-${platform()}-${arch()}`
  const jsonPath = path.join(outputDir, `${slug}.json`)
  const markdownPath = path.join(outputDir, `${slug}.md`)
  const latestPath = path.join(outputDir, 'latest-summary.md')
  const markdown = renderMarkdownReport(report)

  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(markdownPath, markdown)
  writeFileSync(latestPath, markdown)

  console.log(`Wrote ${path.relative(repoRoot, jsonPath)}`)
  console.log(`Wrote ${path.relative(repoRoot, markdownPath)}`)
  console.log(`Wrote ${path.relative(repoRoot, latestPath)}`)
}

run().catch((error) => {
  console.error('[benchmark:1.0] failed')
  console.error(error)
  process.exitCode = 1
})
