import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import VirtualScrollerMarkstreamPage from '../playground/src/pages/virtual-scroller-markstream.vue'
import { flushAll } from './setup/flush-all'

describe('playground /virtual-scroller-markstream shell smoke', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(720)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(960)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(96)
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(7200)

    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders the vue-virtual-scroller integration lab', async () => {
    const wrapper = mount(VirtualScrollerMarkstreamPage, {
      attachTo: document.body,
      global: {
        stubs: {
          MarkdownRender: {
            props: ['content'],
            template: '<div class="assistant-markdown">{{ content }}</div>',
          },
        },
      },
    })

    await flushAll()
    await nextTick()

    expect(wrapper.text()).toContain('markstream-vue + vue-virtual-scroller')
    expect(wrapper.text()).toContain('Thread A')
    expect(wrapper.text()).toContain('Thread B')
    expect(wrapper.text()).toContain('full Markdown coverage')
    expect(wrapper.text()).toContain('Mermaid and KaTeX response')
    expect(wrapper.text()).toContain('code-heavy response')
    expect(wrapper.find('.vue-recycle-scroller').exists()).toBe(true)

    wrapper.unmount()
  }, 15000)
})
