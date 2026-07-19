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

describe('mathBlockNode locked min-height on content replacement', () => {
  beforeEach(() => {
    mocks.renderKaTeXWithBackpressure.mockReset()
    // Never resolves: simulates KaTeX being unavailable/fallback state.
    mocks.renderKaTeXWithBackpressure.mockImplementation(() => new Promise<string>(() => {}))
  })

  afterEach(() => {
    if (originalOffsetHeightDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeightDescriptor)
    }
  })

  it('clears stale lockedMinHeight when content is replaced (non-append) at same indexKey and cacheScope', async () => {
    // Simulate a tall fallback block being replaced by a short one while
    // KaTeX never produces HTML (disabled / worker stuck / persistent fallback).
    // Without the content-replacement reset, the shorter block would inherit
    // the previous 392px locked min-height indefinitely.
    mockOffsetHeight((el) => {
      const locked = Number.parseFloat(el.style.minHeight)
      if (Number.isFinite(locked) && locked > 0)
        return locked
      return el.dataset.markstreamMode === 'katex' ? 64 : 392
    })

    const rendererCache = createMathBlockMinHeightCache('renderer-replacement')

    const wrapper = mount(MathBlockNode as any, {
      props: {
        node: {
          type: 'math_block',
          content: '\\sum_{i=1}^{n} x_i^2',
          raw: '$\\sum_{i=1}^{n} x_i^2$',
          loading: false,
        },
        indexKey: 'math-replacement-0',
        cacheScope: 'renderer-replacement',
      },
      global: {
        provide: {
          [MATH_BLOCK_MIN_HEIGHT_CACHE as symbol]: rendererCache,
        },
      },
    })

    await flushAll()
    expect(wrapper.attributes('style')).toContain('min-height: 392px;')
    expect(rendererCache.cache.get('renderer-replacement:math-block:math-replacement-0')).toBe(392)

    // Replace with a completely different, shorter fallback math block.
    // cacheScope and indexKey are unchanged (same Vue component instance).
    // The new raw is NOT a prefix-extension of the old raw, so this is a
    // content replacement, not a streaming append.
    await wrapper.setProps({
      node: {
        type: 'math_block',
        content: 'y',
        raw: '$y$',
        loading: false,
      },
    })
    await flushAll()

    // After clearing, offsetHeight reads 40 (mock returns fallback height
    // when no locked min-height is set). But once we lock to 40, subsequent
    // reads return the locked value. The key assertion: locked min-height
    // must NOT still be 392.
    const style = wrapper.attributes('style') ?? ''
    expect(style).not.toContain('min-height: 392px')

    wrapper.unmount()
  })

  it('preserves lockedMinHeight when content is a streaming append (prefix extension)', async () => {
    // Streaming append to the math block itself: raw grows by prefix extension.
    // lockedMinHeight must be preserved to avoid flicker during streaming.
    mockOffsetHeight(200)

    const rendererCache = createMathBlockMinHeightCache('renderer-append')

    const wrapper = mount(MathBlockNode as any, {
      props: {
        node: {
          type: 'math_block',
          content: 'x',
          raw: '$x$',
          loading: true,
        },
        indexKey: 'math-append-0',
        cacheScope: 'renderer-append',
      },
      global: {
        provide: {
          [MATH_BLOCK_MIN_HEIGHT_CACHE as symbol]: rendererCache,
        },
      },
    })

    await flushAll()
    expect(wrapper.attributes('style')).toContain('min-height: 200px;')

    // Append-only update: raw grows from "$x$" to "$x^2$".
    // This is a prefix extension (nextContent.startsWith(prev)), so
    // lockedMinHeight should be preserved (no clearLockedMinHeight call).
    await wrapper.setProps({
      node: {
        type: 'math_block',
        content: 'x^2',
        raw: '$x^2$',
        loading: true,
      },
    })
    await flushAll()

    // min-height should still be present (preserved across append).
    const appendStyle = wrapper.attributes('style') ?? ''
    expect(appendStyle, `actual style after append: ${JSON.stringify(appendStyle)}`).toContain('min-height: 200px;')
    expect(rendererCache.cache.get('renderer-append:math-block:math-append-0')).toBe(200)

    wrapper.unmount()
  })

  it('does not falsely trigger replacement on normalizeStandaloneBackslashT transformations', async () => {
    // During streaming, the parser's normalizeStandaloneBackslashT may
    // transform content (e.g. "alpha" -> "\\alpha") between parse ticks,
    // even though the user is just appending characters. The `raw` field
    // preserves the original un-normalized input, so checking raw for
    // prefix-extension must NOT trigger a false replacement.
    mockOffsetHeight(180)

    const rendererCache = createMathBlockMinHeightCache('renderer-normalize')

    const wrapper = mount(MathBlockNode as any, {
      props: {
        node: {
          type: 'math_block',
          // Already-normalized content (simulating post-parse state)
          content: 'alph',
          raw: '$alph$',
          loading: true,
        },
        indexKey: 'math-normalize-0',
        cacheScope: 'renderer-normalize',
      },
      global: {
        provide: {
          [MATH_BLOCK_MIN_HEIGHT_CACHE as symbol]: rendererCache,
        },
      },
    })

    await flushAll()
    expect(wrapper.attributes('style')).toContain('min-height: 180px;')

    // Next parse tick: content normalized to "\\alpha" (non-prefix), but
    // raw extended from "$alph$" to "$alpha$" (prefix extension).
    // The raw prefix check correctly identifies this as an append.
    await wrapper.setProps({
      node: {
        type: 'math_block',
        content: '\\alpha',
        raw: '$alpha$',
        loading: true,
      },
    })
    await flushAll()

    // lockedMinHeight preserved: raw was prefix-extended.
    const normalizeStyle = wrapper.attributes('style') ?? ''
    expect(normalizeStyle, `actual style after normalize: ${JSON.stringify(normalizeStyle)}`).toContain('min-height: 180px;')
    expect(rendererCache.cache.get('renderer-normalize:math-block:math-normalize-0')).toBe(180)

    wrapper.unmount()
  })
})

