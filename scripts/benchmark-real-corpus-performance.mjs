#!/usr/bin/env node

import { Buffer } from 'node:buffer'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { arch, platform, release, totalmem, type } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const outputDir = path.resolve(repoRoot, process.env.MARKSTREAM_REAL_CORPUS_OUTPUT_DIR || '.tmp/perf-real-corpus')
const fixtureRoot = path.join(outputDir, 'fixture')
const outputJsonPath = path.join(outputDir, 'latest.json')
const outputMarkdownPath = path.join(outputDir, 'latest.md')
const parserDistPath = path.join(repoRoot, 'packages/markdown-parser/dist/index.js')
const coreDistPath = path.join(repoRoot, 'packages/markstream-core/dist/index.js')

const parserRounds = readPositiveIntEnv('MARKSTREAM_REAL_CORPUS_PARSER_ROUNDS', 7)
const parserWarmups = readPositiveIntEnv('MARKSTREAM_REAL_CORPUS_PARSER_WARMUPS', 2)
const streamChunkCount = readPositiveIntEnv('MARKSTREAM_REAL_CORPUS_STREAM_CHUNKS', 120)
const browserRepeats = readPositiveIntEnv('MARKSTREAM_REAL_CORPUS_BROWSER_REPEATS', 3)
const browserStreamChunks = readPositiveIntEnv('MARKSTREAM_REAL_CORPUS_BROWSER_STREAM_CHUNKS', 96)
const browserStreamIntervalMs = readNonNegativeNumberEnv('MARKSTREAM_REAL_CORPUS_BROWSER_STREAM_INTERVAL_MS', 8)
const browserSmoothStreamingOptions = readJsonObjectEnv('MARKSTREAM_REAL_CORPUS_SMOOTH_OPTIONS_JSON')
const browserViewportWidth = readPositiveIntEnv('MARKSTREAM_REAL_CORPUS_BROWSER_VIEWPORT_WIDTH', 1280)
const browserViewportHeight = readPositiveIntEnv('MARKSTREAM_REAL_CORPUS_BROWSER_VIEWPORT_HEIGHT', 900)
const browserCpuThrottleRate = readPositiveIntEnv('MARKSTREAM_REAL_CORPUS_BROWSER_CPU_THROTTLE_RATE', 1)

const corpusDefinitions = [
  { id: 'ai-chat-streaming', label: 'Docs AI chat streaming', path: 'docs/guide/ai-chat-streaming.md' },
  { id: 'readme-en', label: 'README English', path: 'README.md' },
  { id: 'readme-zh', label: 'README Chinese', path: 'README.zh-CN.md' },
  { id: 'docs-performance', label: 'Docs performance guide', path: 'docs/guide/performance.md' },
  { id: 'react-components', label: 'Docs React components', path: 'docs/guide/react-components.md' },
  { id: 'parser-readme', label: 'Parser README', path: 'packages/markdown-parser/README.md' },
  { id: 'changelog', label: 'CHANGELOG full restore', path: 'CHANGELOG.md' },
]

const selectedParserCaseIds = readCaseListEnv('MARKSTREAM_REAL_CORPUS_PARSER_CASES', corpusDefinitions.map(item => item.id))
const selectedBrowserRestoreCaseIds = readCaseListEnv(
  'MARKSTREAM_REAL_CORPUS_BROWSER_RESTORE_CASES',
  ['ai-chat-streaming', 'readme-en', 'react-components', 'changelog'],
)
const selectedBrowserStreamCaseIds = readCaseListEnv(
  'MARKSTREAM_REAL_CORPUS_BROWSER_STREAM_CASES',
  ['ai-chat-streaming', 'readme-en'],
)

function readPositiveIntEnv(name, fallback) {
  const value = process.env[name]
  if (value == null || value === '')
    return fallback
  const numeric = Number(value)
  if (!Number.isInteger(numeric) || numeric <= 0)
    throw new Error(`${name} must be a positive integer.`)
  return numeric
}

function readNonNegativeNumberEnv(name, fallback) {
  const value = process.env[name]
  if (value == null || value === '')
    return fallback
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0)
    throw new Error(`${name} must be a non-negative number.`)
  return numeric
}

function readCaseListEnv(name, fallback) {
  const value = process.env[name]
  if (value == null || value.trim() === '')
    return fallback
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function readJsonObjectEnv(name) {
  const value = process.env[name]
  if (value == null || value.trim() === '')
    return null

  const parsed = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error(`${name} must be a JSON object.`)
  return parsed
}

function validateCaseIds(ids, label) {
  const known = new Set(corpusDefinitions.map(item => item.id))
  const missing = ids.filter(id => !known.has(id))
  if (missing.length)
    throw new Error(`Unknown ${label} case id(s): ${missing.join(', ')}`)
}

function round(value, digits = 3) {
  return Number(Number(value || 0).toFixed(digits))
}

function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  if (!sorted.length)
    return 0
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))
  return sorted[index]
}

function summarize(values) {
  return {
    minMs: round(Math.min(...values)),
    medianMs: round(median(values)),
    p95Ms: round(percentile(values, 0.95)),
    maxMs: round(Math.max(...values)),
  }
}

function readCorpus() {
  return corpusDefinitions.map((definition) => {
    const absolutePath = path.join(repoRoot, definition.path)
    const markdown = readFileSync(absolutePath, 'utf8')
    return {
      ...definition,
      absolutePath,
      markdown,
      bytes: Buffer.byteLength(markdown),
      chars: markdown.length,
    }
  })
}

