import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

const ADMONITION_KINDS = ['warning', 'info', 'note', 'tip', 'danger', 'caution', 'error'] as const

describe('containers plugin', () => {
  it('renders admonition container via ::: admonition', () => {
    const md = getMarkdown('t')
    const content = `::: note\nThis is a note\n:::`
    const html = md.render(content)
    expect(html).toContain('vmr-container-note')
    expect(html).toContain('This is a note')
  })

  it('renders multiple container types', () => {
    const md = getMarkdown('t')
    const content = `::: warning\nWarn\n:::\n\n::: tip\nTip\n:::`
    const html = md.render(content)
    expect(html).toContain('vmr-container-warning')
    expect(html).toContain('vmr-container-tip')
  })

  it('renders warning block with expected HTML structure', () => {
    const md = getMarkdown('play')
    const content = `::: warning\n这是一个警告块。\n:::`
    const html = md.render(content)
    // exact wrapper class
    expect(html).toContain('class="vmr-container vmr-container-warning"')
    // contains paragraph with content
    expect(html).toContain('<p>这是一个警告块。</p>')
  })

  it('does not emit an empty generic container for a streaming admonition marker', () => {
    const md = getMarkdown('stream-admonition-empty')
    for (const kind of ADMONITION_KINDS) {
      const nodes = parseMarkdownToStructure(`::: ${kind}`, md, { final: false })
      expect(nodes).toEqual([])
    }
    for (const markdown of ['::: warning\n', '::: warning\r\n', '::: warning Title\n']) {
      const nodes = parseMarkdownToStructure(markdown, md, { final: false })
      expect(nodes).toEqual([])
    }
  })

  it('keeps previous content when deferring a streaming admonition marker', () => {
    const md = getMarkdown('stream-admonition-previous-content')
    const nodes = parseMarkdownToStructure('text\n::: warning\n', md, { final: false }) as any[]
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.raw).toBe('text')
  })

  it('defers an empty admonition after body marker cleanup', () => {
    const md = getMarkdown('stream-admonition-empty-body-marker')
    for (const markdown of [
      '::: warning\n-',
      '::: warning\n>',
      '::: warning\n*',
      '::: warning\n1.',
      '::: warning\n1. ',
    ]) {
      const nodes = parseMarkdownToStructure(markdown, md, { final: false })
      expect(nodes).toEqual([])
    }
  })

  it('does not strip a final title-only admonition marker', () => {
    const md = getMarkdown('stream-admonition-final')
    const nodes = parseMarkdownToStructure('::: warning', md, { final: true }) as any[]
    expect(nodes[0]).toEqual(expect.objectContaining({
      type: 'admonition',
      kind: 'warning',
    }))
  })

  it('does not strip admonition-like text inside an open fenced code block', () => {
    const md = getMarkdown('stream-admonition-code-fence')
    for (const markdown of [
      '```md\n::: warning',
      '```md\n::: warning\n-',
    ]) {
      const nodes = parseMarkdownToStructure(markdown, md, { final: false })
      expect(JSON.stringify(nodes)).toContain('::: warning')
    }
  })

  it('does not strip indented code that looks like an admonition marker', () => {
    const md = getMarkdown('stream-admonition-indented-code')
    const nodes = parseMarkdownToStructure('    ::: warning', md, { final: false })
    expect(JSON.stringify(nodes)).toContain('::: warning')
  })

  it('does not strip admonition-like text inside an open custom html block', () => {
    const md = getMarkdown('stream-admonition-custom-block')
    const nodes = parseMarkdownToStructure('<thinking>\n::: warning', md, {
      final: false,
      customHtmlTags: ['thinking'],
    })
    expect(JSON.stringify(nodes)).toContain('::: warning')
  })

  it('does not strip admonition-like text inside an open standard html block', () => {
    for (const [index, markdown] of [
      '<div>\n::: warning',
      '<pre>\n::: warning',
      '<!--\n::: warning',
    ].entries()) {
      const md = getMarkdown(`stream-admonition-standard-html-${index}`)
      const parsedSources: string[] = []
      const parse = md.parse.bind(md)
      md.parse = ((src, env) => {
        parsedSources.push(src)
        return parse(src, env)
      }) as typeof md.parse
      const nodes = parseMarkdownToStructure(markdown, md, {
        final: false,
        streamParse: false,
      })
      expect(parsedSources.some(src => src.includes('::: warning'))).toBe(true)
      if (!markdown.startsWith('<!--'))
        expect(JSON.stringify(nodes)).toContain('::: warning')
    }
  })

  it('parses streaming admonition content as admonition instead of vmr_container', () => {
    const md = getMarkdown('stream-admonition-content')
    const nodes = parseMarkdownToStructure('::: warning\nWarn', md, { final: false }) as any[]
    expect(nodes[0]).toEqual(expect.objectContaining({
      type: 'admonition',
      kind: 'warning',
    }))
    expect(nodes[0]?.children?.[0]?.raw).toBe('Warn')
  })

  it('preserves original markdown inside container', () => {
    const md = getMarkdown('t')
    const content = `::: note-test \n# head text\n:::`
    const tokens = parseMarkdownToStructure(content, md)

    // the raw should contain the markdown `# head text`
    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          raw: expect.stringContaining('#'),
        }),
      ]),
    )
  })
})
