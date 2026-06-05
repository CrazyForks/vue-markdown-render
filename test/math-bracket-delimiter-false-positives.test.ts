import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

describe('math plugin - bracket delimiter false positives', () => {
  it('consumes escaped closing bracket for plain bracket math blocks', () => {
    const md = getMarkdown('mixed-bracket-close')
    const markdown = `[
e^x = 1 + x + \\frac{x^2}{2}
\\]`

    const nodes = parseMarkdownToStructure(markdown, md, { final: true })
    const mathBlock = nodes.find((node: any) => node.type === 'math_block') as any
    expect(mathBlock?.content).toBe('e^x = 1 + x + \\frac{x^2}{2}')
    expect(JSON.stringify(nodes)).not.toContain('"content":"]"')
  })

  it('keeps list labels separate from following bracket math blocks', () => {
    const md = getMarkdown('list-bracket-math')
    const markdown = `- **指数函数**：
[
e^x = 1 + x + \\frac{x^2}{2}
\\]`

    const nodes = parseMarkdownToStructure(markdown, md, { final: true })
    const list = nodes[0] as any
    const mathBlock = nodes[1] as any

    expect(list?.type).toBe('list')
    expect(mathBlock?.type).toBe('math_block')
    expect(mathBlock?.content).toBe('e^x = 1 + x + \\frac{x^2}{2}')
    expect(JSON.stringify(nodes)).not.toContain('"content":"]"')
  })

  it('should not treat JSON arrays as bracket-math blocks', () => {
    const md = getMarkdown('json-array')
    const markdown = `
[
  { "a": 1 },
  { "b": 2 }
]
`
    const tokens = md.parse(markdown, { __markstreamFinal: true }) as any[]
    expect(tokens.some(t => t?.type === 'math_block')).toBe(false)

    const nodes = parseMarkdownToStructure(markdown, md, { final: true })
    expect(nodes.some(n => n.type === 'math_block')).toBe(false)
  })

  it('should not treat numeric arrays as bracket-math blocks', () => {
    const md = getMarkdown('number-array')
    const markdown = `
[
  1,
  2
]
`
    const tokens = md.parse(markdown, { __markstreamFinal: true }) as any[]
    expect(tokens.some(t => t?.type === 'math_block')).toBe(false)

    const nodes = parseMarkdownToStructure(markdown, md, { final: true })
    expect(nodes.some(n => n.type === 'math_block')).toBe(false)
  })
})