function selectCases(corpus, ids) {
  const byId = new Map(corpus.map(item => [item.id, item]))
  return ids.map(id => byId.get(id)).filter(Boolean)
}

function getNewestSourceMtimeMs(dir) {
  let newest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      newest = Math.max(newest, getNewestSourceMtimeMs(filePath))
      continue
    }
    if (!entry.isFile())
      continue
    if (!/\.(?:[cm]?js|tsx?|vue)$/.test(entry.name))
      continue
    newest = Math.max(newest, statSync(filePath).mtimeMs)
  }
  return newest
}

function assertWorkspacePackageDistsFresh() {
  const packages = [
    {
      name: 'stream-markdown-parser',
      srcDir: path.join(repoRoot, 'packages/markdown-parser/src'),
      distPath: parserDistPath,
    },
    {
      name: 'markstream-core',
      srcDir: path.join(repoRoot, 'packages/markstream-core/src'),
      distPath: coreDistPath,
    },
  ]
  const report = packages.map((item) => {
    if (!existsSync(item.distPath)) {
      return {
        ...item,
        distMtimeMs: 0,
        sourceMtimeMs: getNewestSourceMtimeMs(item.srcDir),
        stale: true,
        missing: true,
      }
    }

    const distMtimeMs = statSync(item.distPath).mtimeMs
    const sourceMtimeMs = getNewestSourceMtimeMs(item.srcDir)
    return {
      ...item,
      distMtimeMs,
      sourceMtimeMs,
      stale: sourceMtimeMs > distMtimeMs + 1000,
      missing: false,
    }
  })

  const stale = report.filter(item => item.stale)
  if (stale.length && process.env.MARKSTREAM_REAL_CORPUS_ALLOW_STALE_DIST !== '1') {
    throw new Error([
      'Workspace package dist is stale. Run pnpm run build:parser && pnpm run build:core before this benchmark,',
      'or set MARKSTREAM_REAL_CORPUS_ALLOW_STALE_DIST=1 for exploratory runs.',
      ...stale.map(item => `- ${item.name}: ${path.relative(repoRoot, item.distPath)}`),
    ].join('\n'))
  }

  return report.map(item => ({
    name: item.name,
    distPath: path.relative(repoRoot, item.distPath),
    stale: item.stale,
    missing: item.missing,
    sourceMtimeMs: Math.round(item.sourceMtimeMs),
    distMtimeMs: Math.round(item.distMtimeMs),
  }))
}

function createChunks(markdown, count) {
  if (!markdown)
    return []
  const chunkSize = Math.max(1, Math.ceil(markdown.length / count))
  const chunks = []
  for (let index = 0; index < markdown.length; index += chunkSize)
    chunks.push(markdown.slice(index, index + chunkSize))
  return chunks
}

function sumTiming(rows, key) {
  return round(rows.reduce((total, row) => total + Number(row.timing?.[key] || 0), 0))
}

async function runParserBenchmarks(corpus) {
  if (!existsSync(parserDistPath)) {
    throw new Error(
      `Parser dist not found at ${path.relative(repoRoot, parserDistPath)}. Run pnpm run build:parser first.`,
    )
  }

  const parser = await import(pathToFileURL(parserDistPath).href)
  const { getMarkdown, parseMarkdownToStructure } = parser
  const cases = selectCases(corpus, selectedParserCaseIds)
  const results = []

  for (const testCase of cases) {
    const finalRuns = []
    for (let roundIndex = 0; roundIndex < parserWarmups + parserRounds; roundIndex++) {
      const md = getMarkdown(`real-corpus-final-${testCase.id}-${roundIndex}`)
      md.stream?.reset?.()
      const timing = {}
      const startedAt = performance.now()
      const nodes = parseMarkdownToStructure(testCase.markdown, md, {
        final: true,
        streamParse: true,
        __timing: timing,
      })
      const elapsed = performance.now() - startedAt
      if (roundIndex >= parserWarmups) {
        finalRuns.push({
          ms: elapsed,
          timing,
          nodes: nodes.length,
        })
      }
    }

    const streamRuns = []
    for (let roundIndex = 0; roundIndex < parserWarmups + parserRounds; roundIndex++) {
      const md = getMarkdown(`real-corpus-stream-${testCase.id}-${roundIndex}`)
      md.stream?.reset?.()
      let current = ''
      const chunks = createChunks(testCase.markdown, streamChunkCount)
      const commitDurations = []
      const commitTimings = []
      let lastNodes = []

      for (const chunk of chunks) {
        current += chunk
        const timing = {}
        const startedAt = performance.now()
        lastNodes = parseMarkdownToStructure(current, md, {
          final: false,
          streamParse: true,
          __timing: timing,
        })
        commitDurations.push(performance.now() - startedAt)
        commitTimings.push({ timing })
      }

      const finalTiming = {}
      const finalStartedAt = performance.now()
      const finalNodes = parseMarkdownToStructure(testCase.markdown, md, {
        final: true,
        streamParse: true,
        __timing: finalTiming,
      })
      const finalFlushMs = performance.now() - finalStartedAt

      if (roundIndex >= parserWarmups) {
        streamRuns.push({
          totalMs: commitDurations.reduce((total, value) => total + value, 0),
          medianCommitMs: median(commitDurations),
          p95CommitMs: percentile(commitDurations, 0.95),
          maxCommitMs: Math.max(...commitDurations),
          finalFlushMs,
          chunks: chunks.length,
          nodesBeforeFinal: lastNodes.length,
          nodesAfterFinal: finalNodes.length,
          processTokensMs: sumTiming(commitTimings, 'processTokensMs'),
          parseTotalMs: sumTiming(commitTimings, 'parseMarkdownToStructureTotalMs'),
          finalTiming,
          streamStats: typeof md.stream?.stats === 'function' ? md.stream.stats() : null,
        })
      }
    }

    results.push({
      id: testCase.id,
      label: testCase.label,
      path: testCase.path,
      bytes: testCase.bytes,
      chars: testCase.chars,
      final: {
        ...summarize(finalRuns.map(run => run.ms)),
        medianNodes: median(finalRuns.map(run => run.nodes)),
        processTokensMedianMs: round(median(finalRuns.map(run => run.timing.processTokensMs ?? 0))),
        parserTotalMedianMs: round(median(finalRuns.map(run => run.timing.parseMarkdownToStructureTotalMs ?? 0))),
      },
      streaming: {
        chunks: median(streamRuns.map(run => run.chunks)),
        totalMedianMs: round(median(streamRuns.map(run => run.totalMs))),
        medianCommitMs: round(median(streamRuns.map(run => run.medianCommitMs))),
        p95CommitMs: round(median(streamRuns.map(run => run.p95CommitMs))),
        maxCommitMs: round(median(streamRuns.map(run => run.maxCommitMs))),
        finalFlushMedianMs: round(median(streamRuns.map(run => run.finalFlushMs))),
        processTokensMedianMs: round(median(streamRuns.map(run => run.processTokensMs))),
        parserTotalMedianMs: round(median(streamRuns.map(run => run.parseTotalMs))),
        medianNodesBeforeFinal: median(streamRuns.map(run => run.nodesBeforeFinal)),
        medianNodesAfterFinal: median(streamRuns.map(run => run.nodesAfterFinal)),
        streamStats: streamRuns[Math.floor(streamRuns.length / 2)]?.streamStats ?? null,
      },
    })
  }

  return results
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
        args: chromeLaunchArgs(),
      }
    }
  }

  return {
    channel: 'chrome',
    headless: true,
    args: chromeLaunchArgs(),
  }
}

