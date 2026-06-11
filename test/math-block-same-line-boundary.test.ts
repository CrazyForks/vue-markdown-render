import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

function collectByType(nodes: any, type: string, out: any[] = [], seen = new WeakSet<object>()) {
  if (!nodes)
    return out

  if (Array.isArray(nodes)) {
    for (const node of nodes)
      collectByType(node, type, out, seen)
    return out
  }

  if (typeof nodes === 'object') {
    if (seen.has(nodes))
      return out
    seen.add(nodes)

    if (nodes.type === type)
      out.push(nodes)

    for (const value of Object.values(nodes))
      collectByType(value, type, out, seen)
  }

  return out
}

describe('math block same-line boundary package entry smoke test', () => {
  it('preserves prefix math, display math, and suffix math through package entry', () => {
    const md = getMarkdown('root-smoke-math-boundary')

    const source = [
      'Before $a$ and display $$',
      'E=mc^2',
      '$$ where $x$ follows.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(source, md, { final: true }) as any[]

    expect(nodes.map((node: any) => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('E=mc^2')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content)).toEqual(['a', 'x'])
  })

  it('preserves bracket tolerant display math through package entry', () => {
    const md = getMarkdown('root-smoke-bracket-math-boundary')

    const source = [
      'Before $a$ and bracket display \\[',
      'x + y = z',
      '\\] where $z$ follows.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(source, md, { final: true }) as any[]

    expect(nodes.map((node: any) => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('x + y = z')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content)).toEqual(['a', 'z'])
  })
})
