/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import HtmlBlockNode from '../../components/HtmlBlockNode/HtmlBlockNode.vue'
import HtmlInlineNode from '../../components/HtmlInlineNode/HtmlInlineNode.vue'
import MarkdownRender from '../../components/NodeRenderer'
import { setCustomComponents } from '../../utils/nodeComponents'
import { flushAll } from '../../../test/setup/flush-all'

// Mock custom components
const TestComponent = defineComponent({
  name: 'TestComponent',
  props: ['dataType', 'active'],
  setup(props, { slots }) {
    return () => h(
      'div',
      {
        'class': 'test-component',
        'data-type': props.dataType,
        'data-active': props.active,
      },
      slots.default?.() || 'Test Component',
    )
  },
})

const NestedComponent = defineComponent({
  name: 'NestedComponent',
  setup(_, { slots }) {
    return () => h('div', { class: 'nested-component' }, slots.default?.())
  },
})

describe('htmlBlockNode - Custom Components Integration', () => {
  const testId = 'test-html-block'

  beforeEach(() => {
    setCustomComponents(testId, {
      testcomp: TestComponent,
      nestedcomp: NestedComponent,
    })
  })

  it('should render custom component in HTML block', () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<testcomp data-type="block">Content</testcomp>',
          loading: false,
        },
        customId: testId,
      },
    })

    expect(wrapper.find('.test-component').exists()).toBe(true)
    expect(wrapper.find('.test-component').attributes('data-type')).toBe('block')
    expect(wrapper.html()).toContain('Content')
  })

  it('should render nested custom components', () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<testcomp data-type="outer">Outer <nestedcomp>Nested</nestedcomp> End</testcomp>',
          loading: false,
        },
        customId: testId,
      },
    })

    expect(wrapper.find('.test-component').exists()).toBe(true)
    expect(wrapper.find('.nested-component').exists()).toBe(true)
    expect(wrapper.html()).toContain('Outer')
    expect(wrapper.html()).toContain('Nested')
    expect(wrapper.html()).toContain('End')
  })

  it('should render deeply nested custom components', () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: `
            <testcomp data-type="level1">
              Level 1
              <nestedcomp>
                Level 2
                <testcomp data-type="level3">Level 3</testcomp>
              </nestedcomp>
            </testcomp>
          `,
          loading: false,
        },
        customId: testId,
      },
    })

    expect(wrapper.find('.test-component').exists()).toBe(true)
    expect(wrapper.findAll('.test-component').length).toBeGreaterThan(0)
    expect(wrapper.findAll('.nested-component').length).toBeGreaterThan(0)
  })

  it('should render mixed standard HTML and custom components', () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<div class="standard"><testcomp data-type="mixed">Component</testcomp><p>Paragraph</p></div>',
          loading: false,
        },
        customId: testId,
      },
    })

    expect(wrapper.find('.standard').exists()).toBe(true)
    expect(wrapper.find('.test-component').exists()).toBe(true)
    expect(wrapper.find('p').exists()).toBe(true)
  })

  it('should use v-html when no custom components are present', () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<div class="standard">Pure HTML</div>',
          loading: false,
        },
        customId: testId,
      },
    })

    expect(wrapper.find('.standard').exists()).toBe(true)
    expect(wrapper.html()).toContain('Pure HTML')
  })

  it('should pass props correctly to custom components', () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<testcomp data-type="test" active="true">With Props</testcomp>',
          loading: false,
        },
        customId: testId,
      },
    })

    const comp = wrapper.find('.test-component')
    expect(comp.attributes('data-type')).toBe('test')
    expect(comp.attributes('data-active')).toBe('true')
  })

  it('should sanitize dangerous attributes', () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<testcomp onclick="alert(1)" data-type="safe">Content</testcomp>',
          loading: false,
        },
        customId: testId,
      },
    })

    const comp = wrapper.find('.test-component')
    expect(comp.attributes('onclick')).toBeUndefined()
    expect(comp.attributes('data-type')).toBe('safe')
  })

  it('should handle the playground test scenario', () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: `
            <testcomp data-type="block-level" style="display: block;">
              <nestedcomp>
                This is nested
              </nestedcomp>
            </testcomp>
          `,
          loading: false,
        },
        customId: testId,
      },
    })

    expect(wrapper.find('.test-component').exists()).toBe(true)
    expect(wrapper.find('.nested-component').exists()).toBe(true)
    expect(wrapper.html()).toContain('This is nested')
  })

  it('should render placeholder when loading is true and not deferred', async () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<testcomp>Content</testcomp>',
          loading: true,
        },
        customId: testId,
      },
    })

    // Should show placeholder initially
    expect(wrapper.find('.html-block-node__placeholder').exists()).toBe(true)
  })
})

