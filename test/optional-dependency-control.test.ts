import { afterEach, describe, expect, it, vi } from 'vitest'
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

      let resolve: (value: object) => void = () => {}
      const loader = vi.fn(() =>
        new Promise<object>((r) => {
          resolve = r
        }),
      )

      setInfographicLoader(loader)
      const pending = getInfographic()

      disableInfographic()
      resolve({ Infographic: CustomInfographic })

      await expect(pending).resolves.toBeNull()
      await expect(getInfographic()).resolves.toBeNull()
    })

    it('requires an explicit loader when enabling infographic', () => {
      expect(() => enableInfographic(undefined as any)).toThrow('enableInfographic requires a loader')
    })
  })
})
