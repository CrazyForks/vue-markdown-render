import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import NodeRenderer from '../packages/markstream-vue2/src/components/NodeRenderer/NodeRenderer.vue'
import { removeCustomComponents, setCustomComponents } from '../packages/markstream-vue2/src/utils/nodeComponents'
import { flushAll } from './setup/flush-all'

const customId = 'vue2-heavy-props-test'

const CustomMermaidProbe = defineComponent({
  name: 'CustomMermaidProbe',
  props: {
    showHeader: Boolean,
    showZoomControls: Boolean,
    renderDebounceMs: Number,
    previewPollDelayMs: Number,
  },
  render() {
    return h('div', {
      'class': 'custom-mermaid-probe',
      'data-show-header': String(this.showHeader),
      'data-show-zoom-controls': String(this.showZoomControls),
      'data-render-debounce-ms': String(this.renderDebounceMs),
      'data-preview-poll-delay-ms': String(this.previewPollDelayMs),
    })
  },
})

describe('markstream-vue2 heavy-node prop forwarding', () => {
  afterEach(() => {
    removeCustomComponents(customId)
  })

  it('forwards mermaidProps to custom mermaid renderers', async () => {
    setCustomComponents(customId, { mermaid: CustomMermaidProbe })

    const wrapper = mount(NodeRenderer as any, {
      props: {
        customId,
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

    const probe = wrapper.get('.custom-mermaid-probe')
    expect(probe.attributes('data-show-header')).toBe('false')
    expect(probe.attributes('data-show-zoom-controls')).toBe('false')
    expect(probe.attributes('data-render-debounce-ms')).toBe('180')
    expect(probe.attributes('data-preview-poll-delay-ms')).toBe('500')
  })
})
