import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Tooltip from '../src/components/Tooltip/Tooltip.vue'
import { flushAll } from './setup/flush-all'

vi.mock('@floating-ui/dom', () => ({
  arrow: vi.fn(() => ({ name: 'arrow' })),
  autoUpdate: vi.fn((_anchor: HTMLElement, _tooltip: HTMLElement, update: () => unknown) => {
    void Promise.resolve().then(update)
    return vi.fn()
  }),
  computePosition: vi.fn(async () => {
    throw new Error('position failed')
  }),
  flip: vi.fn(() => ({ name: 'flip' })),
  offset: vi.fn(() => ({ name: 'offset' })),
  shift: vi.fn(() => ({ name: 'shift' })),
}))

function rect(left: number, top: number, width: number, height: number) {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect
}

describe('tooltip fallback positioning', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('stays visible at a fallback position when Floating UI positioning fails', async () => {
    const anchor = document.createElement('button')
    anchor.getBoundingClientRect = () => rect(12, 34, 40, 40)
    document.body.appendChild(anchor)

    const wrapper = mount(Tooltip, {
      attachTo: document.body,
      props: {
        visible: false,
        anchorEl: anchor,
        content: 'Copy',
        placement: 'top',
        offset: 6,
      },
    })

    await wrapper.setProps({ visible: true })
    await flushAll()

    const tooltip = document.querySelector<HTMLElement>('.tooltip-element')
    expect(tooltip?.textContent).toContain('Copy')
    expect(tooltip?.style.display).not.toBe('none')
    expect(tooltip?.style.transform).toBe('translate3d(12px, 28px, 0)')

    await wrapper.setProps({ content: 'Copied' })
    await flushAll()

    expect(document.querySelector<HTMLElement>('.tooltip-element')?.style.transform).toBe('translate3d(12px, 28px, 0)')

    wrapper.unmount()
  })
})
