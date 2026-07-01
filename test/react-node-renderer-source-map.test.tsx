/**
 * @vitest-environment jsdom
 */

import React, { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { NodeRenderer } from '../packages/markstream-react/src/components/NodeRenderer'

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('react node renderer source maps', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
  })

  it('does not reuse nodes when includeSourceMap is enabled for unchanged content', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const seen: any[] = []
    function Probe(props: { node: any }) {
      seen.push(props.node)
      return <span>{props.node.content}</span>
    }

    const content = '<Probe>\nstable\n</Probe>'
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const streamingComponents = { probe: Probe }

    await act(async () => {
      root.render(
        <StrictMode>
          <NodeRenderer
            content={content}
            final
            smoothStreaming={false}
            batchRendering={false}
            viewportPriority={false}
            deferNodesUntilVisible={false}
            streamingComponents={streamingComponents}
            parseOptions={{ includeSourceMap: false }}
          />
        </StrictMode>,
      )
    })
    await flushReact()

    const firstNode = seen.at(-1)
    expect(firstNode?.sourceMap).toBeUndefined()

    await act(async () => {
      root.render(
        <StrictMode>
          <NodeRenderer
            content={content}
            final
            smoothStreaming={false}
            batchRendering={false}
            viewportPriority={false}
            deferNodesUntilVisible={false}
            streamingComponents={streamingComponents}
            parseOptions={{ includeSourceMap: true }}
          />
        </StrictMode>,
      )
    })
    await flushReact()

    expect(seen.at(-1)).not.toBe(firstNode)
    expect(seen.at(-1)?.sourceMap).toEqual({ startLine: 0, endLine: 3 })

    await act(async () => {
      root.unmount()
    })
  })

  it('does not reuse nodes when the same raw node moves to different source lines', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const seen: any[] = []
    function Probe(props: { node: any }) {
      seen.push(props.node)
      return <span>{props.node.content}</span>
    }

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const streamingComponents = { probe: Probe }

    const render = (content: string) => (
      <StrictMode>
        <NodeRenderer
          content={content}
          final
          smoothStreaming={false}
          batchRendering={false}
          viewportPriority={false}
          deferNodesUntilVisible={false}
          streamingComponents={streamingComponents}
          parseOptions={{ includeSourceMap: true }}
        />
      </StrictMode>
    )

    await act(async () => {
      root.render(render('Alpha\n\n<Probe>\nstable\n</Probe>'))
    })
    await flushReact()

    const firstNode = seen.at(-1)
    expect(firstNode?.sourceMap).toEqual({ startLine: 2, endLine: 5 })

    await act(async () => {
      root.render(render('\nAlpha\n\n<Probe>\nstable\n</Probe>'))
    })
    await flushReact()

    expect(seen.at(-1)).not.toBe(firstNode)
    expect(seen.at(-1)?.sourceMap).toEqual({ startLine: 3, endLine: 6 })

    await act(async () => {
      root.unmount()
    })
  })
})
