import { describe, expect, it } from 'vitest'
import {
  clearGlobalCustomComponents,
  getCustomNodeComponents,
  removeCustomComponents,
  setCustomComponents,
} from '../packages/markstream-angular/src/customComponents'
import {
  disableKatex,
  enableKatex,
  isKatexEnabled,
  setKatexLoader,
} from '../packages/markstream-angular/src/optional/katex'
import {
  disableMermaid,
  enableMermaid,
  isMermaidEnabled,
  setMermaidLoader,
} from '../packages/markstream-angular/src/optional/mermaid'

describe('markstream-angular api parity helpers', () => {
  it('merges global and scoped custom components like react/vue2', () => {
    const GlobalCode = class {}
    const ScopedThinking = class {}

    clearGlobalCustomComponents()
    setCustomComponents({ code_block: GlobalCode as any })
    setCustomComponents('scope-a', { thinking: ScopedThinking as any })

    expect(getCustomNodeComponents()).toMatchObject({
      code_block: GlobalCode,
    })
    expect(getCustomNodeComponents('scope-a')).toMatchObject({
      code_block: GlobalCode,
      thinking: ScopedThinking,
    })

    removeCustomComponents('scope-a')
    clearGlobalCustomComponents()
    expect(getCustomNodeComponents('scope-a')).toEqual({})
  })

  it('supports toggling katex and mermaid loaders', () => {
    const katexLoader = () => ({ renderToString: () => '<span />' })
    const mermaidLoader = () => ({
      render: async () => ({ svg: '<svg />' }),
      initialize() {},
    })

    disableKatex()
    disableMermaid()
    expect(isKatexEnabled()).toBe(false)
    expect(isMermaidEnabled()).toBe(false)

    enableKatex(katexLoader)
    enableMermaid(mermaidLoader)
    expect(isKatexEnabled()).toBe(true)
    expect(isMermaidEnabled()).toBe(true)

    setKatexLoader(null)
    setMermaidLoader(null)
    expect(isKatexEnabled()).toBe(false)
    expect(isMermaidEnabled()).toBe(false)

    enableKatex()
    enableMermaid()
  })
})
