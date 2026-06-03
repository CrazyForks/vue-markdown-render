import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NodeRenderer from '../src/components/NodeRenderer'
import { flushAll } from './setup/flush-all'

describe('numeric-only list item rendering', () => {
  it('renders numeric-only unordered list item text', async () => {
    const content = Array.from({ length: 9 }, (_, index) => `- ${index + 1}`).join('\n')

    const wrapper = mount(NodeRenderer, {
      props: {
        content,
        final: true,
        batchRendering: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()

    const items = wrapper.findAll('li.list-item')
    expect(items).toHaveLength(9)
    expect(items.map(item => item.text())).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
    ])
  })
})
