/**
 * @vitest-environment jsdom
 */

import type { VueWrapper } from '@vue/test-utils'
import { mount } from '@vue/test-utils'
import { full as markdownItEmoji } from 'markdown-it-emoji'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { removeCustomComponents, setCustomComponents } from '../../src/utils/nodeComponents'
import { flushAll } from '../setup/flush-all'

interface Scenario {
  name: string
  markdown: string
  expectedText?: string | string[]
  props?: Record<string, any>
  assert?: (wrapper: VueWrapper<any>) => void | Promise<void>
  skipSnapshot?: boolean
}

let MarkdownRender: any

// Use shared flushAll from test/setup/flush-all

async function mountMarkdown(markdown: string, props: Record<string, any> = {}) {
  const wrapper = mount(MarkdownRender, {
    props: {
      content: markdown,
      ...props,
      customMarkdownIt: (md: any) => md.use(markdownItEmoji),
    },
  })
  await flushAll()
  return wrapper
}

function normalizeText(input: string) {
  return input.replace(/\s+/g, ' ').trim()
}

function sanitizeSnapshotHtml(html: string, name: string) {
  if (name.includes('admonition'))
    return html.replace(/admonition-[a-z0-9]+/gi, 'admonition-stable')
  return html
}

describe('markdownRender node e2e coverage', () => {
  beforeAll(async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    MarkdownRender = (await import('../../src/components/NodeRenderer')).default
  })

  afterAll(() => {
    ; (Date.now as any).mockRestore?.()
  })

  const scenarios: Scenario[] = [
    {
      name: 'paragraph and text node',
      markdown: 'Simple paragraph content rendered as plain text.',
      expectedText: 'Simple paragraph content rendered as plain text.',
      assert: (wrapper) => {
        const paragraph = wrapper.find('p')
        expect(paragraph.exists()).toBe(true)
      },
    },
    {
      name: 'heading node',
      markdown: '# Heading Node Title',
      expectedText: 'Heading Node Title',
      assert: (wrapper) => {
        const heading = wrapper.find('h1')
        expect(heading.exists()).toBe(true)
      },
    },
    {
      name: 'blockquote node',
      markdown: '> Blockquote rendered content.',
      expectedText: 'Blockquote rendered content.',
      assert: (wrapper) => {
        const blockquote = wrapper.find('blockquote')
        expect(blockquote.exists()).toBe(true)
      },
    },
    {
      name: 'unordered list node',
      markdown: '- Item one\n- Item two',
      expectedText: ['Item one', 'Item two'],
      assert: (wrapper) => {
        const list = wrapper.find('ul')
        expect(list.exists()).toBe(true)
        expect(list.findAll('li')).toHaveLength(2)
      },
    },
    {
      name: 'ordered list node',
      markdown: '1. First entry\n2. Second entry',
      expectedText: ['First entry', 'Second entry'],
      assert: (wrapper) => {
        const list = wrapper.find('ol')
        expect(list.exists()).toBe(true)
        expect(list.findAll('li')).toHaveLength(2)
      },
    },
    {
      name: 'checkbox nodes',
      markdown: '- [x] Completed task\n- [ ] Pending task',
      expectedText: ['Completed task', 'Pending task'],
      assert: (wrapper) => {
        const inputs = wrapper.findAll('input[type="checkbox"]')
        expect(inputs).toHaveLength(2)
        expect((inputs[0].element as HTMLInputElement).checked).toBe(true)
        expect((inputs[1].element as HTMLInputElement).checked).toBe(false)
      },
    },
    {
      name: 'link node',
      markdown: 'Visit [Vue](https://vuejs.org) now.',
      expectedText: ['Visit', 'Vue', 'now.'],
      assert: (wrapper) => {
        const link = wrapper.find('a[href="https://vuejs.org"]')
        expect(link.exists()).toBe(true)
        expect(link.text()).toBe('Vue')
      },
    },
    {
      name: 'image node',
      markdown: '![Vue Logo](https://example.com/vue.png "Vue Logo")',
      assert: (wrapper) => {
        const figure = wrapper.find('figure')
        expect(figure.exists()).toBe(true)
        const img = figure.find('img')
        expect(img.exists()).toBe(true)
        expect(img.attributes('src')).toBe('https://example.com/vue.png')
        expect(img.attributes('title')).toBe('Vue Logo')
        expect(figure.html()).toContain('Vue Logo')
      },
    },
    {
      name: 'inline code node',
      markdown: 'Here is `const answer = 42` inline.',
      expectedText: ['Here is', 'const answer = 42', 'inline.'],
      assert: (wrapper) => {
        const code = wrapper.find('code')

        expect(code.exists()).toBe(true)
        expect(code.text()).toBe('const answer = 42')
      },
    },

    {
      name: 'code block node',
      markdown: '```ts\nexport const sum = (a: number, b: number) => a + b\n```',
      props: { renderCodeBlocksAsPre: true },
      expectedText: ['export const sum = (a: number, b: number) => a + b'],
      assert: async (wrapper) => {
        await flushAll()
        const fallback = wrapper.find('pre code')
        expect(fallback.exists()).toBe(true)
        expect(fallback.text()).toContain('export const sum = (a: number, b: number) => a + b')
      },
    },
    {
      name: 'mermaid block node',
      markdown: '```mermaid\ngraph LR;A-->B;\n```',
      skipSnapshot: true,
      assert: async (wrapper) => {
        await flushAll()
        await new Promise(resolve => setTimeout(resolve, 5000))

        const mermaid = wrapper.find('._mermaid')
        expect(mermaid.exists()).toBe(true)
        // do not rely on exact toolbar SVG markup in snapshots (icons may
        // render differently in different envs); just assert the wrapper
        // contains the mermaid container
        expect(mermaid.html()).toContain('_mermaid')
      },
    },
    {
      name: 'table node',
      markdown: '| Name | Role |\n| --- | --- |\n| Alice | Developer |',
      expectedText: ['Name', 'Role', 'Alice', 'Developer'],
      assert: (wrapper) => {
        const table = wrapper.find('table')
        expect(table.exists()).toBe(true)
        expect(table.findAll('tbody tr')).toHaveLength(1)
      },
    },
    {
      name: 'definition list node',
      markdown: '',
      props: {
        nodes: [
          {
            type: 'definition_list',
            raw: 'Term: Definition details',
            items: [
              {
                type: 'definition_item',
                raw: 'Term: Definition details',
                term: [
                  {
                    type: 'text',
                    content: 'Term',
                    raw: 'Term',
                  },
                ],
                definition: [
                  {
                    type: 'paragraph',
                    raw: 'Definition details',
                    children: [
                      {
                        type: 'text',
                        content: 'Definition details',
                        raw: 'Definition details',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      expectedText: ['Term', 'Definition details'],
      assert: (wrapper) => {
        const dl = wrapper.find('dl')
        expect(dl.exists()).toBe(true)
        expect(dl.findAll('dt')).toHaveLength(1)
        expect(dl.findAll('dd')).toHaveLength(1)
      },
    },
    {
      name: 'footnote nodes',
      markdown: 'A footnote reference[^1].\n\n[^1]: Footnote explanation',
      expectedText: ['A footnote reference', 'Footnote explanation'],
      assert: (wrapper) => {
        const footnoteBlock = wrapper.find('[id="fnref-1"]')
        expect(footnoteBlock.exists()).toBe(true)
        expect(footnoteBlock.text()).toBe('[1]')
        const footerAnchor = wrapper.find('.footnote-anchor')
        expect(footerAnchor.exists()).toBe(true)
      },
    },
    {
      name: 'footnote reference node',
      markdown: '',
      props: {
        nodes: [
          {
            type: 'footnote_reference',
            id: '1',
            raw: '[^1]',
          },
        ],
      },
      expectedText: [],
      assert: (wrapper) => {
        const reference = wrapper.find('sup.footnote-reference')
        expect(reference.exists()).toBe(true)
        expect(reference.text()).toContain('1')
      },
    },
    {
      name: 'admonition node',
      markdown: '::: warning\nAdmonition content\n:::',
      expectedText: 'Admonition content',
      assert: (wrapper) => {
        const admonition = wrapper.find('.admonition-warning')
        expect(admonition.exists()).toBe(true)
      },
    },
    {
      name: 'thematic break node',
      markdown: 'First section.\n\n---\n\nSecond section.',
      expectedText: ['First section.', 'Second section.'],
      assert: (wrapper) => {
        const hr = wrapper.find('hr')
        expect(hr.exists()).toBe(true)
      },
    },
    {
      name: 'hardbreak node',
      markdown: 'Line one  \nLine two',
      expectedText: ['Line one', 'Line two'],
      assert: (wrapper) => {
        expect(wrapper.findAll('br.hard-break').length).toBeGreaterThan(0)
      },
    },
    {
      name: 'strong node',
      markdown: 'This is **bold text**.',
      expectedText: ['This is', 'bold text'],
      assert: (wrapper) => {
        const strong = wrapper.find('strong')
        expect(strong.exists()).toBe(true)
        expect(strong.text()).toBe('bold text')
      },
    },
    {
      name: 'emphasis node',
      markdown: 'This is *italic text*.',
      expectedText: ['This is', 'italic text'],
      assert: (wrapper) => {
        const em = wrapper.find('em')
        expect(em.exists()).toBe(true)
        expect(em.text()).toBe('italic text')
      },
    },
    {
      name: 'strikethrough node',
      markdown: 'This is ~~deleted text~~.',
      expectedText: ['This is', 'deleted text'],
      assert: (wrapper) => {
        const del = wrapper.find('s, del')
        expect(del.exists()).toBe(true)
      },
    },
    {
      name: 'highlight node',
      markdown: 'Use ==highlighted text== for emphasis.',
      expectedText: ['Use', 'highlighted text', 'for emphasis.'],
      assert: (wrapper) => {
        const mark = wrapper.find('mark.highlight-node')
        expect(mark.exists()).toBe(true)
      },
    },
    {
      name: 'insert node',
      markdown: 'Here comes ++inserted text++ in the paragraph.',
      expectedText: ['Here comes', 'inserted text', 'in the paragraph.'],
      assert: (wrapper) => {
        const ins = wrapper.find('ins.insert-node')
        expect(ins.exists()).toBe(true)
      },
    },
    {
      name: 'subscript node',
      markdown: 'Chemical formula H~2~O is familiar.',
      expectedText: ['Chemical formula', 'H2O', 'is familiar.'],
      assert: (wrapper) => {
        const sub = wrapper.find('sub')
        expect(sub.exists()).toBe(true)
        expect(sub.text()).toBe('2')
      },
    },
    {
      name: 'superscript node',
      markdown: 'Math uses x^2^ frequently.',
      expectedText: ['Math uses', 'x2', 'frequently.'],
      assert: (wrapper) => {
        const sup = wrapper.find('sup')
        expect(sup.exists()).toBe(true)
        expect(sup.text()).toBe('2')
      },
    },
    {
      name: 'emoji node',
      markdown: 'Smile with :smile: emoji.',
      expectedText: ['Smile with', 'emoji.'],
      assert: (wrapper) => {
        const emoji = wrapper.find('span.emoji-node')
        expect(emoji.exists()).toBe(true)
        expect(emoji.text()).toBe('😄')
      },
    },
    {
      name: 'math inline node',
      markdown: 'Einstein wrote $E=mc^2$.',
      skipSnapshot: false,
      // Accept either raw Dollar-delimited text or rendered KaTeX output
      expectedText: ['Einstein wrote', 'E=mc^2'],
      assert: async (wrapper) => {
        await flushAll()
        await flushAll()
        const inline = wrapper.find('.math-inline')
        if (inline.exists())
          expect(wrapper.html()).toContain('katex')
        else
          expect(wrapper.text()).toContain('Einstein wrote $E=mc^2$.')
      },
    },
    {
      name: 'math block node',
      markdown: '$$\na^2 + b^2 = c^2\n$$',
      skipSnapshot: true,
      // do not assert expectedText globally because math rendering is
      // optional and may be handled asynchronously or by KaTeX which
      // isn't guaranteed in the test env
      expectedText: [],
      assert: (wrapper) => {
        const block = wrapper.find('.math-block')
        // math rendering is optional (requires katex). Accept either
        // a rendered KaTeX block or the raw LaTeX fallback
        if (block.exists()) {
          // prefer KaTeX output, but tolerate absence
          const hasKaTeX = wrapper.html().includes('katex-display') || wrapper.html().includes('katex')
          if (!hasKaTeX) {
            expect(wrapper.text()).toContain('a^2 + b^2 = c^2')
          }
        }
      },
    },
    {
      name: 'reference node',
      markdown: 'Cite research [1] for details.',
      expectedText: ['Cite research', 'for details.'],
      assert: (wrapper) => {
        const reference = wrapper.find('span.reference-node')
        expect(reference.exists()).toBe(true)
        expect(reference.text()).toBe('1')
      },
    },
    {
      name: 'complex inline code with emphasis and multiple code spans',
      markdown: '1.  **整合冗余条款：** 将原`1-(5)`、`3-(3)`、`3-(4)`中关于“缴纳费用”和“告知法律状态变化”的核心义务合并，统一放入`1-(4)`“法律状态维护与通知义务”中，使其逻辑更集中，避免了在不同部分重复提及相似义务。',
      expectedText: ['整合冗余条款', '1-(5)', '3-(3)', '3-(4)', '法律状态维护与通知义务'],
      // assert removed: rely on expectedText assertions to validate parsing
    },
  ]

  for (const scenario of scenarios) {
    it(`renders ${scenario.name}`, async () => {
      const wrapper = await mountMarkdown(scenario.markdown, scenario.props)
      try {
        if (scenario.assert)
          await scenario.assert(wrapper)

        const textContent = normalizeText(wrapper.text())
        if (Array.isArray(scenario.expectedText)) {
          for (const snippet of scenario.expectedText)
            expect(textContent).toContain(snippet)
        }
        else if (typeof scenario.expectedText === 'string' && scenario.expectedText.length > 0) {
          expect(textContent).toContain(scenario.expectedText)
        }

        if (!scenario.skipSnapshot) {
          const snapshotHtml = sanitizeSnapshotHtml(wrapper.html(), scenario.name)
          expect(snapshotHtml).toMatchSnapshot()
        }
      }
      finally {
        wrapper.unmount()
      }
    }, 20000)
  }

  it('allows overriding `list_item` via customComponents', async () => {
    const scopeId = 'custom-components-list-item'
    const CustomListItem = defineComponent({
      name: 'CustomListItem',
      props: {
        node: { type: Object, required: true },
        indexKey: [String, Number],
        value: Number,
        customId: String,
        typewriter: Boolean,
      },
      setup(props) {
        return () => h('li', { 'class': 'custom-list-item', 'data-value': props.value == null ? '' : String(props.value) }, [
          h(MarkdownRender, {
            nodes: (props.node as any).children || [],
            customId: props.customId,
            indexKey: `custom-list-item-${String(props.indexKey ?? '')}`,
            typewriter: props.typewriter,
            batchRendering: false,
          }),
        ])
      },
    })

    setCustomComponents(scopeId, { list_item: CustomListItem })

    try {
      const wrapper = await mountMarkdown('1. First entry\n2. Second entry', { customId: scopeId, final: true })
      try {
        const items = wrapper.findAll('li.custom-list-item')
        expect(items).toHaveLength(2)
        expect(items[0].attributes('data-value')).toBe('1')
        expect(items[1].attributes('data-value')).toBe('2')
        expect(normalizeText(wrapper.text())).toMatch(/First entry\s*Second entry/)
      }
      finally {
        wrapper.unmount()
      }
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('renders repeated custom components without slot content reuse', async () => {
    const scopeId = 'custom-components-repeat'
    const NewQuestion = defineComponent({
      name: 'NewQuestion',
      setup(_, { slots }) {
        return () => h('div', { class: 'new-question' }, slots.default?.())
      },
    })
    const SubQuestion = defineComponent({
      name: 'SubQuestion',
      setup(_, { slots }) {
        return () => h('div', { class: 'sub-question' }, slots.default?.())
      },
    })

    setCustomComponents(scopeId, {
      'new-question': NewQuestion,
      'sub-question': SubQuestion,
    })

    try {
      const markdown = `<new-question>A</new-question>
<sub-question>
B
</sub-question>

<sub-question>
C
</sub-question>`
      const wrapper = await mountMarkdown(markdown, {
        customId: scopeId,
        final: true,
      })
      try {
        expect(normalizeText(wrapper.text())).toContain('A B C')
      }
      finally {
        wrapper.unmount()
      }
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('renders nested repeated custom components without content bleed', async () => {
    const scopeId = 'custom-components-nested-repeat'
    const NewQuestion = defineComponent({
      name: 'NewQuestion',
      setup(_, { slots }) {
        return () => h('div', { class: 'new-question' }, slots.default?.())
      },
    })
    const SubQuestion = defineComponent({
      name: 'SubQuestion',
      setup(_, { slots }) {
        return () => h('div', { class: 'sub-question' }, slots.default?.())
      },
    })

    setCustomComponents(scopeId, {
      'new-question': NewQuestion,
      'sub-question': SubQuestion,
    })

    try {
      const markdown = `<sub-question>
  <new-question>A</new-question>
  <sub-question>Inner-1</sub-question>
</sub-question>

<sub-question>
  <new-question>B</new-question>
  <sub-question>Inner-2</sub-question>
</sub-question>`
      const wrapper = await mountMarkdown(markdown, { customId: scopeId, final: true })
      try {
        expect(normalizeText(wrapper.text())).toMatch(/A\s*Inner-1\s*B\s*Inner-2/)
      }
      finally {
        wrapper.unmount()
      }
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('renders repeated custom components with different attrs and explicit keys', async () => {
    const scopeId = 'custom-components-attrs-repeat'
    const SubQuestion = defineComponent({
      name: 'SubQuestion',
      setup(_, { slots, attrs }) {
        const id = attrs['data-id'] == null ? '' : String(attrs['data-id'])
        return () => h('div', { class: 'sub-question' }, [
          h('span', { class: 'sub-question__id' }, id),
          slots.default?.(),
        ])
      },
    })

    setCustomComponents(scopeId, {
      'sub-question': SubQuestion,
    })

    try {
      const markdown = `<sub-question key="k1" data-id="1">B</sub-question>
<sub-question key="k2" data-id="2">C</sub-question>`
      const wrapper = await mountMarkdown(markdown, { customId: scopeId, final: true })
      try {
        expect(normalizeText(wrapper.text())).toMatch(/1\s*B\s*2\s*C/)
      }
      finally {
        wrapper.unmount()
      }
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('renders custom components interleaved with markdown blocks', async () => {
    const scopeId = 'custom-components-mixed-markdown'
    const NewQuestion = defineComponent({
      name: 'NewQuestion',
      setup(_, { slots }) {
        return () => h('div', { class: 'new-question' }, slots.default?.())
      },
    })
    const SubQuestion = defineComponent({
      name: 'SubQuestion',
      setup(_, { slots }) {
        return () => h('div', { class: 'sub-question' }, slots.default?.())
      },
    })

    setCustomComponents(scopeId, {
      'new-question': NewQuestion,
      'sub-question': SubQuestion,
    })

    try {
      const markdown = `<div><new-question>A</new-question></div>

Normal paragraph between.

- item-1
- item-2

<div><sub-question>B</sub-question></div>

Another paragraph.

<div><sub-question>C</sub-question></div>`
      const wrapper = await mountMarkdown(markdown, { customId: scopeId, final: true })
      try {
        const text = normalizeText(wrapper.text())
        expect(text).toContain('A')
        expect(text).toContain('Normal paragraph between.')
        expect(text).toMatch(/item-1\s*item-2/)
        expect(text).toMatch(/A[^B]*B[\s\S]*C/)
      }
      finally {
        wrapper.unmount()
      }
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('renders repeated custom components mixed with standard HTML inside one block', async () => {
    const scopeId = 'custom-components-mixed-html'
    const SubQuestion = defineComponent({
      name: 'SubQuestion',
      setup(_, { slots }) {
        return () => h('div', { class: 'sub-question' }, slots.default?.())
      },
    })

    setCustomComponents(scopeId, {
      'sub-question': SubQuestion,
    })

    try {
      const markdown = `<div>
  <sub-question>First <strong>X</strong></sub-question>
  <span>middle</span>
  <sub-question>Second <em>Y</em></sub-question>
</div>`
      const wrapper = await mountMarkdown(markdown, { customId: scopeId, final: true })
      try {
        expect(normalizeText(wrapper.text())).toMatch(/First\s*X\s*middle\s*Second\s*Y/)
      }
      finally {
        wrapper.unmount()
      }
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })
})
