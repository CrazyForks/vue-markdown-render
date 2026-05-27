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

function findCustomDataNode(nodes: any[]): any | undefined {
  for (const node of nodes) {
    if (node?.type === 'custom-data')
      return node
    if (Array.isArray(node?.children)) {
      const found = findCustomDataNode(node.children)
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
      const customData = findCustomDataNode(nodes)
      if (!customData?.content)
        continue

      expect(String(customData.content)).not.toContain('“')
      expect(String(customData.content)).not.toContain('”')
    }

    const nodes = parseMarkdownToStructure(content, md, { customHtmlTags: tags, final: true }) as any[]
    const customData = findCustomDataNode(nodes)
    expect(customData?.content).toBe('{"type":"fileinfo","filename":"技能市场产品需求文档.md","url":"/center/ckeApi/api/tools/file/download?fileId=67e3e46d-f962-459d-a03d-366a0af5eb69"}')
    expect(() => JSON.parse(customData.content)).not.toThrow()
  })
})
