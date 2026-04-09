import type { ParsedNode } from 'stream-markdown-parser'
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

describe('math followed by image bug', () => {
  it('should parse math and image correctly - not math, image, and link', () => {
    const md = getMarkdown()
    const content = '$5\\%$ \n![image](https://img.shetu66.com/2023/04/27/1682576769453692.png)'
    const result = parseMarkdownToStructure(content, md)

    console.log('Parse result:', JSON.stringify(result, null, 2))

    // Should have 1 paragraph node with math_inline, text, and image children
    expect(result.length).toBe(1)
    expect(result[0].type).toBe('paragraph')

    const children = (result[0] as ParsedNode & { children?: ParsedNode[] }).children || []
    expect(children.length).toBe(3)

    // First child should be math_inline
    expect(children[0].type).toBe('math_inline')
    expect((children[0] as { content: string }).content).toBe('5\\%')

    // Second child should be text (space and newline)
    expect(children[1].type).toBe('text')
    expect((children[1] as { content: string }).content).toBe(' \n')

    // Third child should be image
    expect(children[2].type).toBe('image')
    expect((children[2] as { src: string }).src).toBe('https://img.shetu66.com/2023/04/27/1682576769453692.png')
    expect((children[2] as { alt: string }).alt).toBe('image')

    // Should NOT have a link node in children
    const linkNodes = children.filter((n: ParsedNode) => n.type === 'link')
    expect(linkNodes.length).toBe(0)
  })

  it('should parse math and image without newline', () => {
    const md = getMarkdown()
    const content = '$5\\%$ ![image](https://img.shetu66.com/2023/04/27/1682576769453692.png)'
    const result = parseMarkdownToStructure(content, md)

    console.log('Parse result (no newline):', JSON.stringify(result, null, 2))

    // Should have 1 paragraph node with math_inline, text, and image children
    expect(result.length).toBe(1)
    expect(result[0].type).toBe('paragraph')

    const children = (result[0] as ParsedNode & { children?: ParsedNode[] }).children || []
    expect(children.length).toBe(3)

    // First child should be math_inline
    expect(children[0].type).toBe('math_inline')
    expect((children[0] as { content: string }).content).toBe('5\\%')

    // Second child should be text (space)
    expect(children[1].type).toBe('text')
    expect((children[1] as { content: string }).content).toBe(' ')

    // Third child should be image
    expect(children[2].type).toBe('image')
    expect((children[2] as { src: string }).src).toBe('https://img.shetu66.com/2023/04/27/1682576769453692.png')
    expect((children[2] as { alt: string }).alt).toBe('image')

    // Should NOT have a link node in children
    const linkNodes = children.filter((n: ParsedNode) => n.type === 'link')
    expect(linkNodes.length).toBe(0)
  })

  it('should parse math, image, and math correctly', () => {
    const md = getMarkdown()
    const content = '$5\\%$ ![image](https://img.shetu66.com/2023/04/27/1682576769453692.png) $5\\%$'
    const result = parseMarkdownToStructure(content, md)

    console.log('Parse result (math-image-math):', JSON.stringify(result, null, 2))

    // Should have 1 paragraph node with math_inline, text, image, and math_inline children
    expect(result.length).toBe(1)
    expect(result[0].type).toBe('paragraph')

    const children = (result[0] as ParsedNode & { children?: ParsedNode[] }).children || []
    // Now we have: math, text, image, text, math (the space after image is now correctly preserved)
    expect(children.length).toBe(5)

    // First child should be math_inline
    expect(children[0].type).toBe('math_inline')
    expect((children[0] as { content: string }).content).toBe('5\\%')

    // Second child should be text (space before image)
    expect(children[1].type).toBe('text')
    expect((children[1] as { content: string }).content).toBe(' ')

    // Third child should be image
    expect(children[2].type).toBe('image')
    expect((children[2] as { src: string }).src).toBe('https://img.shetu66.com/2023/04/27/1682576769453692.png')
    expect((children[2] as { alt: string }).alt).toBe('image')

    // Fourth child should be text (space after image)
    expect(children[3].type).toBe('text')
    expect((children[3] as { content: string }).content).toBe(' ')

    // Fifth child should be math_inline
    expect(children[4].type).toBe('math_inline')
    expect((children[4] as { content: string }).content).toBe('5\\%')

    // Should NOT have a link node in children
    const linkNodes = children.filter((n: ParsedNode) => n.type === 'link')
    expect(linkNodes.length).toBe(0)
  })

  it('should handle incomplete math followed by image', () => {
    const md = getMarkdown()
    const content = '$ \n![image](https://img.shetu66.com/2023/04/27/1682576769453692.png)'
    const result = parseMarkdownToStructure(content, md)

    console.log('Parse result (incomplete math):', JSON.stringify(result, null, 2))

    // Should have 1 paragraph node
    expect(result.length).toBe(1)
    expect(result[0].type).toBe('paragraph')

    const children = (result[0] as ParsedNode & { children?: ParsedNode[] }).children || []
    // Incomplete math $ might be treated as text, followed by image
    expect(children.length).toBeGreaterThanOrEqual(1)

    // Last child should be image
    const lastChild = children[children.length - 1]
    expect(lastChild.type).toBe('image')
    expect((lastChild as { src: string }).src).toBe('https://img.shetu66.com/2023/04/27/1682576769453692.png')
    expect((lastChild as { alt: string }).alt).toBe('image')

    // Should NOT have a link node
    const linkNodes = children.filter((n: ParsedNode) => n.type === 'link')
    expect(linkNodes.length).toBe(0)
  })

  it('should handle empty math followed by image', () => {
    const md = getMarkdown()
    const content = '$$![image](https://img.shetu66.com/2023/04/27/1682576769453692.png)'
    const result = parseMarkdownToStructure(content, md)

    console.log('Parse result (empty math):', JSON.stringify(result, null, 2))

    // Should have 1 paragraph node
    expect(result.length).toBe(1)
    expect(result[0].type).toBe('paragraph')

    const children = (result[0] as ParsedNode & { children?: ParsedNode[] }).children || []
    expect(children.length).toBeGreaterThanOrEqual(1)

    // Should have an image
    const imageNodes = children.filter((n: ParsedNode) => n.type === 'image')
    expect(imageNodes.length).toBe(1)
    expect((imageNodes[0] as { src: string }).src).toBe('https://img.shetu66.com/2023/04/27/1682576769453692.png')

    // Should NOT have a link node
    const linkNodes = children.filter((n: ParsedNode) => n.type === 'link')
    expect(linkNodes.length).toBe(0)
  })

  it('should handle multiple math and image combinations', () => {
    const md = getMarkdown()
    const content = '$a$ ![img1](url1) $b$ ![img2](url2) $c$'
    const result = parseMarkdownToStructure(content, md)

    console.log('Parse result (multiple):', JSON.stringify(result, null, 2))

    // Should have 1 paragraph node
    expect(result.length).toBe(1)
    expect(result[0].type).toBe('paragraph')

    const children = (result[0] as ParsedNode & { children?: ParsedNode[] }).children || []
    // Now we have: math, text, image, text, math, text, image, text, math
    // (spaces after images are now correctly preserved)
    expect(children.length).toBe(9)

    // Check math nodes
    const mathNodes = children.filter((n: ParsedNode) => n.type === 'math_inline')
    expect(mathNodes.length).toBe(3)
    expect((mathNodes[0] as { content: string }).content).toBe('a')
    expect((mathNodes[1] as { content: string }).content).toBe('b')
    expect((mathNodes[2] as { content: string }).content).toBe('c')

    // Check image nodes
    const imageNodes = children.filter((n: ParsedNode) => n.type === 'image')
    expect(imageNodes.length).toBe(2)
    expect((imageNodes[0] as { src: string }).src).toBe('url1')
    expect((imageNodes[1] as { src: string }).src).toBe('url2')

    // Should NOT have a link node
    const linkNodes = children.filter((n: ParsedNode) => n.type === 'link')
    expect(linkNodes.length).toBe(0)
  })

  it('should handle image with title attribute', () => {
    const md = getMarkdown()
    const content = '$x$ ![img](url "title") $y$'
    const result = parseMarkdownToStructure(content, md)

    console.log('Parse result (with title):', JSON.stringify(result, null, 2))

    // Should have 1 paragraph node
    expect(result.length).toBe(1)
    expect(result[0].type).toBe('paragraph')

    const children = (result[0] as ParsedNode & { children?: ParsedNode[] }).children || []
    // Now we have: math, text, image, text, math (the space after image is now correctly preserved)
    expect(children.length).toBe(5)

    // Check image with title
    const imageNode = children[2]
    expect(imageNode.type).toBe('image')
    expect((imageNode as { src: string }).src).toBe('url')
    expect((imageNode as { alt: string }).alt).toBe('img')
    expect((imageNode as { title: string | null }).title).toBe('title')
  })

  it('should parse image whose alt text contains inline math formulas', () => {
    const md = getMarkdown()
    const content = '![图6：Brain-Score大脑对齐性能（RSA）。我们测试了TopoLM和非拓扑控制在Brain-Score语言上的表现，使用表示相似性分析（RSA）来估计对齐。TopoLM在Pereira2018上优于控制，但在Blank2014和Fedorenko2016上表现较差（对每个基准分别进行的\\(t\\)-检验：\\(p<0.05\\)）。对于每个基准，我们从10个交叉验证循环中抽样，以计算自助法95%置信区间（黑条）。当结果在3个基准上取平均时（最后一面板"Brain-Score"），我们发现TopoLM与其控制之间存在显著差异（\\(t\\)-检验：\\(p>0.05\\)）。然而，这一结果需要谨慎解读，因为它主要受Fedorenko2016的结果影响，该结果仅显示非常大的绝对值，因为用于归一化的基础数据非常嘈杂，即噪声上限非常低。](https://www.baidu.com/img/PCfb_5bf082d29588c07f842ccde3f97243ea.png)'
    const result = parseMarkdownToStructure(content, md)

    // Should have 1 paragraph node
    expect(result.length).toBe(1)
    expect(result[0].type).toBe('paragraph')

    const children = (result[0] as ParsedNode & { children?: ParsedNode[] }).children || []

    // Should contain a single image node (not broken into multiple tokens)
    const imageNodes = children.filter((n: ParsedNode) => n.type === 'image')
    expect(imageNodes.length).toBe(1)
    expect((imageNodes[0] as { src: string }).src).toBe('https://www.baidu.com/img/PCfb_5bf082d29588c07f842ccde3f97243ea.png')

    // Should NOT have math_inline nodes (math is inside the image alt text, not standalone)
    const mathNodes = children.filter((n: ParsedNode) => n.type === 'math_inline')
    expect(mathNodes.length).toBe(0)

    // Should NOT have link nodes
    const linkNodes = children.filter((n: ParsedNode) => n.type === 'link')
    expect(linkNodes.length).toBe(0)
  })
})
