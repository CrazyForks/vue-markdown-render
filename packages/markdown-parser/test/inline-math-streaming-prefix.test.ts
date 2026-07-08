import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function collectByType(nodes: any, type: string, out: any[] = []) {
  if (!nodes)
    return out
  if (Array.isArray(nodes)) {
    nodes.forEach(node => collectByType(node, type, out))
    return out
  }
  if (nodes.type === type)
    out.push(nodes)
  if (Array.isArray(nodes.children))
    nodes.children.forEach((child: any) => collectByType(child, type, out))
  if (Array.isArray(nodes.items))
    nodes.items.forEach((item: any) => collectByType(item, type, out))
  return out
}

describe('inline math streaming prefix', () => {
  it('does not leave the escaped opener as text before loading paren math after a softbreak', () => {
    const md = getMarkdown('inline-math-streaming-prefix')
    const input = '如果考虑多个向量，正文补空间的概念可以扩展。\n\\(W = \\operatorname{span}\\{\\boldsy'
    const nodes = parseMarkdownToStructure(input, md, { final: false }) as any[]
    const text = collectByType(nodes, 'text').map((node: any) => node.content).join('')
    const math = collectByType(nodes, 'math_inline')

    expect(text).toBe('如果考虑多个向量，正文补空间的概念可以扩展。\n')
    expect(math).toHaveLength(1)
    expect(math[0]).toMatchObject({
      type: 'math_inline',
      content: 'W = \\operatorname{span}\\{\\boldsy',
      loading: true,
      markup: '\\(\\)',
    })
  })
})
