import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

describe('html block regressions', () => {
  const md = getMarkdown('html-block-regressions')

  it('keeps fenced code inside html block content', () => {
    const markdown = `<div>
\`\`\`js
console.log(1)
\`\`\`
</div>`

    const nodes = parseMarkdownToStructure(markdown, md)
    expect(nodes.length).toBe(1)
    const htmlBlock: any = nodes[0]
    expect(htmlBlock.type).toBe('html_block')
    expect(htmlBlock.tag).toBe('div')
    expect(htmlBlock.loading).toBe(false)
    expect(htmlBlock.raw).toContain('```js')

    const codeBlocks = nodes.filter((n: any) => n.type === 'code_block' || n.type === 'fence')
    expect(codeBlocks.length).toBe(0)
  })
})
