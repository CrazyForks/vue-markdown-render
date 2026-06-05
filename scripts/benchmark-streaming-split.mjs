#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const fixtureRoot = path.join(repoRoot, 'test/benchmark/streaming-split')
const outputDir = path.resolve(repoRoot, process.env.MARKSTREAM_STREAMING_SPLIT_OUTPUT_DIR || '.tmp/benchmark/streaming-split')
const outputJsonPath = path.join(outputDir, 'latest.json')
const outputMarkdownPath = path.join(outputDir, 'latest.md')
const baselinePath = process.env.MARKSTREAM_STREAMING_SPLIT_BASELINE
  ? path.resolve(repoRoot, process.env.MARKSTREAM_STREAMING_SPLIT_BASELINE)
  : null

const targetChunks = Number(process.env.MARKSTREAM_STREAMING_SPLIT_CHUNKS || 119)
const chunkSize = Number(process.env.MARKSTREAM_STREAMING_SPLIT_CHUNK_SIZE || 18)
const repeats = Number(process.env.MARKSTREAM_STREAMING_SPLIT_REPEATS || 3)
const intervalMs = Number(process.env.MARKSTREAM_STREAMING_SPLIT_INTERVAL_MS || 16)
const selectedCaseIds = (process.env.MARKSTREAM_STREAMING_SPLIT_CASES || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)

if (!Number.isFinite(targetChunks) || targetChunks <= 0)
  throw new Error('MARKSTREAM_STREAMING_SPLIT_CHUNKS must be a positive number.')
if (!Number.isFinite(chunkSize) || chunkSize <= 0)
  throw new Error('MARKSTREAM_STREAMING_SPLIT_CHUNK_SIZE must be a positive number.')
if (!Number.isFinite(repeats) || repeats <= 0)
  throw new Error('MARKSTREAM_STREAMING_SPLIT_REPEATS must be a positive number.')
if (!Number.isFinite(intervalMs) || intervalMs < 0)
  throw new Error('MARKSTREAM_STREAMING_SPLIT_INTERVAL_MS must be a non-negative number.')

