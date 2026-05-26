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
      const threadAAfter = api.read()

      await api.switchThread('thread-b')
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

      return {
        threadABefore,
        threadBBefore,
        threadAAfter,
        threadBAfter,
        final: api.read(),
      }
    })

    const {
      threadABefore,
      threadBBefore,
      threadAAfter,
      threadBAfter,
      final,
    } = result

    const threadARestoreDelta = Math.abs(threadABefore.scrollTop - threadAAfter.scrollTop)
    const threadBRestoreDelta = Math.abs(threadBBefore.scrollTop - threadBAfter.scrollTop)

    assert(
      threadARestoreDelta < 32,
      'thread-a scroll position was not restored accurately',
      { before: threadABefore.scrollTop, after: threadAAfter.scrollTop, threadARestoreDelta },
    )

    assert(
      threadBRestoreDelta < 32,
      'thread-b scroll position was not restored accurately',
      { before: threadBBefore.scrollTop, after: threadBAfter.scrollTop, threadBRestoreDelta },
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
      final.health.virtualDomWithinLimit === true,
      'markdown DOM slot count exceeded budget',
      final.health,
    )

    assert(
      final.health.maxObservedMarkdownSlots <= final.health.domSlotBudget,
      'observed markdown node-slot count exceeded budget',
      final.health,
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
      final.health.layoutIntegrityOk === true,
      'virtual-scroll layout health check failed',
      final.health,
    )

    process.stdout.write(`${JSON.stringify({
      ok: true,
      threadARestoreDelta,
      threadBRestoreDelta,
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
