/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { sanitizeHtmlContent } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'
import MarkdownRender from '../../src/components/NodeRenderer'
import payloads from '../fixtures/security/html-xss-corpus.json'
import { flushAll } from '../setup/flush-all'

function expectNoExecutableMarkup(html: string) {
  const root = document.createElement('div')
  root.innerHTML = html

  expect(root.querySelector('script')).toBeNull()

  for (const el of Array.from(root.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      expect(attr.name).not.toMatch(/^on/i)

      if (['href', 'src', 'xlink:href', 'action', 'data', 'srcdoc', 'formaction', 'poster'].includes(attr.name.toLowerCase())) {
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

  it('sanitizes executable HTML through MarkdownRender safe mode', async () => {
    const wrapper = mount(MarkdownRender, {
      props: {
        content: '<a href="javascript:alert(1)">bad</a><span onclick="alert(1)">x</span>',
        final: true,
        htmlPolicy: 'safe',
        batchRendering: false,
      },
    })

    await flushAll()

    expect(wrapper.html()).not.toMatch(/javascript:/i)
    expect(wrapper.html()).not.toMatch(/\sonclick=/i)
  })
})
