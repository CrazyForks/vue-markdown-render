import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

describe('parseMarkdownToStructure with code in link text', () => {
  it('parses inline code as the child of a local file link', () => {
    const md = getMarkdown()
    const markdown = '[`on-send-interrupt.test.ts`](file:///Users/Simon/Github/best-agent/packages/cli-render/src/tests/on-send-interrupt.test.ts#L156-L190)'
    const result = parseMarkdownToStructure(markdown, md, { final: true })

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('paragraph')
    expect(result[0].children).toHaveLength(1)
    expect(result[0].children[0]).toMatchObject({
      type: 'link',
      href: 'file:///Users/Simon/Github/best-agent/packages/cli-render/src/tests/on-send-interrupt.test.ts#L156-L190',
      loading: false,
      children: [
        {
          type: 'inline_code',
          code: 'on-send-interrupt.test.ts',
        },
      ],
    })
  })

  it('repairs each local file link when other inline code is present', () => {
    const md = getMarkdown()
    const markdown = '`prefix` [`a.ts`](file:///tmp/a.ts) and [`b.ts`](file:///tmp/b.ts)'
    const result = parseMarkdownToStructure(markdown, md, { final: true })
    const children = result[0].children

    expect(children[0]).toMatchObject({ type: 'inline_code', code: 'prefix' })
    expect(children.filter(node => node.type === 'link')).toMatchObject([
      { href: 'file:///tmp/a.ts', children: [{ type: 'inline_code', code: 'a.ts' }] },
      { href: 'file:///tmp/b.ts', children: [{ type: 'inline_code', code: 'b.ts' }] },
    ])
  })

  it('supports balanced parentheses in a local file link destination', () => {
    const md = getMarkdown()
    const markdown = '[`a(b)c.ts`](file:///tmp/a(b)c.ts)'
    const result = parseMarkdownToStructure(markdown, md, { final: true })

    expect(result[0].children).toMatchObject([
      {
        type: 'link',
        href: 'file:///tmp/a(b)c.ts',
        children: [{ type: 'inline_code', code: 'a(b)c.ts' }],
      },
    ])
  })

  it('parses mixed text and code labels without scheme-specific recovery', () => {
    const md = getMarkdown()
    const result = parseMarkdownToStructure('[open `a.ts`](file:///tmp/a.ts)', md, { final: true })

    expect(result[0].children).toMatchObject([
      {
        type: 'link',
        href: 'file:///tmp/a.ts',
        children: [
          { type: 'text', content: 'open ' },
          { type: 'inline_code', code: 'a.ts' },
        ],
      },
    ])
  })

  it('uses the configured link validator for any accepted scheme', () => {
    const md = getMarkdown('custom-link-scheme', {
      markdownItOptions: {
        validateLink: () => true,
      },
    })
    const result = parseMarkdownToStructure('[`x`](file:////example.com/target)', md, { final: true })

    expect(result[0].children).toMatchObject([
      {
        type: 'link',
        href: 'file:////example.com/target',
        children: [{ type: 'inline_code', code: 'x' }],
      },
    ])
  })

  it('uses link validators configured after Markdown creation', () => {
    const md = getMarkdown()
    md.set({ validateLink: () => true })
    const result = parseMarkdownToStructure('[`x`](file:////example.com/target)', md, { final: true })

    expect(result[0].children).toMatchObject([
      {
        type: 'link',
        href: 'file:////example.com/target',
        children: [{ type: 'inline_code', code: 'x' }],
      },
    ])
  })

  it('respects direct markdown-it link validator overrides', () => {
    const rejectingMd = getMarkdown() as ReturnType<typeof getMarkdown> & { validateLink: () => boolean }
    rejectingMd.validateLink = () => false
    const rejected = parseMarkdownToStructure('[`x`](https://example.com)', rejectingMd, { final: true })

    const allowingMd = getMarkdown() as ReturnType<typeof getMarkdown> & { validateLink: () => boolean }
    allowingMd.validateLink = () => true
    const allowed = parseMarkdownToStructure('[`x`](file:////example.com/target)', allowingMd, { final: true })
    const autolink = parseMarkdownToStructure('<file:////example.com/target>', allowingMd, { final: true })

    expect(rejected[0].children.some(node => node.type === 'link')).toBe(false)
    expect(allowed[0].children.some(node => node.type === 'link')).toBe(true)
    expect(autolink[0].children.some(node => node.type === 'link')).toBe(true)
  })

  it('keeps link validation separate from image validation', () => {
    const md = getMarkdown()
    const dataImage = parseMarkdownToStructure('![x](data:image/png;base64,AAAA)', md, { final: true })
    const fileImage = parseMarkdownToStructure('![x](file:///tmp/x.png)', md, { final: true })
    const linkedDataImage = parseMarkdownToStructure('[![x](data:image/png;base64,AAAA)](file:///tmp/x)', md, { final: true })

    expect(dataImage[0].children.some(node => node.type === 'image')).toBe(true)
    expect(fileImage[0].children.some(node => node.type === 'image')).toBe(false)
    expect(linkedDataImage[0].children).toMatchObject([
      {
        type: 'link',
        children: [{ type: 'image', src: 'data:image/png;base64,AAAA' }],
      },
    ])
  })

  it('unescapes recovered link destinations', () => {
    const md = getMarkdown()
    const result = parseMarkdownToStructure('[`a)`](file:///tmp/a\\).ts)', md, { final: true })

    expect(result[0].children).toMatchObject([
      {
        type: 'link',
        href: 'file:///tmp/a).ts',
        children: [{ type: 'inline_code', code: 'a)' }],
      },
    ])
  })

  it('does not parse escaped or rejected local file links', () => {
    const md = getMarkdown()
    const escaped = parseMarkdownToStructure('\\[`x`](file:///tmp/x)', md, { final: true })
    const escapedClose = parseMarkdownToStructure('[`x`\\](file:///tmp/x)', md, { final: true })
    const entityEscaped = parseMarkdownToStructure('&#91;`x`](file:///tmp/x)', md, { final: true })
    const hosted = parseMarkdownToStructure('[`x`](file:////example.com/tmp/x)', md, { final: true })
    const rejectingMd = getMarkdown()
    rejectingMd.set?.({ validateLink: () => false })
    const rejected = parseMarkdownToStructure('[`x`](file:///tmp/x)', rejectingMd, { final: true })

    expect(escaped[0].children.some(node => node.type === 'link')).toBe(false)
    expect(escapedClose[0].children.some(node => node.type === 'link')).toBe(false)
    expect(entityEscaped[0].children.some(node => node.type === 'link')).toBe(false)
    expect(hosted[0].children.some(node => node.type === 'link')).toBe(false)
    expect(rejected[0].children.some(node => node.type === 'link')).toBe(false)
  })

  it('should parse links with inline code correctly', () => {
    const md = getMarkdown()

    const mdText1 = `the [\`npm init\` command](https://docs.npmjs.com/creating-a-package-json-file).`
    const result1 = parseMarkdownToStructure(mdText1, md, { final: true })
    // 验证结果的基本结构
    expect(result1).toBeDefined()
    expect(result1.length).toBe(1)
    expect(result1[0].type).toBe('paragraph')
    expect(result1[0].children.length).toBe(3)

    // 验证链接节点
    const linkNode1 = result1[0].children[1]
    expect(linkNode1.type).toBe('link')
    expect(linkNode1.href).toBe('https://docs.npmjs.com/creating-a-package-json-file')
    expect(linkNode1.text).toBe('npm init command')
    expect(linkNode1.children.length).toBe(2)

    // 验证链接中的内联代码节点
    expect(linkNode1.children[0].type).toBe('inline_code')
    expect(linkNode1.children[0].code).toBe('npm init')
    expect(linkNode1.children[1].type).toBe('text')
    expect(linkNode1.children[1].content).toBe(' command')

    // 验证第二个链接
    const mdText2 = `[\`npm install\` command](https://docs.npmjs.com/getting-started/installing-npm-packages-locally):`
    const result2 = parseMarkdownToStructure(mdText2, md, { final: true })

    expect(result2.length).toBe(1)
    const linkNode2 = result2[0].children[0]
    expect(linkNode2.type).toBe('link')
    expect(linkNode2.href).toBe('https://docs.npmjs.com/getting-started/installing-npm-packages-locally')
    expect(linkNode2.text).toBe('npm install command')
    expect(linkNode2.children.length).toBe(2)

    expect(linkNode2.children[0].type).toBe('inline_code')
    expect(linkNode2.children[0].code).toBe('npm install')
    expect(linkNode2.children[1].type).toBe('text')
    expect(linkNode2.children[1].content).toBe(' command')
  })
})
