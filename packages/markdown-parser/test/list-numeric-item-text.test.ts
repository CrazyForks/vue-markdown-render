import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

describe('list numeric item text', () => {
  it('keeps numeric-only unordered list item text nodes', () => {
    const md = getMarkdown('list-numeric-item-text')
    const markdown = Array.from({ length: 9 }, (_, index) => `- ${index + 1}`).join('\n')

    const nodes = parseMarkdownToStructure(markdown, md, { final: true })
    const list = nodes[0] as any

    expect(list.type).toBe('list')
    expect(list.items.map((item: any) => item.children[0]?.children[0]?.content)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
    ])
  })
})
