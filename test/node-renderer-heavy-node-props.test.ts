import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MermaidBlockNode from '../src/components/MermaidBlockNode'
import NodeRenderer from '../src/components/NodeRenderer'
import { flushAll } from './setup/flush-all'

describe('nodeRenderer heavy-node prop forwarding', () => {
  it('forwards mermaidProps to MermaidBlockNode', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [
          {
            type: 'code_block',
            language: 'mermaid',
            code: 'graph LR\nA-->B\n',
            raw: '```mermaid\ngraph LR\nA-->B\n```',
          },
        ],
        mermaidProps: {
          showHeader: false,
          showZoomControls: false,
          renderDebounceMs: 180,
          previewPollDelayMs: 500,
        },
      },
    })

    await flushAll()

    const mermaid = wrapper.findComponent(MermaidBlockNode as any)
    expect(mermaid.exists()).toBe(true)
    expect(mermaid.props('showHeader')).toBe(false)
    expect(mermaid.props('showZoomControls')).toBe(false)
    expect(mermaid.props('renderDebounceMs')).toBe(180)
    expect(mermaid.props('previewPollDelayMs')).toBe(500)
  })
})
