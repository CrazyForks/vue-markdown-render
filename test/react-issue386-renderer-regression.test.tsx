/**
 * @vitest-environment jsdom
 */

/* eslint-disable antfu/no-import-node-modules-by-path */
import katex from 'katex'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import React, { act } from '../packages/markstream-react/node_modules/react'
import { createRoot } from '../packages/markstream-react/node_modules/react-dom/client'
import { renderToStaticMarkup } from '../packages/markstream-react/node_modules/react-dom/server'
import { NodeRenderer } from '../packages/markstream-react/src/components/NodeRenderer'
import { NodeRenderer as ServerNodeRenderer } from '../packages/markstream-react/src/server'
import { clearKaTeXCache, clearKaTeXWorker, setKaTeXWorker } from '../packages/markstream-react/src/workers/katexWorkerClient'

const REAL_WORLD_MULTILINE_INPUT = `$2.897771955 times 10^{-3}text{m·K}$^[1]^
测试<sup>[3]</sup>。
$x$^[1]^
$x$ ^[1]^
测试^[1]^
$2.897771955 \\times 10^{-3}\\text{m·K}$^[1]^
<sup>[1]</sup>
测试<sup>[12]</sup>结束
A<sup>[3]</sup>B
$x$^[1]^
测试^[1]^
<sup>[3]</sup>
测试<sup>[12]</sup>结束`

class FakeKaTeXWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null

  postMessage(data: { id: string, content: string, displayMode: boolean }) {
    queueMicrotask(() => {
      try {
        const html = katex.renderToString(data.content, {
          throwOnError: false,
          displayMode: data.displayMode,
          output: 'html',
          strict: 'ignore',
        })
        this.onmessage?.({
          data: {
            id: data.id,
            html,
            content: data.content,
            displayMode: data.displayMode,
          },
        } as MessageEvent)
      }
      catch (error: any) {
        this.onmessage?.({
          data: {
            id: data.id,
            error: error?.message || String(error),
            content: data.content,
            displayMode: data.displayMode,
          },
        } as MessageEvent)
      }
    })
  }

  terminate() {}
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function renderMarkdown(content: string, extraProps: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)

  await act(async () => {
    root.render(React.createElement(NodeRenderer as any, {
      content,
      viewportPriority: false,
      deferNodesUntilVisible: false,
      maxLiveNodes: 0,
      ...extraProps,
    }))
  })
  await flushReact()

  return {
    host,
    unmount: async () => {
      await act(async () => {
        root.unmount()
      })
    },
  }
}

beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  setKaTeXWorker(new FakeKaTeXWorker() as unknown as Worker)
})

afterEach(() => {
  clearKaTeXWorker()
  clearKaTeXCache()
  document.body.innerHTML = ''
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

describe('markstream-react issue #386 renderer regressions', () => {
  it('renders bracketed superscript syntax from markdown content', async () => {
    const view = await renderMarkdown('测试^[1]^')

    expect(view.host.querySelector('sup.superscript-node')?.textContent).toBe('[1]')
    expect(view.host.textContent).not.toContain('^[1]^')

    await view.unmount()
  })

  it('renders superscript syntax immediately after inline math', async () => {
    const view = await renderMarkdown('$x$^[1]^')

    expect(view.host.querySelector('.katex')).toBeTruthy()
    expect(view.host.querySelector('sup.superscript-node')?.textContent).toBe('[1]')
    expect(view.host.textContent).not.toContain('^[1]^')

    await view.unmount()
  })

  it('preserves brackets inside standard inline html tags', async () => {
    const view = await renderMarkdown('测试<sup>[3]</sup>。')

    expect(view.host.querySelector('.html-inline-node sup')?.textContent).toBe('[3]')
    expect(view.host.querySelectorAll('p.paragraph-node')).toHaveLength(1)
    expect(view.host.querySelector('p.paragraph-node .html-inline-node sup')?.textContent).toBe('[3]')
    expect(view.host.querySelector('p.paragraph-node')?.textContent).toBe('测试[3]。')

    await view.unmount()
  })

  it('keeps inline html embedded in the same paragraph on the client', async () => {
    const view = await renderMarkdown('A<sup>[3]</sup>B')

    expect(view.host.querySelectorAll('p.paragraph-node')).toHaveLength(1)
    expect(view.host.querySelector('p.paragraph-node .html-inline-node sup')?.textContent).toBe('[3]')
    expect(view.host.querySelector('p.paragraph-node')?.textContent).toBe('A[3]B')

    await view.unmount()
  })

  it('keeps inline html embedded in the same paragraph during SSR', () => {
    const html = renderToStaticMarkup(React.createElement(ServerNodeRenderer as any, {
      content: 'A<sup>[3]</sup>B',
      typewriter: false,
    }))

    expect(html).toContain('<p')
    expect(html).toContain('A')
    expect(html).toContain('<sup>[3]</sup>')
    expect(html).toContain('B')
    expect(html).not.toContain('</p><span class="html-inline-node"')
    expect(html).not.toContain('</sup></div></div></div><div class="node-slot"')
  })

  it('renders the real multiline issue-386 input in streaming mode without leaking raw superscript syntax', async () => {
    const view = await renderMarkdown(REAL_WORLD_MULTILINE_INPUT, { final: false })

    const superscripts = Array.from(view.host.querySelectorAll('sup.superscript-node')).map(node => node.textContent)
    const inlineHtmlSup = Array.from(view.host.querySelectorAll('.html-inline-node sup')).map(node => node.textContent)

    expect(view.host.querySelector('.katex')).toBeTruthy()
    expect(superscripts).toEqual(['[1]', '[1]', '[1]', '[1]', '[1]', '[1]', '[1]'])
    expect(inlineHtmlSup).toEqual(['[3]', '[1]', '[12]', '[3]', '[3]', '[12]'])
    expect(view.host.textContent).not.toContain('^[1]^')

    await view.unmount()
  })
})
