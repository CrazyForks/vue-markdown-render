import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import VirtualScrollPage from '../playground/src/pages/virtual-scroll.vue'
import { flushAll } from './setup/flush-all'

describe('playground /virtual-scroll smoke', () => {
  let originalElementFromPoint: typeof document.elementFromPoint | undefined

  beforeEach(() => {
    originalElementFromPoint = document.elementFromPoint

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(720)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(960)
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => document.querySelector('.virtual-message')),
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

  it('renders the virtual scroll lab shell and exposes validation metrics', async () => {
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

    await wrapper.get('button:nth-of-type(5)').trigger('click')
    await flushAll()

    expect(wrapper.text()).toContain('visible range:')

    wrapper.unmount()
  })
})
