import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import MermaidBlockNode from '../src/components/MermaidBlockNode'
import NodeRenderer from '../src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents } from '../src/utils/nodeComponents'
import { flushAll } from './setup/flush-all'

const customId = 'vue3-heavy-props-test'

const ExactLanguageProbe = defineComponent({
  name: 'ExactLanguageProbe',
  props: {
    node: { type: Object, required: true },
    showHeader: Boolean,
    stream: Boolean,
  },
  setup(props) {
    return () => h('div', {
      'class': 'exact-language-probe',
      'data-language': String((props.node as any)?.language ?? ''),
      'data-show-header': String(props.showHeader),
      'data-stream': String(props.stream),
    })
  },
})

const GenericCodeBlockProbe = defineComponent({
  name: 'GenericCodeBlockProbe',
  props: {
    node: { type: Object, required: true },
    showHeader: Boolean,
  },
  setup(props) {
    return () => h('div', {
      'class': 'generic-code-block-probe',
      'data-language': String((props.node as any)?.language ?? ''),
      'data-show-header': String(props.showHeader),
    })
  },
})

const CustomD2Probe = defineComponent({
  name: 'CustomD2Probe',
  props: {
    node: { type: Object, required: true },
    themeId: Number,
  },
  setup(props) {
    return () => h('div', {
      'class': 'custom-d2-probe',
      'data-language': String((props.node as any)?.language ?? ''),
      'data-theme-id': String(props.themeId),
    })
  },
})

const CustomD2LangProbe = defineComponent({
  name: 'CustomD2LangProbe',
  props: {
    node: { type: Object, required: true },
    themeId: Number,
  },
  setup(props) {
    return () => h('div', {
      'class': 'custom-d2lang-probe',
      'data-language': String((props.node as any)?.language ?? ''),
      'data-theme-id': String(props.themeId),
    })
  },
})

afterEach(() => {
  removeCustomComponents(customId)
})

describe('nodeRenderer heavy-node prop forwarding', () => {
  it('prefers exact language overrides over code_block fallback for custom languages', async () => {
    setCustomComponents(customId, {
      echarts: ExactLanguageProbe,
      code_block: GenericCodeBlockProbe,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        codeBlockStream: false,
        codeBlockProps: {
          showHeader: false,
        },
        nodes: [
          {
            type: 'code_block',
            language: 'echarts',
            code: 'option = {}',
            raw: '```echarts\noption = {}\n```',
          },
          {
            type: 'code_block',
            language: 'ts',
            code: 'export const value = 1',
            raw: '```ts\nexport const value = 1\n```',
          },
        ],
      },
    })

    await flushAll()

    const exact = wrapper.get('.exact-language-probe')
    const generic = wrapper.get('.generic-code-block-probe')
    expect(exact.attributes('data-language')).toBe('echarts')
    expect(exact.attributes('data-show-header')).toBe('false')
    expect(exact.attributes('data-stream')).toBe('false')
    expect(generic.attributes('data-language')).toBe('ts')
    expect(generic.attributes('data-show-header')).toBe('false')
  })

  it('lets d2lang exact overrides beat d2 fallback while keeping d2 props', async () => {
    setCustomComponents(customId, {
      d2: CustomD2Probe,
      d2lang: CustomD2LangProbe,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        d2Props: {
          themeId: 7,
        },
        nodes: [
          {
            type: 'code_block',
            language: 'd2lang',
            code: 'a -> b',
            raw: '```d2lang\na -> b\n```',
          },
        ],
      },
    })

    await flushAll()

    expect(wrapper.find('.custom-d2-probe').exists()).toBe(false)
    const exact = wrapper.get('.custom-d2lang-probe')
    expect(exact.attributes('data-language')).toBe('d2lang')
    expect(exact.attributes('data-theme-id')).toBe('7')
  })

  it('forwards mermaidProps to MermaidBlockNode', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [
          {
            type: 'code_block',
            language: 'mermaid',
            code: 'graph LR\nA-->B\n',
            raw: '```mermaid\ngraph LR\nA-->B\n```',
          },
        ],
        mermaidProps: {
          showHeader: false,
          showZoomControls: false,
          renderDebounceMs: 180,
          previewPollDelayMs: 500,
        },
      },
    })

    await flushAll()

    const mermaid = wrapper.findComponent(MermaidBlockNode as any)
    expect(mermaid.exists()).toBe(true)
    expect(mermaid.props('showHeader')).toBe(false)
    expect(mermaid.props('showZoomControls')).toBe(false)
    expect(mermaid.props('renderDebounceMs')).toBe(180)
    expect(mermaid.props('previewPollDelayMs')).toBe(500)
  })
})
