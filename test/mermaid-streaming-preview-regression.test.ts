import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

async function flushVueUpdates() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

async function settleStreamingRender(turns = 6) {
  for (let index = 0; index < turns; index++)
    await flushVueUpdates()
}

function createNode(code: string) {
  return {
    type: 'code_block',
    language: 'mermaid',
    code,
    raw: `\`\`\`mermaid\n${code}\`\`\``,
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('mermaid streaming preview regression', () => {
  it('renders a prefix preview immediately when returning to preview mid-stream', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const canParseOffthread = vi.fn(async (code: string) => !code.includes('B-->C'))
    const findPrefixOffthread = vi.fn(async () => 'graph LR\nA-->B\n')
    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async (_id: string, code: string) => ({
        svg: `<svg data-rendered="${code.includes('B-->C') ? 'full' : 'prefix'}" viewBox="0 0 10 10"><g /></svg>`,
      })),
    }

    vi.doMock('../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread,
      findPrefixOffthread,
      terminateWorker: vi.fn(),
    }))
    const getMermaid = vi.fn(async () => fakeMermaid)
    vi.doMock('../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid,
    }))

    const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: createNode('graph LR\nA-->B\n'),
        loading: true,
      },
    })

    await flushVueUpdates()

    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).viewportReady = true
    ;(wrapper.vm as any).showSource = false
    await settleStreamingRender()

    ;(wrapper.vm as any).showSource = true
    await settleStreamingRender()

    fakeMermaid.render.mockClear()
    canParseOffthread.mockClear()
    findPrefixOffthread.mockClear()

    await wrapper.setProps({
      node: createNode('graph LR\nA-->B\nB-->C\n'),
    })
    await settleStreamingRender()

    ;(wrapper.vm as any).showSource = false
    await settleStreamingRender()

    expect(canParseOffthread).toHaveBeenCalled()
    expect(findPrefixOffthread).toHaveBeenCalled()
    expect(getMermaid).toHaveBeenCalled()
    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)
    expect(fakeMermaid.render.mock.calls[0]?.[1]).toContain('A-->B')
    expect(fakeMermaid.render.mock.calls[0]?.[1]).not.toContain('B-->C')
    expect(wrapper.find('svg[data-rendered="prefix"]').exists()).toBe(true)
  })
})
