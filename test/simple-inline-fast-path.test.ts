import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import NodeRenderer from '../src/components/NodeRenderer'
import { clearGlobalCustomComponents, setCustomComponents } from '../src/utils/nodeComponents'
import { flushAll } from './setup/flush-all'

describe('simple inline fast path', () => {
  afterEach(() => {
    clearGlobalCustomComponents()
  })

  it('renders simple list item paragraphs without nested renderer wrappers', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: '- Visit [Vue](https://vuejs.org) with **bold** and `code`',
        final: true,
        batchRendering: false,
        showTooltips: false,
      },
    })

    await flushAll()

    const item = wrapper.get('li.list-item')
    expect(item.find('.markdown-renderer').exists()).toBe(false)
    expect(item.get('p.paragraph-node').text()).toContain('Visit Vue with bold and code')
    expect(item.get('strong.strong-node').text()).toBe('bold')
    expect(item.get('code.inline-code').text()).toBe('code')
    expect(item.get('a[href="https://vuejs.org"]').attributes('title')).toBe('https://vuejs.org')
  })

  it('renders simple table cells without nested renderer wrappers', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: [
          '| Name | Value |',
          '| --- | --- |',
          '| Vue | [Docs](https://vuejs.org) and **bold** `code` |',
        ].join('\n'),
        final: true,
        batchRendering: false,
        showTooltips: false,
      },
    })

    await flushAll()

    const table = wrapper.get('table.table-node')
    expect(table.find('.markdown-renderer').exists()).toBe(false)
    expect(table.get('a[href="https://vuejs.org"]').attributes('title')).toBe('')
    expect(table.get('strong.strong-node').text()).toBe('bold')
    expect(table.get('code.inline-code').text()).toBe('code')
  })

  it('uses a lightweight plain text node when simple table text has fade disabled', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: [
          '| Name | Value |',
          '| --- | --- |',
          '| Vue | Fast path |',
        ].join('\n'),
        final: true,
        batchRendering: false,
        fade: false,
      },
    })

    await flushAll()

    const valueCell = wrapper.get('tbody td:nth-child(2)')
    expect(valueCell.text()).toBe('Fast path')
    expect(valueCell.find('.markdown-renderer').exists()).toBe(false)
    expect(valueCell.find('.text-node-stream-delta').exists()).toBe(false)
  })

  it('keeps the nested renderer path when paragraph has a custom component', async () => {
    const scopeId = 'simple-inline-paragraph-override'
    setCustomComponents(scopeId, {
      paragraph: defineComponent({
        name: 'CustomParagraphNode',
        props: {
          node: { type: Object, required: true },
        },
        setup(props) {
          return () => h('p', { class: 'custom-paragraph-node' }, String((props.node as any).raw ?? ''))
        },
      }),
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '- overridden',
        customId: scopeId,
        final: true,
        batchRendering: false,
      },
    })

    await flushAll()

    const item = wrapper.get('li.list-item')
    expect(item.get('.markdown-renderer').exists()).toBe(true)
    expect(item.get('.custom-paragraph-node').text()).toBe('overridden')
  })

  it('does not bypass a custom text component in simple table cells', async () => {
    const scopeId = 'simple-inline-text-override'

    setCustomComponents(scopeId, {
      text: defineComponent({
        name: 'CustomTextNode',
        props: {
          node: { type: Object, required: true },
        },
        setup(props) {
          return () => h(
            'span',
            { class: 'custom-text-node' },
            String((props.node as any).content ?? (props.node as any).raw ?? ''),
          )
        },
      }),
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        content: [
          '| Name | Value |',
          '| --- | --- |',
          '| Vue | Fast path |',
        ].join('\n'),
        customId: scopeId,
        final: true,
        batchRendering: false,
      },
    })

    await flushAll()

    expect(wrapper.findAll('.custom-text-node').map(node => node.text())).toContain('Fast path')
  })
})
