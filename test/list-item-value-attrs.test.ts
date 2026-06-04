import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ListItemNode from '../src/components/ListItemNode/ListItemNode.vue'
import ListNode from '../src/components/ListNode/ListNode.vue'

vi.mock('../src/components/NodeRenderer', () => ({
  default: {
    name: 'NodeRenderer',
    props: {
      nodes: {
        type: Array,
        default: () => [],
      },
      indexKey: {
        type: [String, Number],
        default: undefined,
      },
      customId: {
        type: String,
        default: undefined,
      },
    },
    template: `
      <span
        data-testid="node-renderer"
        :data-index-key="indexKey"
        :data-custom-id="customId"
      />
    `,
  },
}))

function createParagraph(raw = 'item') {
  return {
    type: 'paragraph',
    raw,
    children: [
      {
        type: 'text',
        raw,
        content: raw,
      },
    ],
  }
}

function createListItem(raw = 'item') {
  return {
    type: 'list_item' as const,
    raw,
    children: [createParagraph(raw)],
  }
}

function createListNode(options: {
  ordered: boolean
  start?: number
  items?: ReturnType<typeof createListItem>[]
}) {
  return {
    type: 'list' as const,
    ordered: options.ordered,
    start: options.start,
    raw: options.ordered ? '1. item' : '- item',
    items: options.items ?? [createListItem('first'), createListItem('second')],
  }
}

const mountOptions = {}

describe('list item value/customId attributes', () => {
  it('does not leak value or custom-id attributes to unordered <li>', () => {
    const wrapper = mount(ListNode, {
      props: {
        node: createListNode({
          ordered: false,
          // Regression guard: even if parser/input accidentally carries start,
          // unordered list items must not receive li[value].
          start: 0,
        }),
        customId: 'message-1',
        indexKey: 'root',
      },
      ...mountOptions,
    })

    const list = wrapper.get('ul')
    expect(list.exists()).toBe(true)

    const items = wrapper.findAll('li')
    expect(items).toHaveLength(2)

    for (const item of items) {
      expect(item.attributes('value')).toBeUndefined()
      expect(item.attributes('custom-id')).toBeUndefined()
    }

    const textNodes = wrapper.findAll('.text-node')
    expect(textNodes).toHaveLength(2)
    expect(textNodes[0]!.attributes('custom-id')).toBe('message-1')
    expect(textNodes[1]!.attributes('custom-id')).toBe('message-1')
  })

  it('keeps explicit li values for ordered lists, including start=0', () => {
    const wrapper = mount(ListNode, {
      props: {
        node: createListNode({
          ordered: true,
          start: 0,
        }),
        customId: 'message-2',
        indexKey: 'root',
      },
      ...mountOptions,
    })

    const list = wrapper.get('ol')
    expect(list.exists()).toBe(true)

    const items = wrapper.findAll('li')
    expect(items.map(item => item.attributes('value'))).toEqual(['0', '1'])

    for (const item of items) {
      expect(item.attributes('custom-id')).toBeUndefined()
    }
  })

  it('removes li value when value becomes nullish without remounting the list item', async () => {
    const wrapper = mount(ListItemNode, {
      props: {
        item: createListItem('first'),
        indexKey: 'root-0',
        customId: 'message-3',
        value: 3,
      },
      ...mountOptions,
    })

    const initialLi = wrapper.get('li').element

    expect(wrapper.get('li').attributes('value')).toBe('3')
    expect(wrapper.get('li').attributes('custom-id')).toBeUndefined()
    expect(wrapper.get('.text-node').attributes('custom-id')).toBe(
      'message-3',
    )

    await wrapper.setProps({
      value: undefined,
    })

    expect(wrapper.get('li').element).toBe(initialLi)
    expect(wrapper.get('li').attributes('value')).toBeUndefined()
    expect(wrapper.get('li').attributes('custom-id')).toBeUndefined()
  })

  it('does not render non-finite li values', async () => {
    const wrapper = mount(ListItemNode, {
      props: {
        item: createListItem('first'),
        indexKey: 'root-0',
        value: Number.NaN,
      },
      ...mountOptions,
    })

    expect(wrapper.get('li').attributes('value')).toBeUndefined()

    await wrapper.setProps({
      value: Number.POSITIVE_INFINITY,
    })

    expect(wrapper.get('li').attributes('value')).toBeUndefined()
  })

  it('does not remount unordered list items during streaming-style item updates', async () => {
    const first = createListItem('first')
    const second = createListItem('second')

    const wrapper = mount(ListNode, {
      props: {
        node: createListNode({
          ordered: false,
          items: [first, second],
        }),
        customId: 'message-4',
        indexKey: 'root',
      },
      ...mountOptions,
    })

    const initialItems = wrapper.findAll('li').map(item => item.element)

    await wrapper.setProps({
      node: createListNode({
        ordered: false,
        items: [
          createListItem('first updated'),
          second,
        ],
      }),
    })

    const nextItems = wrapper.findAll('li').map(item => item.element)

    expect(nextItems[0]).toBe(initialItems[0])
    expect(nextItems[1]).toBe(initialItems[1])

    for (const item of wrapper.findAll('li')) {
      expect(item.attributes('value')).toBeUndefined()
      expect(item.attributes('custom-id')).toBeUndefined()
    }
  })
})