describe('mathBlockNode delimiter pair matrix', () => {
  beforeEach(() => {
    mocks.renderKaTeXWithBackpressure.mockReset()
    mocks.renderKaTeXWithBackpressure.mockImplementation(() => new Promise<string>(() => {}))
  })

  afterEach(() => {
    if (originalOffsetHeightDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeightDescriptor)
    }
  })

  const cases: Array<[string, string, string, boolean]> = [
    ['$$x$$', '$$x^2$$', 'double-dollar', true],
    ['\\[x\\]', '\\[x^2\\]', 'escaped-bracket', true],
    ['\\[x]', '\\[x^2]', 'fallback-close', true],
    ['[x]', '[x^2]', 'plain-bracket', true],
    ['[x\\]', '[x^2\\]', 'plain-bracket-backslash', true],
    ['$x$', '$x^2$', 'inline-dollar', true],
    ['$$alph$$', '$$alpha$$', 'normalize', true],
    ['$$x^2$$', '$$x^3$$', 'replace', false],
    ['$$x$$', '\\[x^2\\]', 'family-change', false],
  ]

  for (const [previousRaw, nextRaw, label, shouldPreserve] of cases) {
    it(`${shouldPreserve ? 'preserves' : 'clears'} lockedMinHeight for ${label}: ${previousRaw} -> ${nextRaw}`, async () => {
      mockOffsetHeight(150)
      const rendererCache = createMathBlockMinHeightCache(`renderer-${label}`)

      const wrapper = mount(MathBlockNode as any, {
        props: {
          node: {
            type: 'math_block',
            content: previousRaw,
            raw: previousRaw,
            loading: true,
          },
          indexKey: `delim-${label}`,
          cacheScope: `renderer-${label}`,
        },
        global: {
          provide: { [MATH_BLOCK_MIN_HEIGHT_CACHE as symbol]: rendererCache },
        },
      })

      await flushAll()
      expect(wrapper.attributes('style')).toContain('min-height: 150px;')

      await wrapper.setProps({
        node: {
          type: 'math_block',
          content: nextRaw,
          raw: nextRaw,
          loading: true,
        },
      })
      await flushAll()

      const style = wrapper.attributes('style') ?? ''
      if (shouldPreserve)
        expect(style, `expected preserved for ${previousRaw} -> ${nextRaw}`).toContain('min-height: 150px;')
      else
        expect(style, `expected cleared for ${previousRaw} -> ${nextRaw}`).not.toContain('min-height: 150px;')

      wrapper.unmount()
    })
  }
})

