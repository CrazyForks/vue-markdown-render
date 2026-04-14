/**
 * @vitest-environment node
 */

import type { RenderContext } from '../packages/markstream-react/src/types'
import { describe, expect, it } from 'vitest'
import React from '../packages/markstream-react/node_modules/react'
import { renderToStaticMarkup } from '../packages/markstream-react/node_modules/react-dom/server'
import { HtmlBlockNode as ReactHtmlBlockNode } from '../packages/markstream-react/src/components/HtmlBlockNode/HtmlBlockNode'
import { renderNode as clientRenderNode } from '../packages/markstream-react/src/renderers/renderNode'
import {
  HtmlBlockNode as ReactServerHtmlBlockNode,
  renderNode as serverRenderNode,
} from '../packages/markstream-react/src/server-renderer/index'
import { renderNode } from '../packages/markstream-react/src/renderers/renderNode'

describe('markstream-react heavy-node prop forwarding', () => {
  const baseCtx: RenderContext = {
    customId: 'react-heavy-props-test',
    isDark: false,
    indexKey: 'react-heavy-props-test',
    typewriter: false,
    codeBlockProps: {},
    mermaidProps: {},
    d2Props: {},
    infographicProps: {},
    showTooltips: true,
    codeBlockStream: true,
    renderCodeBlocksAsPre: false,
    customComponents: {},
    customHtmlTags: [],
    events: {},
  }

  it('forwards mermaidProps to MermaidBlockNode render output', () => {
    const ctx: RenderContext = {
      ...baseCtx,
      mermaidProps: {
        showHeader: false,
        renderDebounceMs: 180,
      },
    }

    const element = renderNode({
      type: 'code_block',
      language: 'mermaid',
      code: 'graph LR\nA-->B\n',
      raw: '```mermaid\ngraph LR\nA-->B\n```',
    } as any, 'mermaid-props', ctx) as any

    expect(element?.props?.showHeader).toBe(false)
    expect(element?.props?.renderDebounceMs).toBe(180)
  })

  it('sanitizes dangerous attrs on the client structured html wrapper path', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReactHtmlBlockNode, {
        node: {
          type: 'html_block',
          tag: 'a',
          content: '<a href="javascript:alert(1)" onclick="alert(1)" data-safe="ok"></a>',
          attrs: [
            ['href', 'javascript:alert(1)'],
            ['onclick', 'alert(1)'],
            ['data-safe', 'ok'],
          ],
          children: [
            {
              type: 'paragraph',
              raw: 'safe child',
              children: [{ type: 'text', raw: 'safe child', content: 'safe child' }],
            },
          ],
          loading: false,
        },
        ctx: baseCtx,
        renderNode: clientRenderNode,
        indexKey: 'client-html-attrs',
        customId: baseCtx.customId,
      } as any),
    )

    expect(html).toContain('data-safe="ok"')
    expect(html).not.toContain('onclick=')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('safe child')
  })

  it('sanitizes dangerous attrs on the server structured html wrapper path', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReactServerHtmlBlockNode, {
        node: {
          type: 'html_block',
          tag: 'a',
          content: '<a href="javascript:alert(1)" onclick="alert(1)" data-safe="ok"></a>',
          attrs: [
            ['href', 'javascript:alert(1)'],
            ['onclick', 'alert(1)'],
            ['data-safe', 'ok'],
          ],
          children: [
            {
              type: 'paragraph',
              raw: 'safe child',
              children: [{ type: 'text', raw: 'safe child', content: 'safe child' }],
            },
          ],
        },
        ctx: baseCtx,
        renderNode: serverRenderNode,
        indexKey: 'server-html-attrs',
        customId: baseCtx.customId,
      } as any),
    )

    expect(html).toContain('data-safe="ok"')
    expect(html).not.toContain('onclick=')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('safe child')
  })
})
