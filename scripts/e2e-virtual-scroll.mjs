#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const playgroundDir = path.join(repoRoot, 'playground')
const host = '127.0.0.1'

function assert(condition, message, details) {
  if (condition)
    return

  const suffix = details ? `\n${JSON.stringify(details, null, 2)}` : ''
  throw new Error(`${message}${suffix}`)
}

function outerAnchorDelta(before, after) {
  if (!before || !after || before.type !== after.type)
    return Number.POSITIVE_INFINITY

  if (before.type === 'bottom') {
    return Math.abs(
      Number(before.distanceFromBottomPx ?? 0)
      - Number(after.distanceFromBottomPx ?? 0),
    )
  }

  if (before.index !== after.index)
    return Number.POSITIVE_INFINITY

  return Math.abs(Number(before.offsetPx ?? 0) - Number(after.offsetPx ?? 0))
}

function assertThreadRestore(label, before, after) {
  const scrollDelta = Math.abs(before.scrollTop - after.scrollTop)
  const anchorDelta = outerAnchorDelta(before.outerAnchor, after.outerAnchor)

  assert(
    scrollDelta < 32 || anchorDelta < 32,
    `${label} scroll position was not restored accurately`,
    {
      before: {
        scrollTop: before.scrollTop,
        firstVisibleMessageId: before.firstVisibleMessageId,
        outerAnchor: before.outerAnchor,
      },
      after: {
        scrollTop: after.scrollTop,
        firstVisibleMessageId: after.firstVisibleMessageId,
        outerAnchor: after.outerAnchor,
      },
      scrollDelta,
      anchorDelta,
    },
  )
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    socket.on('connect', () => {
      socket.end()
      resolve(true)
    })
    socket.on('error', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

async function findFreePort(start = 4360, end = 4399) {
  for (let port = start; port <= end; port++) {
    if (!await isPortOpen(port))
      return port
  }

  throw new Error(`No free port found in ${start}-${end}`)
}

async function waitForPort(port, timeoutMs = 60000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(port))
      return

    await new Promise(resolve => setTimeout(resolve, 150))
  }

  throw new Error(`Timed out waiting for ${host}:${port}`)
}

function killProcessTree(child) {
  if (!child || child.killed)
    return

  try {
    if (process.platform !== 'win32' && child.pid)
      process.kill(-child.pid, 'SIGTERM')
    else
      child.kill('SIGTERM')
  }
  catch {}

  setTimeout(() => {
    try {
      if (process.platform !== 'win32' && child.pid)
        process.kill(-child.pid, 'SIGKILL')
      else if (!child.killed)
        child.kill('SIGKILL')
    }
    catch {}
  }, 3000).unref?.()
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

function startDevServer(port) {
  const logs = []
  const child = spawn(
    'pnpm',
    [
      '-C',
      playgroundDir,
      'exec',
      'vite',
      '--host',
      host,
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        CI: '1',
      },
    },
  )

  child.stdout.on('data', chunk => logs.push(String(chunk)))
  child.stderr.on('data', chunk => logs.push(String(chunk)))

  return {
    child,
    getLogs() {
      return logs.join('')
    },
  }
}

async function waitForLabReady(page, timeoutMs = 30000) {
  await page.waitForFunction(() => {
    const api = window.__markstreamVirtualScrollLab
    if (!api)
      return false

    const snapshot = api.read()
    return snapshot.ready === true
  }, null, { timeout: timeoutMs })
}

