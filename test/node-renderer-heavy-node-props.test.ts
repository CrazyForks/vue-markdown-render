import { mount } from '@vue/test-utils'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, inject } from 'vue'
import MermaidBlockNode from '../src/components/MermaidBlockNode'
import NodeRenderer from '../src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents } from '../src/utils/nodeComponents'
import { flushAll } from './setup/flush-all'

const markdownCodeBlockNodeMock = vi.hoisted(() => ({
  factory: async () => {
    const { defineComponent, h } = await import('vue')
    return {
      default: defineComponent({
        name: 'MarkdownCodeBlockNodeProbe',
        inheritAttrs: false,
        setup(_, { attrs }) {
          return () => h('div', {
            'class': 'code-block-container',
            'data-has-monaco-options': String(Object.prototype.hasOwnProperty.call(attrs, 'monacoOptions')),
            'data-langs': JSON.stringify(attrs.langs ?? null),
          })
        },
      }),
    }
  },
}))

vi.mock('../src/components/MarkdownCodeBlockNode', markdownCodeBlockNodeMock.factory)
vi.mock('../src/components/MarkdownCodeBlockNode/index.ts', markdownCodeBlockNodeMock.factory)
vi.mock('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue', markdownCodeBlockNodeMock.factory)

beforeAll(async () => {
  await Promise.all([
    import('../src/components/MarkdownCodeBlockNode'),
    import('../src/components/MarkdownCodeBlockNode/index.ts'),
    import('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue'),
  ])
})

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

const GenericCodeBlockAttrsProbe = defineComponent({
  name: 'GenericCodeBlockAttrsProbe',
  props: {
    node: { type: Object, required: true },
    showHeader: Boolean,
    showLineNumbers: Boolean,
  },
  setup(props, { attrs }) {
    return () => h('div', {
      'class': 'generic-code-block-attrs-probe',
      'data-language': String((props.node as any)?.language ?? ''),
      'data-show-header': String(props.showHeader),
      'data-show-line-numbers': String(props.showLineNumbers),
      'data-has-stream': String(Object.prototype.hasOwnProperty.call(attrs, 'stream')),
      'data-has-monaco-options': String(Object.prototype.hasOwnProperty.call(attrs, 'monacoOptions')),
      'data-monaco-options': JSON.stringify(attrs.monacoOptions ?? null),
      'data-has-themes': String(Object.prototype.hasOwnProperty.call(attrs, 'themes')),
      'data-langs': JSON.stringify(attrs.langs ?? null),
    })
  },
})

const ReservedCodeBlockPropsProbe = defineComponent({
  name: 'ReservedCodeBlockPropsProbe',
  props: {
    node: { type: Object, required: true },
    indexKey: { type: [String, Number], required: true },
    showHeader: { type: Boolean, default: true },
  },
  setup(props) {
    return () => h('div', {
      'class': 'reserved-code-block-props-probe',
      'data-language': String((props.node as any)?.language ?? ''),
      'data-index-key': String(props.indexKey),
      'data-show-header': String(props.showHeader),
    })
  },
})

