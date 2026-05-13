/**
 * @vitest-environment jsdom
 */

import { sanitizeHtmlContent } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'
import payloads from '../fixtures/security/html-xss-corpus.json'

function expectNoExecutableMarkup(html: string) {
  const root = document.createElement('div')
  root.innerHTML = html

  expect(root.querySelector('script')).toBeNull()

  for (const el of Array.from(root.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      expect(attr.name).not.toMatch(/^on/i)

      if (['href', 'src', 'xlink:href', 'action', 'data', 'srcdoc'].includes(attr.name.toLowerCase())) {
        expect(attr.value).not.toMatch(/javascript:/i)
        expect(attr.value).not.toMatch(/vbscript:/i)
        expect(attr.value).not.toMatch(/data:text\/html/i)
      }

      if (attr.name.toLowerCase() === 'style') {
        expect(attr.value).not.toMatch(/javascript:/i)
        expect(attr.value).not.toMatch(/expression\s*\(/i)
        expect(attr.value).not.toMatch(/@import/i)
      }
    }
  }
}

describe('htmlPolicy safe security corpus', () => {
  it.each(payloads)('does not create executable DOM for $name', ({ html }) => {
    expectNoExecutableMarkup(sanitizeHtmlContent(html, 'safe'))
  })

  it('scrubs unsafe URLs from allowed HTML elements', () => {
    const html = sanitizeHtmlContent('<a href="javascript:alert(1)">x</a><img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="><span style="background:url(javascript:alert(1))">x</span>', 'safe')

    expect(html).toContain('<a>x</a>')
    expect(html).toContain('<img>')
    expect(html).not.toContain('src=')
    expect(html).toContain('<span>x</span>')
    expectNoExecutableMarkup(html)
  })
})
