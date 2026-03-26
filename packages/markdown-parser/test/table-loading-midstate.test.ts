import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

describe('table loading mid-states', () => {
  it('recognizes spaced separator rows as loading tables', () => {
    const md = getMarkdown('table-loading-spaced-separator')
    const markdown = `# 表格
|列1|列2|列3|列4|列5|
| - | - | - | - | `

    const nodes = parseMarkdownToStructure(markdown, md, { final: false }) as any[]
    const table = nodes.find(node => node.type === 'table') as any

    expect(table).toBeTruthy()
    expect(table.loading).toBe(true)
    expect(table.header.cells.map((cell: any) => cell.raw)).toEqual(['列1', '列2', '列3', '列4', '列5'])
  })

  it('keeps header cells when the separator row is only partially typed', () => {
    const md = getMarkdown('table-loading-partial-separator')
    const markdown = `# 表格
|列1|列2|列3|列4|列5|
|:-`

    const nodes = parseMarkdownToStructure(markdown, md, { final: false }) as any[]
    const table = nodes.find(node => node.type === 'table') as any

    expect(table).toBeTruthy()
    expect(table.loading).toBe(true)
    expect(table.header.cells.map((cell: any) => cell.raw)).toEqual(['列1', '列2', '列3', '列4', '列5'])
  })
})