const FadeProbe = defineComponent({
  name: 'FadeProbe',
  setup() {
    const fade = inject<{ value?: boolean } | undefined>('markstreamFade', undefined)

    return () => h('div', {
      'class': 'fade-probe',
      'data-fade': String(fade?.value),
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

const EstimatedPreviewProbe = defineComponent({
  name: 'EstimatedPreviewProbe',
  props: {
    node: { type: Object, required: true },
    estimatedPreviewHeightPx: Number,
  },
  setup(props) {
    return () => h('div', {
      'class': 'estimated-preview-probe',
      'data-language': String((props.node as any)?.language ?? ''),
      'data-estimated-preview-height': String(props.estimatedPreviewHeightPx ?? ''),
    })
  },
})

const AnswerBox = defineComponent({
  name: 'AnswerBox',
  setup(_, { slots }) {
    return () => h('section', { class: 'answer-box' }, slots.default?.())
  },
})

const Mention = defineComponent({
  name: 'Mention',
  setup(_, { slots }) {
    return () => h('span', { class: 'mention' }, slots.default?.())
  },
})

const InlinePropsProbe = defineComponent({
  name: 'InlinePropsProbe',
  props: {
    node: { type: Object, required: true },
    loading: Boolean,
    isDark: Boolean,
  },
  setup(props, { slots }) {
    return () => h('span', {
      'class': 'inline-props-probe',
      'data-type': String((props.node as any)?.type ?? ''),
      'data-loading': String(props.loading),
      'data-is-dark': String(props.isDark),
    }, slots.default?.())
  },
})

const CopyEmitterProbe = defineComponent({
  name: 'CopyEmitterProbe',
  props: {
    node: { type: Object, required: true },
  },
  emits: ['copy'],
  setup(props, { emit }) {
    return () => h('button', {
      class: 'copy-emitter-probe',
      onClick: () => emit('copy', (props.node as any).code),
    }, 'copy')
  },
})

const NativeCopyProbe = defineComponent({
  name: 'NativeCopyProbe',
  props: {
    node: { type: Object, required: true },
  },
  setup() {
    return () => h('span', { class: 'native-copy-probe' }, 'math')
  },
})

afterEach(() => {
  removeCustomComponents(customId)
})

describe('nodeRenderer heavy-node prop forwarding', () => {
  it('uses lightweight chat mode defaults for code blocks and tooltips', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        mode: 'chat',
        content: [
          '[Vue](https://vuejs.org)',
          '',
          '```ts',
          'console.log(1)',
          '```',
        ].join('\n'),
        final: true,
      },
    })

    await flushAll()

    expect(wrapper.find('pre[data-markstream-pre="1"]').exists()).toBe(true)
    expect(wrapper.find('[data-markstream-code-block="1"]').exists()).toBe(false)
    expect(wrapper.get('a[href="https://vuejs.org"]').attributes('title')).toBe('https://vuejs.org')
  })

  it('falls back to docs mode for invalid runtime mode input', async () => {
    setCustomComponents(customId, {
      paragraph: FadeProbe,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        mode: 'invalid' as any,
        content: 'hello',
        batchRendering: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()

    expect(wrapper.get('.fade-probe').attributes('data-fade')).toBe('true')
  })

  it('emits copy-code and legacy copy for code copy payloads', async () => {
    setCustomComponents(customId, {
      code_block: CopyEmitterProbe,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        nodes: [
          {
            type: 'code_block',
            language: 'ts',
            code: 'export const value = 1',
            raw: '```ts\nexport const value = 1\n```',
          },
        ],
      },
    })

    await wrapper.get('.copy-emitter-probe').trigger('click')

    expect(wrapper.emitted('copy-code')?.[0]).toEqual(['export const value = 1'])
    expect(wrapper.emitted('copy')?.[0]).toEqual(['export const value = 1'])
  })

  it('does not re-emit native copy events from math nodes', async () => {
    setCustomComponents(customId, {
      math_inline: NativeCopyProbe,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        nodes: [
          {
            type: 'math_inline',
            content: 'x + y',
            raw: '$x + y$',
          },
        ],
      },
    })

    wrapper.get('.native-copy-probe').element.dispatchEvent(new Event('copy', { bubbles: true }))

    expect(wrapper.emitted('copy-code')).toBeUndefined()
    expect(wrapper.emitted('copy')).toBeUndefined()
  })

  it('honors explicit pre code renderer in the default mode', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        codeRenderer: 'pre',
        nodes: [
          {
            type: 'code_block',
            language: 'ts',
            code: 'const value = 1',
            raw: '```ts\nconst value = 1\n```',
          },
        ],
      },
    })

    await flushAll()

    expect(wrapper.find('pre[data-markstream-pre="1"]').exists()).toBe(true)
    expect(wrapper.find('[data-markstream-code-block="1"]').exists()).toBe(false)
  })

  it('does not leak rich code block props onto the pre renderer', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        codeRenderer: 'pre',
        codeBlockMonacoOptions: { fontSize: 16 },
        themes: ['vitesse-dark'],
        codeBlockProps: {
          showLineNumbers: true,
          showCopyButton: true,
          reservedHeightPx: 120,
        },
        nodes: [
          {
            type: 'code_block',
            language: 'ts',
            code: 'const value = 1',
            raw: '```ts\nconst value = 1\n```',
          },
        ],
      },
    })

    await flushAll()

    const pre = wrapper.get('pre[data-markstream-pre="1"]')
    expect(pre.attributes('data-markstream-line-numbers')).toBe('1')
    expect(pre.attributes()).not.toHaveProperty('monacooptions')
    expect(pre.attributes()).not.toHaveProperty('themes')
    expect(pre.attributes()).not.toHaveProperty('showcopybutton')
    expect(pre.attributes('style')).toContain('120px')
  })

  it('keeps generic code_block bindings for custom code_block overrides in pre mode', async () => {
    setCustomComponents(customId, {
      code_block: GenericCodeBlockAttrsProbe,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        codeRenderer: 'pre',
        codeBlockMonacoOptions: { fontSize: 16 },
        themes: ['vitesse-dark'],
        codeBlockProps: {
          showLineNumbers: true,
          showHeader: false,
        },
        nodes: [
          {
            type: 'code_block',
            language: 'mermaid',
            code: 'graph LR\nA-->B\n',
            raw: '```mermaid\ngraph LR\nA-->B\n```',
          },
        ],
      },
    })

    await flushAll()

    const probe = wrapper.get('.generic-code-block-attrs-probe')
    expect(probe.attributes('data-language')).toBe('mermaid')
    expect(probe.attributes('data-show-header')).toBe('false')
    expect(probe.attributes('data-show-line-numbers')).toBe('true')
    expect(probe.attributes('data-has-stream')).toBe('true')
    expect(probe.attributes('data-has-monaco-options')).toBe('true')
    expect(probe.attributes('data-has-themes')).toBe('true')
  })

  it('does not pass Monaco-only props to the shiki renderer', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        codeRenderer: 'shiki',
        codeBlockMonacoOptions: { fontSize: 18 },
        nodes: [
          {
            type: 'code_block',
            language: 'ts',
            code: 'const value = 1',
            raw: '```ts\nconst value = 1\n```',
          },
        ],
      },
    })

    for (let attempt = 0; attempt < 10 && !wrapper.find('.code-block-container').exists(); attempt++)
      await flushAll()

    const shiki = wrapper.get('.code-block-container')
    expect(wrapper.find('[data-markstream-code-block="1"]').exists()).toBe(false)
    expect(shiki.attributes('data-has-monaco-options')).toBe('false')
  })

  it('forwards top-level langs to the shiki renderer and lets codeBlockProps override them', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        codeRenderer: 'shiki',
        langs: ['typescript'],
        nodes: [
          {
            type: 'code_block',
            language: 'ts',
            code: 'const value = 1',
            raw: '```ts\nconst value = 1\n```',
          },
        ],
      },
    })

    for (let attempt = 0; attempt < 10 && !wrapper.find('.code-block-container').exists(); attempt++)
      await flushAll()

    expect(wrapper.get('.code-block-container').attributes('data-langs')).toBe('["typescript"]')

    await wrapper.setProps({
      codeBlockProps: {
        langs: ['python'],
      },
    })
    await flushAll()

    expect(wrapper.get('.code-block-container').attributes('data-langs')).toBe('["python"]')
  })

  it('forwards top-level langs to nested shiki renderers', async () => {
    setCustomComponents(customId, {
      'answer-box': AnswerBox,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        codeRenderer: 'shiki',
        langs: ['typescript'],
        content: [
          '<answer-box>',
          '```ts',
          'console.log(1)',
          '```',
          '</answer-box>',
        ].join('\n'),
        customHtmlTags: ['answer-box'],
        final: true,
        batchRendering: false,
        deferNodesUntilVisible: false,
      },
    })

    for (let attempt = 0; attempt < 10 && !wrapper.find('.code-block-container').exists(); attempt++)
      await flushAll()

    expect(wrapper.get('.answer-box .code-block-container').attributes('data-langs')).toBe('["typescript"]')
  })

  it('inherits shiki code rendering for code blocks nested inside list items', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        mode: 'chat',
        codeRenderer: 'shiki',
        langs: ['typescript'],
        codeBlockProps: {
          langs: ['tsx'],
        },
        content: [
          '1. **step one**',
          '   - before:',
          '     ```ts',
          '     refreshSessionSidecars(sessionId)',
          '     await syncSessionFromSnapshot(sessionId)',
          '     ```',
        ].join('\n'),
        final: true,
        batchRendering: false,
        deferNodesUntilVisible: false,
      },
    })

    for (let attempt = 0; attempt < 10 && !wrapper.find('li .code-block-container').exists(); attempt++)
      await flushAll()

    const nestedCodeBlock = wrapper.get('li .code-block-container')
    expect(nestedCodeBlock.attributes('data-langs')).toBe('["tsx"]')
    expect(wrapper.find('li [data-markstream-code-block="1"]').exists()).toBe(false)
  })

  it('forwards Monaco diff options to code blocks nested inside list items', async () => {
    setCustomComponents(customId, {
      code_block: GenericCodeBlockAttrsProbe as any,
    })

    const monacoOptions = {
      diffWordWrap: 'off',
      renderSideBySide: true,
      useInlineViewWhenSpaceIsLimited: false,
    }
    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        codeRenderer: 'monaco',
        codeBlockMonacoOptions: monacoOptions,
        codeBlockProps: {
          showHeader: false,
        },
        content: [
          '1. before:',
          '   ```diff',
          '   -old description that should stay on one source line',
          '   +new description that should stay on one source line',
          '   ```',
        ].join('\n'),
        final: true,
        batchRendering: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()

    const nestedCodeBlock = wrapper.get('li .generic-code-block-attrs-probe')
    expect(nestedCodeBlock.attributes('data-show-header')).toBe('false')
    expect(JSON.parse(nestedCodeBlock.attributes('data-monaco-options') ?? 'null')).toEqual(monacoOptions)
  })

  it('forwards Monaco diff options to code blocks rendered inside custom tag slots', async () => {
    setCustomComponents(customId, {
      'answer-box': AnswerBox,
      'code_block': GenericCodeBlockAttrsProbe as any,
    })

    const monacoOptions = {
      diffWordWrap: 'off',
      renderSideBySide: true,
      useInlineViewWhenSpaceIsLimited: false,
    }
    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        codeRenderer: 'monaco',
        codeBlockMonacoOptions: monacoOptions,
        codeBlockProps: {
          showHeader: false,
        },
        content: [
          '<answer-box>',
          '```diff',
          '-old description that should stay on one source line',
          '+new description that should stay on one source line',
          '```',
          '</answer-box>',
        ].join('\n'),
        customHtmlTags: ['answer-box'],
        final: true,
        batchRendering: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()

    const nestedCodeBlock = wrapper.get('.answer-box .generic-code-block-attrs-probe')
    expect(nestedCodeBlock.attributes('data-show-header')).toBe('false')
    expect(JSON.parse(nestedCodeBlock.attributes('data-monaco-options') ?? 'null')).toEqual(monacoOptions)
  })

  it('forwards top-level langs to custom code_block renderers without forcing codeRenderer="shiki"', async () => {
    setCustomComponents(customId, {
      code_block: GenericCodeBlockAttrsProbe as any,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        langs: ['typescript'],
        nodes: [
          {
            type: 'code_block',
            language: 'ts',
            code: 'const value = 1',
            raw: '```ts\nconst value = 1\n```',
          },
        ],
        viewportPriority: false,
        deferNodesUntilVisible: false,
        batchRendering: false,
        maxLiveNodes: 0,
      },
    })

    for (let attempt = 0; attempt < 10 && !wrapper.find('.generic-code-block-attrs-probe').exists(); attempt++)
      await flushAll()

    expect(wrapper.get('.generic-code-block-attrs-probe').attributes('data-langs')).toBe('["typescript"]')
  })

  it('keeps generic code block props off exact custom mermaid renderers', async () => {
    setCustomComponents(customId, {
      mermaid: GenericCodeBlockAttrsProbe as any,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        langs: ['mermaid'],
        codeBlockStream: false,
        codeBlockProps: {
          showHeader: true,
        },
        mermaidProps: {
          showHeader: false,
        },
        nodes: [
          {
            type: 'code_block',
            language: 'mermaid',
            code: 'flowchart TD\nA-->B',
            raw: '```mermaid\nflowchart TD\nA-->B\n```',
          },
        ],
        viewportPriority: false,
        deferNodesUntilVisible: false,
        batchRendering: false,
        maxLiveNodes: 0,
      },
    })

    for (let attempt = 0; attempt < 10 && !wrapper.find('.generic-code-block-attrs-probe').exists(); attempt++)
      await flushAll()

    const probe = wrapper.get('.generic-code-block-attrs-probe')
    expect(probe.attributes('data-show-header')).toBe('false')
    expect(probe.attributes('data-has-stream')).toBe('false')
    expect(probe.attributes('data-langs')).toBe('null')
  })

  it('does not let codeBlockProps override reserved code block props', async () => {
    setCustomComponents(customId, {
      code_block: ReservedCodeBlockPropsProbe,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        codeBlockProps: {
          node: {
            type: 'code_block',
            language: 'spoofed',
          },
          indexKey: 'spoofed-index',
          key: 'spoofed-key',
          ref: 'spoofed-ref',
          ctx: {},
          renderNode: () => null,
          ['__proto__']: { polluted: true },
          prototype: { polluted: true },
          constructor: { polluted: true },
          showHeader: false,
        },
        nodes: [
          {
            type: 'code_block',
            language: 'ts',
            code: 'const value = 1',
            raw: '```ts\nconst value = 1\n```',
          },
        ],
        viewportPriority: false,
        deferNodesUntilVisible: false,
        batchRendering: false,
        maxLiveNodes: 0,
      },
    })

    await flushAll()

    const probe = wrapper.get('.reserved-code-block-props-probe')
    expect(probe.attributes('data-language')).toBe('ts')
    expect(probe.attributes('data-index-key')).toBe('markdown-renderer-0')
    expect(probe.attributes('data-show-header')).toBe('false')
  })

  it('ignores invalid runtime codeRenderer values', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        mode: 'chat',
        codeRenderer: 'invalid' as any,
        nodes: [
          {
            type: 'code_block',
            language: 'ts',
            code: 'const value = 1',
            raw: '```ts\nconst value = 1\n```',
          },
        ],
      },
    })

    await flushAll()

    expect(wrapper.find('pre[data-markstream-pre="1"]').exists()).toBe(true)
    expect(wrapper.find('[data-markstream-code-block="1"]').exists()).toBe(false)
  })

  it('uses codeBlockProps for Mermaid fences when codeRenderer is pre', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        codeRenderer: 'pre',
        codeBlockProps: {
          showLineNumbers: true,
        },
        nodes: [
          {
            type: 'code_block',
            language: 'mermaid',
            code: 'graph LR\nA-->B\n',
            raw: '```mermaid\ngraph LR\nA-->B\n```',
          },
        ],
      },
    })

    await flushAll()

    expect(wrapper.find('[data-markstream-mermaid="1"]').exists()).toBe(false)
    const pre = wrapper.get('pre[data-markstream-pre="1"]')
    expect(pre.text()).toContain('graph LR')
    expect(pre.attributes('data-markstream-line-numbers')).toBe('1')
  })

  it('renders a reserved Mermaid shell before the async component resolves', () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [
          {
            type: 'code_block',
            language: 'mermaid',
            code: 'flowchart TD\nA-->B\nB-->C\nC-->D\nD-->E\nE-->F\nF-->G\nG-->H\nH-->I\nI-->J\nJ-->K\nK-->L\n',
            raw: '```mermaid\nflowchart TD\nA-->B\n```',
          },
        ],
      },
    })

    const shell = wrapper.get('[data-markstream-mermaid="1"]')
    expect(shell.attributes('data-markstream-mode')).toBe('pending')
    expect(shell.find('.mermaid-source-panel').exists()).toBe(false)
    expect((shell.get('.mermaid-preview-area').element as HTMLElement).style.height).toBe('500px')
  })

  it('renders a reserved Infographic shell before the async component resolves', () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [
          {
            type: 'code_block',
            language: 'infographic',
            code: [
              '# Release progress',
              '- Plan: complete',
              '- Build: active',
              '- Verify: pending',
            ].join('\n'),
            raw: '```infographic\n# Release progress\n- Plan: complete\n```',
          },
        ],
      },
    })

    const shell = wrapper.get('[data-markstream-infographic="1"]')
    expect(shell.attributes('data-markstream-mode')).toBe('pending')
    expect(shell.find('.infographic-source').exists()).toBe(false)
    expect((shell.get('.infographic-preview').element as HTMLElement).style.height).toBe('500px')
  })

  it('injects stable preview height estimates for Mermaid and Infographic blocks', async () => {
    setCustomComponents(customId, {
      mermaid: EstimatedPreviewProbe,
      infographic: EstimatedPreviewProbe,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        nodes: [
          {
            type: 'code_block',
            language: 'mermaid',
            code: 'flowchart TD\nA-->B\nB-->C\nC-->D\nD-->E\nE-->F\nF-->G\nG-->H\nH-->I\nI-->J\nJ-->K\nK-->L\n',
            raw: '```mermaid\nflowchart TD\nA-->B\n```',
          },
          {
            type: 'code_block',
            language: 'infographic',
            code: [
              '# Release progress',
              '- Plan: complete',
              '- Build: active',
              '- Verify: pending',
            ].join('\n'),
            raw: '```infographic\n# Release progress\n- Plan: complete\n```',
          },
        ],
      },
    })

    await flushAll()

    const probes = wrapper.findAll('.estimated-preview-probe')
    expect(probes).toHaveLength(2)
    expect(probes[0].attributes('data-language')).toBe('mermaid')
    expect(probes[0].attributes('data-estimated-preview-height')).toBe('500')
    expect(probes[1].attributes('data-language')).toBe('infographic')
    expect(probes[1].attributes('data-estimated-preview-height')).toBe('500')
  })

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

  it('inherits renderer props inside custom tag default slots', async () => {
    setCustomComponents(customId, {
      'answer-box': AnswerBox,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        content: [
          '<answer-box>',
          '```ts',
          'console.log(1)',
          '```',
          '</answer-box>',
          '',
          'Inline <answer-box>[Vue](https://vuejs.org)</answer-box>',
        ].join('\n'),
        customHtmlTags: ['answer-box'],
        final: true,
        renderCodeBlocksAsPre: true,
        showTooltips: false,
      },
    })

    await flushAll()

    const boxes = wrapper.findAll('.answer-box')
    expect(boxes).toHaveLength(2)
    expect(boxes[0].find('pre[data-markstream-pre="1"]').exists()).toBe(true)
    expect(boxes[0].find('[data-markstream-code-block="1"]').exists()).toBe(false)
    expect(boxes[0].find('code').text()).toBe('console.log(1)')

    const link = boxes[1].get('a[href="https://vuejs.org"]')
    expect(link.attributes('title')).toBe('https://vuejs.org')
  })

  it('renders custom tag slots inside inline container children', async () => {
    setCustomComponents(customId, {
      mention: Mention,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        content: [
          '**<mention>Simon</mention>**',
          '',
          '*<mention>Ada</mention>*',
          '',
          '# Hi <mention>Lin</mention>',
        ].join('\n'),
        final: true,
        batchRendering: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()

    expect(wrapper.get('strong .mention').text()).toBe('Simon')
    expect(wrapper.get('em .mention').text()).toBe('Ada')
    expect(wrapper.get('h1 .mention').text()).toBe('Lin')
  })

  it('forwards loading and isDark to inline custom tag components', async () => {
    setCustomComponents(customId, {
      mention: InlinePropsProbe,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        isDark: true,
        batchRendering: false,
        deferNodesUntilVisible: false,
        nodes: [
          {
            type: 'paragraph',
            raw: '',
            children: [
              {
                type: 'mention',
                tag: 'mention',
                content: 'Direct',
                raw: '<mention>Direct</mention>',
                loading: true,
              },
              {
                type: 'text',
                content: ' ',
                raw: ' ',
              },
              {
                type: 'strong',
                raw: '**<mention>Strong</mention>**',
                children: [
                  {
                    type: 'mention',
                    tag: 'mention',
                    content: 'Strong',
                    raw: '<mention>Strong</mention>',
                    loading: true,
                  },
                ],
              },
            ],
          },
        ],
      },
    })

    await flushAll()

    const probes = wrapper.findAll('.inline-props-probe')
    expect(probes).toHaveLength(2)
    expect(probes[0].attributes('data-loading')).toBe('true')
    expect(probes[0].attributes('data-is-dark')).toBe('true')
    expect(probes[0].text()).toBe('Direct')
    expect(probes[1].attributes('data-loading')).toBe('true')
    expect(probes[1].attributes('data-is-dark')).toBe('true')
    expect(probes[1].text()).toBe('Strong')
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