describe('mathBlockNode virtualization remount cache behavior', () => {
  beforeEach(() => {
    mocks.renderKaTeXWithBackpressure.mockReset()
    mocks.renderKaTeXWithBackpressure.mockImplementation(() => new Promise<string>(() => {}))
  })

  afterEach(() => {
    if (originalOffsetHeightDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeightDescriptor)
    }
  })

  it('restores cached height on remount when cache was preserved', async () => {
    mockOffsetHeight(200)
    const rendererCache = createMathBlockMinHeightCache('renderer-remount')

    const first = mount(MathBlockNode as any, {
      props: {
        node: { type: 'math_block', content: 'x', raw: '$$x$$', loading: true },
        indexKey: 'remount-0',
        cacheScope: 'renderer-remount',
      },
      global: {
        provide: { [MATH_BLOCK_MIN_HEIGHT_CACHE as symbol]: rendererCache },
      },
    })

    await flushAll()
    expect(first.attributes('style')).toContain('min-height: 200px;')
    expect(rendererCache.cache.get('renderer-remount:math-block:remount-0')).toBe(200)
    first.unmount()

    const second = mount(MathBlockNode as any, {
      props: {
        node: { type: 'math_block', content: 'x', raw: '$$x$$', loading: true },
        indexKey: 'remount-0',
        cacheScope: 'renderer-remount',
      },
      global: {
        provide: { [MATH_BLOCK_MIN_HEIGHT_CACHE as symbol]: rendererCache },
      },
    })

    await flushAll()
    expect(second.attributes('style')).toContain('min-height: 200px;')

    second.unmount()
  })

  it('does not restore stale height when remounted with different content after cache clear', async () => {
    let naturalHeight = 392
    mockOffsetHeight((el) => {
      const locked = Number.parseFloat(el.style.minHeight)
      if (Number.isFinite(locked) && locked > 0)
        return locked
      return naturalHeight
    })

    const rendererCache = createMathBlockMinHeightCache('renderer-replace')

    const first = mount(MathBlockNode as any, {
      props: {
        node: { type: 'math_block', content: 'x^2 + y^2', raw: '$$x^2 + y^2$$', loading: false },
        indexKey: 'replace-0',
        cacheScope: 'renderer-replace',
      },
      global: {
        provide: { [MATH_BLOCK_MIN_HEIGHT_CACHE as symbol]: rendererCache },
      },
    })

    await flushAll()
    expect(first.attributes('style')).toContain('min-height: 392px;')
    expect(rendererCache.cache.get('renderer-replace:math-block:replace-0')).toBe(392)
    first.unmount()

    rendererCache.clear()
    naturalHeight = 40

    const second = mount(MathBlockNode as any, {
      props: {
        node: { type: 'math_block', content: 'y', raw: '$$y$$', loading: false },
        indexKey: 'replace-0',
        cacheScope: 'renderer-replace',
      },
      global: {
        provide: { [MATH_BLOCK_MIN_HEIGHT_CACHE as symbol]: rendererCache },
      },
    })

    await flushAll()
    const style = second.attributes('style') ?? ''
    expect(style).not.toContain('min-height: 392px;')

    second.unmount()
  })
})