const allCases = [
  {
    id: 'plain',
    label: 'Plain text + headings',
    block: [
      '# Streaming answer\n\n',
      '解释 debounce 的核心思路，并给出前端业务里常见的落地方式。\n\n',
      '高频输入不会每次都打到业务逻辑，而是先进入等待窗口，最终只触发最后一次调用。\n\n',
      '## 关键收益\n\n',
      '它让 UI 更新节奏更稳定，也让请求、取消和 loading 状态更容易维护。\n\n',
    ].join(''),
  },
  {
    id: 'list',
    label: 'Lists',
    block: [
      '## Checklist\n\n',
      '- 搜索框自动补全\n',
      '- resize / scroll 事件\n',
      '- Agent 面板连续 token 合并\n',
      '- 保留滚动位置\n',
      '- 避免重复创建整块 DOM\n\n',
    ].join(''),
  },
  {
    id: 'table',
    label: 'Tables',
    block: [
      '## 对比\n\n',
      '| 方案 | 触发次数 | 用户感受 |\n',
      '| --- | ---: | --- |\n',
      '| 不处理 | 每个 key stroke | 请求抖动，列表闪烁 |\n',
      '| debounce | 最后一次输入 | 节奏稳定 |\n',
      '| throttle | 固定窗口一次 | 适合滚动 |\n\n',
    ].join(''),
  },
  {
    id: 'code-ts',
    label: 'TypeScript code fences',
    block: [
      '```ts\n',
      'export function debounce<T extends (...args: any[]) => void>(fn: T, wait = 300) {\n',
      '  let timer: ReturnType<typeof setTimeout> | undefined\n',
      '  return (...args: Parameters<T>) => {\n',
      '    if (timer) clearTimeout(timer)\n',
      '    timer = setTimeout(() => fn(...args), wait)\n',
      '  }\n',
      '}\n',
      '```\n\n',
    ].join(''),
  },
  {
    id: 'code-diff',
    label: 'Diff code fences',
    block: [
      '```diff\n',
      '- input.addEventListener(\'input\', run)\n',
      '+ input.addEventListener(\'input\', debounce(run, 300))\n',
      '- render(markdown)\n',
      '+ scheduleRender(markdown)\n',
      '```\n\n',
    ].join(''),
  },
  {
    id: 'mermaid-source',
    label: 'Mermaid fences as source',
    block: [
      '```mermaid\n',
      'graph LR\n',
      '  input[Input] --> timer[Timer]\n',
      '  timer --> api[Search API]\n',
      '  api --> view[Result View]\n',
      '```\n\n',
    ].join(''),
  },
  {
    id: 'blockquote',
    label: 'Blockquotes',
    block: [
      '> final: 代码块、表格、Mermaid 源码、diff 和滚动位置都应该稳定落地。\n\n',
      '> 关键不是把每个 chunk 都同步提交，而是让用户看到稳定的增长过程。\n\n',
    ].join(''),
  },
  {
    id: 'full-mix',
    label: 'Full mixed workload',
    block: [
      '# Streaming renderer benchmark\n\n',
      '解释 debounce 的核心思路，并给出前端业务里常见的落地方式。\n\n',
      '- 搜索框自动补全\n',
      '- resize / scroll 这类高频事件\n',
      '- Agent 面板里需要合并连续 token 的 UI 更新\n\n',
      '```ts\n',
      'const run = debounce((value: string) => search(value), 300)\n',
      'input.addEventListener(\'input\', (event) => run((event.target as HTMLInputElement).value))\n',
      '```\n\n',
      '| 方案 | 触发次数 | 用户感受 |\n',
      '| --- | ---: | --- |\n',
      '| 不处理 | 每个 key stroke | 请求抖动 |\n',
      '| debounce | 最后一次输入 | 节奏稳定 |\n\n',
      '```diff\n',
      '- input.addEventListener(\'input\', run)\n',
      '+ input.addEventListener(\'input\', debounce(run, 300))\n',
      '```\n\n',
      '```mermaid\n',
      'graph LR\n',
      '  input[Input] --> timer[Timer]\n',
      '  timer --> api[Search API]\n',
      '```\n\n',
      '> final: 代码块、表格、Mermaid 源码、diff 和滚动位置都应该稳定落地。\n\n',
    ].join(''),
  },
]

const cases = selectedCaseIds.length
  ? allCases.filter(testCase => selectedCaseIds.includes(testCase.id))
  : allCases

const missingCases = selectedCaseIds.filter(id => !allCases.some(testCase => testCase.id === id))
if (missingCases.length)
  throw new Error(`Unknown streaming split benchmark cases: ${missingCases.join(', ')}`)

const primaryRenderers = [
  { id: 'streamdown', renderer: 'streamdown', variant: null },
  { id: 'markstream-local', renderer: 'markstream', variant: 'incremental' },
]

const markstreamProbe = [
  { id: 'markstream-local', renderer: 'markstream', variant: 'incremental' },
  { id: 'markstream-local-nosmooth', renderer: 'markstream', variant: 'incremental-nosmooth' },
  { id: 'markstream-local-window', renderer: 'markstream', variant: 'window' },
]

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function packageVersion(packageName, fallback = 'unknown') {
  const packageJsonPath = packageName === 'markstream-vue'
    ? path.join(repoRoot, 'package.json')
    : path.join(repoRoot, 'node_modules', packageName, 'package.json')
  if (!existsSync(packageJsonPath))
    return fallback
  return readJsonFile(packageJsonPath).version || fallback
}

function resolveChromeLaunchOptions() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return {
        executablePath: candidate,
        headless: true,
      }
    }
  }

  return {
    channel: 'chrome',
    headless: true,
  }
}

function createChunks(block) {
  let content = ''
  while (content.length < targetChunks * chunkSize)
    content += block
  content = content.slice(0, targetChunks * chunkSize)
  const chunks = []
  for (let index = 0; index < content.length; index += chunkSize)
    chunks.push(content.slice(index, index + chunkSize))
  return chunks.slice(0, targetChunks)
}

function metricMap(metrics) {
  return Object.fromEntries(metrics.metrics.map(metric => [metric.name, metric.value]))
}

function round(value, digits = 3) {
  return Number(value.toFixed(digits))
}

