import { describe, expect, it } from 'vitest'
import { hasCompleteHtmlTagContent } from '../packages/markstream-angular/src/components/shared/node-helpers'
import {
  coerceBuiltinHtmlNode,
  coerceCustomHtmlNode,
  resolveNodeOutletCodeMode,
  resolveNodeOutletCustomInputs,
} from '../packages/markstream-angular/src/components/shared/node-outlet-helpers'

describe('markstream-angular NodeOutlet', () => {
  it('coerces custom html tags into tag-typed nodes for custom components', () => {
    const node = {
      type: 'html_block',
      tag: 'thinking',
      content: '<thinking>inner body</thinking>',
      raw: '<thinking>inner body</thinking>',
    } as any

    expect((coerceCustomHtmlNode(node) as any).type).toBe('thinking')
    expect((coerceCustomHtmlNode(node) as any).tag).toBe('thinking')
    expect((coerceCustomHtmlNode(node) as any).content).toBe('inner body')
    expect((coerceBuiltinHtmlNode(node, 'html_block') as any).type).toBe('html_block')
    expect((coerceBuiltinHtmlNode(node, 'html_block') as any).content).toBe('<thinking>inner body</thinking>')
  })

  it('preserves standard html wrappers for builtin html nodes', () => {
    const node = {
      type: 'html_block',
      tag: 'details',
      content: '<details><summary>More</summary><p>Body</p></details>',
      raw: '<details><summary>More</summary><p>Body</p></details>',
    } as any

    expect((coerceBuiltinHtmlNode(node, 'html_block') as any).content).toBe('<details><summary>More</summary><p>Body</p></details>')
  })

  it('only escapes malformed unknown html tags', () => {
    expect(hasCompleteHtmlTagContent('<question>ok</question>', 'question')).toBe(true)
    expect(hasCompleteHtmlTagContent('<question>ok', 'question')).toBe(false)
  })

  it('routes heavy node props by code block mode', () => {
    const context = {
      codeBlockProps: { showHeader: false },
      mermaidProps: { renderDebounceMs: 180 },
      d2Props: { themeId: 7 },
      infographicProps: { showHeader: false },
      events: {},
    }

    let node = {
      type: 'code_block',
      language: 'mermaid',
      code: 'graph TD\nA-->B\n',
    } as any
    expect(resolveNodeOutletCodeMode(node, context as any)).toBe('mermaid')
    expect(resolveNodeOutletCustomInputs(node, context as any)).toEqual({ renderDebounceMs: 180 })

    node = {
      type: 'code_block',
      language: 'd2',
      code: 'a -> b',
    } as any
    expect(resolveNodeOutletCodeMode(node, context as any)).toBe('d2')
    expect(resolveNodeOutletCustomInputs(node, context as any)).toEqual({ themeId: 7 })

    node = {
      type: 'code_block',
      language: 'infographic',
      code: 'infographic list-row-simple-horizontal-arrow',
    } as any
    expect(resolveNodeOutletCodeMode(node, context as any)).toBe('infographic')
    expect(resolveNodeOutletCustomInputs(node, context as any)).toEqual({ showHeader: false })

    node = {
      type: 'code_block',
      language: 'ts',
      code: 'const value = 1',
    } as any
    expect(resolveNodeOutletCodeMode(node, context as any)).toBe('code')
    expect(resolveNodeOutletCustomInputs(node, context as any)).toEqual({ showHeader: false })
  })
})
