/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

// SSR import smoke test: importing the library entry should not throw in Node.
describe('ssr import safety', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('@antv/infographic')
  })

  it('does not import @antv/infographic when importing public entry', async () => {
    let imported = false

    vi.doMock('@antv/infographic', () => {
      imported = true
      return {
        default: class {
          render() {}
        },
      }
    })

    const mod = await import('../src/exports')

    expect(mod).toBeTruthy()
    expect(imported).toBe(false)
  })

  it('can import library entry without throwing', async () => {
    let mod: any = null
    let threw = false

    try {
      mod = await import('../src/exports')
    }
    catch (e) {
      threw = true
      console.error('Import threw:', e)
    }

    expect(threw).toBe(false)
    expect(mod).toBeTruthy()
    expect(
      typeof mod.default === 'object'
      || typeof mod.VueRendererMarkdown !== 'undefined'
      || Object.keys(mod).length > 0,
    ).toBe(true)
  })
})