async function run() {
  const port = await findFreePort()
  const server = startDevServer(port)

  let browser

  try {
    await waitForPort(port)

    browser = await chromium.launch(resolveChromeLaunchOptions())
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    })

    page.on('console', (msg) => {
      if (msg.type() === 'error')
        process.stderr.write(`[browser:${msg.type()}] ${msg.text()}\n`)
    })

    await page.goto(`http://${host}:${port}/virtual-scroll`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    })

    await waitForLabReady(page)

    await page.evaluate(() => {
      window.__markstreamVirtualScrollLab.clearEvents()
    })

    const result = await page.evaluate(async () => {
      const api = window.__markstreamVirtualScrollLab
      const waitHealthy = async (frames = 30, options = {}) => {
        let latest = api.read()
        for (let i = 0; i < frames; i++) {
          await api.nextFrame()
          latest = api.read()
          if (
            latest.health.maxObservedBlankProbes === 0
            && latest.blankFrameCount === 0
            && latest.visibleCoverageOk
            && latest.health.virtualDomWithinLimit
            && latest.health.scrollJitterOk
            && latest.maxItemHeightDriftPx < 24
          ) {
            if (options.clearEvents !== false) {
              api.clearEvents()
              await api.nextFrame()
              latest = api.read()
            }
            return latest
          }
        }
        return latest
      }
      const scrollToSettledBottom = async () => {
        let latest = api.read()
        for (let i = 0; i < 4; i++) {
          await api.scrollToRatio(1)
          latest = await waitHealthy(45)
          if (latest.distanceFromBottomPx < 32)
            return latest
        }
        return latest
      }
      const waitForSettledEvent = async (frames = 120) => {
        let latest = api.read()
        for (let i = 0; i < frames; i++) {
          if (latest.settledEvents > 0)
            return latest
          await api.nextFrame()
          latest = api.read()
        }
        return latest
      }
      const waitUntil = async (predicate, frames = 180) => {
        let latest = api.read()
        for (let i = 0; i < frames; i++) {
          if (predicate(latest))
            return latest
          await api.nextFrame()
          latest = api.read()
        }
        return latest
      }

      await api.scrollToRatio(0.15)
      await api.nextFrame()

      await api.scrollToRatio(0.82)
      await api.nextFrame()

      const threadABefore = api.read()

      await api.switchThread('thread-b')
      await api.nextFrame()
      await api.scrollToRatio(0.58)
      await api.nextFrame()

      const threadBBefore = api.read()

      await api.switchThread('thread-a')
      await api.nextFrame()
      await api.nextFrame()
      const threadAAfter = api.read()

      await api.switchThread('thread-b')
      await api.nextFrame()
      await api.nextFrame()
      const threadBAfter = api.read()

      await api.rapidSwitchThreads(
        ['thread-a', 'thread-b'],
        12,
      )

      await api.scrollToRatio(0.04)
      await api.nextFrame()
      await api.scrollToRatio(0.95)
      await api.nextFrame()
      const switchAfter = await waitHealthy(60, { clearEvents: false })

      api.clearEvents()
      api.startStressScroll()
      for (let i = 0; i < 180; i++)
        await api.nextFrame()
      api.stopStressScroll()
      const stressAfter = await waitHealthy(45, { clearEvents: false })
      api.clearEvents()
      await api.nextFrame()

      await scrollToSettledBottom()
      const settledEventsBeforeStream = api.read().settledEvents
      api.startStreamingLastMessage({
        blocks: 160,
        initialChars: 800,
        chunkSize: 6400,
        intervalMs: 16,
      })
      await waitUntil(snapshot => snapshot.streamingActive === false, 360)
      await waitUntil(snapshot => snapshot.settledEvents > settledEventsBeforeStream, 180)
      const streamAfter = await waitHealthy(120, { clearEvents: false })
      api.clearEvents()
      await api.nextFrame()

      api.toggleDensity()
      api.toggleFontScale()
      const relayoutAfter = await waitHealthy(45)

      api.toggleNarrowMode()
      const narrowAfter = await waitHealthy(60)

      await waitForSettledEvent()
      const finalAfter = await waitHealthy(45)

      return {
        threadABefore,
        threadBBefore,
        threadAAfter,
        threadBAfter,
        switchAfter,
        stressAfter,
        streamAfter,
        relayoutAfter,
        narrowAfter,
        final: finalAfter,
      }
    })

    const {
      threadABefore,
      threadBBefore,
      threadAAfter,
      threadBAfter,
      switchAfter,
      stressAfter,
      streamAfter,
      relayoutAfter,
      narrowAfter,
      final,
    } = result

    assertThreadRestore('thread-a', threadABefore, threadAAfter)
    assertThreadRestore('thread-b', threadBBefore, threadBAfter)

    assert(
      switchAfter.health.maxObservedBlankProbes === 0
      && switchAfter.blankFrameCount === 0
      && switchAfter.visibleCoverageOk === true
      && switchAfter.health.maxObservedScrollJumpPx <= 32,
      'blank frame or unexpected scroll jump observed during thread switching',
      {
        health: switchAfter.health,
        events: switchAfter.events.filter(event =>
          (event.blankProbeCount ?? 0) > 0
          || (!event.expectedJump && (event.scrollJumpPx ?? 0) > 32),
        ),
      },
    )

    assert(
      final.health.maxObservedBlankProbes === 0,
      'blank visible item observed during virtual scrolling',
      {
        health: final.health,
        events: final.events.filter(event => (event.blankProbeCount ?? 0) > 0),
      },
    )

    assert(
      final.blankFrameCount === 0,
      'blank frame counter increased during virtual scrolling',
      final,
    )

    assert(
      final.visibleCoverageOk === true,
      'visible probe coverage failed',
      final,
    )

    assert(
      final.health.virtualDomWithinLimit === true,
      'markdown DOM slot count exceeded budget',
      final.health,
    )

    assert(
      final.health.hugeRendererDomWithinLimit === true
      && final.maxHugeMessageSlotCount <= final.hugeRendererSlotBudget,
      'a huge Markdown renderer exceeded its per-renderer live node budget',
      {
        maxHugeMessageSlotCount: final.maxHugeMessageSlotCount,
        hugeRendererSlotBudget: final.hugeRendererSlotBudget,
        health: final.health,
      },
    )

    assert(
      final.health.maxObservedMarkdownSlots <= final.health.domSlotBudget,
      'observed markdown node-slot count exceeded budget',
      final.health,
    )

    assert(
      final.maxMarkdownSlotCount <= final.maxExpectedMarkdownSlotCeiling,
      'peak markdown node-slot count exceeded expected ceiling',
      {
        maxMarkdownSlotCount: final.maxMarkdownSlotCount,
        maxExpectedMarkdownSlotCeiling: final.maxExpectedMarkdownSlotCeiling,
      },
    )

    assert(
      final.maxDomNodeCount <= final.maxExpectedDomNodeCeiling,
      'peak DOM node count exceeded expected ceiling',
      {
        maxDomNodeCount: final.maxDomNodeCount,
        maxExpectedDomNodeCeiling: final.maxExpectedDomNodeCeiling,
      },
    )

    assert(
      final.health.maxObservedHeightDriftPx < 24,
      'height drift is too large after coordination',
      {
        health: final.health,
        events: final.events.filter(event => (event.maxItemHeightDriftPx ?? 0) >= 24),
      },
    )

    assert(
      final.health.maxObservedScrollJumpPx <= 32,
      'unexpected scroll jump observed during virtual-scroll coordination',
      {
        health: final.health,
        events: final.events.filter(event => !event.expectedJump && (event.scrollJumpPx ?? 0) > 32),
      },
    )

    assert(
      final.health.layoutIntegrityOk === true,
      'virtual-scroll layout health check failed',
      final.health,
    )

    assert(
      final.settledEvents > 0,
      'no render-settled events were observed in the virtual-scroll lab',
      final,
    )

    assert(
      stressAfter.health.maxObservedBlankProbes === 0
      && stressAfter.blankFrameCount === 0
      && stressAfter.visibleCoverageOk === true
      && stressAfter.health.virtualDomWithinLimit === true
      && stressAfter.health.hugeRendererDomWithinLimit === true,
      'blank frame or DOM budget regression observed during stress scroll',
      stressAfter,
    )

    assert(
      stressAfter.health.maxObservedScrollJumpPx <= 32,
      'unexpected scroll jump observed during stress scroll',
      {
        health: stressAfter.health,
        events: stressAfter.events.filter(event => !event.expectedJump && (event.scrollJumpPx ?? 0) > 32),
      },
    )

    assert(
      stressAfter.health.maxObservedHeightDriftPx < 24,
      'height drift exceeded budget during stress scroll',
      {
        health: stressAfter.health,
        events: stressAfter.events.filter(event => (event.maxItemHeightDriftPx ?? 0) >= 24),
      },
    )

    assert(
      streamAfter.distanceFromBottomPx < 96,
      'streaming while pinned to bottom caused scroll drift',
      streamAfter,
    )

    assert(
      streamAfter.health.maxObservedBlankProbes === 0,
      'blank frame observed while streaming a huge message',
      streamAfter.health,
    )

    assert(
      streamAfter.blankFrameCount === 0,
      'blank frame observed while streaming a huge message',
      streamAfter,
    )

    assert(
      streamAfter.health.maxObservedScrollJumpPx <= 32,
      'unexpected scroll jump observed while streaming a huge message',
      {
        health: streamAfter.health,
        events: streamAfter.events.filter(event => !event.expectedJump && (event.scrollJumpPx ?? 0) > 32),
      },
    )

    assert(
      streamAfter.health.maxObservedHeightDriftPx < 24,
      'height drift exceeded budget while streaming a huge message',
      {
        health: streamAfter.health,
        events: streamAfter.events.filter(event => (event.maxItemHeightDriftPx ?? 0) >= 24),
      },
    )

    assert(
      relayoutAfter.health.maxObservedHeightDriftPx < 24,
      'density/font relayout did not converge',
      relayoutAfter.health,
    )

    assert(
      narrowAfter.layoutWidth > 0 && narrowAfter.layoutWidth < 320,
      'narrow virtual-scroll lab did not enter sub-320px layout',
      narrowAfter,
    )

    assert(
      narrowAfter.health.maxObservedHeightDriftPx < 24,
      'sub-320px virtual-scroll layout did not converge',
      narrowAfter.health,
    )

    assert(
      narrowAfter.health.maxObservedBlankProbes === 0
      && narrowAfter.blankFrameCount === 0
      && narrowAfter.visibleCoverageOk === true,
      'blank frame or coverage regression observed in narrow layout',
      narrowAfter,
    )

    process.stdout.write(`${JSON.stringify({
      ok: true,
      health: final.health,
    }, null, 2)}\n`)
  }
  catch (error) {
    process.stderr.write(`${server.getLogs()}\n`)
    throw error
  }
  finally {
    if (browser)
      await browser.close().catch(() => {})

    killProcessTree(server.child)
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
