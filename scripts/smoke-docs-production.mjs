#!/usr/bin/env node

import process from 'node:process'

const newHost = process.env.MARKSTREAM_DOCS_URL || 'https://markstream.simonhe.me'
const oldHost = process.env.MARKSTREAM_OLD_DOCS_URL || 'https://markstream-vue-docs.simonhe.me'
const failures = []

async function request(url, options = {}) {
  const response = await fetch(url, options)
  return response
}

async function expectStatus(url, expectedStatus) {
  const response = await request(url, { redirect: 'manual' })
  if (response.status !== expectedStatus)
    failures.push(`${url} returned ${response.status}, expected ${expectedStatus}`)
  return response
}

async function expectText(url, markers) {
  const response = await expectStatus(url, 200)
  if (response.status !== 200)
    return ''

  const text = await response.text()
  for (const marker of markers) {
    if (!text.includes(marker))
      failures.push(`${url} is missing marker: ${marker}`)
  }
  return text
}

async function expectRedirect(path) {
  const sourceUrl = `${oldHost}${path}`
  const targetUrl = `${newHost}${path}`
  const response = await request(sourceUrl, { redirect: 'manual' })
  if (![301, 308].includes(response.status)) {
    failures.push(`${sourceUrl} returned ${response.status}, expected 301 or 308`)
    return
  }

  const location = response.headers.get('location')
  if (location !== targetUrl)
    failures.push(`${sourceUrl} redirects to ${location}, expected ${targetUrl}`)
}

await expectText(`${newHost}/`, [
  `<link rel="canonical" href="${newHost}/">`,
  'Markstream',
])
await expectText(`${newHost}/robots.txt`, [
  `Sitemap: ${newHost}/sitemap.xml`,
])
await expectText(`${newHost}/sitemap.xml`, [
  `${newHost}/frameworks/react`,
  `${newHost}/frameworks/vue`,
  `${newHost}/compare/react-markdown`,
])
await expectText(`${newHost}/llms.txt`, [
  'Markstream is a family',
  `${newHost}/frameworks/react`,
])
await expectText(`${newHost}/frameworks/react`, [
  `<link rel="canonical" href="${newHost}/frameworks/react">`,
  `<meta property="og:url" content="${newHost}/frameworks/react">`,
])

for (const path of ['/', '/frameworks/react', '/llms.txt', '/zh/frameworks/vue'])
  await expectRedirect(path)

if (failures.length > 0) {
  console.error('[docs-production-smoke] failed:')
  for (const failure of failures)
    console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('[docs-production-smoke] Production docs URL, redirects, robots, sitemap, llms.txt, and canonical tags are valid.')
