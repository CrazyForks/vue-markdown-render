import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function collect(nodes: any, type: string): any[] {
  const out: any[] = []
  const walk = (node: any) => {
    if (!node)
      return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (node.type === type)
      out.push(node)
    for (const key of ['children', 'items', 'rows', 'cells']) {
      if (Array.isArray(node[key]))
        node[key].forEach(walk)
    }
  }
  walk(nodes)
  return out
}

describe('math block streaming close handling', () => {
  it('does not keep a standalone plain ] close line inside \\[ math content', () => {
    const md = getMarkdown('math-block-streaming-plain-close')
    const markdown = String.raw`- **矩阵：**

\[
\begin{bmatrix}
2x_2 - 8x_3 = 8 \\
5x_1 - 5x_3 = 10
\end{bmatrix}
]`

    const nodes = parseMarkdownToStructure(markdown, md, {
      final: false,
      streamParse: true,
    }) as any[]
    const mathBlocks = collect(nodes, 'math_block')
    const textNodes = collect(nodes, 'text')

    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].loading).toBe(false)
    expect(mathBlocks[0].content).toContain('\\end{bmatrix}')
    expect(mathBlocks[0].content).not.toMatch(/\]\s*$/)
    expect(textNodes.map(node => node.content)).not.toContain(']')
  })
})
