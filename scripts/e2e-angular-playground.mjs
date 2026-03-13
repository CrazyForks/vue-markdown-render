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
const playgroundDir = path.join(repoRoot, 'playground-angular')
const host = '127.0.0.1'

function isPortOpen(port, listenHost = host) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: listenHost, port })
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

async function findFreePort(start = 4175, end = 4205) {
  for (let port = start; port <= end; port++) {
    if (!await isPortOpen(port))
      return port
  }
  throw new Error(`No free port found in ${start}-${end}`)
}

async function waitForPort(port, timeout = 60000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
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
    child.kill('SIGTERM')
  }
  catch {}
  setTimeout(() => {
    try {
      if (!child.killed)
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
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
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
  const logBuffer = []
  const child = spawn(
    'pnpm',
    ['exec', 'vite', 'dev', '--host', host, '--port', String(port)],
    {
      cwd: playgroundDir,
      env: {
        ...process.env,
        CI: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  const appendLogs = (chunk) => {
    const text = String(chunk)
    logBuffer.push(text)
    if (logBuffer.length > 160)
      logBuffer.splice(0, logBuffer.length - 160)
  }

  child.stdout.on('data', appendLogs)
  child.stderr.on('data', appendLogs)

  return {
    child,
    getLogs() {
      return logBuffer.join('')
    },
  }
}

function summarizeErrors(errors) {
  return errors
    .map(error => error.trim())
    .filter(Boolean)
}

async function waitForStableEnhancements(page) {
  await page.waitForSelector('.preview-surface .katex', { timeout: 30000 })
  await page.waitForSelector('.preview-surface .markstream-angular-mermaid svg', { timeout: 30000 })
  await page.waitForSelector('.preview-surface [data-markstream-infographic="1"] svg', { timeout: 30000 })
  await page.waitForSelector('.preview-surface [data-markstream-d2="1"] svg', { timeout: 30000 })
}

async function collectBaselineMetrics(page) {
  return page.evaluate(() => ({
    katexCount: document.querySelectorAll('.preview-surface .katex').length,
    mermaidSvgCount: document.querySelectorAll('.preview-surface .markstream-angular-mermaid svg').length,
    infographicSvgCount: document.querySelectorAll('.preview-surface [data-markstream-infographic="1"] svg').length,
    d2SvgCount: document.querySelectorAll('.preview-surface [data-markstream-d2="1"] svg').length,
  }))
}

async function collectDiffMetrics(page) {
  return page.evaluate(() => ({
    wrapperCount: document.querySelectorAll('.preview-surface [data-markstream-monaco="1"]').length,
    monacoCount: document.querySelectorAll('.preview-surface [data-markstream-monaco="1"] .monaco-editor').length,
    monacoDiffCount: document.querySelectorAll('.preview-surface [data-markstream-monaco="1"] .monaco-diff-editor').length,
    badgeTexts: Array.from(document.querySelectorAll('.preview-surface .markstream-angular-enhanced-block__badge'))
      .map(node => node.textContent?.trim())
      .filter(Boolean),
  }))
}

async function waitForDiffEditors(page, timeout = 60000) {
  const startedAt = Date.now()
  let lastSnapshot = null

  while (Date.now() - startedAt < timeout) {
    lastSnapshot = await page.evaluate(() => ({
      wrapperCount: document.querySelectorAll('.preview-surface [data-markstream-monaco="1"]').length,
      monacoCount: document.querySelectorAll('.preview-surface [data-markstream-monaco="1"] .monaco-editor').length,
      badgeTexts: Array.from(document.querySelectorAll('.preview-surface .markstream-angular-enhanced-block__badge'))
        .map(node => node.textContent?.trim())
        .filter(Boolean),
      previewExcerpt: (document.querySelector('.preview-surface')?.textContent || '').slice(0, 500),
      textareaExcerpt: (((document.querySelector('textarea') && 'value' in document.querySelector('textarea'))
        ? document.querySelector('textarea').value
        : '') || '').slice(0, 160),
    }))

    if (lastSnapshot.wrapperCount >= 2 && lastSnapshot.monacoCount >= 2)
      return lastSnapshot

    await page.waitForTimeout(1000)
  }

  throw new Error(`Timed out waiting for diff Monaco blocks: ${JSON.stringify(lastSnapshot)}`)
}

async function collectStressMetrics(page) {
  return page.evaluate(() => ({
    tableCount: document.querySelectorAll('.preview-surface table').length,
    detailsCount: document.querySelectorAll('.preview-surface details').length,
    summaryCount: document.querySelectorAll('.preview-surface summary').length,
    blockquoteCount: document.querySelectorAll('.preview-surface blockquote').length,
    previewExcerpt: (document.querySelector('.preview-surface')?.textContent || '').slice(0, 500),
  }))
}

async function collectStreamingMetrics(page) {
  const progressNode = page.locator('.workspace-card').nth(1).locator('.mini-pill')
  const readProgress = async () => {
    const text = (await progressNode.innerText()).trim()
    return Number.parseInt(text.replace(/[^\d]/g, ''), 10)
  }

  await page.getByRole('button', { name: '开始流式渲染' }).click()
  await page.waitForFunction(() => {
    const title = document.querySelectorAll('.workspace-card__head p')[1]
    return title?.textContent?.includes('Streaming 中')
  }, { timeout: 10000 })

  const earlyProgress = await readProgress()

  await page.waitForFunction(() => {
    const title = document.querySelectorAll('.workspace-card__head p')[1]
    const pill = document.querySelector('.workspace-card .mini-pill')
    return title?.textContent?.includes('已显示完整输入')
      && pill?.textContent?.trim() === '100%'
  }, { timeout: 30000 })

  return {
    earlyProgress,
    finalProgress: await readProgress(),
  }
}

async function main() {
  const port = await findFreePort()
  const server = startDevServer(port)

  try {
    await waitForPort(port)

    const browser = await chromium.launch(resolveChromeLaunchOptions())
    const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } })
    const consoleErrors = []
    const pageErrors = []

    page.on('console', (msg) => {
      if (msg.type() === 'error')
        consoleErrors.push(msg.text())
    })
    page.on('pageerror', error => pageErrors.push(String(error)))

    const homeUrl = `http://${host}:${port}/`
    await page.goto(homeUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('text=markstream-angular playground', { timeout: 30000 })
    await page.waitForSelector('text=Open /test', { timeout: 30000 })

    const homeProgressText = (await page.locator('.meta').innerText()).trim()
    await page.getByRole('button', { name: 'Open /test' }).click()
    await page.waitForURL(new RegExp(`http://${host}:${port}/test$`), { timeout: 15000 })
    await page.waitForSelector('text=markstream-angular /test', { timeout: 30000 })

    await waitForStableEnhancements(page)
    const baseline = await collectBaselineMetrics(page)

    await page.getByRole('button', { name: 'Diff 与代码流' }).click()
    await waitForDiffEditors(page)
    const diff = await collectDiffMetrics(page)

    await page.getByRole('button', { name: '结构压力' }).click()
    await page.waitForSelector('.preview-surface table', { timeout: 20000 })
    await page.waitForFunction(() => {
      return document.querySelectorAll('.preview-surface summary').length >= 1
    }, { timeout: 20000 })
    const stress = await collectStressMetrics(page)
    const streaming = await collectStreamingMetrics(page)

    await page.getByRole('button', { name: '返回主 demo' }).click()
    await page.waitForURL(new RegExp(`http://${host}:${port}/$`), { timeout: 15000 })
    await page.waitForSelector('text=markstream-angular playground', { timeout: 30000 })

    const screenshot = '/tmp/markstream-angular-playground-e2e.png'
    await page.screenshot({ path: screenshot, fullPage: true })
    await browser.close()

    const result = {
      homeUrl,
      homeProgressText,
      baseline,
      diff,
      stress,
      streaming,
      consoleErrors: summarizeErrors(consoleErrors),
      pageErrors: summarizeErrors(pageErrors),
      screenshot,
    }

    console.log(JSON.stringify(result, null, 2))

    if (result.consoleErrors.length > 0 || result.pageErrors.length > 0) {
      throw new Error(`Unexpected browser errors: console=${result.consoleErrors.length}, page=${result.pageErrors.length}`)
    }
    if (baseline.katexCount < 1 || baseline.mermaidSvgCount < 1 || baseline.infographicSvgCount < 1 || baseline.d2SvgCount < 1) {
      throw new Error(`Baseline enhancements did not all render: ${JSON.stringify(baseline)}`)
    }
    if (diff.wrapperCount < 2 || diff.monacoCount < 2) {
      throw new Error(`Diff sample did not mount Monaco editors as expected: ${JSON.stringify(diff)}`)
    }
    if (stress.tableCount < 1 || stress.summaryCount < 1) {
      throw new Error(`Stress sample missed expected structural nodes: ${JSON.stringify(stress)}`)
    }
    if (!(streaming.earlyProgress > 0 && streaming.earlyProgress < 100) || streaming.finalProgress !== 100) {
      throw new Error(`Streaming progress did not behave as expected: ${JSON.stringify(streaming)}`)
    }
  }
  catch (error) {
    const recentLogs = server.getLogs().trim()
    if (recentLogs) {
      console.error('--- playground-angular recent logs ---')
      console.error(recentLogs)
      console.error('--- end playground-angular recent logs ---')
    }
    throw error
  }
  finally {
    killProcessTree(server.child)
  }
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
