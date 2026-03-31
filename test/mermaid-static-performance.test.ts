import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

async function flushVueUpdates() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('mermaid static render performance', () => {
  it('renders completed diagrams once without starting preview polling', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const canParseOffthread = vi.fn(async () => true)
    const findPrefixOffthread = vi.fn(async () => 'graph LR\nA-->B\n')
    const terminateWorker = vi.fn()
    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async (_id: string, code: string) => ({
        svg: `<svg data-rendered="full">${code}</svg>`,
      })),
    }

    vi.doMock('../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread,
      findPrefixOffthread,
      terminateWorker,
    }))
    vi.doMock('../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
    }))

    const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code: 'graph LR\nA-->B\n',
          raw: '```mermaid\ngraph LR\nA-->B\n```',
        },
        loading: false,
      },
    })

    await flushVueUpdates()
    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).showSource = false
    ;(wrapper.vm as any).viewportReady = true
    await flushVueUpdates()
    await vi.advanceTimersByTimeAsync(5000)
    await flushVueUpdates()

    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)
    expect(canParseOffthread).not.toHaveBeenCalled()
    expect(findPrefixOffthread).not.toHaveBeenCalled()

    wrapper.unmount()
    expect(terminateWorker).toHaveBeenCalled()
  })
})
