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

async function readSnapshot(page) {
  return await page.evaluate(() => {
    const api = window.__MARKSTREAM_VIRTUAL_SCROLL_LAB__
    if (!api)
      throw new Error('Virtual scroll lab API is not available')
    return api.read()
  })
}

async function waitForLabReady(page, timeoutMs = 30000) {
  await page.waitForFunction(() => {
    const api = window.__MARKSTREAM_VIRTUAL_SCROLL_LAB__
    if (!api)
      return false

    const snapshot = api.read()
    return snapshot.totalHeight > snapshot.viewportHeight
      && snapshot.messageDomCount > 0
      && snapshot.markdownSlotCount > 0
  }, null, { timeout: timeoutMs })
}

async function waitForHealthy(page, label, timeoutMs = 30000) {
  await page.waitForFunction(() => {
    const api = window.__MARKSTREAM_VIRTUAL_SCROLL_LAB__
    if (!api)
      return false

    const snapshot = api.read()
    return snapshot.blankFrameCount === 0
      && snapshot.visibleCoverageOk
      && snapshot.clippedMessageCount === 0
      && snapshot.heightDriftMessageCount === 0
      && snapshot.maxItemHeightDriftPx <= 2
      && snapshot.markdownSlotCount <= snapshot.expectedMarkdownSlotCeiling
      && snapshot.maxMarkdownSlotCount <= (snapshot.maxExpectedMarkdownSlotCeiling ?? snapshot.expectedMarkdownSlotCeiling)
      && snapshot.messageDomCount <= 24
      && snapshot.labStatus === 'ok'
  }, null, { timeout: timeoutMs }).catch(async (error) => {
    const snapshot = await readSnapshot(page).catch(() => null)
    throw new Error(`${label} did not become healthy: ${error.message}\n${JSON.stringify(snapshot, null, 2)}`)
  })
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
    await waitForHealthy(page, 'initial')

    await page.evaluate(() => window.__MARKSTREAM_VIRTUAL_SCROLL_LAB__.actions.jumpToBottom())
    await page.evaluate(() => window.__MARKSTREAM_VIRTUAL_SCROLL_LAB__.actions.startStreamingLastMessage())

    await page.waitForTimeout(4500)
    await waitForHealthy(page, 'streaming bottom pin')

    const afterStream = await readSnapshot(page)
    assert(afterStream.distanceFromBottomPx <= 32, 'streaming should remain pinned near bottom', afterStream)

    await page.evaluate(() => window.__MARKSTREAM_VIRTUAL_SCROLL_LAB__.actions.startStressScroll())
    await page.waitForTimeout(10000)
    await page.evaluate(() => window.__MARKSTREAM_VIRTUAL_SCROLL_LAB__.actions.stopStressScroll())
    await waitForHealthy(page, 'stress scroll')

    const afterStress = await readSnapshot(page)
    assert(afterStress.blankFrameCount === 0, 'stress scroll produced blank frames', afterStress)
    assert(
      afterStress.markdownSlotCount <= afterStress.expectedMarkdownSlotCeiling,
      'DOM-size exceeded markdown slot ceiling',
      afterStress,
    )
    assert(
      afterStress.maxMarkdownSlotCount <= (afterStress.maxExpectedMarkdownSlotCeiling ?? afterStress.expectedMarkdownSlotCeiling),
      'DOM-size exceeded markdown slot ceiling during stress scroll',
      afterStress,
    )
    assert(
      afterStress.maxItemHeightDriftPx <= 2,
      'item height drift is too large after stress scroll',
      afterStress,
    )

    await page.evaluate(() => window.__MARKSTREAM_VIRTUAL_SCROLL_LAB__.actions.jumpToMiddle())
    await page.waitForTimeout(300)
    const threadABefore = await readSnapshot(page)

    await page.evaluate(() => window.__MARKSTREAM_VIRTUAL_SCROLL_LAB__.actions.switchThread('thread-b'))
    await page.waitForTimeout(500)
    await waitForHealthy(page, 'thread B')

    await page.evaluate(() => window.__MARKSTREAM_VIRTUAL_SCROLL_LAB__.actions.switchThread('thread-a'))
    await page.waitForTimeout(800)
    await waitForHealthy(page, 'thread A restore')

    const threadAAfter = await readSnapshot(page)
    assert(
      Math.abs(threadAAfter.scrollTop - threadABefore.scrollTop) <= 48,
      'thread restore drift is too large',
      { before: threadABefore, after: threadAAfter },
    )

    await page.evaluate(() => window.__MARKSTREAM_VIRTUAL_SCROLL_LAB__.actions.toggleDensity())
    await page.evaluate(() => window.__MARKSTREAM_VIRTUAL_SCROLL_LAB__.actions.toggleFontScale())
    await page.waitForTimeout(1200)
    await waitForHealthy(page, 'density/font relayout')

    const finalSnapshot = await readSnapshot(page)
    process.stdout.write(`${JSON.stringify({
      ok: true,
      snapshot: finalSnapshot,
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