function chromeLaunchArgs() {
  return [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-dev-shm-usage',
    '--no-sandbox',
  ]
}

function metricMap(metrics) {
  return Object.fromEntries(metrics.metrics.map(metric => [metric.name, metric.value]))
}

async function getMetrics(client) {
  return metricMap(await client.send('Performance.getMetrics'))
}

function deltaMetrics(after, before) {
  return {
    taskDurationMs: round((after.TaskDuration - before.TaskDuration) * 1000),
    scriptDurationMs: round((after.ScriptDuration - before.ScriptDuration) * 1000),
    layoutDurationMs: round((after.LayoutDuration - before.LayoutDuration) * 1000),
    recalcStyleDurationMs: round((after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000),
    jsHeapUsedMB: round(after.JSHeapUsedSize / 1024 / 1024),
  }
}

function writeFixture(corpus) {
  const sourceDir = path.join(fixtureRoot, 'src')
  mkdirSync(sourceDir, { recursive: true })
  writeFileSync(path.join(fixtureRoot, 'index.html'), [
    '<!doctype html>',
    '<html>',
    '<head><meta charset="UTF-8"><title>Real corpus benchmark</title></head>',
    '<body><div id="app"></div><script type="module" src="/src/main.js"></script></body>',
    '</html>',
  ].join('\n'))
  writeFileSync(path.join(sourceDir, 'style.css'), [
    'html, body, #app { margin: 0; min-height: 100%; }',
    'body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f7f8fa; color: #18202f; }',
    '.bench-shell { width: min(920px, calc(100vw - 48px)); margin: 0 auto; padding: 24px 0 72px; }',
    '.bench-host { background: #fff; border: 1px solid #dde2ea; padding: 24px; }',
  ].join('\n'))
  writeFileSync(
    path.join(sourceDir, 'corpus.json'),
    `${JSON.stringify(corpus.map(item => ({
      id: item.id,
      label: item.label,
      path: item.path,
      markdown: item.markdown,
      bytes: item.bytes,
      chars: item.chars,
    })))}\n`,
  )
  writeFileSync(path.join(sourceDir, 'main.js'), getFixtureMainSource())
}

function getFixtureMainSource() {
  return String.raw`import MarkdownRender from 'markstream-vue'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import corpus from './corpus.json'
import 'markstream-vue/index.css'
import './style.css'

const content = ref('')
const final = ref(true)
const smoothStreaming = ref(false)
const mode = ref('chat')
const renderKey = ref(0)
const smoothStreamingOptions = ${JSON.stringify(browserSmoothStreamingOptions)}

function waitFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve))
}

async function waitFrames(count) {
  for (let i = 0; i < count; i++)
    await waitFrame()
}

function createParsePerformance() {
  return {
    parseCommitCount: 0,
    parseCoalescedCount: 0,
    streamCommitCount: 0,
    syncCommitCount: 0,
    tokenCloneMs: 0,
    processTokensMs: 0,
    parseMarkdownToStructureTotalMs: 0,
    nodeReuseMs: 0,
    signatureMs: 0,
    stabilizeSignatureMs: 0,
    primeSignatureMs: 0,
    signatureCallCount: 0,
    stabilizeSignatureCallCount: 0,
    primeSignatureCallCount: 0,
    stabilizeMs: 0,
    reusedNodeCount: 0,
    dirtyTailNodeCount: 0,
    stream: {
      total: 0,
      cacheHits: 0,
      appendHits: 0,
      tailHits: 0,
      fullParses: 0,
      chunkedParses: 0,
    },
    streamModes: {},
  }
}

function installParsePerformanceHook() {
  if (window.__realCorpusParseHookInstalled)
    return
  window.__realCorpusParseHookInstalled = true
  window.__realCorpusParsePerformance = createParsePerformance()
  const originalInfo = console.info.bind(console)
  const streamCounterKeys = ['total', 'cacheHits', 'appendHits', 'tailHits', 'fullParses', 'chunkedParses']
  const parseTimingKeys = ['tokenCloneMs', 'processTokensMs', 'parseMarkdownToStructureTotalMs']
  console.info = (...args) => {
    try {
      const label = args[0]
      if (label === '[markstream-vue][perf] parse(stream)' || label === '[markstream-vue][perf] parse(sync)') {
        const data = args[1] ?? {}
        const metrics = window.__realCorpusParsePerformance

        metrics.parseCommitCount = Math.max(metrics.parseCommitCount, Number(data.parseCommitCount || 0))
        metrics.parseCoalescedCount = Math.max(metrics.parseCoalescedCount, Number(data.parseCoalescedCount || 0))
        metrics.nodeReuseMs += Number(data.nodeReuseMs || 0)
        metrics.signatureMs += Number(data.signatureMs || 0)
        metrics.stabilizeSignatureMs += Number(data.stabilizeSignatureMs || 0)
        metrics.primeSignatureMs += Number(data.primeSignatureMs || 0)
        metrics.signatureCallCount += Number(data.signatureCallCount || 0)
        metrics.stabilizeSignatureCallCount += Number(data.stabilizeSignatureCallCount || 0)
        metrics.primeSignatureCallCount += Number(data.primeSignatureCallCount || 0)
        metrics.stabilizeMs += Number(data.stabilizeMs || 0)
        metrics.reusedNodeCount += Number(data.reusedNodeCount || 0)
        metrics.dirtyTailNodeCount += Number(data.dirtyTailNodeCount || 0)

        for (const key of parseTimingKeys)
          metrics[key] += Number(data[key] || 0)

        if (label === '[markstream-vue][perf] parse(stream)')
          metrics.streamCommitCount += 1
        else
          metrics.syncCommitCount += 1

        const delta = data.streamDelta
        if (delta && typeof delta === 'object') {
          for (const key of streamCounterKeys)
            metrics.stream[key] += Number(delta[key] || 0)
        }

        if (typeof data.streamMode === 'string')
          metrics.streamModes[data.streamMode] = (metrics.streamModes[data.streamMode] ?? 0) + 1

        return
      }
    }
    catch {}
    originalInfo(...args)
  }
}

installParsePerformanceHook()

function resetParsePerformance() {
  window.__realCorpusParsePerformance = createParsePerformance()
}

function readParsePerformance() {
  return JSON.parse(JSON.stringify(window.__realCorpusParsePerformance ?? createParsePerformance()))
}

function diffParsePerformance(after, before) {
  const result = createParsePerformance()
  for (const key of [
    'parseCommitCount',
    'parseCoalescedCount',
    'streamCommitCount',
    'syncCommitCount',
    'tokenCloneMs',
    'processTokensMs',
    'parseMarkdownToStructureTotalMs',
    'nodeReuseMs',
    'signatureMs',
    'stabilizeSignatureMs',
    'primeSignatureMs',
    'signatureCallCount',
    'stabilizeSignatureCallCount',
    'primeSignatureCallCount',
    'stabilizeMs',
    'reusedNodeCount',
    'dirtyTailNodeCount',
  ]) {
    result[key] = Number(after?.[key] || 0) - Number(before?.[key] || 0)
  }
  for (const key of Object.keys(result.stream))
    result.stream[key] = Number(after?.stream?.[key] || 0) - Number(before?.stream?.[key] || 0)
  result.streamModes = after?.streamModes ?? {}
  return result
}

function startRunObservers(root) {
  const state = {
    mutationCount: 0,
    longTasks: [],
    layoutShifts: [],
    heightSamples: [],
  }
  const pushHeightSample = (height) => {
    if (!Number.isFinite(height) || height <= 0)
      return
    const rounded = Math.round(height * 10) / 10
    if (state.heightSamples[state.heightSamples.length - 1] !== rounded)
      state.heightSamples.push(rounded)
  }
  pushHeightSample(root.getBoundingClientRect().height)

  const mutationObserver = new MutationObserver(records => {
    state.mutationCount += records.length
  })
  mutationObserver.observe(root, { childList: true, subtree: true, characterData: true, attributes: true })

  let longTaskObserver = null
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        state.longTasks.push({ duration: entry.duration, startTime: entry.startTime })
    })
    longTaskObserver.observe({ entryTypes: ['longtask'] })
  }
  catch {}

  let layoutShiftObserver = null
  try {
    layoutShiftObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput)
          state.layoutShifts.push({ value: entry.value, startTime: entry.startTime })
      }
    })
    layoutShiftObserver.observe({ type: 'layout-shift' })
  }
  catch {}

  let resizeObserver = null
  try {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries)
        pushHeightSample(entry.contentRect?.height)
    })
    resizeObserver.observe(root)
  }
  catch {}

  return {
    stop() {
      state.mutationCount += mutationObserver.takeRecords().length
      mutationObserver.disconnect()
      longTaskObserver?.disconnect()
      layoutShiftObserver?.disconnect()
      resizeObserver?.disconnect()
      return state
    },
  }
}

function getRoot() {
  const root = document.querySelector('.bench-host')
  if (!root)
    throw new Error('Benchmark root not found.')
  return root
}

function measureSlots() {
  const root = getRoot()
  return Array.from(root.querySelectorAll('.node-slot')).map((slot) => {
    const rect = slot.getBoundingClientRect()
    const type = String(slot.getAttribute('data-node-type') || '')
    const ignored = type === 'image'
      || type === 'math_block'
      || Boolean(slot.querySelector('.katex, [data-markstream-math]'))
      || Boolean(slot.querySelector('img, .image-node-container, .image-placeholder, .image-shimmer-overlay'))
    return {
      index: Number(slot.getAttribute('data-node-index') || -1),
      type,
      height: Math.round(rect.height * 10) / 10,
      ignored,
    }
  })
}

function summarizeHeightChanges(before, after, thresholdPx = 1) {
  const beforeByIndex = new Map(before.map(item => [item.index, item]))
  const changes = []
  const nonIgnoredChanges = []

  for (const next of after) {
    const prev = beforeByIndex.get(next.index)
    if (!prev)
      continue
    const delta = next.height - prev.height
    const absDelta = Math.abs(delta)
    if (absDelta <= thresholdPx)
      continue
    const row = {
      index: next.index,
      type: next.type,
      before: prev.height,
      after: next.height,
      delta: Math.round(delta * 10) / 10,
      ignored: next.ignored || prev.ignored,
    }
    changes.push(row)
    if (!row.ignored)
      nonIgnoredChanges.push(row)
  }

  const byType = new Map()
  for (const row of nonIgnoredChanges) {
    const current = byType.get(row.type) ?? {
      type: row.type,
      count: 0,
      absDeltaPx: 0,
      maxAbsDeltaPx: 0,
    }
    const absDelta = Math.abs(row.delta)
    current.count++
    current.absDeltaPx += absDelta
    current.maxAbsDeltaPx = Math.max(current.maxAbsDeltaPx, absDelta)
    byType.set(row.type, current)
  }

  return {
    changedSlots: changes.length,
    nonIgnoredChangedSlots: nonIgnoredChanges.length,
    maxAbsDeltaPx: Math.round(Math.max(0, ...changes.map(item => Math.abs(item.delta))) * 10) / 10,
    nonIgnoredMaxAbsDeltaPx: Math.round(Math.max(0, ...nonIgnoredChanges.map(item => Math.abs(item.delta))) * 10) / 10,
    nonIgnoredChangesByType: Array.from(byType.values())
      .map(item => ({
        ...item,
        absDeltaPx: Math.round(item.absDeltaPx * 10) / 10,
        maxAbsDeltaPx: Math.round(item.maxAbsDeltaPx * 10) / 10,
      }))
      .sort((a, b) => b.absDeltaPx - a.absDeltaPx),
    topChanges: changes
      .slice()
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 10),
    topNonIgnoredChanges: nonIgnoredChanges
      .slice()
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 10),
  }
}

function getDomSnapshot() {
  const root = getRoot()
  return {
    scrollHeight: Math.round(root.scrollHeight),
    clientHeight: Math.round(root.clientHeight),
    domNodes: root.querySelectorAll('*').length,
    slots: root.querySelectorAll('.node-slot').length,
    placeholders: root.querySelectorAll('.node-placeholder').length,
    pendingMath: root.querySelectorAll('[data-markstream-math][data-markstream-pending="true"], .math-loading-overlay').length,
    pendingImages: root.querySelectorAll('.image-shimmer-overlay, .image-placeholder').length,
  }
}

async function waitForText(text, timeoutMs = 30000) {
  if (!text)
    return { found: true, elapsedMs: 0, timedOut: false }

  const startedAt = performance.now()
  while (performance.now() - startedAt < timeoutMs) {
    await nextTick()
    await waitFrames(1)
    if (getRoot().textContent.includes(text)) {
      return {
        found: true,
        elapsedMs: performance.now() - startedAt,
        timedOut: false,
      }
    }
  }

  return {
    found: false,
    elapsedMs: performance.now() - startedAt,
    timedOut: true,
  }
}

async function waitForStableRender(timeoutMs = 20000, requiredText = '') {
  const startedAt = performance.now()
  let stableFrames = 0
  let previousKey = ''
  let snapshot = getDomSnapshot()

  while (performance.now() - startedAt < timeoutMs) {
    await nextTick()
    await waitFrames(1)
    snapshot = getDomSnapshot()
    const key = [
      snapshot.scrollHeight,
      snapshot.domNodes,
      snapshot.slots,
      snapshot.placeholders,
    ].join(':')

    const hasRequiredText = !requiredText || getRoot().textContent.includes(requiredText)

    if (hasRequiredText && snapshot.placeholders === 0 && snapshot.pendingMath === 0 && key === previousKey) {
      stableFrames += 1
      if (stableFrames >= 4)
        break
    }
    else {
      stableFrames = 0
      previousKey = key
    }
  }

  return {
    elapsedMs: performance.now() - startedAt,
    stableFrames,
    timedOut: performance.now() - startedAt >= timeoutMs,
    snapshot,
  }
}

function summarizeObserverState(state) {
  const longTaskDurations = state.longTasks.map(entry => entry.duration)
  return {
    mutationCount: state.mutationCount,
    longTaskCount: state.longTasks.length,
    longTaskTotalMs: Math.round(longTaskDurations.reduce((total, value) => total + value, 0) * 10) / 10,
    longTaskMaxMs: Math.round(Math.max(0, ...longTaskDurations) * 10) / 10,
    cls: Math.round(state.layoutShifts.reduce((total, entry) => total + entry.value, 0) * 100000) / 100000,
    heightSampleCount: state.heightSamples.length,
  }
}

function countHeightJumps(heightSamples) {
  return heightSamples.reduce((count, value, index, array) => {
    return index > 0 && Math.abs(value - array[index - 1]) > 24 ? count + 1 : count
  }, 0)
}

function findCase(caseId) {
  const item = corpus.find(entry => entry.id === caseId)
  if (!item)
    throw new Error('Unknown corpus case: ' + caseId)
  return item
}

function makeChunks(markdown, count) {
  const chunkSize = Math.max(1, Math.ceil(markdown.length / count))
  const chunks = []
  for (let index = 0; index < markdown.length; index += chunkSize)
    chunks.push(markdown.slice(index, index + chunkSize))
  return chunks
}

async function resetRenderer(nextMode, nextSmoothStreaming) {
  content.value = ''
  final.value = true
  mode.value = nextMode
  smoothStreaming.value = nextSmoothStreaming
  renderKey.value += 1
  await nextTick()
  await waitFrames(2)
}

async function runRestore(options) {
  const item = findCase(options.caseId)
  await resetRenderer('chat', false)
  const root = getRoot()
  resetParsePerformance()
  const parseBefore = readParsePerformance()
  const observers = startRunObservers(root)
  const startedAt = performance.now()
  final.value = true
  content.value = item.markdown
  await nextTick()
  await waitFrames(2)
  const firstSnapshot = getDomSnapshot()
  const firstSlots = measureSlots()
  const stable = await waitForStableRender(options.timeoutMs ?? 30000)
  const settledSlots = measureSlots()
  const totalMs = performance.now() - startedAt
  const observerState = observers.stop()
  const parseAfter = readParsePerformance()

  return {
    id: item.id,
    label: item.label,
    path: item.path,
    bytes: item.bytes,
    chars: item.chars,
    totalMs,
    firstSnapshot,
    settledSnapshot: stable.snapshot,
    stable,
    heightStability: summarizeHeightChanges(firstSlots, settledSlots),
    observers: summarizeObserverState(observerState),
    parsePerformance: diffParsePerformance(parseAfter, parseBefore),
  }
}

async function runStream(options) {
  const item = findCase(options.caseId)
  const endMarker = 'MARKSTREAM_REAL_CORPUS_STREAM_END_' + item.id
  const streamMarkdown = item.markdown + '\n\n' + endMarker
  await resetRenderer('chat', 'auto')
  const root = getRoot()
  resetParsePerformance()
  const parseBefore = readParsePerformance()
  const observers = startRunObservers(root)
  const chunks = makeChunks(streamMarkdown, options.chunks ?? 96)
  const updateDurations = []
  let current = ''
  final.value = false
  smoothStreaming.value = 'auto'
  await nextTick()

  const startedAt = performance.now()
  for (const chunk of chunks) {
    current += chunk
    const updateStartedAt = performance.now()
    content.value = current
    await nextTick()
    await waitFrames(1)
    updateDurations.push(performance.now() - updateStartedAt)
    if (options.intervalMs > 0)
      await new Promise(resolve => setTimeout(resolve, options.intervalMs))
  }
  final.value = true
  await nextTick()
  await waitFrames(2)
  const markerWait = await waitForText(endMarker, options.timeoutMs ?? 30000)
  const finalSnapshot = getDomSnapshot()
  const beforeFinalSlots = measureSlots()
  const stable = await waitForStableRender(options.timeoutMs ?? 30000, endMarker)
  const settledSlots = measureSlots()
  const totalMs = performance.now() - startedAt
  const observerState = observers.stop()
  const parseAfter = readParsePerformance()
  const sortedUpdates = updateDurations.slice().sort((a, b) => a - b)
  const heightJumps = countHeightJumps(observerState.heightSamples)

  return {
    id: item.id,
    label: item.label,
    path: item.path,
    bytes: item.bytes,
    chars: item.chars,
    chunks: chunks.length,
    totalMs,
    avgUpdateMs: updateDurations.reduce((total, value) => total + value, 0) / Math.max(1, updateDurations.length),
    p95UpdateMs: sortedUpdates[Math.min(sortedUpdates.length - 1, Math.ceil(sortedUpdates.length * 0.95) - 1)] || 0,
    maxUpdateMs: Math.max(0, ...updateDurations),
    heightJumps,
    finalSnapshot,
    settledSnapshot: stable.snapshot,
    markerWait,
    stable,
    heightStability: summarizeHeightChanges(beforeFinalSlots, settledSlots),
    observers: summarizeObserverState(observerState),
    parsePerformance: diffParsePerformance(parseAfter, parseBefore),
  }
}

window.__runRealCorpusBenchmark = async (options) => {
  if (options.mode === 'stream')
    return runStream(options)
  return runRestore(options)
}

window.__ready = true

const App = defineComponent({
  setup() {
    return () => h('main', { class: 'bench-shell' }, [
      h('section', { class: 'bench-host' }, [
        h(MarkdownRender, {
          key: renderKey.value,
          content: content.value,
          final: final.value,
          mode: mode.value,
          smoothStreaming: smoothStreaming.value,
          smoothStreamingOptions,
          debugPerformance: true,
          renderCodeBlocksAsPre: true,
          batchRendering: true,
          initialRenderBatchSize: 16,
          renderBatchSize: 16,
          renderBatchDelay: 8,
          parseCoalesceMs: 32,
        }),
      ]),
    ])
  },
})

createApp(App).mount('#app')
`
}

async function createBenchmarkServer(corpus) {
  writeFixture(corpus)
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
    server: { host: '127.0.0.1', port: 4193, strictPort: false },
  })
  await server.listen()
  const address = server.httpServer?.address()
  const port = typeof address === 'object' && address ? address.port : server.config.server.port
  return { server, port }
}

