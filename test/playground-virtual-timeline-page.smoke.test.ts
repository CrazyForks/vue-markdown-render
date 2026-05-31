import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import VirtualTimelineZeroPage from '../playground/src/pages/virtual-timeline-zero.vue'
import { flushAll } from './setup/flush-all'

describe('playground /virtual-timeline-zero shell smoke', () => {
  beforeEach(() => {
    window.sessionStorage.removeItem('markstream-vue:virtual-timeline-zero:thread-states:v1')

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(720)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(960)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(72)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
  })

  afterEach(() => {
    window.sessionStorage.removeItem('markstream-vue:virtual-timeline-zero:thread-states:v1')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders the zero-config mixed timeline lab', async () => {
    const wrapper = mount(VirtualTimelineZeroPage, {
      attachTo: document.body,
    })

    await flushAll()
    await vi.dynamicImportSettled()
    await flushAll()
    await nextTick()

    expect(wrapper.text()).toContain('markstream-vue virtual timeline zero config')
    expect(wrapper.text()).toContain('Thread A')
    expect(wrapper.text()).toContain('Thread B')
    expect(wrapper.text()).toContain('Reading GitHub PR')
    expect(wrapper.find('[data-testid="markstream-virtual-timeline"]').exists()).toBe(true)
    expect((window as any).__markstreamVirtualTimelineZero?.read().threadId).toBe('thread-a')

    wrapper.unmount()
    expect((window as any).__markstreamVirtualTimelineZero).toBeUndefined()
  })
})
