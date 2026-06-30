import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

const markdown = [
  '# Title',
  '',
  'Paragraph text',
  '',
  '- one',
  '- two',
  '',
  '```ts',
  'const x = 1',
  '```',
  '',
  '---',
].join('\n')

describe('node source map metadata', () => {
  it('keeps node shapes unchanged by default', () => {
    const nodes = parseMarkdownToStructure(markdown, getMarkdown('source-map-default'), {
      final: true,
      streamParse: false,
    }) as any[]

    expect(nodes.map(node => node.sourceMap)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ])
  })

  it('attaches opt-in source line ranges to top-level block nodes', () => {
    const nodes = parseMarkdownToStructure(markdown, getMarkdown('source-map-enabled'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes.map(node => [node.type, node.sourceMap])).toEqual([
      ['heading', { startLine: 0, endLine: 1 }],
      ['paragraph', { startLine: 2, endLine: 3 }],
      ['list', { startLine: 4, endLine: 7 }],
      ['code_block', { startLine: 7, endLine: 10 }],
      ['thematic_break', { startLine: 11, endLine: 12 }],
    ])
    expect(nodes[3].startLine).toBe(7)
    expect(nodes[3].endLine).toBe(10)
  })

  it('maps ranges back to caller source lines after custom tag preprocessing', () => {
    const nodes = parseMarkdownToStructure([
      'Alpha',
      '<thinking>hi</thinking>',
      '',
      '## Next',
    ].join('\n'), getMarkdown('source-map-custom-tags'), {
      customHtmlTags: ['thinking'],
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes.map(node => [node.type, node.sourceMap])).toEqual([
      ['paragraph', { startLine: 0, endLine: 1 }],
      ['paragraph', { startLine: 1, endLine: 2 }],
      ['heading', { startLine: 3, endLine: 4 }],
    ])
  })

  it('attaches source maps to admonition containers', () => {
    const nodes = parseMarkdownToStructure('::: tip Title\nBody\n:::', getMarkdown('source-map-container'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes.map(node => [node.type, node.sourceMap])).toEqual([
      ['admonition', { startLine: 0, endLine: 2 }],
    ])
  })

  it('preserves source maps when postTransformTokens returns tokens', () => {
    const nodes = parseMarkdownToStructure('# Title\n\nParagraph text', getMarkdown('source-map-post-transform'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
      postTransformTokens: tokens => tokens,
    }) as any[]

    expect(nodes.map(node => [node.type, node.sourceMap])).toEqual([
      ['heading', { startLine: 0, endLine: 1 }],
      ['paragraph', { startLine: 2, endLine: 3 }],
    ])
  })

  it('maps source ranges across math newline preprocessing that collapses lines', () => {
    const nodes = parseMarkdownToStructure('x\nabla', getMarkdown('source-map-math-collapse'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes[0]?.sourceMap).toEqual({ startLine: 0, endLine: 2 })
  })

  it('keeps source maps on paragraph nodes promoted from inline custom tags', () => {
    const nodes = parseMarkdownToStructure('<br><thinking>hi</thinking>', getMarkdown('source-map-promoted-custom', {
      customHtmlTags: ['thinking'],
    }), {
      customHtmlTags: ['thinking'],
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes.map(node => [node.type, node.sourceMap])).toEqual([
      ['paragraph', { startLine: 0, endLine: 1 }],
      ['thinking', { startLine: 0, endLine: 1 }],
    ])
  })

  it('updates sourceMap when details html blocks are merged', () => {
    const source = [
      '<details>',
      '<summary>Title</summary>',
      '',
      'Body',
      '</details>',
    ].join('\n')

    const nodes = parseMarkdownToStructure(source, getMarkdown('source-map-details'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes[0]?.sourceMap).toEqual({ startLine: 0, endLine: 5 })
  })

  it('updates sourceMap when split top-level html blocks are merged', () => {
    const source = [
      '<span>',
      '',
      '- item',
      '',
      '</span>',
    ].join('\n')

    const nodes = parseMarkdownToStructure(source, getMarkdown('source-map-html-merge'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes[0]?.sourceMap).toEqual({ startLine: 0, endLine: 5 })
  })

  it('attaches sourceMap to standalone html documents', () => {
    const source = [
      '<html>',
      '<body>',
      'Document',
      '</body>',
      '</html>',
    ].join('\n')

    const nodes = parseMarkdownToStructure(source, getMarkdown('source-map-standalone-html'), {
      final: true,
      includeSourceMap: true,
      streamParse: false,
    }) as any[]

    expect(nodes[0]?.sourceMap).toEqual({ startLine: 0, endLine: 5 })
  })
})
