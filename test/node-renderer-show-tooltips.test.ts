import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NodeRenderer from '../src/components/NodeRenderer'
import { hideTooltip } from '../src/composables/useSingletonTooltip'
import { flushAll } from './setup/flush-all'

describe('nodeRenderer showTooltips prop', () => {
  afterEach(() => {
    hideTooltip(true)
    vi.useRealTimers()
  })

  it('disables LinkNode tooltip when showTooltips is false', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: 'Visit [Vue](https://vuejs.org \"Vue Site\") now.',
        showTooltips: false,
      },
    })
    await flushAll()

    const link = wrapper.find('a[href=\"https://vuejs.org\"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('title')).toBe('Vue Site')
  })

  it('keeps LinkNode tooltip enabled by default', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: 'Visit [Vue](https://vuejs.org \"Vue Site\") now.',
      },
    })
    await flushAll()

    const link = wrapper.find('a[href=\"https://vuejs.org\"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('title')).toBe('')
  })

  it('inherits showTooltips=false inside list item nested renderer', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: '- Visit [Vue](https://vuejs.org) now.',
        showTooltips: false,
      },
    })
    await flushAll()

    const link = wrapper.find('a[href=\"https://vuejs.org\"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('title')).toBe('https://vuejs.org')
  })

  it('uses visible IDN text for punycoded bare URL tooltips', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: 'http://你好.com',
      },
    })
    await flushAll()

    const link = wrapper.find('a[href="http://xn--6qq79v.com"]')
    expect(link.exists()).toBe(true)
    expect(link.text()).toBe('http://你好.com')

    vi.useFakeTimers()
    await link.trigger('mouseenter', { clientX: 10, clientY: 10 })
    await vi.advanceTimersByTimeAsync(80)
    await vi.dynamicImportSettled()
    vi.useRealTimers()
    await flushAll()

    expect(document.querySelector('.tooltip-element')?.textContent?.trim()).toBe('http://你好.com')
    await link.trigger('mouseleave')
  })
})
