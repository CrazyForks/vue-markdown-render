import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'
import { collect, hasNode, textIncludes } from './utils/midstate-utils'

describe('html inline streaming mid-states', () => {
  const md = getMarkdown('html-inline-midstates')
  const mdCustom = getMarkdown('html-inline-custom', { customHtmlTags: ['thinking'] })

  it('suppresses partial opening tags in text tokens', () => {
    const nodes = parseMarkdownToStructure('x <span class="a"', md)
    const p = collect(nodes, 'paragraph')[0] as any
    expect(p).toBeTruthy()
    expect(textIncludes(p, 'x')).toBe(true)
    expect(textIncludes(p, '<span')).toBe(false)
  })

  it('suppresses partial opening tags without attrs', () => {
    const nodes = parseMarkdownToStructure('x <span', md)
    const p = collect(nodes, 'paragraph')[0] as any
    expect(p).toBeTruthy()
    expect(textIncludes(p, 'x')).toBe(true)
    expect(textIncludes(p, '<span')).toBe(false)
  })

  it('supports custom inline tags for mid-state suppression', () => {
    const nodes = parseMarkdownToStructure('x <thinking foo="bar"', mdCustom)
    expect(textIncludes(nodes, '<thinking')).toBe(false)
  })

  it('suppresses partial opening tags when ">" appears inside quotes', () => {
    const nodes = parseMarkdownToStructure('x <a href="https://example.com?q=a>b', md)
    expect(textIncludes(nodes, 'x')).toBe(true)
    expect(textIncludes(nodes, '<a')).toBe(false)
    expect(hasNode(nodes, 'link')).toBe(false)
  })

  it('suppresses partial custom tags when adjacent to text', () => {
    const nodes = parseMarkdownToStructure('x<thinking foo="bar"', mdCustom)
    expect(textIncludes(nodes, '<thinking')).toBe(false)
    expect(textIncludes(nodes, 'x')).toBe(true)
  })

  it('suppresses partial tag when line starts with "<tag"', () => {
    const nodes = parseMarkdownToStructure('<span class="a"', md)
    expect(textIncludes(nodes, '<span')).toBe(false)
  })

  it('suppresses partial closing when line starts with "</tag"', () => {
    const nodes = parseMarkdownToStructure('</sp', md)
    expect(textIncludes(nodes, '</sp')).toBe(false)
  })

  it('allows html_inline once tag_open is complete', () => {
    const nodes = parseMarkdownToStructure('x <span class="a">hello', md)
    expect(hasNode(nodes, 'html_inline')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(html.loading).toBe(true)
    expect(textIncludes(html.children, '<span')).toBe(false)
  })

  it('auto-closes custom tags as html_inline and keeps loading', () => {
    const nodes = parseMarkdownToStructure('x <thinking>hi', mdCustom, { customHtmlTags: ['thinking'] })
    expect(hasNode(nodes, 'thinking')).toBe(true)
    const thinking = collect(nodes, 'thinking')[0] as any
    expect(thinking.loading).toBe(true)
    expect(thinking.autoClosed).toBe(true)
    expect(thinking.content).toContain('hi')
  })

  it('suppresses partial opening tag when adjacent to text', () => {
    const nodes = parseMarkdownToStructure('x<span class="a"', md)
    expect(textIncludes(nodes, 'x')).toBe(true)
    expect(textIncludes(nodes, '<span')).toBe(false)
  })

  it('parses html_inline when adjacent to text and tag_open is complete', () => {
    const nodes = parseMarkdownToStructure('x<span class="a">hello', md)
    expect(hasNode(nodes, 'html_inline')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(html.loading).toBe(true)
    expect(textIncludes(html.children, '<span')).toBe(false)
    expect(textIncludes(nodes, 'x')).toBe(true)
    expect(textIncludes(nodes, 'hello')).toBe(true)
  })

  it('filters partial closing tags when tag is adjacent to text', () => {
    const nodes = parseMarkdownToStructure('x<span>hello</sp', md)
    expect(hasNode(nodes, 'html_inline')).toBe(true)
    expect(textIncludes(nodes, 'hello')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(textIncludes(html.children, '</sp')).toBe(false)
    expect(html.loading).toBe(true)
    expect(textIncludes(html.children, '<span>')).toBe(false)
    expect(textIncludes(html.children, '</sp')).toBe(false)
  })

  it('filters partial closing tags from html_inline content', () => {
    const nodes = parseMarkdownToStructure('x <span>hello</sp', md)
    expect(hasNode(nodes, 'html_inline')).toBe(true)
    expect(textIncludes(nodes, 'hello')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(textIncludes(html.children, '</sp')).toBe(false)
    expect(html.loading).toBe(true)
    expect(textIncludes(html.children, '<span>')).toBe(false)
    expect(textIncludes(html.children, '</sp')).toBe(false)
  })

  it('finalizes html_inline when closing tag completes', () => {
    const nodes = parseMarkdownToStructure('x <span>hello</span>', md)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(html).toBeTruthy()
    expect(html.loading).toBe(false)
    expect(html.content).toContain('</span>')
  })
  it('filters partial closing tags from html_inline content with attrs', () => {
    const nodes = parseMarkdownToStructure('x <span style="color: red">我是 span 元素标签</', md)
    expect(hasNode(nodes, 'html_inline')).toBe(true)
    expect(textIncludes(nodes, 'x ')).toBe(true)
    expect(textIncludes(nodes, '我是 span 元素标签')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(textIncludes(html.children, '</')).toBe(false)
  })
  it('filters partial closing tags from html_inline content with attrs -1', () => {
    const nodes = parseMarkdownToStructure('x<span style="color: red">我是 span 元素标签', md)
    expect(hasNode(nodes, 'html_inline')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(html.loading).toBe(true)
    expect(textIncludes(html.children, '<span')).toBe(false)
    expect(textIncludes(nodes, 'x')).toBe(true)
    expect(textIncludes(nodes, '我是 span 元素标签')).toBe(true)
    expect(textIncludes(html.children, '</')).toBe(false)
  })

  it('suppresses bare closing prefix "</" while typing', () => {
    const nodes = parseMarkdownToStructure('x <span>hello</', md)
    expect(textIncludes(nodes, 'hello')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(textIncludes(html.children, '</')).toBe(false)
  })

  it('suppresses trailing "<" while typing', () => {
    const nodes = parseMarkdownToStructure('x <', md)
    const p = collect(nodes, 'paragraph')[0] as any
    expect(p).toBeTruthy()
    expect(textIncludes(p, 'x')).toBe(true)
    expect(textIncludes(p, '<')).toBe(false)
  })

  it('handles list item with partial closing tag', () => {
    const nodes = parseMarkdownToStructure('- x <span style="color: red">xxx</sp\n', md)
    // list mid-state tolerance: might be list or paragraph depending on parser rules
    expect(textIncludes(nodes, 'x')).toBe(true)
    expect(hasNode(nodes, 'html_inline')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(textIncludes(html.children, '</sp')).toBe(false)
  })

  it('handles list item with partial opening tag', () => {
    const nodes = parseMarkdownToStructure('- x <span style="color: red"\n', md)
    expect(textIncludes(nodes, 'x')).toBe(true)
    expect(textIncludes(nodes, '<span')).toBe(false)
  })

  it('handles list item with partial opening tag-1', () => {
    const nodes = parseMarkdownToStructure('- x<span style="color: red"\n', md)
    expect(textIncludes(nodes, 'x')).toBe(true)
    expect(textIncludes(nodes, '<span')).toBe(false)
  })

  it('handles list item with partial opening tag-2', () => {
    const nodes = parseMarkdownToStructure('- x<span style="color: red">hihi', md)
    expect(textIncludes(nodes, 'x')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(html.loading).toBe(true)
    expect(textIncludes(html.children, '<span')).toBe(false)
    expect(textIncludes(nodes, 'hihi')).toBe(true)
  })

  it('handles list item with partial opening tag-3', () => {
    const nodes = parseMarkdownToStructure('- x<span style="color: red">hihi</', md)
    expect(textIncludes(nodes, 'x')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(html.loading).toBe(true)
    expect(textIncludes(html.children, '<span')).toBe(false)
    expect(textIncludes(html.children, '</')).toBe(false)
    expect(textIncludes(nodes, 'hihi')).toBe(true)
  })

  it('handles table cell with partial opening tag', () => {
    const markdown = `| a | b |\n| - | - |\n| x <span class="a" | y |`
    const nodes = parseMarkdownToStructure(markdown, md)
    expect(hasNode(nodes, 'table')).toBe(true)
    expect(textIncludes(nodes, '<span')).toBe(false)
  })

  it('handles table cell with partial closing tag', () => {
    const markdown = `| a |\n| - |\n| x <span>y</sp |`
    const nodes = parseMarkdownToStructure(markdown, md)
    expect(hasNode(nodes, 'table')).toBe(true)
    expect(hasNode(nodes, 'html_inline')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(textIncludes(html.children, '</sp')).toBe(false)
  })

  it('handles table cell with partial closing tag -1', () => {
    const markdown = `| a |\n| - |\n| x<span>y</sp |`
    const nodes = parseMarkdownToStructure(markdown, md)
    expect(hasNode(nodes, 'table')).toBe(true)
    expect(hasNode(nodes, 'html_inline')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(textIncludes(html.children, '</sp')).toBe(false)
  })

  it('handles table cell with partial closing tag -2', () => {
    const markdown = `| a |\n| - |\n| x<span style="color: red">y |`
    const nodes = parseMarkdownToStructure(markdown, md)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(html.loading).toBe(true)
    expect(textIncludes(html.children, '<span')).toBe(false)
    expect(textIncludes(nodes, 'x')).toBe(true)
    expect(hasNode(nodes, 'table')).toBe(true)
    expect(hasNode(nodes, 'html_inline')).toBe(true)
    expect(textIncludes(html.children, '</sp')).toBe(false)
  })
})
