import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function skipComment(source: string, index: number) {
  const end = source.indexOf('*/', index + 2)
  return end === -1 ? source.length : end + 2
}

function skipString(source: string, index: number) {
  const quote = source[index]
  index++
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2
      continue
    }
    if (source[index] === quote)
      return index + 1
    index++
  }
  return index
}

function splitSelectorList(selector: string) {
  const parts: string[] = []
  let start = 0
  let depth = 0

  for (let index = 0; index < selector.length; index++) {
    const char = selector[index]
    if (char === '"' || char === '\'') {
      index = skipString(selector, index) - 1
      continue
    }
    if (char === '(' || char === '[') {
      depth++
    }
    else if (char === ')' || char === ']') {
      depth--
    }
    else if (char === ',' && depth === 0) {
      parts.push(selector.slice(start, index).trim())
      start = index + 1
    }
  }

  parts.push(selector.slice(start).trim())
  return parts.filter(Boolean)
}

function collectCssRules(source: string) {
  const selectors: string[] = []
  const keyframes: string[] = []
  const context: string[] = []
  let index = 0

  while (index < source.length) {
    if (source.startsWith('/*', index)) {
      index = skipComment(source, index)
      continue
    }
    if (/\s/.test(source[index])) {
      index++
      continue
    }

    const start = index
    let depth = 0
    while (index < source.length) {
      if (source.startsWith('/*', index)) {
        index = skipComment(source, index)
        continue
      }
      if (source[index] === '"' || source[index] === '\'') {
        index = skipString(source, index)
        continue
      }
      if (source[index] === '(' || source[index] === '[') {
        depth++
      }
      else if (source[index] === ')' || source[index] === ']') {
        depth--
      }
      else if (depth === 0 && (source[index] === '{' || source[index] === ';' || source[index] === '}')) {
        break
      }
      index++
    }

    const token = source[index]
    const prelude = source.slice(start, index).trim()

    if (token === '{') {
      const keyframeMatch = prelude.match(/^@(?:-\w+-)?keyframes\s+([\w-]+)/)
      if (keyframeMatch) {
        keyframes.push(keyframeMatch[1])
        context.push('keyframes')
      }
      else {
        if (prelude && !prelude.startsWith('@') && context[context.length - 1] !== 'keyframes') {
          selectors.push(...splitSelectorList(prelude))
        }
        context.push(prelude.startsWith('@') ? 'at' : 'rule')
      }
    }
    else if (token === '}') {
      context.pop()
    }

    index++
  }

  return { selectors, keyframes }
}

function isScopedSelector(selector: string) {
  return selector.startsWith(':where(.markstream-react)')
    || selector.startsWith('.markstream-react')
    || selector.startsWith('.dark .markstream-react')
    || selector.startsWith('.dark :where(.markstream-react)')
    || selector === 'body > div[id^="dmermaid-"]'
}

describe('markstream-react css scoping', () => {
  const css = readFileSync(resolve(process.cwd(), 'packages/markstream-react/src/index.css'), 'utf8')

  it('keeps component selectors scoped to the renderer root', () => {
    const { selectors } = collectCssRules(css)
    const unscoped = selectors.filter(selector => !isScopedSelector(selector))

    expect(unscoped).toEqual([])
    expect(css).toContain(':where(.markstream-react) .mode-btn')
    expect(css).toContain(':where(.markstream-react).ms-tooltip')
    expect(css).toContain(':where(.markstream-react).html-preview-frame__backdrop')
    expect(css).toContain(':where(.markstream-react).mermaid-modal-overlay')
  })

  it('keeps keyframe names namespaced', () => {
    const { keyframes } = collectCssRules(css)

    expect(keyframes.filter(name => !name.startsWith('markstream-react-'))).toEqual([])
    expect(new Set(keyframes).size).toBe(keyframes.length)
    expect(css).not.toContain('@keyframes spin')
    expect(css).not.toMatch(/animation(?:-name)?\s*:[^;{}]*(?<!markstream-react-)spin(?![\w-])/)
  })

  it('keeps body portal roots in the renderer scope', () => {
    const portalRoots = [
      ['packages/markstream-react/src/components/CodeBlockNode/HtmlPreviewFrame.tsx', 'markstream-react html-preview-frame__backdrop'],
      ['packages/markstream-react/src/components/InfographicBlockNode/InfographicBlockNode.tsx', 'markstream-react fixed inset-0 z-50'],
      ['packages/markstream-react/src/components/MermaidBlockNode/MermaidBlockNode.tsx', 'markstream-react mermaid-modal-overlay'],
      ['packages/markstream-react/src/components/Tooltip/Tooltip.tsx', 'markstream-react ms-tooltip'],
      ['packages/markstream-react/src/tooltip/singletonTooltip.ts', 'markstream-react ms-tooltip'],
    ]

    for (const [file, marker] of portalRoots) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(source).toContain(marker)
    }
  })
})
