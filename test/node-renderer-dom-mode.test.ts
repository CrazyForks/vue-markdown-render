import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import NodeRenderer from '../src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents } from '../src/exports'
import { flushAll } from './setup/flush-all'

function paragraphNode(index: number) {
  return {
    type: 'paragraph',
    raw: `Paragraph ${index}`,
    children: [
      {
        type: 'text',
        content: `Paragraph ${index}`,
        raw: `Paragraph ${index}`,
      },
    ],
  }
}

function codeBlockNode(lines: number) {
  const code = Array.from({ length: lines }, (_, index) => `line ${index + 1}`).join('\n')
  return {
    type: 'code_block',
    language: 'ts',
    code,
    raw: `\`\`\`ts\n${code}\n\`\`\``,
  }
}

function countElements(wrapper: ReturnType<typeof mount>) {
  return wrapper.element.querySelectorAll('*').length
}

describe('node renderer domMode', () => {
  afterEach(() => {
    try {
      removeCustomComponents('dom-mode-custom')
    }
    catch {}
  })

  it('renders simple content without per-node wrappers in minimal DOM mode', async () => {
    const nodes = [paragraphNode(1), paragraphNode(2), paragraphNode(3)]
    const commonProps = {
      nodes,
      batchRendering: false,
      deferNodesUntilVisible: false,
      fade: false,
      nodeVirtual: false,
      typewriter: false,
      viewportPriority: false,
    }

    const full = mount(NodeRenderer, {
      props: commonProps,
    })
    const minimal = mount(NodeRenderer, {
      props: {
        ...commonProps,
        domMode: 'minimal',
      },
    })

    await flushAll()

    expect(full.findAll('.node-slot')).toHaveLength(3)
    expect(full.findAll('.node-content')).toHaveLength(3)
    expect(minimal.findAll('.node-slot')).toHaveLength(0)
    expect(minimal.findAll('.node-content')).toHaveLength(0)
    expect(countElements(minimal)).toBeLessThan(countElements(full))
    expect(minimal.text()).toContain('Paragraph 1')
    expect(minimal.text()).toContain('Paragraph 3')

    full.unmount()
    minimal.unmount()
  })

  it('forwards mouse events from nodes in minimal DOM mode', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [paragraphNode(1)],
        batchRendering: false,
        deferNodesUntilVisible: false,
        domMode: 'minimal',
        fade: false,
        nodeVirtual: false,
        typewriter: false,
        viewportPriority: false,
      },
    })

    await flushAll()

    expect(wrapper.findAll('.node-slot')).toHaveLength(0)

    const paragraph = wrapper.get('.paragraph-node')
    await paragraph.trigger('mouseover')
    await paragraph.trigger('mouseout')

    expect(wrapper.emitted('mouseover')).toHaveLength(1)
    expect(wrapper.emitted('mouseout')).toHaveLength(1)

    wrapper.unmount()
  })

  it('falls back to full DOM when node virtualization is active', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [paragraphNode(1), paragraphNode(2)],
        batchRendering: false,
        deferNodesUntilVisible: false,
        domMode: 'minimal',
        fade: false,
        maxLiveNodes: 1,
        nodeVirtual: true,
        typewriter: false,
        viewportPriority: false,
      },
    })

    await flushAll()

    expect(wrapper.classes()).toContain('virtualized')
    expect(wrapper.findAll('.node-slot').length).toBeGreaterThan(0)
    expect(wrapper.findAll('.node-content').length).toBeGreaterThan(0)

    wrapper.unmount()
  })

  it('falls back to full DOM when fade transitions are active', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [paragraphNode(1)],
        batchRendering: false,
        deferNodesUntilVisible: false,
        domMode: 'minimal',
        fade: true,
        nodeVirtual: false,
        typewriter: false,
        viewportPriority: false,
      },
    })

    await flushAll()

    expect(wrapper.findAll('.node-slot')).toHaveLength(1)
    expect(wrapper.findAll('.node-slot > .node-content')).toHaveLength(1)

    wrapper.unmount()
  })

  it('falls back to full DOM when incremental batching is active', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [paragraphNode(1), paragraphNode(2), paragraphNode(3)],
        batchRendering: true,
        deferNodesUntilVisible: false,
        domMode: 'minimal',
        fade: false,
        initialRenderBatchSize: 1,
        maxLiveNodes: 0,
        nodeVirtual: false,
        renderBatchDelay: 100000,
        renderBatchSize: 1,
        typewriter: false,
        viewportPriority: false,
      },
    })

    try {
      await flushAll()

      expect(wrapper.findAll('.node-slot')).toHaveLength(3)
      expect(wrapper.findAll('.node-placeholder').length).toBeGreaterThan(0)
    }
    finally {
      wrapper.unmount()
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  it('does not leave transparent placeholders for a small streaming append', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    const wrapper = mount(NodeRenderer, {
      props: {
        content: 'Paragraph 1',
        batchRendering: true,
        deferNodesUntilVisible: false,
        fade: false,
        final: false,
        initialRenderBatchSize: 1,
        maxLiveNodes: 0,
        nodeVirtual: false,
        renderBatchDelay: 100000,
        renderBatchSize: 1,
        smoothStreaming: false,
        typewriter: false,
        viewportPriority: false,
      },
    })

    try {
      await flushAll()
      expect(wrapper.findAll('.node-placeholder')).toHaveLength(0)

      await wrapper.setProps({ content: 'Paragraph 1\n\nParagraph 2' })
      await flushAll()

      expect(wrapper.findAll('.node-slot')).toHaveLength(2)
      expect(wrapper.findAll('.node-placeholder')).toHaveLength(0)
      expect(wrapper.text()).toContain('Paragraph 2')
    }
    finally {
      wrapper.unmount()
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  it('renders final non-virtual content without incremental placeholders', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    const wrapper = mount(NodeRenderer, {
      props: {
        content: 'Paragraph 1\n\nParagraph 2\n\nParagraph 3',
        final: true,
        batchRendering: true,
        deferNodesUntilVisible: false,
        fade: false,
        initialRenderBatchSize: 1,
        maxLiveNodes: 0,
        nodeVirtual: false,
        renderBatchDelay: 100000,
        renderBatchSize: 1,
        typewriter: false,
        viewportPriority: false,
      },
    })

    try {
      await flushAll()

      expect(wrapper.findAll('.node-slot')).toHaveLength(3)
      expect(wrapper.findAll('.node-content')).toHaveLength(3)
      expect(wrapper.findAll('.node-placeholder')).toHaveLength(0)
      expect(wrapper.text()).toContain('Paragraph 3')
    }
    finally {
      wrapper.unmount()
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  it('uses code block estimates for incremental batch placeholders', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(640)
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      wrapper = mount(NodeRenderer, {
        props: {
          nodes: [paragraphNode(1), codeBlockNode(10)],
          batchRendering: true,
          deferNodesUntilVisible: false,
          domMode: 'minimal',
          fade: false,
          initialRenderBatchSize: 1,
          maxLiveNodes: 0,
          nodeVirtual: false,
          renderBatchDelay: 100000,
          renderBatchSize: 1,
          renderCodeBlocksAsPre: true,
          typewriter: false,
          viewportPriority: false,
        },
      })
      await flushAll()

      const placeholder = wrapper.get('.node-slot[data-node-index="1"] .node-placeholder')
      const height = Number.parseFloat((placeholder.element as HTMLElement).style.height)

      expect(height).toBeGreaterThan(270)
    }
    finally {
      wrapper?.unmount()
      clientWidth.mockRestore()
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  it('falls back to full DOM when host virtual scroll is active', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [paragraphNode(1)],
        batchRendering: false,
        deferNodesUntilVisible: false,
        domMode: 'minimal',
        fade: false,
        nodeVirtual: false,
        typewriter: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'dom-mode-virtual-scroll',
        },
      },
    })

    await flushAll()

    expect(wrapper.findAll('.node-slot')).toHaveLength(1)
    expect(wrapper.findAll('.node-slot > .node-content')).toHaveLength(1)

    wrapper.unmount()
  })

  it('falls back to full DOM when custom components are registered', async () => {
    setCustomComponents('dom-mode-custom', {
      custom: defineComponent({
        setup() {
          return () => h('div', 'custom')
        },
      }),
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        customId: 'dom-mode-custom',
        nodes: [paragraphNode(1)],
        batchRendering: false,
        deferNodesUntilVisible: false,
        domMode: 'minimal',
        fade: false,
        nodeVirtual: false,
        typewriter: false,
        viewportPriority: false,
      },
    })

    await flushAll()

    expect(wrapper.findAll('.node-slot')).toHaveLength(1)
    expect(wrapper.findAll('.node-content')).toHaveLength(1)

    wrapper.unmount()
  })
})
