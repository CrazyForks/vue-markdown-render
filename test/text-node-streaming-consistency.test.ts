/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NodeRenderer from '../src/components/NodeRenderer'
import { flushAll } from './setup/flush-all'

describe('text node streaming consistency', () => {
  it('settles a finished strong-node delta when following sibling text keeps streaming', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: '1. **记忆化递归（动态规划',
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
        maxLiveNodes: 0,
      },
    })

    try {
      await wrapper.setProps({
        content: '1. **记忆化递归（动态规划）*',
      })
      await flushAll()

      let strongDelta = wrapper.find('.strong-node .text-node-stream-delta')
      expect(strongDelta.exists()).toBe(true)
      expect(strongDelta.text()).toBe('）')

      await wrapper.setProps({
        content: '1. **记忆化递归（动态规划）**：',
      })
      await flushAll()

      strongDelta = wrapper.find('.strong-node .text-node-stream-delta')
      expect(strongDelta.exists()).toBe(false)
      expect(wrapper.get('.strong-node').text()).toBe('记忆化递归（动态规划）')

      await wrapper.setProps({
        content: '1. **记忆化递归（动态规划）**：使',
      })
      await flushAll()

      expect(wrapper.find('.strong-node .text-node-stream-delta').exists()).toBe(false)
      expect(wrapper.get('.list-item').text()).toContain('记忆化递归（动态规划）：使')
    }
    finally {
      wrapper.unmount()
    }
  })
})