function summarizeBrowserRuns(runs) {
  const sortedByTotal = runs.slice().sort((a, b) => a.totalMs - b.totalMs)
  const numericKeys = [
    'totalMs',
    'avgUpdateMs',
    'p95UpdateMs',
    'maxUpdateMs',
    'heightJumps',
    'taskDurationMs',
    'scriptDurationMs',
    'layoutDurationMs',
    'recalcStyleDurationMs',
    'jsHeapUsedMB',
  ]
  const output = {}
  for (const key of numericKeys) {
    const values = runs.map(run => run[key]).filter(Number.isFinite)
    if (values.length)
      output[key] = round(median(values))
  }

  const medianRun = sortedByTotal[Math.floor(sortedByTotal.length / 2)]
  output.firstSnapshot = medianRun.firstSnapshot
  output.finalSnapshot = medianRun.finalSnapshot
  output.settledSnapshot = medianRun.settledSnapshot
  output.heightStability = medianRun.heightStability
  output.observers = medianRun.observers
  output.parsePerformance = medianRun.parsePerformance
  output.stable = medianRun.stable
  return output
}

async function runBrowserCase(browser, port, mode, testCase) {
  const runs = []

  for (let index = 0; index < browserRepeats; index++) {
    const page = await browser.newPage({
      viewport: { width: browserViewportWidth, height: browserViewportHeight },
      deviceScaleFactor: 1,
    })
    const pageErrors = []
    const consoleErrors = []
    page.on('pageerror', error => pageErrors.push(error.message))
    page.on('console', (message) => {
      const text = message.text()
      if (message.type() === 'error' && !text.includes('Failed to load resource'))
        consoleErrors.push(text)
    })
    const client = await page.context().newCDPSession(page)
    await client.send('Performance.enable')
    if (browserCpuThrottleRate > 1)
      await client.send('Emulation.setCPUThrottlingRate', { rate: browserCpuThrottleRate })
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.__ready === true)
    const before = await getMetrics(client)
    const result = await page.evaluate(
      options => window.__runRealCorpusBenchmark(options),
      {
        mode,
        caseId: testCase.id,
        chunks: browserStreamChunks,
        intervalMs: browserStreamIntervalMs,
        timeoutMs: 30000,
      },
    )
    const after = await getMetrics(client)
    await page.close()

    if (pageErrors.length || consoleErrors.length) {
      throw new Error([
        `Browser benchmark errors for ${mode}/${testCase.id}`,
        pageErrors.length ? `page errors:\n${pageErrors.join('\n')}` : '',
        consoleErrors.length ? `console errors:\n${consoleErrors.join('\n')}` : '',
      ].filter(Boolean).join('\n\n'))
    }

    runs.push({
      ...result,
      ...deltaMetrics(after, before),
      totalMs: round(result.totalMs),
      avgUpdateMs: round(result.avgUpdateMs),
      p95UpdateMs: round(result.p95UpdateMs),
      maxUpdateMs: round(result.maxUpdateMs),
    })
  }

  return {
    id: testCase.id,
    label: testCase.label,
    path: testCase.path,
    bytes: testCase.bytes,
    chars: testCase.chars,
    mode,
    median: summarizeBrowserRuns(runs),
    runs,
  }
}

