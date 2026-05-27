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

function readMode() {
  const arg = process.argv.find(value => value.startsWith('--mode='))
  const raw = arg
    ? arg.slice('--mode='.length)
    : process.env.MARKSTREAM_E2E_VIRTUAL_SCROLL_MODE || 'smoke'

  if (raw !== 'smoke' && raw !== 'stress')
    throw new Error(`Invalid virtual-scroll e2e mode: ${raw}`)

  return raw
}

const mode = readMode()
const stressMode = mode === 'stress'

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
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    typeof chromium.executablePath === 'function'
      ? chromium.executablePath()
      : '',
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
        args: [
          '--disable-dev-shm-usage',
          '--no-sandbox',
        ],
      }
    }
  }

  return {
    channel: 'chrome',
    headless: true,
    args: [
      '--disable-dev-shm-usage',
      '--no-sandbox',
    ],
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
  let page

  try {
    await waitForPort(port)

    try {
      browser = await chromium.launch(resolveChromeLaunchOptions())
    }
    catch (error) {
      throw new Error(
        [
          'Unable to launch Chromium for virtual-scroll e2e.',
          'Install Chrome/Chromium in CI or set PLAYWRIGHT_CHROME_PATH / PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.',
          `Original error: ${error?.message || String(error)}`,
        ].join('\n'),
      )
    }
    page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    })

    page.on('console', (msg) => {
      if (msg.type() === 'error')
        process.stderr.write(`[browser:${msg.type()}] ${msg.text()}\n`)
    })

    page.on('pageerror', (error) => {
      process.stderr.write(`[browser:pageerror] ${error.stack || error.message}\n`)
    })

    const profile = stressMode ? 'stress' : 'smoke'

    await page.goto(`http://${host}:${port}/virtual-scroll?profile=${profile}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    })

    await waitForLabReady(page)

    const rootLocator = page.locator('[data-testid="virtual-scroll-root"]')
    await rootLocator.hover()

    for (let i = 0; i < 24; i++) {
      await page.mouse.wheel(0, 900)
      await page.waitForTimeout(16)
    }

    const wheelProbe = await page.evaluate(async () => {
      const api = window.__markstreamVirtualScrollLab
      for (let i = 0; i < 20; i++)
        await api.nextFrame()
      return api.read()
    })

    assert(
      wheelProbe.stats.blankProbeCount === 0
      && wheelProbe.blankFrameCount === 0
      && wheelProbe.visibleCoverageOk === true
      && wheelProbe.health.virtualDomWithinLimit === true
      && wheelProbe.health.hugeRendererDomWithinLimit === true,
      'blank frame, coverage, or DOM budget regression observed during real wheel scrolling',
      wheelProbe,
    )

    if (!stressMode) {
      const smoke = await page.evaluate(async () => {
        const api = window.__markstreamVirtualScrollLab

        const waitHealthy = async (frames = 90) => {
          let latest = api.read()
          for (let i = 0; i < frames; i++) {
            await api.nextFrame()
            latest = api.read()

            if (
              latest.stats.blankProbeCount === 0
              && latest.health.maxObservedBlankProbes === 0
              && latest.health.maxObservedPlaceholderProbes === 0
              && latest.health.maxObservedEmptyCardProbes === 0
              && latest.blankFrameCount === 0
              && latest.visibleCoverageOk
              && latest.health.virtualDomWithinLimit
              && latest.health.hugeRendererDomWithinLimit
              && latest.health.threadRestoreOk
              && latest.maxItemHeightDriftPx < 24
            ) {
              api.clearEvents()
              await api.nextFrame()
              latest = api.read()
              return latest
            }
          }

          return latest
        }

        await api.clearEvents()
        await api.scrollToRatio(0.82)
        const before = await waitHealthy()

        await api.switchThread('thread-b')
        await waitHealthy()

        await api.switchThread(before.threadId)
        const restored = await waitHealthy()

        await api.settleVisibleRenderers()
        const final = await waitHealthy()

        api.clearEvents()
        api.toggleReverseFlexMode()
        await api.nextFrame()
        await api.scrollToRatio(1)

        const reverseBefore = api.read()

        await api.switchThread(reverseBefore.threadId === 'thread-a' ? 'thread-b' : 'thread-a')
        await api.nextFrame()
        await api.switchThread(reverseBefore.threadId)

        for (let i = 0; i < 60; i++)
          await api.nextFrame()

        const reverseAfter = api.read()
        api.toggleReverseFlexMode()
        await api.nextFrame()

        return {
          before,
          restored,
          final,
          reverseFlexProbe: {
            before: reverseBefore,
            after: reverseAfter,
          },
        }
      })

      assertThreadRestore('smoke thread restore', smoke.before, smoke.restored)
      assertThreadRestore(
        'reverse flex thread restore',
        smoke.reverseFlexProbe.before,
        smoke.reverseFlexProbe.after,
      )

      assert(
        smoke.final.health.layoutIntegrityOk
        && smoke.final.health.virtualDomWithinLimit
        && smoke.final.health.hugeRendererDomWithinLimit
        && smoke.final.health.maxObservedBlankProbes === 0,
        'virtual-scroll smoke health check failed',
        smoke.final,
      )

      process.stdout.write(`${JSON.stringify({
        ok: true,
        mode,
        health: smoke.final.health,
      }, null, 2)}\n`)

      return
    }

    await page.evaluate(() => {
      window.__markstreamVirtualScrollLab.clearEvents()
    })

    await page.evaluate(async () => {
      const api = window.__markstreamVirtualScrollLab
      for (let i = 0; i < 8; i++)
        await api.nextFrame()
      await api.scrollToRatio(0)
      await api.nextFrame()
      await api.scrollToRatio(0.5)
      await api.nextFrame()
      await api.scrollToRatio(0)
      await api.nextFrame()
    })

    const rootScrollSync = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="virtual-scroll-root"]')
      const snapshot = window.__markstreamVirtualScrollLab.read()

      return {
        domScrollTop: root?.scrollTop ?? null,
        snapshotScrollTop: snapshot.scrollTop,
        delta: root
          ? Math.abs(root.scrollTop - snapshot.scrollTop)
          : Number.POSITIVE_INFINITY,
      }
    })

    assert(
      rootScrollSync.delta <= 1,
      'virtual-scroll lab snapshot scrollTop is out of sync with DOM scrollTop',
      rootScrollSync,
    )

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
          const blankProbeOk = options.clearEvents === false
            ? latest.health.maxObservedBlankProbes === 0
            : latest.stats.blankProbeCount === 0
          if (
            blankProbeOk
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
      const getOuterAnchorDelta = (before, after) => {
        if (!before || !after || before.type !== after.type)
          return Number.POSITIVE_INFINITY

        if (before.type === 'bottom') {
          return Math.abs(
            Number(before.distanceFromBottomPx ?? 0)
            - Number(after.distanceFromBottomPx ?? 0),
          )
        }

        if (before.messageKey && after.messageKey && before.messageKey !== after.messageKey)
          return Number.POSITIVE_INFINITY

        if (before.messageKey == null && after.messageKey == null && before.index !== after.index)
          return Number.POSITIVE_INFINITY

        return Math.abs(Number(before.offsetPx ?? 0) - Number(after.offsetPx ?? 0))
      }
      const isCurrentHealthy = snapshot => (
        snapshot.stats.blankProbeCount === 0
        && snapshot.blankFrameCount === 0
        && snapshot.visibleCoverageOk
        && snapshot.health.maxObservedCoverageGapPx <= 24
        && snapshot.health.virtualDomWithinLimit
        && snapshot.health.hugeRendererDomWithinLimit
        && snapshot.maxItemHeightDriftPx < 24
      )
      const isStableSnapshot = (previous, next) => (
        Math.abs(previous.scrollTop - next.scrollTop) <= 1
        && Math.abs(previous.totalHeight - next.totalHeight) <= 1
        && getOuterAnchorDelta(previous.outerAnchor, next.outerAnchor) <= 1
      )
      const waitCurrentHealthy = async (frames = 120) => {
        let latest = api.read()
        let previousHealthy = null
        let stableFrames = 0

        for (let i = 0; i < frames; i++) {
          await api.nextFrame()
          latest = api.read()

          if (!isCurrentHealthy(latest)) {
            previousHealthy = null
            stableFrames = 0
            continue
          }

          if (previousHealthy && isStableSnapshot(previousHealthy, latest))
            stableFrames += 1
          else
            stableFrames = 0

          previousHealthy = latest

          if (stableFrames >= 2)
            return latest
        }

        return latest
      }

      await api.scrollToRatio(0.15)
      await waitCurrentHealthy()
      api.clearEvents()

      await api.scrollToRatio(0.82)
      const threadABefore = await waitCurrentHealthy()
      api.clearEvents()

      await api.switchThread('thread-b')
      await waitCurrentHealthy()
      await api.scrollToRatio(0.58)
      const threadBBefore = await waitCurrentHealthy()
      api.clearEvents()

      await api.switchThread('thread-a')
      const threadAAfter = await waitCurrentHealthy()
      api.clearEvents()

      await api.switchThread('thread-b')
      const threadBAfter = await waitCurrentHealthy()
      api.clearEvents()

      await api.rapidSwitchThreads(
        ['thread-a', 'thread-b'],
        12,
      )
      await waitCurrentHealthy()
      api.clearEvents()

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

      api.toggleSmallMessageCoordination()
      const smallCoordinationAfter = await waitHealthy(90)

      await api.scrollToRatio(0.62)
      await waitCurrentHealthy()
      api.clearEvents()
      const relayoutThreadBefore = await waitCurrentHealthy()
      const settledEventsBeforeRelayoutRestore = relayoutThreadBefore.settledEvents
      const relayoutOtherThread
        = relayoutThreadBefore.threadId === 'thread-a' ? 'thread-b' : 'thread-a'

      await api.switchThread(relayoutOtherThread)
      await waitCurrentHealthy()
      await api.switchThread(relayoutThreadBefore.threadId)
      let relayoutThreadAfter = await waitCurrentHealthy()
      await waitUntil(
        snapshot => snapshot.settledEvents > settledEventsBeforeRelayoutRestore,
        180,
      )
      for (let i = 0; i < 8; i++)
        await api.nextFrame()
      relayoutThreadAfter = api.read()
      api.clearEvents()
      await api.nextFrame()

      const finalSettleResults = await api.settleVisibleRenderers()
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
        smallCoordinationAfter,
        relayoutThreadBefore,
        relayoutThreadAfter,
        finalSettleResults,
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
      smallCoordinationAfter,
      relayoutThreadBefore,
      relayoutThreadAfter,
      finalSettleResults,
      final,
    } = result

    assertThreadRestore('thread-a', threadABefore, threadAAfter)
    assertThreadRestore('thread-b', threadBBefore, threadBAfter)
    assertThreadRestore('relayout thread restore', relayoutThreadBefore, relayoutThreadAfter)

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
      final.health.maxObservedCoverageGapPx <= 24,
      'transient viewport coverage gap exceeded budget during virtual scrolling',
      {
        health: final.health,
        events: final.events.filter(event => (event.maxCoverageGapPx ?? 0) > 24),
      },
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
      relayoutAfter.health.maxObservedScrollJumpPx <= 32
      && narrowAfter.health.maxObservedScrollJumpPx <= 32,
      'layout changes caused unexpected scroll jump',
      {
        relayout: relayoutAfter.health,
        narrow: narrowAfter.health,
      },
    )

    assert(
      relayoutAfter.maxItemHeightDriftPx < 24
      && narrowAfter.maxItemHeightDriftPx < 24,
      'height model did not converge after layout change',
      {
        relayout: relayoutAfter,
        narrow: narrowAfter,
      },
    )

    assert(
      final.health.layoutIntegrityOk === true,
      'virtual-scroll layout health check failed',
      final.health,
    )

    assert(
      final.health.threadRestoreOk === true,
      'thread restore delta exceeded budget',
      {
        lastThreadRestoreDeltaPx: final.health.lastThreadRestoreDeltaPx,
        lastThreadRestoreAnchorDeltaPx: final.health.lastThreadRestoreAnchorDeltaPx,
        health: final.health,
      },
    )

    assert(
      final.settledEvents > 0,
      'no render-settled events were observed in the virtual-scroll lab',
      {
        final,
        finalSettleResults,
      },
    )

    assert(
      stressAfter.health.maxObservedBlankProbes === 0
      && stressAfter.blankFrameCount === 0
      && stressAfter.visibleCoverageOk === true
      && stressAfter.health.maxObservedCoverageGapPx <= 24
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
      stressAfter.maxItemHeightDriftPx < 24,
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
      streamAfter.stats.blankProbeCount === 0,
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
      streamAfter.maxItemHeightDriftPx < 24,
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

    assert(
      narrowAfter.health.maxObservedCoverageGapPx <= 24,
      'transient viewport coverage gap exceeded budget in narrow layout',
      narrowAfter.health,
    )

    assert(
      smallCoordinationAfter.health.maxObservedBlankProbes === 0
      && smallCoordinationAfter.blankFrameCount === 0
      && smallCoordinationAfter.visibleCoverageOk === true
      && smallCoordinationAfter.health.virtualDomWithinLimit === true
      && smallCoordinationAfter.health.maxObservedScrollJumpPx <= 32,
      'small-message virtual-scroll coordination caused blank frame, DOM budget, or jitter regression',
      smallCoordinationAfter,
    )

    const anchorPollutionProbe = await page.evaluate(async () => {
      const api = window.__markstreamVirtualScrollLab

      await api.scrollToRatio(0.73)
      await api.nextFrame()
      const before = api.read()

      api.toggleDensity()
      for (let i = 0; i < 30; i++)
        await api.nextFrame()

      const afterRelayout = api.read()

      await api.switchThread(before.threadId === 'thread-a' ? 'thread-b' : 'thread-a')
      for (let i = 0; i < 12; i++)
        await api.nextFrame()

      await api.switchThread(before.threadId)
      for (let i = 0; i < 30; i++)
        await api.nextFrame()

      const restored = api.read()

      return {
        before,
        afterRelayout,
        restored,
      }
    })

    assertThreadRestore(
      'anchor pollution probe',
      anchorPollutionProbe.before,
      anchorPollutionProbe.restored,
    )

    process.stdout.write(`${JSON.stringify({
      ok: true,
      mode,
      health: final.health,
    }, null, 2)}\n`)
  }
  catch (error) {
    if (page) {
      const snapshot = await page.evaluate(() => {
        try {
          return window.__markstreamVirtualScrollLab?.read?.() ?? null
        }
        catch {
          return null
        }
      }).catch(() => null)

      if (snapshot)
        process.stderr.write(`[virtual-scroll:snapshot]\n${JSON.stringify(snapshot, null, 2)}\n`)

      const screenshotPath = path.join(repoRoot, 'virtual-scroll-failure.png')
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {})
      process.stderr.write(`[virtual-scroll:screenshot] ${screenshotPath}\n`)
    }

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
