import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MathInlineNode from '../src/components/MathInlineNode/MathInlineNode.vue'
import { flushAll } from './setup/flush-all'

const mocks = vi.hoisted(() => ({
  renderKaTeXWithBackpressure: vi.fn(() => new Promise<string>(() => {})),
}))

vi.mock('../src/components/MathInlineNode/katex', () => ({
  getKatexSync: () => null,
  getKatex: async () => null,
}))

vi.mock('../src/workers/katexWorkerClient', async () => {
  const actual: any = await vi.importActual('../src/workers/katexWorkerClient')
  return {
    ...actual,
    renderKaTeXWithBackpressure: mocks.renderKaTeXWithBackpressure,
  }
})

describe('mathInlineNode pending state', () => {
  beforeEach(() => {
    mocks.renderKaTeXWithBackpressure.mockClear()
    mocks.renderKaTeXWithBackpressure.mockImplementation(() => new Promise<string>(() => {}))
  })

  it('exposes pending state while async KaTeX render is in flight', async () => {
    const wrapper = mount(MathInlineNode as any, {
      props: {
        node: {
          type: 'math_inline',
          content: 'x',
          raw: '$x$',
          markup: '$',
          loading: false,
        },
      },
    })

    await flushAll()

    expect(mocks.renderKaTeXWithBackpressure).toHaveBeenCalled()
    expect(wrapper.attributes('data-markstream-mode')).toBe('fallback')
    expect(wrapper.attributes('data-markstream-pending')).toBe('true')

    wrapper.unmount()
  })

  it('keeps loading inline math in loading mode instead of flashing raw fallback', async () => {
    const wrapper = mount(MathInlineNode as any, {
      props: {
        node: {
          type: 'math_inline',
          content: 'W = \\operatorname{span}\\{\\boldsy',
          raw: '\\(W = \\operatorname{span}\\{\\boldsy\\)',
          markup: '\\(\\)',
          loading: true,
        },
      },
    })

    await flushAll()

    expect(mocks.renderKaTeXWithBackpressure).toHaveBeenCalled()
    expect(wrapper.attributes('data-markstream-mode')).toBe('loading')
    expect(wrapper.attributes('data-markstream-pending')).toBe('true')
    expect(wrapper.find('.math-inline--fallback').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('\\operatorname')

    wrapper.unmount()
  })
})
