import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h } from 'vue'
import MathBlockNode from '../src/components/MathBlockNode/MathBlockNode.vue'
import MathInlineNode from '../src/components/MathInlineNode/MathInlineNode.vue'
import { provideOffscreenHeavyNodeDeferral, provideViewportPriority } from '../src/composables/viewportPriority'
import { flushAll } from './setup/flush-all'

const mocks = vi.hoisted(() => ({
  renderSync: vi.fn((content: string) => `<span class="katex">${content}</span>`),
  renderWorker: vi.fn(() => new Promise<string>(() => {})),
}))

vi.mock('../src/components/MathInlineNode/katex', () => ({
  getKatexSync: () => ({ renderToString: mocks.renderSync }),
  getKatex: async () => ({ renderToString: mocks.renderSync }),
}))

vi.mock('../src/workers/katexWorkerClient', async () => {
  const actual: any = await vi.importActual('../src/workers/katexWorkerClient')
  return {
    ...actual,
    renderKaTeXWithBackpressure: mocks.renderWorker,
    setKaTeXCache: vi.fn(),
  }
})

interface Entry { target: Element, isIntersecting: boolean, intersectionRatio: number }

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  callback: (entries: Entry[]) => void
  elements = new Set<Element>()

  constructor(callback: (entries: Entry[]) => void) {
    this.callback = callback
    FakeIntersectionObserver.instances.push(this)
  }

  observe(element: Element) {
    this.elements.add(element)
  }

  unobserve(element: Element) {
    this.elements.delete(element)
  }

  disconnect() {
    this.elements.clear()
  }

  trigger(element: Element) {
    if (this.elements.has(element))
      this.callback([{ target: element, isIntersecting: true, intersectionRatio: 1 }])
  }
}

describe('math rendering priority', () => {
  beforeEach(() => {
    mocks.renderSync.mockClear()
    mocks.renderWorker.mockClear()
    FakeIntersectionObserver.instances = []
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as any)
    vi.stubGlobal('requestIdleCallback', vi.fn())
    vi.stubGlobal('cancelIdleCallback', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    FakeIntersectionObserver.instances = []
  })

  it.each([
    ['inline', MathInlineNode, { type: 'math_inline', content: 'x^2', raw: '$x^2$', markup: '$', loading: false }],
    ['block', MathBlockNode, { type: 'math_block', content: 'x^2', raw: '$$x^2$$', markup: '$$', loading: false }],
  ])('renders settled %s KaTeX immediately when heavy-node deferral is enabled', async (_kind, component, node) => {
    const Probe = defineComponent({
      setup() {
        provideOffscreenHeavyNodeDeferral(computed(() => true))
        provideViewportPriority(() => null, true)
        return () => h(component as any, { node })
      },
    })
    const wrapper = mount(Probe)

    await flushAll()

    const target = wrapper.get('[data-markstream-math]')
    expect(target.attributes('data-markstream-mode')).toBe('katex')
    expect(mocks.renderSync).toHaveBeenCalledTimes(1)
    expect(mocks.renderWorker).not.toHaveBeenCalled()
    expect(requestIdleCallback).not.toHaveBeenCalled()
    expect(FakeIntersectionObserver.instances).toHaveLength(0)
    wrapper.unmount()
  })

  it.each([
    ['inline', MathInlineNode, { type: 'math_inline', content: 'x^2', raw: '$x^2$', markup: '$', loading: false }],
    ['block', MathBlockNode, { type: 'math_block', content: 'x^2', raw: '$$x^2$$', markup: '$$', loading: false }],
  ])('renders a standalone %s component without waiting for viewport visibility', async (_kind, component, node) => {
    const wrapper = mount(component as any, { props: { node } })

    await flushAll()

    expect(wrapper.get('[data-markstream-math]').attributes('data-markstream-mode')).toBe('katex')
    expect(mocks.renderSync).toHaveBeenCalledTimes(1)
    expect(FakeIntersectionObserver.instances).toHaveLength(0)
    wrapper.unmount()
  })
})
