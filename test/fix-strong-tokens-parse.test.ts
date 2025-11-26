import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

describe('fixStrongTokens plugin (parse-token assertions)', () => {
  it('produces strong token around inner underscore for `a __b_c__ d`', () => {
    const md = getMarkdown('t')
    const content = 'a __b_c__ d'
    const nodes = parseMarkdownToStructure(content, md)
    // top-level should be a paragraph
    const para = nodes[0] as any
    expect(para).toBeDefined()
    expect(para.type).toBe('paragraph')
    const strong = para.children?.find((c: any) => c.type === 'strong')
    expect(strong).toBeDefined()
    const text = strong.children?.[0]
    expect(text).toBeDefined()
    expect(text.type).toBe('text')
    expect(text.content).toBe('b_c')
  })

  it('parses malformed emphasis without throwing and returns tokens', () => {
    const md = getMarkdown('t')
    const content = 'this is *a test * with unmatched star'
    const nodes = parseMarkdownToStructure(content, md)
    // basic sanity: nodes array exists and contains at least one paragraph/inline-derived node
    const emphasis = nodes[0].children?.find((c: any) => c.type === 'emphasis')
    expect(emphasis.type).toBe('emphasis')
    expect(emphasis.children?.[0].content).toBe('a test ')
    expect(emphasis.raw).toBe('*a test *')
  })
})
