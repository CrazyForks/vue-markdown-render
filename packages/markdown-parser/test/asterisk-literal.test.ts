import { describe, expect, it } from 'vitest'
import { collect, textIncludes } from '../../../test/utils/midstate-utils'
import { getMarkdown, parseInlineTokens, parseMarkdownToStructure } from '../src'

const md = getMarkdown('test')

describe('asterisk masking literals', () => {
  it('keeps intraword asterisks as literal text when no closing pair exists', () => {
    const markdown = '某市***项目，公司名称：某某***科技有限公司'
    const nodes = parseInlineTokens([{ type: 'text', content: markdown }] as any[], markdown)

    expect(textIncludes(nodes, '某市***项目')).toBe(true)
    expect(textIncludes(nodes, '某某***科技有限公司')).toBe(true)
    expect(collect(nodes as any, 'strong').length).toBe(0)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })

  it('keeps intraword asterisks literal inside link text', () => {
    const markdown = '某市***项目，公司名称：[某某***科技有限公司]()'
    const nodes = parseMarkdownToStructure(markdown, md)

    expect(textIncludes(nodes, '某市***项目')).toBe(true)
    expect(textIncludes(nodes, '某某***科技有限公司')).toBe(true)
    expect(collect(nodes as any, 'strong').length).toBe(0)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })

  it('keeps intraword double-asterisk literal when strong closing pair is missing', () => {
    const markdown = '请联系某某**科技有限公司办理'
    const nodes = parseInlineTokens([{ type: 'text', content: markdown }] as any[], markdown)

    expect(textIncludes(nodes, '某某**科技有限公司')).toBe(true)
    expect(collect(nodes as any, 'strong').length).toBe(0)
  })

  it('keeps intraword single asterisk literal when no matching close exists', () => {
    const markdown = '品牌名：某*某科技有限公司'
    const nodes = parseInlineTokens([{ type: 'text', content: markdown }] as any[], markdown)

    expect(textIncludes(nodes, '某*某科技有限公司')).toBe(true)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })

  it('does not break normal strong parsing in full markdown pipeline', () => {
    const markdown = 'foo**bar**baz'
    const nodes = parseMarkdownToStructure(markdown, md)

    expect(collect(nodes as any, 'strong').length).toBe(1)
    expect(textIncludes(nodes, 'bar')).toBe(true)
  })

  it('keeps literal intraword asterisks while still parsing nearby strong content', () => {
    const markdown = '某市***项目，重点：**必须完成**'
    const nodes = parseMarkdownToStructure(markdown, md)

    expect(textIncludes(nodes, '某市***项目')).toBe(true)
    expect(collect(nodes as any, 'strong').length).toBe(1)
    expect(textIncludes(nodes, '必须完成')).toBe(true)
  })

  it('keeps literal intraword asterisks in link text while parsing normal strong outside link', () => {
    const markdown = '公司：[某某***科技有限公司]()，状态：**正常**'
    const nodes = parseMarkdownToStructure(markdown, md)

    expect(textIncludes(nodes, '某某***科技有限公司')).toBe(true)
    expect(collect(nodes as any, 'strong').length).toBe(1)
    expect(textIncludes(nodes, '正常')).toBe(true)
  })

  it('treats intraword strong with punctuation as literal in inline fallback', () => {
    const markdown = 'foo**a,b**bar'
    const nodes = parseInlineTokens([{ type: 'text', content: markdown }] as any[], markdown)

    expect(textIncludes(nodes, 'foo**a,b**bar')).toBe(true)
    expect(collect(nodes as any, 'strong').length).toBe(0)
  })

  it('still parses intraword strong when inner content is word-only in inline fallback', () => {
    const markdown = 'foo**abc**bar'
    const nodes = parseInlineTokens([{ type: 'text', content: markdown }] as any[], markdown)

    expect(collect(nodes as any, 'strong').length).toBe(1)
    expect(textIncludes(nodes, 'abc')).toBe(true)
  })

  it('keeps escaped double asterisks as literal text', () => {
    const markdown = '需方：\\*\\*\\*\\*\\*\\*有限公司'
    const nodes = parseInlineTokens([{ type: 'text', content: '需方：******有限公司' }] as any[], markdown)

    expect(textIncludes(nodes, '需方：******有限公司')).toBe(true)
    expect(collect(nodes as any, 'strong').length).toBe(0)
    expect(collect(nodes as any, 'emphasis').length).toBe(0)
  })
})
