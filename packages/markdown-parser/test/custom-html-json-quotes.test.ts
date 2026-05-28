import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

const customDataChunks = [
  '<custom-data>{"',
  'type":"fileinfo',
  '","filename":"技能',
  '市场产品',
  '需求文档.md',
  '","url":"/',
  'center',
  '/cke',
  'Api',
  '/api/tools',
  '/file/download?',
  'fileId=',
  '67e',
  '3e',
  '46',
  'd-f',
  '962',
  '-459',
  'd',
  '-a03',
  'd',
  '-366',
  'a0',
  'af5',
  'eb69',
  '"}</custom-data',
  '>',
]

function findNodeByType(nodes: any[], type: string): any | undefined {
  for (const node of nodes) {
    if (node?.type === type)
      return node
    if (Array.isArray(node?.children)) {
      const found = findNodeByType(node.children, type)
      if (found)
        return found
    }
    if (Array.isArray(node?.items)) {
      const found = findNodeByType(node.items, type)
      if (found)
        return found
    }
  }
}

describe('custom HTML JSON content', () => {
  it('preserves straight JSON quotes inside a streamed custom tag', () => {
    const tags = ['custom-data']
    const md = getMarkdown('custom-html-json-quotes-streaming', { customHtmlTags: tags })
    let content = ''

    for (const chunk of customDataChunks) {
      content += chunk
      const nodes = parseMarkdownToStructure(content, md, { customHtmlTags: tags, final: false }) as any[]
      const customData = findNodeByType(nodes, 'custom-data')
      if (!customData?.content)
        continue

      expect(String(customData.content)).not.toContain('“')
      expect(String(customData.content)).not.toContain('”')
    }

    const nodes = parseMarkdownToStructure(content, md, { customHtmlTags: tags, final: true }) as any[]
    const customData = findNodeByType(nodes, 'custom-data')
    expect(customData?.content).toBe('{"type":"fileinfo","filename":"技能市场产品需求文档.md","url":"/center/ckeApi/api/tools/file/download?fileId=67e3e46d-f962-459d-a03d-366a0af5eb69"}')
    expect(() => JSON.parse(customData.content)).not.toThrow()
  })

  it('preserves line separators and straight quotes inside nested custom tags', () => {
    const tags = ['thinking']
    const md = getMarkdown('custom-html-json-quotes-nested-lines', { customHtmlTags: tags })
    const content = 'line 1\nline 2 "ok"'
    const markdown = `- prefix <thinking>${content}</thinking>`

    const nodes = parseMarkdownToStructure(markdown, md, { customHtmlTags: tags, final: true }) as any[]
    const thinking = findNodeByType(nodes, 'thinking')

    expect(thinking?.content).toBe(content)
    expect(String(thinking?.content ?? '')).not.toContain('“')
    expect(String(thinking?.content ?? '')).not.toContain('”')
  })

  it('preserves pretty JSON payload whitespace inside custom tags', () => {
    const tags = ['custom-data']
    const md = getMarkdown('custom-html-json-quotes-pretty-json', { customHtmlTags: tags })
    const payload = [
      '{',
      '  "type": "fileinfo",',
      '',
      '  "meta": {',
      '    "title": "技能市场产品需求文档.md"',
      '  }',
      '}',
    ].join('\n')
    const markdown = `<custom-data>\n${payload}</custom-data>`

    const nodes = parseMarkdownToStructure(markdown, md, { customHtmlTags: tags, final: true }) as any[]
    const customData = findNodeByType(nodes, 'custom-data')

    expect(customData?.content).toBe(payload)
    expect(customData?.raw).toBe(markdown)
    expect(() => JSON.parse(customData.content)).not.toThrow()
  })

  it('preserves HTML entities in source payload content', () => {
    const tags = ['custom-data']
    const md = getMarkdown('custom-html-json-quotes-entities', { customHtmlTags: tags })
    const payload = '{"text":"a&amp;b","quote":"&quot;","numeric":"&#34;"}'
    const markdown = `<custom-data>${payload}</custom-data>`

    const nodes = parseMarkdownToStructure(markdown, md, { customHtmlTags: tags, final: true }) as any[]
    const customData = findNodeByType(nodes, 'custom-data')

    expect(customData?.content).toBe(payload)
    expect(customData?.raw).toBe(markdown)
    expect(() => JSON.parse(customData.content)).not.toThrow()
  })

  it('preserves source payload when customHtmlTags are provided at parse time', () => {
    const tags = ['custom-data']
    const md = getMarkdown('custom-html-json-quotes-parse-time-tags')
    const payload = '{"quote":"ok"}'
    const markdown = `<custom-data>${payload}</custom-data>`

    const nodes = parseMarkdownToStructure(markdown, md, { customHtmlTags: tags, final: true }) as any[]
    const customData = findNodeByType(nodes, 'custom-data')

    expect(customData?.content).toBe(payload)
    expect(customData?.raw).toBe(markdown)
    expect(String(customData?.content ?? '')).not.toContain('“')
    expect(String(customData?.content ?? '')).not.toContain('”')
    expect(() => JSON.parse(customData.content)).not.toThrow()
  })

  it('preserves trailing source while a streamed custom tag is still open', () => {
    const tags = ['custom-data']
    const md = getMarkdown('custom-html-json-quotes-open-trailing-source', { customHtmlTags: tags })
    const payload = '{"text":"a&amp;b"}   '
    const markdown = `<custom-data>${payload}`

    const nodes = parseMarkdownToStructure(markdown, md, { customHtmlTags: tags, final: false }) as any[]
    const customData = findNodeByType(nodes, 'custom-data')

    expect(customData?.content).toBe(payload)
  })

  it('keeps source payload separate from markdown-rendered children', () => {
    const tags = ['custom-data']
    const md = getMarkdown('custom-html-json-quotes-markdown-children', { customHtmlTags: tags })
    const payload = '{"title":"**Report**","note":"don\'t change \\"quotes\\" or x_y"}'
    const markdown = `<custom-data>${payload}</custom-data>`

    const nodes = parseMarkdownToStructure(markdown, md, { customHtmlTags: tags, final: true }) as any[]
    const customData = findNodeByType(nodes, 'custom-data')

    expect(customData?.content).toBe(payload)
    expect(customData?.raw).toBe(markdown)
    expect(() => JSON.parse(customData.content)).not.toThrow()
    expect(customData?.children?.some((child: any) => child.type === 'strong')).toBe(true)
  })

  it('does not confuse custom tag names with longer tag prefixes', () => {
    const tags = ['custom-data']
    const md = getMarkdown('custom-html-json-quotes-prefix-tags', { customHtmlTags: tags })
    const markdown = '<custom-data2>{"a":"b"}</custom-data2>'

    const nodes = parseMarkdownToStructure(markdown, md, { customHtmlTags: tags, final: true }) as any[]

    expect(findNodeByType(nodes, 'custom-data')).toBeUndefined()
  })

  it('does not include a top-level html_block closing tag in custom JSON content', () => {
    const tags = ['custom-data']
    const md = getMarkdown('custom-html-json-quotes-html-block-close', { customHtmlTags: tags })
    const markdown = [
      '- prefix <custom-data>{"a":"b"}',
      '',
      '</custom-data>',
    ].join('\n')

    const nodes = parseMarkdownToStructure(markdown, md, { customHtmlTags: tags, final: true }) as any[]
    const customData = findNodeByType(nodes, 'custom-data')

    expect(customData?.content).toBe('{"a":"b"}')
    expect(String(customData?.raw ?? '')).toContain('</custom-data>')
    expect(() => JSON.parse(customData.content)).not.toThrow()
  })

  it('does not include top-level html_block closing tag trailing content in custom JSON content', () => {
    const tags = ['custom-data']
    const md = getMarkdown('custom-html-json-quotes-html-block-close-trailing', { customHtmlTags: tags })
    const markdown = [
      '- prefix <custom-data>{"a":"b"}',
      '',
      '</custom-data> trailing',
    ].join('\n')

    const nodes = parseMarkdownToStructure(markdown, md, { customHtmlTags: tags, final: true }) as any[]
    const customData = findNodeByType(nodes, 'custom-data')

    expect(customData?.content).toBe('{"a":"b"}')
    expect(String(customData?.content ?? '')).not.toContain('trailing')
    expect(JSON.stringify(nodes)).toContain('trailing')
    expect(() => JSON.parse(customData.content)).not.toThrow()
  })

  it('keeps typographer enabled for normal markdown text', () => {
    const md = getMarkdown('custom-html-json-quotes-normal-text')
    const nodes = parseMarkdownToStructure('He said "ok".', md, { final: true }) as any[]
    const text = nodes[0]?.children?.[0]?.content

    expect(text).toBe('He said “ok”.')
  })
})