async function runBrowserBenchmarks(corpus) {
  const restoreCases = selectCases(corpus, selectedBrowserRestoreCaseIds)
  const streamCases = selectCases(corpus, selectedBrowserStreamCaseIds)
  const { server, port } = await createBenchmarkServer(corpus)
  let browser

  try {
    browser = await chromium.launch(resolveChromeLaunchOptions())
    const restore = []
    for (const testCase of restoreCases) {
      console.log(`browser restore case=${testCase.id}`)
      restore.push(await runBrowserCase(browser, port, 'restore', testCase))
    }

    const streaming = []
    for (const testCase of streamCases) {
      console.log(`browser stream case=${testCase.id}`)
      streaming.push(await runBrowserCase(browser, port, 'stream', testCase))
    }

    return { restore, streaming }
  }
  finally {
    await browser?.close()
    await server.close()
  }
}

function formatMs(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '-'
}

function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(Math.round(value)) : '-'
}

function renderParserTable(parserResults) {
  const lines = [
    '| Case | Bytes | Nodes | Final median | Process median | Stream total | Stream p95 commit | Final flush |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const row of parserResults) {
    lines.push(`| ${row.id} | ${row.bytes} | ${formatNumber(row.final.medianNodes)} | ${formatMs(row.final.medianMs)} | ${formatMs(row.final.processTokensMedianMs)} | ${formatMs(row.streaming.totalMedianMs)} | ${formatMs(row.streaming.p95CommitMs)} | ${formatMs(row.streaming.finalFlushMedianMs)} |`)
  }
  return lines.join('\n')
}

