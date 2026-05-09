import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ThinkingNode from '../playground/src/components/ThinkingNode.vue'
import NodeRenderer from '../src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents } from '../src/utils/nodeComponents'
import { flushAll } from './setup/flush-all'

describe('playground Vue thinking node', () => {
  it('renders thinking content through nested NodeRenderer so streamed text can fade', async () => {
    const customId = 'playground-vue-thinking-fade'
    setCustomComponents(customId, { thinking: ThinkingNode })

    const wrapper = mount(NodeRenderer, {
      props: {
        batchRendering: false,
        content: '<thinking>alpha</thinking>',
        customHtmlTags: ['thinking'],
        customId,
        deferNodesUntilVisible: false,
        maxLiveNodes: 0,
        smoothStreaming: false,
        typewriter: true,
        viewportPriority: false,
      },
    })

    try {
      await flushAll()

      await wrapper.setProps({
        content: '<thinking>alpha beta</thinking>',
      })
      await flushAll()

      const thinkingNode = wrapper.get('.thinking-node')
      const delta = wrapper.get('.thinking-node .text-node-stream-delta')

      expect(delta.text()).toBe('beta')
      expect(thinkingNode.text()).toContain('alpha beta')
    }
    finally {
      wrapper.unmount()
      removeCustomComponents(customId)
    }
  })
})