async function getMetrics(client) {
  return metricMap(await client.send('Performance.getMetrics'))
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function medianResult(runs) {
  const keys = [
    'totalMs',
    'p95UpdateMs',
    'maxUpdateMs',
    'avgUpdateMs',
    'longTaskCount',
    'longTaskTotalMs',
    'mutationCount',
    'domNodes',
    'heightJumps',
    'taskDurationMs',
    'scriptDurationMs',
    'layoutDurationMs',
    'recalcStyleDurationMs',
    'jsHeapUsedMB',
  ]
  const output = {}
  for (const key of keys)
    output[key] = round(median(runs.map(run => run[key])))
  output.elementCounts = runs[Math.floor(runs.length / 2)].elementCounts
  return output
}

async function runOnce(browser, port, rendererConfig, chunks) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      consoleErrors.push(message.text())
  })
  const client = await page.context().newCDPSession(page)
  await client.send('Performance.enable')
  const params = new URLSearchParams({ renderer: rendererConfig.renderer })
  if (rendererConfig.variant)
    params.set('variant', rendererConfig.variant)
  await page.goto(`http://127.0.0.1:${port}/?${params.toString()}`, { waitUntil: 'load' })
  try {
    await page.waitForFunction(() => window.__ready === true)
  }
  catch (error) {
    const overlayText = await page.evaluate(() => {
      const overlay = document.querySelector('vite-error-overlay')
      return overlay?.shadowRoot?.textContent || ''
    }).catch(() => '')
    const content = await page.content().catch(() => '')
    await page.close()
    throw new Error([
      error.message,
      overlayText ? `vite overlay:\n${overlayText.slice(0, 4000)}` : '',
      pageErrors.length ? `page errors:\n${pageErrors.join('\n')}` : '',
      consoleErrors.length ? `console errors:\n${consoleErrors.join('\n')}` : '',
      content ? `html:\n${content.slice(0, 2000)}` : '',
    ].filter(Boolean).join('\n\n'))
  }
  const before = await getMetrics(client)
  const result = await page.evaluate(options => window.__runBenchmark(options), { chunks, intervalMs })
  const after = await getMetrics(client)
  await page.close()
  return {
    chunks: result.chunks,
    totalMs: result.totalMs,
    p95UpdateMs: result.p95UpdateMs,
    maxUpdateMs: result.maxUpdateMs,
    avgUpdateMs: result.avgUpdateMs,
    longTaskCount: result.longTaskCount,
    longTaskTotalMs: result.longTaskTotalMs,
    mutationCount: result.mutationCount,
    domNodes: result.domNodes,
    elementCounts: result.elementCounts,
    heightJumps: result.heightJumps,
    taskDurationMs: (after.TaskDuration - before.TaskDuration) * 1000,
    scriptDurationMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
    layoutDurationMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
    recalcStyleDurationMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000,
    jsHeapUsedMB: after.JSHeapUsedSize / 1024 / 1024,
  }
}

async function runAggregate(browser, port, rendererConfig, chunks) {
  const runs = []
  for (let index = 0; index < repeats; index++)
    runs.push(await runOnce(browser, port, rendererConfig, chunks))
  return {
    id: rendererConfig.id,
    renderer: rendererConfig.renderer,
    variant: rendererConfig.variant,
    chunks: targetChunks,
    median: medianResult(runs),
    runs: runs.map(run => ({
      ...run,
      totalMs: round(run.totalMs),
      p95UpdateMs: round(run.p95UpdateMs),
      maxUpdateMs: round(run.maxUpdateMs),
      avgUpdateMs: round(run.avgUpdateMs),
      longTaskTotalMs: round(run.longTaskTotalMs),
      taskDurationMs: round(run.taskDurationMs),
      scriptDurationMs: round(run.scriptDurationMs),
      layoutDurationMs: round(run.layoutDurationMs),
      recalcStyleDurationMs: round(run.recalcStyleDurationMs),
      jsHeapUsedMB: round(run.jsHeapUsedMB),
    })),
  }
}

function getMedian(splitCase, idPrefix) {
  return splitCase.results.find(result => result.id === idPrefix || result.id.startsWith(idPrefix))?.median
}

