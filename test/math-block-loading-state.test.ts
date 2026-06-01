import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MathBlockNode from '../src/components/MathBlockNode/MathBlockNode.vue'
import { MARKSTREAM_NODE_LIFECYCLE_KEY } from '../src/utils/nodeLifecycle'
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

describe('mathBlockNode loading state', () => {
  beforeEach(() => {
    mocks.renderKaTeXWithBackpressure.mockClear()
    mocks.renderKaTeXWithBackpressure.mockImplementation(() => new Promise<string>(() => {}))
  })

  it('keeps loading math blocks in loading mode instead of flashing raw fallback', async () => {
    const wrapper = mount(MathBlockNode as any, {
      props: {
        node: {
          type: 'math_block',
          content: '\\begin{pmatrix}\na & b \\\\\nc & d',
          raw: '\\[\n\\begin{pmatrix}\na & b \\\\\nc & d\n\\]',
          loading: true,
        },
      },
    })

    await flushAll()

    expect(mocks.renderKaTeXWithBackpressure).toHaveBeenCalled()
    expect(wrapper.attributes('data-markstream-mode')).toBe('loading')
    expect(wrapper.attributes('data-markstream-pending')).toBe('true')
    expect(wrapper.find('.math-loading-overlay').exists()).toBe(true)
    expect(wrapper.find('.math-block__fallback').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('\\begin{pmatrix}')
  })

  it('reports async render lifecycle height when KaTeX settles', async () => {
    mocks.renderKaTeXWithBackpressure.mockResolvedValueOnce('<span class="katex">x</span>')
    const heightSpy = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(84)
    const lifecycle = {
      reportHeight: vi.fn(),
      markPending: vi.fn(),
      markSettled: vi.fn(),
    }

    const wrapper = mount(MathBlockNode as any, {
      props: {
        indexKey: 'math-1',
        node: {
          type: 'math_block',
          content: 'x',
          raw: '\\[x\\]',
          loading: true,
        },
      },
      global: {
        provide: {
          [MARKSTREAM_NODE_LIFECYCLE_KEY]: lifecycle,
        },
      },
    })

    await flushAll()

    expect(lifecycle.markPending).toHaveBeenCalledWith('math-1')
    expect(lifecycle.reportHeight).toHaveBeenCalledWith('math-1', 84)
    expect(lifecycle.markSettled).toHaveBeenCalledWith('math-1')

    wrapper.unmount()
    heightSpy.mockRestore()
  })

  it('settles pending lifecycle when content becomes empty before KaTeX resolves', async () => {
    const lifecycle = {
      reportHeight: vi.fn(),
      markPending: vi.fn(),
      markSettled: vi.fn(),
    }

    const wrapper = mount(MathBlockNode as any, {
      props: {
        indexKey: 'math-pending',
        node: {
          type: 'math_block',
          content: 'x',
          raw: '\\[x\\]',
          loading: true,
        },
      },
      global: {
        provide: {
          [MARKSTREAM_NODE_LIFECYCLE_KEY]: lifecycle,
        },
      },
    })

    await flushAll()

    expect(lifecycle.markPending).toHaveBeenCalledWith('math-pending')

    await wrapper.setProps({
      node: {
        type: 'math_block',
        content: '',
        raw: '\\[\\]',
        loading: false,
      },
    })
    await flushAll()

    expect(lifecycle.markSettled).toHaveBeenCalledWith('math-pending')

    wrapper.unmount()
  })
})
