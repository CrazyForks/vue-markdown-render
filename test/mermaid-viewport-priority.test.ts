import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick } from 'vue'

interface Entry {
  target: Element
  isIntersecting: boolean
  intersectionRatio: number
}

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  callback: (entries: Entry[]) => void
  elements = new Set<Element>()

  constructor(cb: (entries: Entry[]) => void) {
    this.callback = cb
    FakeIntersectionObserver.instances.push(this)
  }

  observe(el: Element) {
    this.elements.add(el)
  }

  unobserve(el: Element) {
    this.elements.delete(el)
  }

  disconnect() {
    this.elements.clear()
  }

  trigger(el: Element, isIntersecting = true) {
    if (!this.elements.has(el))
      return
    this.callback([{ target: el, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 }])
  }
}

async function flushVueUpdates() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
  FakeIntersectionObserver.instances = []
})

describe('mermaid viewport priority', () => {
  it('does not load Mermaid offscreen during a final history restore', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestIdleCallback', ((cb: any) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 1)) as any)
    vi.stubGlobal('cancelIdleCallback', ((id: number) => clearTimeout(id)) as any)
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)

    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async () => ({
        svg: '<svg viewBox="0 0 10 10"><rect width="1" height="1" /></svg>',
      })),
    }
    const getMermaid = vi.fn(async () => fakeMermaid)
    vi.doMock('../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid,
      isMermaidEnabled: vi.fn(() => true),
    }))
    vi.doMock('../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))

    const viewportPriority = await import('../src/composables/viewportPriority')
    const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const node = {
      type: 'code_block',
      language: 'mermaid',
      code: 'graph LR\nA-->B\n',
      raw: '```mermaid\ngraph LR\nA-->B\n```',
    }
    const Probe = defineComponent({
      setup() {
        viewportPriority.provideOffscreenHeavyNodeDeferral(computed(() => true))
        viewportPriority.provideViewportPriority(() => null, true)
        return () => h(MermaidBlockNode as any, { node, loading: false })
      },
    })
    const wrapper = mount(Probe)

    await flushVueUpdates()

    const target = wrapper.get('[data-markstream-mermaid="1"]')
    expect(target.attributes('data-markstream-mode')).toBe('fallback')
    expect(getMermaid).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1500)
    await flushVueUpdates()
    expect(getMermaid).not.toHaveBeenCalled()

    const observer = FakeIntersectionObserver.instances.find(instance => instance.elements.has(target.element))
    expect(observer).toBeTruthy()
    observer?.trigger(target.element)
    await flushVueUpdates()
    await flushVueUpdates()

    expect(getMermaid).toHaveBeenCalled()
    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('renders a standalone component without waiting for viewport visibility', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestIdleCallback', ((cb: any) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 1)) as any)
    vi.stubGlobal('cancelIdleCallback', ((id: number) => clearTimeout(id)) as any)

    const canParseOffthread = vi.fn(async () => true)
    const findPrefixOffthread = vi.fn(async () => null)
    vi.doMock('../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread,
      findPrefixOffthread,
      terminateWorker: vi.fn(),
    }))
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)

    const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const node = {
      type: 'code_block',
      language: 'mermaid',
      code: 'graph LR\nA-->B\n',
      raw: '```mermaid\ngraph LR\nA-->B\n```',
    }

    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node,
        loading: true,
      },
    })

    await flushVueUpdates()

    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).showSource = false
    await flushVueUpdates()

    await wrapper.setProps({
      node: {
        ...node,
        code: 'graph LR\nA-->B\nB-->C\n',
        raw: '```mermaid\ngraph LR\nA-->B\nB-->C\n```',
      },
    })
    await flushVueUpdates()
    await vi.advanceTimersByTimeAsync(250)
    await flushVueUpdates()

    await vi.advanceTimersByTimeAsync(250)
    await flushVueUpdates()

    expect(canParseOffthread).toHaveBeenCalled()
    expect(FakeIntersectionObserver.instances).toHaveLength(0)
  })

  it('cancels queued progressive idle work when unmounted', async () => {
    vi.useFakeTimers()
    const idleCallbacks = new Map<number, (deadline: IdleDeadline) => void>()
    let nextIdleId = 0
    const requestIdleCallback = vi.fn((callback: (deadline: IdleDeadline) => void) => {
      const id = ++nextIdleId
      idleCallbacks.set(id, callback)
      return id
    })
    const cancelIdleCallback = vi.fn((id: number) => {
      idleCallbacks.delete(id)
    })
    vi.stubGlobal('requestIdleCallback', requestIdleCallback)
    vi.stubGlobal('cancelIdleCallback', cancelIdleCallback)

    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async () => ({
        svg: '<svg viewBox="0 0 10 10"><rect width="1" height="1" /></svg>',
      })),
    }
    vi.doMock('../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
      isMermaidEnabled: vi.fn(() => true),
    }))
    const canParseOffthread = vi.fn(async () => true)
    vi.doMock('../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread,
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
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
        loading: true,
        renderDebounceMs: 10,
      },
    })

    await flushVueUpdates()
    await flushVueUpdates()
    expect(canParseOffthread).toHaveBeenCalled()
    canParseOffthread.mockClear()
    fakeMermaid.render.mockClear()
    await vi.advanceTimersByTimeAsync(10)
    await flushVueUpdates()

    expect(requestIdleCallback).toHaveBeenCalled()
    const queuedCallbacks = [...idleCallbacks.values()]
    wrapper.unmount()

    expect(cancelIdleCallback).toHaveBeenCalled()
    for (const callback of queuedCallbacks) {
      callback({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline)
    }
    await flushVueUpdates()

    expect(canParseOffthread).not.toHaveBeenCalled()
    expect(fakeMermaid.render).not.toHaveBeenCalled()
  })
})
