/**
 * @vitest-environment jsdom
 *
 * Tests for non-whitelisted custom HTML tags rendering in React.
 *
 * When a custom HTML-like tag (e.g., `<echat-url>`) is NOT in the `customHtmlTags` whitelist,
 * it should be rendered as literal text instead of being parsed as an HTML element.
 * This prevents content loss and ensures surrounding Markdown renders correctly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React, { act, StrictMode } from '../packages/markstream-react/node_modules/react'
import { createRoot } from '../packages/markstream-react/node_modules/react-dom/client'
import { NodeRenderer } from '../packages/markstream-react/src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents } from '../packages/markstream-react/src/customComponents'

function normalizeText(input: string) {
  return input.replace(/\s+/g, ' ').trim()
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('React: non-whitelisted custom HTML tags', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    document.body.innerHTML = ''
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
    vi.unstubAllGlobals()
  })

  it('renders whitelisted tag as custom component', async () => {
    const scopeId = 'react-whitelisted-tag'
    const CustomTag: React.FC<{ node: { content?: string } }> = ({ node }) => (
      <custom-component>{node.content || ''}</custom-component>
    )

    setCustomComponents(scopeId, { 'my-tag': CustomTag })

    try {
      const markdown = `<my-tag>Hello World</my-tag>`
      const host = document.createElement('div')
      document.body.appendChild(host)
      const root = createRoot(host)

      await act(async () => {
        root.render(
          React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
            content: markdown,
            customId: scopeId,
            customHtmlTags: ['my-tag'],
            final: true,
          })),
        )
      })
      await flushReact()

      const text = host.textContent || ''
      // Should render as custom component
      expect(text).toContain('Hello World')

      root.unmount()
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('renders standard HTML div as HTML element', async () => {
    const scopeId = 'react-standard-html-div'
    const markdown = `<div class="test">Content</div>`
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: markdown,
          customId: scopeId,
          final: true,
        })),
      )
    })
    await flushReact()

    const html = host.innerHTML
    // Standard div should render as HTML element
    expect(html).toContain('<div')
    expect(html).toContain('</div>')
    expect(html).toContain('Content')

    root.unmount()
  })

  it('renders non-whitelisted custom tag content correctly', async () => {
    const scopeId = 'react-non-whitelisted-content'
    // Non-whitelisted tags should still show their content
    const markdown = `Hello <unknown-tag>world</unknown-tag>!`
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: markdown,
          customId: scopeId,
          final: true,
          // NOT adding 'unknown-tag' to customHtmlTags
        })),
      )
    })
    await flushReact()

    const text = normalizeText(host.textContent || '')
    // Content should be preserved
    expect(text).toContain('Hello')
    expect(text).toContain('world')
    expect(text).toContain('!')

    root.unmount()
  })

  it('preserves text after non-whitelisted tag in list item', async () => {
    // Original BUG: text after non-whitelisted tag was truncated in list items
    const scopeId = 'react-list-item-tag-truncation'
    const markdown = `- 一段说明文字。
- <echat-url>标签。
- 一段数据分析总结。`
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: markdown,
          customId: scopeId,
          final: true,
          // NOT adding 'echat-url' to customHtmlTags
        })),
      )
    })
    await flushReact()

    const text = normalizeText(host.textContent || '')
    // All three list items should be rendered
    expect(text).toContain('一段说明文字')
    // "标签。" should NOT be lost - this was the original bug
    expect(text).toContain('标签')
    expect(text).toContain('一段数据分析总结')

    root.unmount()
  })

  it('renders non-whitelisted tag literally with HTML entities', async () => {
    // Non-whitelisted tags should display as literal text, not empty nodes
    const scopeId = 'react-literal-tag-display'
    const markdown = `<echat-url>content</echat-url>`
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: markdown,
          customId: scopeId,
          final: true,
          // NOT adding 'echat-url' to customHtmlTags
        })),
      )
    })
    await flushReact()

    const html = host.innerHTML
    // The content is double-escaped:
    // 1. renderNode escapes: <echat-url> → &lt;echat-url&gt;
    // 2. HTML display escapes: &lt; → &amp;lt;
    // So we check for the double-escaped form
    expect(html).toContain('&amp;lt;echat-url')
    expect(html).toContain('&amp;lt;/echat-url')
    expect(html).toContain('content')
    // Should NOT render as actual HTML element
    expect(html).not.toMatch(/<echat-url[^>]*>/i)

    root.unmount()
  })

  it('does not truncate surrounding markdown in list context', async () => {
    // Original BUG: surrounding markdown was truncated when non-whitelisted tag appeared
    const scopeId = 'react-surrounding-markdown-truncation'
    const markdown = `Before list:

- Item with <custom-tag>inline content</custom-tag> and more text.
- Another item.

After list.`
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: markdown,
          customId: scopeId,
          final: true,
          // NOT adding 'custom-tag' to customHtmlTags
        })),
      )
    })
    await flushReact()

    const text = normalizeText(host.textContent || '')
    // Before/after content should be preserved
    expect(text).toContain('Before list')
    expect(text).toContain('After list')
    // List items should be complete
    expect(text).toContain('Item with')
    expect(text).toContain('inline content')
    expect(text).toContain('and more text')
    expect(text).toContain('Another item')

    root.unmount()
  })
})
