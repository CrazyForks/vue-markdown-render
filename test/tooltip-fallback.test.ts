import { autoUpdate, computePosition } from '@floating-ui/dom'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(autoUpdate).mockImplementation((_anchor: HTMLElement, _tooltip: HTMLElement, update: () => unknown) => {
      void Promise.resolve().then(update)
      return vi.fn()
    })
    vi.mocked(computePosition).mockImplementation(async () => {
      throw new Error('position failed')
    })
  })

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

    const tooltip = document.querySelector<HTMLElement>('.tooltip-element')!
    tooltip.getBoundingClientRect = () => rect(0, 0, 80, 20)

    await wrapper.setProps({ visible: true })
    await flushAll()

    expect(tooltip.textContent).toContain('Copy')
    expect(tooltip.style.display).not.toBe('none')
    expect(tooltip.style.transform).toBe('translate3d(12px, 8px, 0)')

    await wrapper.setProps({ content: 'Copied' })
    await flushAll()

    expect(document.querySelector<HTMLElement>('.tooltip-element')?.style.transform).toBe('translate3d(12px, 8px, 0)')

    wrapper.unmount()
  })

  it('keeps tooltip measurable while positioning before ready', async () => {
    const anchor = document.createElement('button')
    anchor.getBoundingClientRect = () => rect(20, 50, 40, 20)
    document.body.appendChild(anchor)

    const wrapper = mount(Tooltip, {
      attachTo: document.body,
      props: {
        visible: false,
        anchorEl: anchor,
        content: 'Tip',
        placement: 'top',
        offset: 6,
      },
    })

    const tooltip = document.querySelector<HTMLElement>('.tooltip-element')!
    tooltip.getBoundingClientRect = () => rect(0, 0, 80, 20)

    await wrapper.setProps({ visible: true })
    await flushAll()

    expect(tooltip.style.display).not.toBe('none')
    expect(tooltip.style.visibility).toBe('visible')
    expect(tooltip.style.transform).toBe('translate3d(20px, 24px, 0)')

    wrapper.unmount()
  })

  it('rebinds autoUpdate when the visible tooltip moves to another anchor', async () => {
    const cleanupA = vi.fn()
    const cleanupB = vi.fn()
    vi.mocked(autoUpdate)
      .mockReturnValueOnce(cleanupA)
      .mockReturnValueOnce(cleanupB)
    vi.mocked(computePosition).mockResolvedValue({
      x: 10,
      y: 20,
      placement: 'top',
      strategy: 'fixed',
      middlewareData: {},
    })

    const anchorA = document.createElement('button')
    const anchorB = document.createElement('button')
    document.body.append(anchorA, anchorB)

    const wrapper = mount(Tooltip, {
      attachTo: document.body,
      props: {
        visible: false,
        anchorEl: anchorA,
        content: 'A',
        placement: 'top',
      },
    })

    await wrapper.setProps({ visible: true })
    await flushAll()

    expect(autoUpdate).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ anchorEl: anchorB, content: 'B' })
    await flushAll()

    expect(cleanupA).toHaveBeenCalled()
    expect(autoUpdate).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })
})
