import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'
import { collect, textIncludes } from './utils/midstate-utils'

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

  it('does not treat JSON arrays like "[14]" as references', () => {
    const markdown = `<question>[{"id":"1","pages":[14],"content":"本次测试的目的是什么？"},{"id":"2","pages":[5,15],"content":"如何根据MODULEID查找对应的测试信息？"}]</question>`
    const nodes = parseMarkdownToStructure(markdown, md) as any[]
    expect(collect(nodes, 'reference').length).toBe(0)
    expect(textIncludes(nodes, '[14]')).toBe(true)
  })

  it('keeps raw html tables out of structured markdown children', () => {
    const markdown = `<table border="1" cellpadding="8" cellspacing="0">
  <thead>
    <tr>
      <th>姓名</th>
      <th>部门</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td rowspan="2">张三</td>
      <td>技术部</td>
    </tr>
    <tr>
      <td>前端重构</td>
    </tr>
  </tbody>
</table>`

    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.tag).toBe('table')
    expect(nodes[0]?.children).toBeUndefined()
    expect(String(nodes[0]?.content ?? '')).toContain('rowspan="2"')
  })
})
