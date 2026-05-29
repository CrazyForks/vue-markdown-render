import { afterEach, describe, expect, it, vi } from 'vitest'

describe('getKatexSync default-loader guard', () => {
  afterEach(() => {
    delete (globalThis as any).katex
    vi.resetModules()
  })

  it('returns null for default async loader even when globalThis.katex is available', async () => {
    vi.resetModules()
    const { enableKatex, getKatexSync } = await import('../src/components/MathInlineNode/katex')

    ;(globalThis as any).katex = {
      renderToString: () => '<span class="katex">x</span>',
    }

    enableKatex()

    expect(getKatexSync()).toBeNull()
  })

  it('returns null for default async loader even when module cache is populated via getKatex()', async () => {
    vi.resetModules()
    const { enableKatex, getKatex, getKatexSync } = await import('../src/components/MathInlineNode/katex')

    ;(globalThis as any).katex = {
      renderToString: () => '<span class="katex">x</span>',
    }

    enableKatex()

    // Populate the module-level cache via the async path
    await getKatex()

    // getKatexSync must still return null: the default loader is intentionally
    // excluded from the sync fast-path so that SSR and client initial renders
    // always produce the same fallback markup.
    expect(getKatexSync()).toBeNull()
  })
})