function formatMs(value) {
  return `${round(value, 1)}ms`
}

function formatMb(value) {
  return `${round(value, 1)}MB`
}

function delta(value, unit = '') {
  const rounded = round(value, 1)
  return `${rounded > 0 ? '+' : ''}${rounded}${unit}`
}

function metricPair(before, after, key, unit = 'ms') {
  const format = unit === 'MB' ? formatMb : formatMs
  return `${format(before[key])} -> ${format(after[key])} (${delta(after[key] - before[key], unit)})`
}

function metricNumberPair(before, after, key) {
  return `${before[key]} -> ${after[key]} (${after[key] - before[key] > 0 ? '+' : ''}${after[key] - before[key]})`
}

function renderPrimaryTable(split) {
  const lines = [
    '| Case | Task S->M | Layout S->M | Script S->M | DOM S->M | Heap S->M | p95 S->M |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]

  for (const splitCase of split) {
    const streamdown = getMedian(splitCase, 'streamdown')
    const markstream = getMedian(splitCase, 'markstream-local')
    lines.push(`| ${splitCase.id} | ${metricPair(streamdown, markstream, 'taskDurationMs')} | ${metricPair(streamdown, markstream, 'layoutDurationMs')} | ${metricPair(streamdown, markstream, 'scriptDurationMs')} | ${metricNumberPair(streamdown, markstream, 'domNodes')} | ${metricPair(streamdown, markstream, 'jsHeapUsedMB', 'MB')} | ${metricPair(streamdown, markstream, 'p95UpdateMs')} |`)
  }

  return lines.join('\n')
}

function renderBaselineTable(current, baseline) {
  const lines = [
    '| Case | Task baseline->current | Layout baseline->current | Script baseline->current | DOM baseline->current | Heap baseline->current | p95 baseline->current |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]

  for (const currentCase of current.split) {
    const baselineCase = baseline.split.find(splitCase => splitCase.id === currentCase.id)
    if (!baselineCase)
      continue
    const before = getMedian(baselineCase, 'markstream-local')
    const after = getMedian(currentCase, 'markstream-local')
    lines.push(`| ${currentCase.id} | ${metricPair(before, after, 'taskDurationMs')} | ${metricPair(before, after, 'layoutDurationMs')} | ${metricPair(before, after, 'scriptDurationMs')} | ${metricNumberPair(before, after, 'domNodes')} | ${metricPair(before, after, 'jsHeapUsedMB', 'MB')} | ${metricPair(before, after, 'p95UpdateMs')} |`)
  }

  return lines.join('\n')
}

function renderHotspots(split) {
  const rows = split
    .map((splitCase) => {
      const streamdown = getMedian(splitCase, 'streamdown')
      const markstream = getMedian(splitCase, 'markstream-local')
      return {
        id: splitCase.id,
        layoutDelta: markstream.layoutDurationMs - streamdown.layoutDurationMs,
        taskDelta: markstream.taskDurationMs - streamdown.taskDurationMs,
        domDelta: markstream.domNodes - streamdown.domNodes,
        heapDelta: markstream.jsHeapUsedMB - streamdown.jsHeapUsedMB,
      }
    })
    .filter(row => row.layoutDelta > 1 || row.taskDelta > 1 || row.domDelta > 0 || row.heapDelta > 1)
    .sort((a, b) => b.layoutDelta - a.layoutDelta)

  if (!rows.length)
    return 'No positive deltas against streamdown in task/layout/DOM/heap.'

  return rows
    .map((row) => {
      const parts = []
      if (row.layoutDelta > 1)
        parts.push(`layout ${delta(row.layoutDelta, 'ms')}`)
      if (row.taskDelta > 1)
        parts.push(`task ${delta(row.taskDelta, 'ms')}`)
      if (row.domDelta > 0)
        parts.push(`DOM ${delta(row.domDelta)}`)
      if (row.heapDelta > 1)
        parts.push(`heap ${delta(row.heapDelta, 'MB')}`)
      return `- ${row.id}: ${parts.join(', ')}`
    })
    .join('\n')
}

function renderConfigProbe(configProbe) {
  const lines = [
    '| Variant | Task | Script | Layout | Recalc | DOM | Heap | p95 | Jumps |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const result of configProbe.results) {
    const metric = result.median
    lines.push(`| ${result.id} | ${formatMs(metric.taskDurationMs)} | ${formatMs(metric.scriptDurationMs)} | ${formatMs(metric.layoutDurationMs)} | ${formatMs(metric.recalcStyleDurationMs)} | ${metric.domNodes} | ${formatMb(metric.jsHeapUsedMB)} | ${formatMs(metric.p95UpdateMs)} | ${metric.heightJumps} |`)
  }
  return lines.join('\n')
}

function renderMarkdown(payload, baseline) {
  const sections = [
    '# Streaming Split Benchmark',
    '',
    `Generated: ${payload.generatedAt}`,
    `Method: ${payload.method}`,
    `Versions: streamdown@${payload.versions.streamdown}, markstream-vue@${payload.versions.markstreamVue}`,
    '',
    '## Current: streamdown -> markstream-vue',
    '',
    renderPrimaryTable(payload.split),
    '',
    '## Hotspots',
    '',
    renderHotspots(payload.split),
    '',
    '## Full-mix markstream config probe',
    '',
    renderConfigProbe(payload.configProbe),
  ]

  if (baseline) {
    sections.push(
      '',
      `## Baseline delta: ${path.basename(baselinePath)}`,
      '',
      renderBaselineTable(payload, baseline),
    )
  }

  return `${sections.join('\n')}\n`
}

async function createBenchmarkServer() {
  const server = await createServer({
    root: fixtureRoot,
    logLevel: 'silent',
    plugins: [vue()],
    resolve: {
      alias: [
        { find: 'markstream-vue/index.css', replacement: path.join(repoRoot, 'src/index.css') },
        { find: 'markstream-vue', replacement: path.join(repoRoot, 'src/exports.ts') },
      ],
    },
    server: { host: '127.0.0.1', port: 4181, strictPort: false },
  })
  await server.listen()
  const address = server.httpServer?.address()
  const port = typeof address === 'object' && address ? address.port : server.config.server.port
  return { server, port }
}

async function main() {
  const { server, port } = await createBenchmarkServer()
  const browser = await chromium.launch(resolveChromeLaunchOptions())

  try {
    const split = []
    for (const testCase of cases) {
      const chunks = createChunks(testCase.block)
      const results = []
      for (const rendererConfig of primaryRenderers) {
        console.log(`case=${testCase.id} renderer=${rendererConfig.id}`)
        results.push(await runAggregate(browser, port, rendererConfig, chunks))
      }
      split.push({
        id: testCase.id,
        label: testCase.label,
        chunkSize,
        chunks: targetChunks,
        results,
      })
    }

    const fullMix = allCases.find(testCase => testCase.id === 'full-mix')
    const fullMixChunks = createChunks(fullMix.block)
    const configProbe = []
    for (const rendererConfig of markstreamProbe) {
      console.log(`probe=full-mix renderer=${rendererConfig.id}`)
      configProbe.push(await runAggregate(browser, port, rendererConfig, fullMixChunks))
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      source: 'scripts/benchmark-streaming-split.mjs',
      fixture: 'test/benchmark/streaming-split',
      method: `${repeats}-run median, Playwright Core + Chrome CDP, ${targetChunks} chunks per case, ${chunkSize} chars per chunk, ${intervalMs}ms transport cadence`,
      versions: {
        streamdown: packageVersion('streamdown'),
        markstreamVue: `${packageVersion('markstream-vue')} source`,
      },
      split,
      configProbe: {
        case: 'full-mix',
        results: configProbe,
      },
    }

    const baseline = baselinePath && existsSync(baselinePath) ? readJsonFile(baselinePath) : null
    mkdirSync(outputDir, { recursive: true })
    writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`)
    writeFileSync(outputMarkdownPath, renderMarkdown(payload, baseline))
    console.log(`wrote ${path.relative(repoRoot, outputJsonPath)}`)
    console.log(`wrote ${path.relative(repoRoot, outputMarkdownPath)}`)
  }
  finally {
    await browser.close()
    await server.close()
  }
}

await main()
