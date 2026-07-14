import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import MathBlockNode from '../src/components/MathBlockNode/MathBlockNode.vue'
import MathInlineNode from '../src/components/MathInlineNode/MathInlineNode.vue'
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
    getKaTeXCache: () => undefined,
    renderKaTeXWithBackpressure: mocks.renderWorker,
    setKaTeXCache: vi.fn(),
  }
})

describe('streaming math main-thread work', () => {
  beforeEach(() => {
    mocks.renderSync.mockClear()
    mocks.renderWorker.mockClear()
  })

  it.each([
    ['inline', MathInlineNode, { type: 'math_inline', content: 'x^2', raw: '$x^2$', markup: '$', loading: true }],
    ['block', MathBlockNode, { type: 'math_block', content: 'x^2', raw: '$$x^2$$', loading: true }],
  ])('keeps a loading %s formula off the main-thread renderer', async (_kind, component, node) => {
    const wrapper = mount(component as any, { props: { node } })
    await flushAll()

    expect(mocks.renderSync).not.toHaveBeenCalled()
    expect(mocks.renderWorker).toHaveBeenCalled()
    expect(wrapper.attributes('data-markstream-mode')).toBe('loading')

    wrapper.unmount()
  })

  it('keeps synchronous rendering for settled initial content', () => {
    const wrapper = mount(MathInlineNode as any, {
      props: {
        node: {
          type: 'math_inline',
          content: 'x^2',
          raw: '$x^2$',
          markup: '$',
          loading: false,
        },
      },
    })

    expect(mocks.renderSync).toHaveBeenCalledTimes(1)
    expect(wrapper.attributes('data-markstream-mode')).toBe('katex')
    wrapper.unmount()
  })
})
