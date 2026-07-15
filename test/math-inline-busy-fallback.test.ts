import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MathInlineNode from '../src/components/MathInlineNode/MathInlineNode.vue'

import { flushAll } from './setup/flush-all'

vi.mock('../src/components/MathInlineNode/katex', () => ({
  getKatexSync: () => null,
  getKatex: async () => ({
    renderToString: (content: string) => `<span class="katex inline">${content}</span>`,
  }),
}))

vi.mock('../src/workers/katexWorkerClient', async () => {
  const actual: any = await vi.importActual('../src/workers/katexWorkerClient')
  return {
    ...actual,
    WORKER_BUSY_CODE: 'WORKER_BUSY',
    renderKaTeXWithBackpressure: async () => {
      const err: any = new Error('Worker busy')
      err.code = 'WORKER_BUSY'
      err.name = 'WorkerBusy'
      throw err
    },
  }
})

describe('mathInlineNode busy worker fallback', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('falls back to sync KaTeX render for settled math when the worker is busy', async () => {
    const wrapper = mount(MathInlineNode as any, {
      props: {
        node: {
          type: 'math_inline',
          content: 'E=mc^2',
          raw: '$E=mc^2$',
          loading: false,
        },
      },
    })
    await flushAll()
    const html = wrapper.html()
    expect(html).toContain('katex inline')
    expect(html).not.toContain('$E=mc^2$')
  })

  it('does not move streaming KaTeX work back to the main thread when the worker is busy', async () => {
    const wrapper = mount(MathInlineNode as any, {
      props: {
        node: {
          type: 'math_inline',
          content: 'E=mc^2',
          raw: '$E=mc^2$',
          loading: true,
        },
      },
    })
    await flushAll()

    expect(wrapper.attributes('data-markstream-mode')).toBe('loading')
    expect(wrapper.html()).not.toContain('katex inline')
    expect(wrapper.text()).not.toContain('$E=mc^2$')

    await wrapper.setProps({
      node: {
        type: 'math_inline',
        content: 'E=mc^2',
        raw: '$E=mc^2$',
        loading: false,
      },
    })
    await flushAll()

    expect(wrapper.html()).toContain('katex inline')
  })
})
