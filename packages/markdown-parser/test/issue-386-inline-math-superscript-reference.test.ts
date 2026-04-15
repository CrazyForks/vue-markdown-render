import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function parse(markdown: string) {
  const md = getMarkdown('issue-386')
  return parseMarkdownToStructure(markdown, md, { final: true }) as any[]
}

function collectByType(value: any, targetType: string): any[] {
  const out: any[] = []
  const walk = (node: any) => {
    if (!node)
      return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (node.type === targetType)
      out.push(node)
    if (Array.isArray(node.children))
      node.children.forEach(walk)
    if (Array.isArray(node.items))
      node.items.forEach(walk)
  }
  walk(value)
  return out
}

describe('issue #386 inline math suffix regressions', () => {
  it('keeps superscript syntax immediately after inline math', () => {
    const nodes = parse('$2.897771955 times 10^{-3}text{m·K}$^[1]^')
    const paragraph = nodes[0] as any

    expect(paragraph?.type).toBe('paragraph')
    expect(paragraph?.children?.map((child: any) => child.type)).toEqual([
      'math_inline',
      'superscript',
    ])
    expect(paragraph?.children?.[1]?.children?.map((child: any) => child.content).join('')).toBe('[1]')

    const textNodes = collectByType(paragraph, 'text')
    expect(textNodes.some((node: any) => node.content === '^[1]^')).toBe(false)
  })

  it('keeps footnote references immediately after inline math', () => {
    const nodes = parse('$x$[^1]\n\n[^1]: note')
    const paragraph = nodes[0] as any

    expect(paragraph?.type).toBe('paragraph')
    expect(paragraph?.children?.map((child: any) => child.type)).toEqual([
      'math_inline',
      'footnote_reference',
    ])
    expect(paragraph?.children?.[1]?.id).toBe('1')

    const footnotes = collectByType(nodes, 'footnote')
    expect(footnotes).toHaveLength(1)
    expect(footnotes[0]?.id).toBe('1')
    expect(collectByType(footnotes[0], 'text').some((node: any) => node.content === 'note')).toBe(true)
  })

  it('preserves brackets inside sup html content', () => {
    const nodes = parse('测试<sup>[3]</sup>。')
    const paragraph = nodes[0] as any
    const htmlInline = collectByType(paragraph, 'html_inline')[0] as any

    expect(htmlInline).toBeDefined()
    expect(htmlInline.content).toBe('<sup>[3]</sup>')
    expect(htmlInline.children?.[0]?.type).toBe('reference')
    expect(htmlInline.children?.[0]?.raw).toBe('[3]')
  })

  it('preserves brackets inside generic inline html content', () => {
    const nodes = parse('<span>[3]</span>')
    const paragraph = nodes[0] as any
    const htmlInline = collectByType(paragraph, 'html_inline')[0] as any

    expect(htmlInline).toBeDefined()
    expect(htmlInline.content).toBe('<span>[3]</span>')
    expect(htmlInline.children?.[0]?.type).toBe('reference')
    expect(htmlInline.children?.[0]?.raw).toBe('[3]')
  })
})
