import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function collectText(value: any): string {
  if (!value || typeof value !== 'object')
    return ''
  if (value.type === 'text')
    return String(value.content ?? '')
  if (Array.isArray(value))
    return value.map(collectText).join('')
  return collectText(value.children)
}

describe('issue 561: strong text after CJK text', () => {
  it.each([true, false])('preserves all text when final=%s', (final) => {
    const markdown = '了**《中华人民共和国大气污染防治法》第四十八条**：'
    const nodes = parseMarkdownToStructure(markdown, getMarkdown(`issue-561-${final}`), { final }) as any[]
    const children = nodes[0].children

    expect(children).toHaveLength(3)
    expect(children[0]).toMatchObject({ type: 'text', content: '了' })
    expect(children[1]).toMatchObject({
      type: 'strong',
      raw: '**《中华人民共和国大气污染防治法》第四十八条**',
    })
    expect(children[1].children[0]).toMatchObject({
      type: 'text',
      content: '《中华人民共和国大气污染防治法》第四十八条',
    })
    expect(children[2]).toMatchObject({ type: 'text', content: '：' })
  })

  it.each([true, false])('preserves Han text immediately after the closing marker when final=%s', (final) => {
    const markdown = '了**《法》**后'
    const nodes = parseMarkdownToStructure(markdown, getMarkdown(`issue-561-trailing-han-${final}`), { final })

    expect(collectText(nodes)).toBe('了《法》后')
    expect(nodes[0].children.filter((child: any) => child.type === 'strong')).toHaveLength(1)
  })

  it.each([
    ['了**「法」**：', '了「法」：'],
    ['了**『法』**：', '了『法』：'],
    ['了**【法】**：', '了【法】：'],
    ['了**（法）**：', '了（法）：'],
    ['了**“法”**：', '了“法”：'],
  ])('preserves text for opening punctuation variant %s', (markdown, expected) => {
    const nodes = parseMarkdownToStructure(markdown, getMarkdown('issue-561-opening-punctuation'), { final: true })

    expect(collectText(nodes)).toBe(expected)
    expect(nodes[0].children.filter((child: any) => child.type === 'strong')).toHaveLength(1)
  })

  it('preserves a strong label when the affected text is inside a link', () => {
    const markdown = '了[**《法》**](https://example.com)：'
    const nodes = parseMarkdownToStructure(markdown, getMarkdown('issue-561-link'), { final: true })

    expect(collectText(nodes)).toBe('了《法》：')
    expect(nodes[0].children.find((child: any) => child.type === 'link')?.children[0]).toMatchObject({
      type: 'strong',
      raw: '**《法》**',
    })
  })

  it('keeps adjacent emphasis content intact as a related inline edge case', () => {
    const markdown = '了*《法》*：'
    const nodes = parseMarkdownToStructure(markdown, getMarkdown('issue-561-emphasis'), { final: true })

    expect(collectText(nodes)).toBe('了《法》：')
    expect(nodes[0].children).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'emphasis', raw: '*《法》*' }),
    ]))
  })
})