describe('htmlInlineNode - Custom Components Integration', () => {
  const testId = 'test-html-inline'

  beforeEach(() => {
    setCustomComponents(testId, {
      testcomp: TestComponent,
      nestedcomp: NestedComponent,
    })
  })

  it('should render custom component inline', () => {
    const wrapper = mount(HtmlInlineNode, {
      props: {
        node: {
          type: 'html_inline',
          content: '<testcomp data-type="inline">Content</testcomp>',
          loading: false,
        },
        customId: testId,
      },
    })

    expect(wrapper.find('.test-component').exists()).toBe(true)
    expect(wrapper.html()).toContain('Content')
  })

  it('should render nested custom components inline', () => {
    const wrapper = mount(HtmlInlineNode, {
      props: {
        node: {
          type: 'html_inline',
          content: 'Text <testcomp data-type="outer"><nestedcomp>Nested</nestedcomp></testcomp> more',
          loading: false,
        },
        customId: testId,
      },
    })

    expect(wrapper.find('.test-component').exists()).toBe(true)
    expect(wrapper.find('.nested-component').exists()).toBe(true)
    expect(wrapper.html()).toContain('Text')
    expect(wrapper.html()).toContain('more')
  })

  it('should use DOM rendering for pure HTML', async () => {
    const wrapper = mount(HtmlInlineNode, {
      props: {
        node: {
          type: 'html_inline',
          content: '<span class="standard">Pure HTML</span>',
          loading: false,
        },
        customId: testId,
      },
    })

    await nextTick()
    expect(wrapper.find('.html-inline-node').exists()).toBe(true)
    expect(wrapper.find('.standard').exists()).toBe(true)
    expect(wrapper.find('.standard').text()).toBe('Pure HTML')
  })

  it('should handle mixed inline content', () => {
    const wrapper = mount(HtmlInlineNode, {
      props: {
        node: {
          type: 'html_inline',
          content: 'Before <testcomp data-type="test">Component</testcomp> After',
          loading: false,
        },
        customId: testId,
      },
    })

    expect(wrapper.find('.test-component').exists()).toBe(true)
    expect(wrapper.html()).toContain('Before')
    expect(wrapper.html()).toContain('After')
  })
})

describe('component Behavior', () => {
  const testId = 'test-behavior'

  beforeEach(() => {
    setCustomComponents(testId, {
      testcomp: TestComponent,
    })
  })

  it('should update when content changes', async () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<div>Old</div>',
          loading: false,
        },
        customId: testId,
      },
    })

    expect(wrapper.html()).toContain('Old')

    await wrapper.setProps({
      node: {
        content: '<testcomp data-type="new">New</testcomp>',
        loading: false,
      },
    })

    await nextTick()
    expect(wrapper.html()).toContain('New')
  })

  it('should react to custom component registration after mount (inline)', async () => {
    const dynamicId = 'test-dynamic-registration-inline'

    const wrapper = mount(HtmlInlineNode, {
      props: {
        node: {
          type: 'html_inline',
          content: '<testcomp data-type="dynamic">Content</testcomp>',
          loading: false,
        },
        customId: dynamicId,
      },
    })

    await nextTick()
    expect(wrapper.find('.test-component').exists()).toBe(false)

    setCustomComponents(dynamicId, { testcomp: TestComponent })
    await nextTick()
    expect(wrapper.find('.test-component').exists()).toBe(true)
  })

  it('should handle empty content', () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '',
          loading: false,
        },
        customId: testId,
      },
    })

    // Empty content should render empty container
    expect(wrapper.find('.html-block-node').exists()).toBe(true)
  })

  it('should handle content with only whitespace', () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '   \n\t   ',
          loading: false,
        },
        customId: testId,
      },
    })

    // Whitespace-only content should still render container
    expect(wrapper.find('.html-block-node').exists()).toBe(true)
  })

  it('renders markdown children inside structured html blocks without duplicating leaked nodes', async () => {
    const markdown = `<span style="font-size: 12px;">

🗺️【环境状态】
- 地点：石溪村，李东的茅屋
- 时间：4/12 周四 上午07:00

🎯【选项】
1. 去田里劳作，争取多收成些粮食卖钱
2. 上山检查之前设置的陷阱，看有没有捕到猎
</span>`

    const wrapper = mount(MarkdownRender, {
      props: {
        content: markdown,
        batchRendering: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()
    await nextTick()

    const htmlBlock = wrapper.find('.html-block-node')
    expect(htmlBlock.exists()).toBe(true)
    expect(htmlBlock.element.tagName).toBe('SPAN')
    expect(htmlBlock.attributes('style')).toContain('font-size: 12px;')
    expect(wrapper.findAll('ul')).toHaveLength(1)
    expect(wrapper.findAll('ol')).toHaveLength(1)

    const text = wrapper.text()
    expect(text.match(/地点：石溪村，李东的茅屋/g)?.length ?? 0).toBe(1)
    expect(text.match(/去田里劳作，争取多收成些粮食卖钱/g)?.length ?? 0).toBe(1)
  })

  it('does not treat blocked html tags as structured wrapper nodes', async () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          tag: 'script',
          content: `<script>

- alpha

</script>`,
          children: [
            {
              type: 'list',
              raw: '',
              ordered: false,
              items: [
                {
                  type: 'list_item',
                  raw: '',
                  children: [
                    {
                      type: 'paragraph',
                      raw: '',
                      children: [{ type: 'text', raw: '', content: 'alpha' }],
                    },
                  ],
                },
              ],
            },
          ],
          loading: false,
        },
        customId: testId,
      },
    })

    await nextTick()
    expect(wrapper.findAll('ul')).toHaveLength(0)
    expect(wrapper.findAll('li')).toHaveLength(0)
  })
})
