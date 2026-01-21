import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure, processTokens } from '../src'

describe('escapeHtmlTags', () => {
  function walkNodes(nodes: any[], visit: (node: any) => void) {
    for (const node of nodes) {
      if (!node)
        continue
      visit(node)
      if (Array.isArray(node.children))
        walkNodes(node.children, visit)
      if (node.type === 'list' && Array.isArray(node.items))
        walkNodes(node.items, visit)
      if (node.type === 'list_item' && Array.isArray(node.children))
        walkNodes(node.children, visit)
      if (node.type === 'blockquote' && Array.isArray(node.children))
        walkNodes(node.children, visit)
      if (node.type === 'table') {
        if (node.header)
          walkNodes([node.header], visit)
        if (Array.isArray(node.rows))
          walkNodes(node.rows, visit)
      }
      if (node.type === 'table_row' && Array.isArray(node.cells))
        walkNodes(node.cells, visit)
      if (node.type === 'table_cell' && Array.isArray(node.children))
        walkNodes(node.children, visit)
      if (node.type === 'definition_list' && Array.isArray(node.items))
        walkNodes(node.items, visit)
      if (node.type === 'definition_item') {
        if (Array.isArray(node.term))
          walkNodes(node.term, visit)
        if (Array.isArray(node.definition))
          walkNodes(node.definition, visit)
      }
      if (node.type === 'footnote' && Array.isArray(node.children))
        walkNodes(node.children, visit)
      if (node.type === 'admonition' && Array.isArray(node.children))
        walkNodes(node.children, visit)
      if (node.type === 'vmr_container' && Array.isArray(node.children))
        walkNodes(node.children, visit)
    }
  }

  it('renders inline <question> as literal text', () => {
    const md = getMarkdown()
    const nodes = parseMarkdownToStructure('Hello <question> world', md, {
      escapeHtmlTags: ['question'],
      final: true,
    })
    const para = nodes[0] as any
    expect(para.type).toBe('paragraph')
    const text = (para.children ?? [])
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.content)
      .join('')
    expect(text).toBe('Hello <question> world')
    expect((para.children ?? []).some((c: any) => c.type === 'html_inline')).toBe(false)
  })

  it('renders block <question> as a paragraph text node', () => {
    const md = getMarkdown()
    const nodes = parseMarkdownToStructure('<question>', md, {
      escapeHtmlTags: ['question'],
      final: true,
    })
    const para = nodes[0] as any
    expect(para.type).toBe('paragraph')
    expect(para.children?.[0]?.type).toBe('text')
    expect(para.children?.[0]?.content).toBe('<question>')
  })

  it('keeps <question> as literal text in list items', () => {
    const md = getMarkdown()
    const markdown = `- 有一个<question>是：“海曙区有多少座大中型水库”，对应的<answer>说：“海曙区共有以下大中型水库：1. **某某A水库**（大型）2. **某某B水库**（大型）3. **某某C水库**（中型）因此，海曙区共有 **3 座**大中型水库。”`
    const nodes = parseMarkdownToStructure(markdown, md, {
      escapeHtmlTags: ['question'],
      final: true,
    })

    expect(nodes[0]?.type).toBe('list')

    const texts: string[] = []
    const questionHtmlInline: any[] = []
    walkNodes(nodes as any[], (node) => {
      if (node.type === 'text' && typeof node.content === 'string')
        texts.push(node.content)
      if (node.type === 'html_inline' && String(node.tag ?? '').toLowerCase() === 'question')
        questionHtmlInline.push(node)
    })

    expect(questionHtmlInline.length).toBe(0)
    expect(texts.join('')).toContain('<question>')
  })

  it('processTokens also honors escapeHtmlTags', () => {
    const md = getMarkdown()
    const tokens = md.parse('Hello <question> world', {})
    const nodes = processTokens(tokens as any, { escapeHtmlTags: ['question'] } as any) as any[]
    const htmlInlineQuestion: any[] = []
    walkNodes(nodes, (node) => {
      if (node.type === 'html_inline' && String(node.tag ?? '').toLowerCase() === 'question')
        htmlInlineQuestion.push(node)
    })
    expect(htmlInlineQuestion.length).toBe(0)
  })

  it('escapeHtmlTags overrides customHtmlTags', () => {
    const md = getMarkdown(undefined, { customHtmlTags: ['thinking'] })
    const nodes = parseMarkdownToStructure('before <thinking>hi</thinking> after', md, {
      customHtmlTags: ['thinking'],
      escapeHtmlTags: ['thinking'],
      final: true,
    })
    const para = nodes[0] as any
    expect(para.type).toBe('paragraph')
    expect((para.children ?? []).some((c: any) => c.type === 'thinking')).toBe(false)
    const text = (para.children ?? [])
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.content)
      .join('')
    expect(text).toBe('before <thinking>hi</thinking> after')
  })
})
