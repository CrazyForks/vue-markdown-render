import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

describe('image alt parsing regressions', () => {
  it('parses an image when alt text contains inline math with bracket indexes', () => {
    const md = getMarkdown('image-alt-math-bracket-index')
    const input = String.raw`![图 1: 实证概率密度 $X^{(c)}[v,d]$，在示例语料图 $G_{c}$ 中突出显示的节点 v，使用 5000 个独立训练的 GNN 模型实例获得，适用于基于子图匹配的图检索。面板 (b)–(d) 显示了模型初始化后和不同训练阶段的 $X^{(c)}[v,d]$ 的密度。](https://www.baidu.com/img/PCfb_5bf082d29588c07f842ccde3f97243ea.png)`

    const nodes = parseMarkdownToStructure(input, md, { final: true })

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('paragraph')
    const children = (nodes[0] as any).children
    expect(children).toHaveLength(1)
    expect(children[0]).toMatchObject({
      type: 'image',
      src: 'https://www.baidu.com/img/PCfb_5bf082d29588c07f842ccde3f97243ea.png',
      alt: '图 1: 实证概率密度 $X^{(c)}[v,d]$，在示例语料图 $G_{c}$ 中突出显示的节点 v，使用 5000 个独立训练的 GNN 模型实例获得，适用于基于子图匹配的图检索。面板 (b)–(d) 显示了模型初始化后和不同训练阶段的 $X^{(c)}[v,d]$ 的密度。',
      title: null,
      loading: false,
    })
  })

  it('still parses inline math after an image with bracketed math in alt text', () => {
    const md = getMarkdown('image-alt-math-followed-by-math')
    const input = String.raw`![caption $X[v,d]$](https://example.com/image.png) and $y$`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    const children = (nodes[0] as any).children

    expect(children.map((child: any) => child.type)).toEqual(['image', 'text', 'math_inline'])
    expect(children[0]).toMatchObject({
      type: 'image',
      src: 'https://example.com/image.png',
      alt: 'caption $X[v,d]$',
      loading: false,
    })
    expect(children[2]).toMatchObject({
      type: 'math_inline',
      content: 'y',
      loading: false,
    })
  })

  it('keeps image parsing stable while the destination streams in', () => {
    const md = getMarkdown('image-alt-math-streaming-stability')
    const chunks: Array<[string, string[]]> = [
      [String.raw`![caption $X[v,d]$](`, ['image']],
      [String.raw`![caption $X[v,d]$](https://example.com/image.png`, ['image']],
      [String.raw`![caption $X[v,d]$](https://example.com/image.png)`, ['image']],
      [String.raw`![caption $X[v,d]$](https://example.com/image.png) and $y$`, ['image', 'text', 'math_inline']],
    ]

    for (const [chunk, expectedTypes] of chunks) {
      const nodes = parseMarkdownToStructure(chunk, md, { final: false })
      const children = (nodes[0] as any).children
      expect(children.map((child: any) => child.type)).toEqual(expectedTypes)
    }
  })
})
