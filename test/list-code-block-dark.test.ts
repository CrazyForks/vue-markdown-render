import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NodeRenderer from '../src/components/NodeRenderer'
import { flushAll } from './setup/flush-all'

const content = [
  '1. First step:',
  '',
  '   ```js',
  '   const x = 1',
  '   ```',
  '',
  '2. Second step',
].join('\n')

describe('code block inside a list inherits dark mode', () => {
  it('forwards isDark down to list-item children', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content,
        isDark: true,
        final: true,
        batchRendering: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()

    const nested = wrapper.find('.list-item .markdown-renderer')
    expect(nested.exists()).toBe(true)
    expect(nested.classes()).toContain('dark')
  })

  it('does not add dark when isDark is false', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content,
        isDark: false,
        final: true,
        batchRendering: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()

    const nested = wrapper.find('.list-item .markdown-renderer')
    expect(nested.exists()).toBe(true)
    expect(nested.classes()).not.toContain('dark')
  })
})
