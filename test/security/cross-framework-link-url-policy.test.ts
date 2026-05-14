import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { renderMarkdownNodeToHtml as renderAngularNodeToHtml } from '../../packages/markstream-angular/src/renderMarkdownHtml'
import { LinkNode as ReactLinkNode } from '../../packages/markstream-react/src/components/LinkNode/LinkNode'
import { LinkNode as ReactServerLinkNode } from '../../packages/markstream-react/src/server-renderer'
import { renderMarkdownNodeToHtml as renderSvelteNodeToHtml } from '../../packages/markstream-svelte/src/renderMarkdownHtml'
import { renderMarkdownNodeToHtml as renderVue2NodeToHtml } from '../../packages/markstream-vue2/src/utils/nestedHtml'

function linkNode(href: string) {
  return {
    type: 'link',
    href,
    title: null,
    text: 'x',
    raw: `[x](${href})`,
    loading: false,
    children: [{ type: 'text', content: 'x', raw: 'x' }],
  } as any
}

function renderAllLinkOutputs(href: string) {
  const node = linkNode(href)
  return [
    renderVue2NodeToHtml(node),
    renderSvelteNodeToHtml(node),
    renderAngularNodeToHtml(node),
    renderToStaticMarkup(React.createElement(ReactServerLinkNode as any, { node })),
    renderToStaticMarkup(React.createElement(ReactLinkNode as any, { node })),
  ]
}

function expectRelHardened(html: string) {
  const rel = html.match(/\srel="([^"]*)"/i)?.[1] ?? ''
  expect(html).toMatch(/\starget="_blank"/i)
  expect(rel.split(/\s+/)).toContain('noopener')
  expect(rel.split(/\s+/)).toContain('noreferrer')
}

describe('cross-framework link URL policy', () => {
  it('omits unsafe hrefs in framework renderers', () => {
    const unsafe = [
      'javascript:alert(1)',
      'java\u0000script:alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html,<script>alert(1)</script>',
    ]

    for (const href of unsafe) {
      for (const rendered of renderAllLinkOutputs(href)) {
        expect(rendered).not.toMatch(/\shref=/i)
        expect(rendered).not.toMatch(/javascript:/i)
        expect(rendered).not.toMatch(/vbscript:/i)
        expect(rendered).not.toMatch(/data:text\/html/i)
      }
    }
  })

  it('preserves safe hrefs in framework renderers', () => {
    const safe = [
      'https://example.com',
      'http://example.com',
      'mailto:a@example.com',
      'tel:+123456789',
      '/docs',
      '#section',
    ]

    for (const href of safe) {
      for (const rendered of renderAllLinkOutputs(href))
        expect(rendered).toContain(`href="${href}"`)
    }
  })

  it('hardens new-tab links in framework renderers', () => {
    for (const rendered of renderAllLinkOutputs('https://example.com'))
      expectRelHardened(rendered)
  })
})
