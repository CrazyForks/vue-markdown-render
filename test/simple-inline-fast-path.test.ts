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

  function textNode(content: string) {
    return {
      type: 'text',
      raw: content,
      content,
    }
  }

  function paragraphNode(content: string) {
    return {
      type: 'paragraph',
      raw: content,
      children: [textNode(content)],
    }
  }

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

  it('uses a lightweight plain text node for simple list item paragraphs when fade is disabled', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: '- Fast path list item',
        final: true,
        batchRendering: false,
        fade: false,
      },
    })

    await flushAll()

    const item = wrapper.get('li.list-item')
    expect(item.find('.markdown-renderer').exists()).toBe(false)

    const paragraph = item.get('p.paragraph-node')
    expect(paragraph.text()).toBe('Fast path list item')
    expect(paragraph.get('.text-node').text()).toBe('Fast path list item')
    expect(paragraph.find('.text-node-stream-delta').exists()).toBe(false)
  })

  it('renders simple nested list parents without wrapping the item in a nested renderer', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: '- Parent **bold**\n  - Child `code`',
        final: true,
        batchRendering: false,
        showTooltips: false,
      },
    })

    await flushAll()

    const item = wrapper.get('li.list-item')
    expect(item.find('.markdown-renderer').exists()).toBe(false)
    expect(item.get('p.paragraph-node').text()).toBe('Parent bold')
    expect(item.get('strong.strong-node').text()).toBe('bold')
    expect(item.get('ul.list-node').text()).toContain('Child code')
    expect(item.get('code.inline-code').text()).toBe('code')
  })

  it('keeps the list item block wrapper when inline children become a paragraph', async () => {
    const createList = (children: any[]) => ({
      type: 'list',
      ordered: false,
      raw: '',
      items: [
        {
          type: 'list_item',
          raw: '',
          children,
        },
      ],
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createList([textNode('Direct item')])],
        batchRendering: false,
        fade: false,
      },
    })

    await flushAll()

    const paragraph = wrapper.get('li.list-item > p.paragraph-node')
    const paragraphElement = paragraph.element
    expect(paragraph.text()).toBe('Direct item')

    await wrapper.setProps({
      nodes: [createList([paragraphNode('Paragraph item')])],
    })
    await flushAll()

    const nextParagraph = wrapper.get('li.list-item > p.paragraph-node')
    expect(nextParagraph.element).toBe(paragraphElement)
    expect(nextParagraph.text()).toBe('Paragraph item')
  })

  it('uses a lightweight plain text node for top-level paragraphs when fade is disabled', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: 'Fast path paragraph',
        final: true,
        batchRendering: false,
        fade: false,
      },
    })

    await flushAll()

    const paragraph = wrapper.get('p.paragraph-node')
    expect(paragraph.text()).toBe('Fast path paragraph')
    expect(paragraph.get('.text-node').text()).toBe('Fast path paragraph')
    expect(paragraph.find('.text-node-stream-delta').exists()).toBe(false)
  })

  it('renders inline code without stream span wrappers when fade is disabled', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: '`code`',
        final: true,
        batchRendering: false,
        fade: false,
      },
    })

    await flushAll()

    const code = wrapper.get('code.inline-code')
    expect(code.text()).toBe('code')
    expect(code.element.childElementCount).toBe(0)
    expect(code.find('.inline-code-stream-delta').exists()).toBe(false)
  })

  it('does not bypass a custom text component for top-level paragraphs', async () => {
    const scopeId = 'simple-inline-paragraph-text-override'

    setCustomComponents(scopeId, {
      text: defineComponent({
        name: 'CustomParagraphTextNode',
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
        content: 'Custom paragraph text',
        customId: scopeId,
        final: true,
        batchRendering: false,
        fade: false,
      },
    })

    await flushAll()

    expect(wrapper.get('.custom-text-node').text()).toBe('Custom paragraph text')
    expect(wrapper.find('.text-node').exists()).toBe(false)
  })

  it('uses a lightweight plain text node for headings when fade is disabled', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: '# Fast heading',
        final: true,
        batchRendering: false,
        fade: false,
      },
    })

    await flushAll()

    const heading = wrapper.get('h1.heading-node')
    expect(heading.text()).toBe('Fast heading')
    expect(heading.get('.text-node').text()).toBe('Fast heading')
    expect(heading.find('.text-node-stream-delta').exists()).toBe(false)
  })

  it('keeps heading inline rendering when heading is not plain text', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: '# Fast **heading**',
        final: true,
        batchRendering: false,
        fade: false,
      },
    })

    await flushAll()

    const heading = wrapper.get('h1.heading-node')
    expect(heading.get('strong.strong-node').text()).toBe('heading')
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
    const columns = table.findAll('col')
    expect(columns).toHaveLength(2)
    expect(columns[0].attributes('style')).toContain('width: 50%')
    expect(columns[1].attributes('style')).toContain('width: 50%')
    expect(table.find('.markdown-renderer').exists()).toBe(false)
    expect(table.get('a[href="https://vuejs.org"]').attributes('title')).toBe('https://vuejs.org')
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

  it('keeps table cells on the simple path when inline children become a paragraph', async () => {
    const createCell = (children: any[], header = false) => ({
      type: 'table_cell',
      header,
      raw: '',
      children,
    })
    const createTable = (valueChildren: any[]) => ({
      type: 'table',
      raw: '',
      loading: false,
      header: {
        type: 'table_row',
        raw: '',
        cells: [createCell([textNode('Name')], true)],
      },
      rows: [
        {
          type: 'table_row',
          raw: '',
          cells: [createCell(valueChildren)],
        },
      ],
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createTable([textNode('Direct cell')])],
        batchRendering: false,
        fade: false,
      },
    })

    await flushAll()

    const valueCell = wrapper.get('tbody td')
    const valueCellElement = valueCell.element
    const textElement = valueCell.get('.text-node').element
    expect(valueCell.find('.markdown-renderer').exists()).toBe(false)
    expect(valueCell.text()).toBe('Direct cell')

    await wrapper.setProps({
      nodes: [createTable([paragraphNode('Paragraph cell')])],
    })
    await flushAll()

    const nextValueCell = wrapper.get('tbody td')
    expect(nextValueCell.element).toBe(valueCellElement)
    expect(nextValueCell.find('.markdown-renderer').exists()).toBe(false)
    expect(nextValueCell.get('.text-node').element).toBe(textElement)
    expect(nextValueCell.text()).toBe('Paragraph cell')
  })

  it('renders simple blockquote paragraphs without nested renderer wrappers', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: '> Final note with **bold** and `code`',
        final: true,
        batchRendering: false,
        showTooltips: false,
      },
    })

    await flushAll()

    const quote = wrapper.get('blockquote.blockquote-node')
    expect(quote.find('.markdown-renderer').exists()).toBe(false)
    expect(quote.get('p.paragraph-node').text()).toContain('Final note with bold and code')
    expect(quote.get('strong.strong-node').text()).toBe('bold')
    expect(quote.get('code.inline-code').text()).toBe('code')
  })

  it('keeps the blockquote block wrapper when inline children become a paragraph', async () => {
    const createBlockquote = (children: any[]) => ({
      type: 'blockquote',
      raw: '',
      children,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createBlockquote([textNode('Direct quote')])],
        batchRendering: false,
        fade: false,
      },
    })

    await flushAll()

    const paragraph = wrapper.get('blockquote.blockquote-node > p.paragraph-node')
    const paragraphElement = paragraph.element
    expect(paragraph.text()).toBe('Direct quote')

    await wrapper.setProps({
      nodes: [createBlockquote([paragraphNode('Paragraph quote')])],
    })
    await flushAll()

    const nextParagraph = wrapper.get('blockquote.blockquote-node > p.paragraph-node')
    expect(nextParagraph.element).toBe(paragraphElement)
    expect(nextParagraph.text()).toBe('Paragraph quote')
  })

  it('uses a lightweight plain text node for simple blockquotes when fade is disabled', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: '> Lightweight final note',
        final: true,
        batchRendering: false,
        fade: false,
      },
    })

    await flushAll()

    const quote = wrapper.get('blockquote.blockquote-node')
    expect(quote.find('.markdown-renderer').exists()).toBe(false)

    const paragraph = quote.get('p.paragraph-node')
    expect(paragraph.text()).toBe('Lightweight final note')
    expect(paragraph.get('.text-node').text()).toBe('Lightweight final note')
    expect(paragraph.find('.text-node-stream-delta').exists()).toBe(false)
  })

  it('passes tooltip visibility through blockquote fast paths', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: '> Read [Docs](https://vuejs.org)',
        final: true,
        batchRendering: false,
        showTooltips: false,
      },
    })

    await flushAll()

    expect(wrapper.get('blockquote a[href="https://vuejs.org"]').attributes('title')).toBe('https://vuejs.org')
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

  it('keeps nested blockquote rendering when paragraph has a custom component', async () => {
    const scopeId = 'simple-inline-blockquote-paragraph-override'

    setCustomComponents(scopeId, {
      paragraph: defineComponent({
        name: 'CustomBlockquoteParagraphNode',
        props: {
          node: { type: Object, required: true },
        },
        setup(props) {
          return () => h(
            'p',
            { class: 'custom-blockquote-paragraph-node' },
            String((props.node as any).raw ?? ''),
          )
        },
      }),
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '> overridden quote',
        customId: scopeId,
        final: true,
        batchRendering: false,
      },
    })

    await flushAll()

    const quote = wrapper.get('blockquote.blockquote-node')
    expect(quote.get('.markdown-renderer').exists()).toBe(true)
    expect(quote.get('.custom-blockquote-paragraph-node').text()).toBe('overridden quote')
  })
})
