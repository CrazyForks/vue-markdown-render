/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import HtmlBlockNode from '../../components/HtmlBlockNode/HtmlBlockNode.vue'
import HtmlInlineNode from '../../components/HtmlInlineNode/HtmlInlineNode.vue'
import { setCustomComponents } from '../../utils/nodeComponents'

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
})
