/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
/* eslint-disable antfu/no-import-node-modules-by-path */
import React, { act, StrictMode } from '../packages/markstream-react/node_modules/react'
import { createRoot } from '../packages/markstream-react/node_modules/react-dom/client'
import { NodeRenderer } from '../packages/markstream-react/src/components/NodeRenderer'
import { SmoothStreamingContext } from '../packages/markstream-react/src/context/smoothStreaming'

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('react node renderer smooth streaming', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
    vi.unstubAllGlobals()
  })

  it('smooths post-mount appends by default and allows opting out', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const content = 'Hello smooth streaming markdown renderer.'
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const renderMarkdown = (props: Record<string, unknown>) =>
      React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, props))

    await act(async () => {
      root.render(renderMarkdown({
        content: '',
        typewriter: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      }))
    })
    await flushReact()

    await act(async () => {
      root.render(renderMarkdown({
        content,
        typewriter: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      }))
    })
    await flushReact()

    expect(host.textContent).not.toContain(content)

    const rawHost = document.createElement('div')
    document.body.appendChild(rawHost)
    const rawRoot = createRoot(rawHost)

    await act(async () => {
      rawRoot.render(renderMarkdown({
        content: '',
        typewriter: true,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      }))
    })
    await flushReact()

    await act(async () => {
      rawRoot.render(renderMarkdown({
        content,
        typewriter: true,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      }))
    })
    await flushReact()

    expect(rawHost.textContent).toContain(content)

    await act(async () => {
      root.unmount()
      rawRoot.unmount()
    })
  })

  it('renders initial static content immediately', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: 'static markdown',
          typewriter: true,
          batchRendering: false,
          viewportPriority: false,
          deferNodesUntilVisible: false,
        })),
      )
    })
    await flushReact()

    expect(host.textContent).toContain('static markdown')

    await act(async () => {
      root.unmount()
    })
  })

  it('forces pacing in smoothStreaming=true mode even without typewriter', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const renderMarkdown = (content: string) =>
      React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
        content,
        typewriter: false,
        smoothStreaming: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      }))

    await act(async () => {
      root.render(renderMarkdown(''))
    })
    await flushReact()

    await act(async () => {
      root.render(renderMarkdown('Force enabled smooth'))
    })
    await flushReact()

    expect(host.textContent).not.toContain('Force enabled smooth')

    await act(async () => {
      root.unmount()
    })
  })

  it('keeps auto mode off when typewriter is disabled', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: 'Auto mode test',
          typewriter: false,
          smoothStreaming: 'auto',
          batchRendering: false,
          viewportPriority: false,
          deferNodesUntilVisible: false,
        })),
      )
    })
    await flushReact()

    expect(host.textContent).toContain('Auto mode test')

    await act(async () => {
      root.unmount()
    })
  })

  it('does not smooth nodes mode and suppresses nested auto pacing', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const nodes = [{ type: 'text', content: 'Node mode', raw: 'Node mode' }]

    await act(async () => {
      root.render(React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, { nodes, typewriter: true, smoothStreaming: true, batchRendering: false, viewportPriority: false, deferNodesUntilVisible: false })))
    })
    await flushReact()

    expect(host.textContent).toContain('Node mode')

    const nestedHost = document.createElement('div')
    document.body.appendChild(nestedHost)
    const nestedRoot = createRoot(nestedHost)

    await act(async () => {
      nestedRoot.render(React.createElement(StrictMode, null, React.createElement(SmoothStreamingContext.Provider, { value: true }, React.createElement(NodeRenderer as any, { content: '', typewriter: true, batchRendering: false, viewportPriority: false, deferNodesUntilVisible: false }))))
    })
    await flushReact()

    await act(async () => {
      nestedRoot.render(React.createElement(StrictMode, null, React.createElement(SmoothStreamingContext.Provider, { value: true }, React.createElement(NodeRenderer as any, { content: 'Nested auto content', typewriter: true, batchRendering: false, viewportPriority: false, deferNodesUntilVisible: false }))))
    })
    await flushReact()

    expect(nestedHost.textContent).toContain('Nested auto content')

    await act(async () => {
      root.unmount()
      nestedRoot.unmount()
    })
  })
})
