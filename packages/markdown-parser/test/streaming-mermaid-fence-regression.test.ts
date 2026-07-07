import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function codeBlocks(nodes: any[]) {
  const result: any[] = []
  const walk = (items: any[]) => {
    for (const node of items || []) {
      if (node?.type === 'code_block')
        result.push(node)
      if (Array.isArray(node?.children))
        walk(node.children)
    }
  }
  walk(nodes)
  return result
}

describe('streaming mermaid fence boundaries', () => {
  it('does not absorb following math markdown after the mermaid closing fence has streamed', () => {
    const markdown = [
      '```mermaid',
      'xychart',
      '  title "销售收入"',
      '  x-axis ["一月", "二月"]',
      '  y-axis "收入" 4000 --> 11000',
      '  line [5000, 6000]',
      '```',
      '',
      '---',
      '# 复杂数学公式',
      '',
      '### 正交补空间',
      '如果 \\(\\boldsymbol{\\alpha}^T \\boldsymbol{\\beta} = 0\\)，那么它们正交。',
      '',
    ].join('\n')
    const md = getMarkdown('streaming-mermaid-fence-regression')

    for (let end = 1; end <= markdown.length; end++) {
      const chunk = markdown.slice(0, end)
      const nodes = parseMarkdownToStructure(chunk, md, { final: false, streamParse: true })
      const mermaidBlocks = codeBlocks(nodes).filter(node => node.language === 'mermaid')

      for (const block of mermaidBlocks) {
        expect(block.code, `prefix length ${end}`).not.toContain('正交补空间')
        expect(block.code, `prefix length ${end}`).not.toContain('boldsymbol')
      }
    }
  })
})
