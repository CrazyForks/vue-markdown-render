import { afterEach, describe, expect, it, vi } from 'vitest'
import { disableD2, enableD2, getD2, isD2Enabled, setD2Loader } from '../src/components/D2BlockNode/d2'
import { disableInfographic, enableInfographic, getInfographic, isInfographicEnabled, setInfographicLoader } from '../src/components/InfographicBlockNode/infographic'
import { disableKatex, enableKatex, getKatex, isKatexEnabled, setKatexLoader } from '../src/components/MathInlineNode/katex'
import { disableMermaid, enableMermaid, getMermaid, isMermaidEnabled, setMermaidLoader } from '../src/components/MermaidBlockNode/mermaid'
import { renderKaTeXWithBackpressure } from '../src/workers/katexWorkerClient'
import { canParseOffthread } from '../src/workers/mermaidWorkerClient'

describe('optional dependency controllers', () => {
  describe('katex loader control', () => {
    afterEach(() => {
      enableKatex()
    })

    it('allows overriding and disabling the KaTeX loader', async () => {
      const customRenderer = { renderToString: vi.fn() }
      setKatexLoader(async () => customRenderer)

      const resolved = await getKatex()
      expect(resolved).toBe(customRenderer)
      expect(isKatexEnabled()).toBe(true)

      disableKatex()
      expect(isKatexEnabled()).toBe(false)
      const disabledLoad = await getKatex()
      expect(disabledLoad).toBeNull()
      await expect(renderKaTeXWithBackpressure('x+y', false)).rejects.toMatchObject({ code: 'KATEX_DISABLED' })
    })
  })

  describe('mermaid loader control', () => {
    afterEach(() => {
      enableMermaid()
    })

    it('allows overriding and disabling the mermaid loader', async () => {
      const render = vi.fn()
      const parse = vi.fn()
      const initialize = vi.fn()
      setMermaidLoader(async () => ({ render, parse, initialize }))

      const api = await getMermaid()
      expect(api?.render).toBe(render)
      expect(api?.parse).toBe(parse)
      expect(typeof api?.initialize).toBe('function')

      disableMermaid()
      expect(isMermaidEnabled()).toBe(false)
      const disabled = await getMermaid()
      expect(disabled).toBeNull()
      await expect(canParseOffthread('graph TD;A-->B', 'light')).rejects.toMatchObject({ code: 'MERMAID_DISABLED' })
    })

    it('shares an in-flight mermaid loader request', async () => {
      const render = vi.fn()
      const parse = vi.fn()
      const initialize = vi.fn()
      let resolveLoader: (value: object) => void = () => {}
      const loader = vi.fn(() =>
        new Promise<object>((r) => {
          resolveLoader = r
        }),
      )

      setMermaidLoader(loader)
      const first = getMermaid()
      const second = getMermaid()

      resolveLoader({ render, parse, initialize })

      const firstResolved = await first
      const secondResolved = await second
      expect(firstResolved).toBe(secondResolved)
      expect(firstResolved?.render).toBe(render)
      expect(loader).toHaveBeenCalledTimes(1)
    })

    it('does not cache an in-flight mermaid loader result after disabling', async () => {
      let resolveLoader: (value: object) => void = () => {}
      const loader = vi.fn(() =>
        new Promise<object>((r) => {
          resolveLoader = r
        }),
      )

      setMermaidLoader(loader)
      const pending = getMermaid()

      disableMermaid()
      resolveLoader({ render: vi.fn() })

      await expect(pending).resolves.toBeNull()
      await expect(getMermaid()).resolves.toBeNull()
    })
  })

  describe('d2 loader control', () => {
    afterEach(() => {
      enableD2()
    })

    it('allows overriding and disabling the D2 loader', async () => {
      class CustomD2 {
        compile() {}
      }

      setD2Loader(async () => ({ D2: CustomD2 }))

      const api = await getD2()
      expect(api).toBe(CustomD2)
      expect(isD2Enabled()).toBe(true)

      disableD2()
      expect(isD2Enabled()).toBe(false)
      await expect(getD2()).resolves.toBeNull()
    })

    it('shares an in-flight D2 loader request', async () => {
      class CustomD2 {
        compile() {}
      }
      let resolveLoader: (value: object) => void = () => {}
      const loader = vi.fn(() =>
        new Promise<object>((r) => {
          resolveLoader = r
        }),
      )

      setD2Loader(loader)
      const first = getD2()
      const second = getD2()

      resolveLoader({ D2: CustomD2 })

      await expect(first).resolves.toBe(CustomD2)
      await expect(second).resolves.toBe(CustomD2)
      expect(loader).toHaveBeenCalledTimes(1)
    })

    it('does not cache an in-flight D2 loader result after disabling', async () => {
      class CustomD2 {
        compile() {}
      }
      let resolveLoader: (value: object) => void = () => {}
      const loader = vi.fn(() =>
        new Promise<object>((r) => {
          resolveLoader = r
        }),
      )

      setD2Loader(loader)
      const pending = getD2()

      disableD2()
      resolveLoader({ D2: CustomD2 })

      await expect(pending).resolves.toBeNull()
      await expect(getD2()).resolves.toBeNull()
    })
  })

  describe('infographic loader control', () => {
    afterEach(() => {
      disableInfographic()
    })

    it('keeps infographic disabled by default to avoid bundling optional peer stubs', async () => {
      expect(isInfographicEnabled()).toBe(false)
      await expect(getInfographic()).resolves.toBeNull()
    })

    it('sets and clears the infographic loader through the setter', async () => {
      class CustomInfographic {
        render() {}
      }

      const loader = vi.fn().mockResolvedValue({ Infographic: CustomInfographic })

      setInfographicLoader(loader)

      expect(isInfographicEnabled()).toBe(true)
      await expect(getInfographic()).resolves.toBe(CustomInfographic)
      expect(loader).toHaveBeenCalledTimes(1)

      setInfographicLoader()

      expect(isInfographicEnabled()).toBe(false)
      await expect(getInfographic()).resolves.toBeNull()
    })

    it('allows overriding and disabling the infographic loader', async () => {
      class CustomInfographic {
        render() {}
      }

      setInfographicLoader(async () => ({ Infographic: CustomInfographic }))

      const resolved = await getInfographic()
      expect(resolved).toBe(CustomInfographic)
      expect(isInfographicEnabled()).toBe(true)

      disableInfographic()
      expect(isInfographicEnabled()).toBe(false)
      await expect(getInfographic()).resolves.toBeNull()
    })

    it('does not cache an in-flight loader result after disabling', async () => {
      class CustomInfographic {
        render() {}
      }

      let resolveLoader: (value: object) => void = () => {}
      const loader = vi.fn(() =>
        new Promise<object>((r) => {
          resolveLoader = r
        }),
      )

      setInfographicLoader(loader)
      const pending = getInfographic()

      disableInfographic()
      resolveLoader({ Infographic: CustomInfographic })

      await expect(pending).resolves.toBeNull()
      await expect(getInfographic()).resolves.toBeNull()
    })

    it('shares an in-flight infographic loader request', async () => {
      class CustomInfographic {
        render() {}
      }

      let resolveLoader: (value: object) => void = () => {}
      const loader = vi.fn(() =>
        new Promise<object>((r) => {
          resolveLoader = r
        }),
      )

      setInfographicLoader(loader)
      const first = getInfographic()
      const second = getInfographic()

      resolveLoader({ Infographic: CustomInfographic })

      await expect(first).resolves.toBe(CustomInfographic)
      await expect(second).resolves.toBe(CustomInfographic)
      expect(loader).toHaveBeenCalledTimes(1)
    })

    it('does not cache an invalid infographic module shape', async () => {
      class CustomInfographic {
        render() {}
      }

      const loader = vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ Infographic: CustomInfographic })
      setInfographicLoader(loader)

      await expect(getInfographic()).resolves.toBeNull()
      await expect(getInfographic()).resolves.toBe(CustomInfographic)
      expect(loader).toHaveBeenCalledTimes(2)
    })

    it('requires an explicit loader when enabling infographic', () => {
      expect(() => enableInfographic(undefined as any)).toThrow('enableInfographic requires a loader')
    })
  })
})
