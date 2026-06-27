import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MathBlockNode from '../src/components/MathBlockNode/MathBlockNode.vue'
import { createMathBlockMinHeightCache, MATH_BLOCK_MIN_HEIGHT_CACHE } from '../src/components/MathBlockNode/minHeightCache'
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

const originalOffsetHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')

function mockOffsetHeight(height: number | ((el: HTMLElement) => number)) {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return typeof height === 'function' ? height(this as HTMLElement) : height
    },
  })
}

describe('mathBlockNode min-height cache scope', () => {
  beforeEach(() => {
    mocks.renderKaTeXWithBackpressure.mockReset()
    mocks.renderKaTeXWithBackpressure.mockImplementation(() => new Promise<string>(() => {}))
  })

  afterEach(() => {
    if (originalOffsetHeightDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeightDescriptor)
    }
  })

  it('isolates cached min-height across different scopes for the same indexKey', async () => {
    const rendererCache = createMathBlockMinHeightCache('renderer-test')

    mockOffsetHeight(120)
    const first = mount(MathBlockNode as any, {
      props: {
        node: {
          type: 'math_block',
          content: '',
          raw: '$$x$$',
        },
        indexKey: 'same-index',
        cacheScope: 'msg-a',
      },
      global: {
        provide: {
          [MATH_BLOCK_MIN_HEIGHT_CACHE as symbol]: rendererCache,
        },
      },
    })
    await flushAll()
    expect(first.attributes('style')).toContain('min-height: 120px;')
    first.unmount()

    mockOffsetHeight(40)
    const second = mount(MathBlockNode as any, {
      props: {
        node: {
          type: 'math_block',
          content: '',
          raw: '$$y$$',
        },
        indexKey: 'same-index',
        cacheScope: 'msg-b',
      },
      global: {
        provide: {
          [MATH_BLOCK_MIN_HEIGHT_CACHE as symbol]: rendererCache,
        },
      },
    })
    await flushAll()
    expect(second.attributes('style')).toContain('min-height: 40px;')
    second.unmount()
  })

  it('clears fallback min-height before reporting successful KaTeX render height', async () => {
    let resolveRender!: (html: string) => void
    mocks.renderKaTeXWithBackpressure.mockImplementationOnce(() => {
      return new Promise<string>((resolve) => {
        resolveRender = resolve
      })
    })

    mockOffsetHeight((el) => {
      const lockedHeight = Number.parseFloat(el.style.minHeight)
      if (Number.isFinite(lockedHeight) && lockedHeight > 0)
        return lockedHeight

      return el.dataset.markstreamMode === 'katex' ? 64 : 392
    })

    const rendererCache = createMathBlockMinHeightCache('renderer-test')
    const lifecycle = {
      reportHeight: vi.fn(),
      markPending: vi.fn(),
      markSettled: vi.fn(),
    }

    const wrapper = mount(MathBlockNode as any, {
      props: {
        node: {
          type: 'math_block',
          content: 'x',
          raw: '\\[x\\]',
          loading: false,
        },
        indexKey: 'math-large-fallback',
        cacheScope: 'msg-c',
      },
      global: {
        provide: {
          [MATH_BLOCK_MIN_HEIGHT_CACHE as symbol]: rendererCache,
          [MARKSTREAM_NODE_LIFECYCLE_KEY as symbol]: lifecycle,
        },
      },
    })

    await flushAll()

    expect(wrapper.attributes('style')).toContain('min-height: 392px;')
    expect(rendererCache.cache.get('msg-c:math-block:math-large-fallback')).toBe(392)

    resolveRender('<span class="katex">x</span>')
    await flushAll()

    expect(wrapper.attributes('data-markstream-mode')).toBe('katex')
    expect(wrapper.attributes('style') ?? '').not.toContain('min-height')
    expect(rendererCache.cache.get('msg-c:math-block:math-large-fallback')).toBe(0)
    expect(lifecycle.reportHeight).toHaveBeenCalledWith('math-large-fallback', 64)

    wrapper.unmount()
  })
})
