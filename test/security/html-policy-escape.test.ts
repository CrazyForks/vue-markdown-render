/**
 * @vitest-environment jsdom
 */

import { sanitizeHtmlContent } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'
import payloads from '../fixtures/security/html-xss-corpus.json'

describe('htmlPolicy escape security corpus', () => {
  it.each(payloads)('renders $name as text only', ({ html }) => {
    const escaped = sanitizeHtmlContent(html, 'escape')
    const root = document.createElement('div')
    root.innerHTML = escaped

    expect(root.children).toHaveLength(0)
    expect(root.textContent).toBe(html)
  })
})