function renderBrowserRestoreTable(rows) {
  const lines = [
    '| Case | Bytes | Total | Task | Script | Layout | DOM nodes | Non-image/katex height changes | Max non-ignored delta | Parser total | Node reuse | Signature | CLS |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const row of rows) {
    const m = row.median
    lines.push(`| ${row.id} | ${row.bytes} | ${formatMs(m.totalMs)} | ${formatMs(m.taskDurationMs)} | ${formatMs(m.scriptDurationMs)} | ${formatMs(m.layoutDurationMs)} | ${formatNumber(m.settledSnapshot?.domNodes)} | ${formatNumber(m.heightStability?.nonIgnoredChangedSlots)} | ${formatMs(m.heightStability?.nonIgnoredMaxAbsDeltaPx)} | ${formatMs(m.parsePerformance?.parseMarkdownToStructureTotalMs)} | ${formatMs(m.parsePerformance?.nodeReuseMs)} | ${formatMs(m.parsePerformance?.signatureMs)} | ${m.observers?.cls ?? '-'} |`)
  }
  return lines.join('\n')
}

function renderBrowserStreamTable(rows) {
  const lines = [
    '| Case | Bytes | Chunks | Total | p95 update | Max update | Height jumps | Mutations | Task | Layout | Parser total | Node reuse | Signature | Non-image/katex final height changes |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const row of rows) {
    const m = row.median
    lines.push(`| ${row.id} | ${row.bytes} | ${row.runs[0]?.chunks ?? '-'} | ${formatMs(m.totalMs)} | ${formatMs(m.p95UpdateMs)} | ${formatMs(m.maxUpdateMs)} | ${formatNumber(m.heightJumps)} | ${formatNumber(m.observers?.mutationCount)} | ${formatMs(m.taskDurationMs)} | ${formatMs(m.layoutDurationMs)} | ${formatMs(m.parsePerformance?.parseMarkdownToStructureTotalMs)} | ${formatMs(m.parsePerformance?.nodeReuseMs)} | ${formatMs(m.parsePerformance?.signatureMs)} | ${formatNumber(m.heightStability?.nonIgnoredChangedSlots)} |`)
  }
  return lines.join('\n')
}

