import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function firstHtml(nodes: any[]) {
  return nodes.find(n => n.type === 'html_block')
}

describe('html_block parser', () => {
  it('marks unclosed <div> as loading and appends closing tag', () => {
    const md = getMarkdown()
    const nodes = parseMarkdownToStructure('<div>hello', md)
    const html = firstHtml(nodes) as any
    expect(html).toBeDefined()
    expect(html.type).toBe('html_block')
    expect(html.tag).toBe('div')
    expect(html.loading).toBe(true)
    expect(html.content).toContain('</div>')
  })

  it('handles uppercase closing tag case-insensitively', () => {
    const md = getMarkdown()
    const nodes = parseMarkdownToStructure('<DIV>Hi</DIV>', md)
    const html = firstHtml(nodes) as any
    expect(html.loading).toBe(false)
    expect(html.tag).toBe('div')
  })

  it('treats void tags as closed (no loading, no fake close)', () => {
    const md = getMarkdown()
    const nodes = parseMarkdownToStructure('<br>', md)
    const html = firstHtml(nodes) as any
    expect(html.loading).toBe(false)
    expect(String(html.content)).not.toContain('</br>')
  })

  it('treats self-closing first tag as closed', () => {
    const md = getMarkdown()
    const nodes = parseMarkdownToStructure('<img src="/x.png" />', md)
    const html = firstHtml(nodes) as any
    expect(html.loading).toBe(false)
    expect(String(html.content)).toContain('<img')
    expect(String(html.content)).not.toContain('</img>')
  })

  it('does not attempt to close comments/doctypes/PIs', () => {
    const md = getMarkdown()
    const a = firstHtml(parseMarkdownToStructure('<!-- comment -->', md)) as any
    const b = firstHtml(parseMarkdownToStructure('<!DOCTYPE html>', md)) as any
    const c = firstHtml(parseMarkdownToStructure('<?xml version="1.0"?>', md)) as any
    expect(a?.loading).toBe(false)
    expect(b?.loading).toBe(false)
    expect(c?.loading).toBe(false)
  })

  it('keeps outer same-tag html blocks loading until the matching outer close arrives', () => {
    const md = getMarkdown()
    const nodes = parseMarkdownToStructure('<div>outer<div>inner</div>rest', md, { final: false })
    const html = firstHtml(nodes) as any
    expect(html).toBeDefined()
    expect(html.type).toBe('html_block')
    expect(html.tag).toBe('div')
    expect(html.loading).toBe(true)
  })

  it('combines details blocks into a single container node with parsed children', () => {
    const markdown = `<details open>
<summary>Thinking...</summary>
这里是详情

首先。。。。
</details>
`

    const md = getMarkdown('html-block-details-container')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]
    const html = firstHtml(nodes) as any
    const summary = html?.children?.[0]

    expect(nodes).toHaveLength(1)
    expect(html?.tag).toBe('details')
    expect(html?.attrs).toEqual([['open', '']])
    expect(String(html?.raw ?? '')).toBe(markdown)
    expect(String(html?.content ?? '')).toContain('<p>首先。。。。</p>')
    expect(summary?.tag).toBe('summary')
    expect(html?.children?.[1]?.type).toBe('paragraph')
    expect(html?.children?.[2]?.type).toBe('paragraph')
  })

  it('keeps nested details grouped under the outer details container', () => {
    const markdown = `<details open>
<summary>outer</summary>
outer start

<details>
<summary>inner</summary>

inner body
</details>

after inner
</details>`

    for (const final of [false, true]) {
      const md = getMarkdown(`html-block-details-nested-container-${final}`)
      const nodes = parseMarkdownToStructure(markdown, md, { final }) as any[]
      const outer = firstHtml(nodes) as any
      const outerSummary = outer?.children?.find((child: any) => child?.type === 'html_block' && child?.tag === 'summary')
      const inner = outer?.children?.find((child: any) => child?.type === 'html_block' && child?.tag === 'details')

      expect(nodes).toHaveLength(1)
      expect(outer?.tag).toBe('details')
      expect(String(outer?.raw ?? '')).toBe(markdown)
      expect(outerSummary).toBeDefined()
      expect(inner).toBeDefined()
      expect(inner?.children?.[0]?.tag).toBe('summary')
      expect(String(inner?.content ?? '')).toContain('<p>inner body</p>')
    }
  })

  it('keeps complex markdown blocks inside details and preserves the closing newline', () => {
    const markdown = `<details open>
<summary>sum</summary>

- a
- b

> q

\`\`\`js
console.log(1)
\`\`\`

tail
</details>
`

    const md = getMarkdown('html-block-details-complex')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]
    const html = firstHtml(nodes) as any

    expect(nodes).toHaveLength(1)
    expect(html?.tag).toBe('details')
    expect(String(html?.raw ?? '')).toBe(markdown)
    expect(String(html?.content ?? '')).toContain('<ul>')
    expect(String(html?.content ?? '')).toContain('<blockquote>')
    expect(String(html?.content ?? '')).toContain('data-lang="js"')
    expect(String(html?.content ?? '')).toContain('<p>tail</p>')
    expect(html?.children?.map((child: any) => child?.type === 'html_block' ? `${child?.type}:${child?.tag}` : child?.type))
      .toEqual(['html_block:summary', 'list', 'blockquote', 'code_block', 'paragraph'])
  })

  it('parses markdown inside summary into summary children', () => {
    const markdown = `<details open>
<summary>**sum** _x_</summary>

body
</details>
`

    const md = getMarkdown('html-block-details-summary-markdown')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]
    const html = firstHtml(nodes) as any
    const summary = html?.children?.[0]
    const summaryParagraph = summary?.children?.[0]

    expect(nodes).toHaveLength(1)
    expect(summary?.tag).toBe('summary')
    expect(html?.attrs).toEqual([['open', '']])
    expect(summaryParagraph?.children?.[0]?.type).toBe('strong')
    expect(summaryParagraph?.children?.[0]?.children?.[0]?.content).toBe('sum')
    expect(summaryParagraph?.children?.[2]?.type).toBe('emphasis')
    expect(summaryParagraph?.children?.[2]?.children?.[0]?.content).toBe('x')
    expect(html?.children?.[1]?.children?.[0]?.content).toBe('body')
  })

  it('keeps opener content before and after summary as structured children', () => {
    const markdown = `<details open>
lead
<summary>sum</summary>
text
<div>inner</div>

para
</details>
`

    const md = getMarkdown('html-block-details-opener-mixed')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]
    const html = firstHtml(nodes) as any

    expect(nodes).toHaveLength(1)
    expect(html?.attrs).toEqual([['open', '']])
    expect(html?.children?.map((child: any) => child?.type === 'html_block' ? `${child?.type}:${child?.tag}` : child?.type))
      .toEqual(['paragraph', 'html_block:summary', 'paragraph', 'html_block:div', 'paragraph'])
    expect(html?.children?.[0]?.children?.[0]?.content).toBe('lead')
    expect(html?.children?.[1]?.children?.[0]?.children?.[0]?.content).toBe('sum')
    expect(html?.children?.[2]?.children?.[0]?.content).toBe('text')
    expect(html?.children?.[3]?.tag).toBe('div')
    expect(html?.children?.[4]?.children?.[0]?.content).toBe('para')
  })
})
