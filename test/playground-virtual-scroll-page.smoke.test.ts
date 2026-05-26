import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import VirtualScrollPage from '../playground/src/pages/virtual-scroll.vue'
import { flushAll } from './setup/flush-all'

describe('playground /virtual-scroll shell smoke', () => {
  let originalElementFromPoint: typeof document.elementFromPoint | undefined

  beforeEach(() => {
    originalElementFromPoint = document.elementFromPoint

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(720)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(960)
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => document.querySelector('.node-content') ?? document.querySelector('.node-placeholder')),
    })

    vi.stubGlobal('ResizeObserver', class {
      callback: ResizeObserverCallback

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback
      }

      observe() {}
      unobserve() {}
      disconnect() {}
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()

    if (originalElementFromPoint) {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      })
    }
    else {
      delete (document as any).elementFromPoint
    }
  })

  it('renders lab shell', async () => {
    const wrapper = mount(VirtualScrollPage, {
      attachTo: document.body,
    })

    await flushAll()
    await nextTick()

    expect(wrapper.text()).toContain('markstream-vue virtual-scroll coordination lab')
    expect(wrapper.text()).toContain('outer rendered:')
    expect(wrapper.text()).toContain('markdown slots:')
    expect(wrapper.text()).toContain('blank probes:')
    expect(wrapper.text()).toContain('status:')
    expect(wrapper.text()).toContain('visible range:')
    expect(wrapper.findAll('button').map(button => button.text())).toEqual(expect.arrayContaining([
      'Thread A',
      'Thread B',
      'Bottom',
      'Stress scroll',
      'Reset caches',
    ]))

    wrapper.unmount()
  })

  it('keeps the lab status visible after core actions', async () => {
    const wrapper = mount(VirtualScrollPage, {
      attachTo: document.body,
    })

    await flushAll()
    await nextTick()

    const buttons = wrapper.findAll('button')
    await buttons.find(button => button.text() === 'Bottom')?.trigger('click')
    await flushAll()

    await buttons.find(button => button.text().startsWith('Density:'))?.trigger('click')
    await flushAll()

    await buttons.find(button => button.text().startsWith('Font:'))?.trigger('click')
    await flushAll()

    expect(wrapper.get('[data-testid="lab-status"]').text()).toContain('status: ok')
    expect(wrapper.get('[data-testid="blank-probes"]').text()).toContain('blank probes: 0')
    expect(wrapper.get('[data-testid="markdown-slots"]').text()).toContain('markdown slots:')
    expect(wrapper.get('[data-testid="max-drift"]').text()).toContain('max drift:')

    wrapper.unmount()
  })
})
