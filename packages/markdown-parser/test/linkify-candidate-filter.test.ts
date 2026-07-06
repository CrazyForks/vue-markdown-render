import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function flatten(nodes: any[]): any[] {
  const output: any[] = []
  for (const node of nodes ?? []) {
    output.push(node)
    if (Array.isArray(node?.children))
      output.push(...flatten(node.children))
    if (Array.isArray(node?.items))
      output.push(...flatten(node.items))
  }
  return output
}

function parse(input: string) {
  return parseMarkdownToStructure(input, getMarkdown('linkify-candidate-filter'), { final: true }) as any[]
}

function links(input: string) {
  return flatten(parse(input)).filter(node => node?.type === 'link')
}

describe('linkify candidate filter', () => {
  it('linkifies ordinary bare links', () => {
    const found = links('Visit example.com now.')

    expect(found).toHaveLength(1)
    expect(found[0].href).toBe('http://example.com')
    expect(found[0].text).toBe('example.com')
  })

  it('does not linkify bare links inside markdown link labels', () => {
    const found = links('[example.com](https://target.test)')

    expect(found).toHaveLength(1)
    expect(found[0].href).toBe('https://target.test')
    expect(found[0].text).toBe('example.com')
  })

  it('does not linkify bare links inside html anchors', () => {
    const found = links('<a href="https://target.test">example.com</a>')

    expect(found).toHaveLength(1)
    expect(found[0].href).toBe('https://target.test')
    expect(found[0].text).toBe('example.com')
  })

  it('still linkifies bare links after html anchors in the same inline token', () => {
    const found = links('<a href="https://target.test">example.com</a> and example.org')

    expect(found.map(link => link.href)).toEqual([
      'https://target.test',
      'http://example.org',
    ])
  })

  it('leaves paragraphs without bare links as text', () => {
    const nodes = parse('This is plain text without autolinks.')
    const found = flatten(nodes)

    expect(found.filter(node => node?.type === 'link')).toHaveLength(0)
    expect(found.filter(node => node?.type === 'text').map(node => node.content).join('')).toBe('This is plain text without autolinks.')
  })
})