function renderHeightChangesByTypeTable(rows) {
  const lines = [
    '| Case | Type | Count | Abs delta | Max delta |',
    '| --- | --- | ---: | ---: | ---: |',
  ]
  for (const row of rows) {
    const groups = row.median?.heightStability?.nonIgnoredChangesByType ?? []
    if (!groups.length) {
      lines.push(`| ${row.id} | - | 0 | 0.0 | 0.0 |`)
      continue
    }
    for (const group of groups)
      lines.push(`| ${row.id} | ${group.type || '-'} | ${formatNumber(group.count)} | ${formatMs(group.absDeltaPx)} | ${formatMs(group.maxAbsDeltaPx)} |`)
  }
  return lines.join('\n')
}

function renderMarkdownReport(payload) {
  const distRows = payload.distFreshness
    .map(item => `| ${item.name} | ${item.distPath} | ${item.stale ? 'yes' : 'no'} | ${item.missing ? 'yes' : 'no'} |`)
    .join('\n')
  return [
    '# Real Corpus Performance Benchmark',
    '',
    `Generated: ${payload.generatedAt}`,
    `Method: parser ${parserRounds}-run median after ${parserWarmups} warmups; browser ${browserRepeats}-run median, Chrome CDP + Vite source aliases.`,
    '',
    '## Environment',
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| Node | ${process.version} |`,
    `| OS | ${type()} ${release()} (${platform()} ${arch()}) |`,
    `| Memory | ${(totalmem() / 1024 / 1024).toFixed(0)} MB |`,
    '',
    '## Dist Freshness',
    '',
    '| Package | Dist | Stale | Missing |',
    '| --- | --- | ---: | ---: |',
    distRows,
    '',
    '## Parser',
    '',
    renderParserTable(payload.parser),
    '',
    '## Browser Restore',
    '',
    renderBrowserRestoreTable(payload.browser.restore),
    '',
    '### Restore Height Changes By Type',
    '',
    renderHeightChangesByTypeTable(payload.browser.restore),
    '',
    '## Browser Streaming',
    '',
    renderBrowserStreamTable(payload.browser.streaming),
    '',
    '### Streaming Height Changes By Type',
    '',
    renderHeightChangesByTypeTable(payload.browser.streaming),
    '',
    'Height stability reports compare node-slot heights after the first restored/final frame against the settled frame. The non-image/katex columns exclude image nodes, slots containing image DOM, math_block nodes, and slots containing KaTeX/math DOM. Browser task/layout timings still include diagnostic snapshots, but the streaming update loop does not force per-chunk layout reads.',
    '',
  ].join('\n')
}

async function main() {
  validateCaseIds(selectedParserCaseIds, 'parser')
  validateCaseIds(selectedBrowserRestoreCaseIds, 'browser restore')
  validateCaseIds(selectedBrowserStreamCaseIds, 'browser stream')

  const distFreshness = assertWorkspacePackageDistsFresh()
  const corpus = readCorpus()
  mkdirSync(outputDir, { recursive: true })

  console.log('running parser real-corpus benchmark')
  const parser = await runParserBenchmarks(corpus)
  console.log('running browser real-corpus benchmark')
  const browser = await runBrowserBenchmarks(corpus)

  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'scripts/benchmark-real-corpus-performance.mjs',
    config: {
      parserRounds,
      parserWarmups,
      streamChunkCount,
      browserRepeats,
      browserStreamChunks,
      browserStreamIntervalMs,
      browserViewportWidth,
      browserViewportHeight,
      browserCpuThrottleRate,
      parserCases: selectedParserCaseIds,
      browserRestoreCases: selectedBrowserRestoreCaseIds,
      browserStreamCases: selectedBrowserStreamCaseIds,
    },
    distFreshness,
    corpus: corpus.map(item => ({
      id: item.id,
      label: item.label,
      path: item.path,
      bytes: item.bytes,
      chars: item.chars,
    })),
    parser,
    browser,
  }

  writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`)
  writeFileSync(outputMarkdownPath, `${renderMarkdownReport(payload)}\n`)
  console.log(`wrote ${path.relative(repoRoot, outputJsonPath)}`)
  console.log(`wrote ${path.relative(repoRoot, outputMarkdownPath)}`)
}

await main()
