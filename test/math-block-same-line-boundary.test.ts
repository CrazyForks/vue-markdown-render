import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

describe('math block same-line boundary regression', () => {
  function collectByType(nodes: any, type: string, out: any[] = []) {
    if (!nodes)
      return out

    if (Array.isArray(nodes)) {
      for (const node of nodes)
        collectByType(node, type, out)
      return out
    }

    if (typeof nodes === 'object') {
      if (nodes.type === type)
        out.push(nodes)

      if (nodes.children)
        collectByType(nodes.children, type, out)
    }

    return out
  }

  it('preserves inline math before tolerant $$ block and text after closing $$', () => {
    const md = getMarkdown('issue-492-math-boundary')

    const content = `Decentralized stochastic optimization is a fundamental paradigm for large-scale learning over networks, where agents communicate only with their neighbors and no central coordinator is required. For strongly convex problems, communication efficiency is mainly determined by the condition number $\\kappa=L/\\mu$ and the network spectral gap $1-\\beta$. Although deterministic decentralized methods can simultaneously achieve accelerated $\\sqrt{\\kappa}$ and $1/\\sqrt{1-\\beta}$ dependences, no existing stochastic method attains both improvements at once. In this paper, we propose *Multi-Gossip Accelerated DSGD* (MG-ADSGD), a decentralized stochastic algorithm that combines Nesterov-type primal--dual extrapolation with multi-round fast gossip averaging. The key idea is to couple the gossip depth with the mini-batch size so that additional communication rounds simultaneously improve consensus accuracy and reduce gradient variance. We show that MG-ADSGD achieves the communication complexity $$
\\widetilde{\\mathcal O}\\!\\left( \\frac{\\sigma^2}{\\mu n\\epsilon}\\log\\frac{1}{\\epsilon} + \\sqrt{\\frac{\\kappa}{1-\\beta}}\\log\\frac{1}{\\epsilon} \\right),
$$ where $\\epsilon$ denotes the target accuracy, $n$ is the number of nodes, and $\\sigma^2$ is the gradient variance. To the best of our knowledge, this bound yields the best currently available communication complexity for decentralized stochastic strongly convex optimization, up to logarithmic factors that are independent of $\\epsilon$.`

    const nodes = parseMarkdownToStructure(content, md, { final: true })

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('widetilde')
    expect(mathBlocks[0].content).toContain('frac')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('where')
    expect(serialized).toContain('target accuracy')
    expect(serialized).toContain('best currently available communication complexity')

    const inlineMath = collectByType(nodes, 'math_inline')
    const inlineContent = inlineMath.map((node: any) => node.content).join('\n')

    expect(inlineContent).toContain('kappa')
    expect(inlineContent).toContain('1-\\beta')
    expect(inlineContent).toContain('sqrt')
    expect(inlineContent).toContain('epsilon')
    expect(inlineContent).toContain('n')
    expect(inlineContent).toContain('sigma')
  })

  it('preserves trailing text after a normal multi-line $$ block close', () => {
    const md = getMarkdown('math-block-close-suffix')

    const content = `Before $a$.
$$
E=mc^2
$$ where $x$ follows.`

    const nodes = parseMarkdownToStructure(content, md, { final: true })

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('E=mc^2')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('Before')
    expect(serialized).toContain('where')
    expect(serialized).toContain('follows')

    const inlineMath = collectByType(nodes, 'math_inline')
    const inlineContent = inlineMath.map((node: any) => node.content).join('\n')
    expect(inlineContent).toContain('a')
    expect(inlineContent).toContain('x')
  })

  it('preserves prefix and suffix around tolerant explicit \\[ block boundaries', () => {
    const md = getMarkdown('math-block-bracket-boundary')

    const content = `Prefix $a$ before display math \\[
x + y = z
\\] where $z$ remains.`

    const nodes = parseMarkdownToStructure(content, md, { final: true })

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('x + y = z')
    expect(mathBlocks[0].markup).toBe('\\[\\]')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('Prefix')
    expect(serialized).toContain('before display math')
    expect(serialized).toContain('where')
    expect(serialized).toContain('remains')

    const inlineMath = collectByType(nodes, 'math_inline')
    const inlineContent = inlineMath.map((node: any) => node.content).join('\n')
    expect(inlineContent).toContain('a')
    expect(inlineContent).toContain('z')
  })

  it('keeps streaming output stable for tolerant $$ block boundaries', () => {
    const md = getMarkdown('stream-math-block-boundary-no-loop')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const chunks = [
      'Before $a$ and display math $',
      '$\nE=mc^2',
      '\n$$ where $x$ follows.',
    ]

    let source = ''
    let nodes: any[] = []

    for (const chunk of chunks) {
      source += chunk
      expect(() => {
        nodes = parseMarkdownToStructure(source, md, {
          final: false,
          streamParse: true,
        }) as any[]
      }).not.toThrow()
    }

    const stableSerialized = JSON.stringify(nodes)

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    // Re-parse the same completed source a few times. The result must stay
    // byte-for-byte stable; duplicated prefix/suffix paragraphs around the
    // math_block show up here immediately.
    for (let index = 0; index < 10; index++) {
      expect(() => {
        nodes = parseMarkdownToStructure(source, md, {
          final: false,
          streamParse: true,
        }) as any[]
      }).not.toThrow()
      expect(JSON.stringify(nodes)).toBe(stableSerialized)
    }

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('Before')
    expect(serialized).toContain('where')
    expect(serialized).toContain('follows')

    const inlineMath = collectByType(nodes, 'math_inline')
    const inlineContent = inlineMath.map((node: any) => node.content).join('\n')
    expect(inlineContent).toContain('a')
    expect(inlineContent).toContain('x')

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
  })
  it('keeps math block boundary normalization inside blockquotes', () => {
    const md = getMarkdown('math-block-boundary-blockquote')

    const content = '> Before $a$ and display math $$\n> E=mc^2\n> $$ where $x$ follows.'

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('blockquote')
    expect(nodes[0]?.children?.map((node: any) => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('E=mc^2')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('Before')
    expect(serialized).toContain('where')
    expect(serialized).toContain('follows')

    const inlineMath = collectByType(nodes, 'math_inline')
    const inlineContent = inlineMath.map((node: any) => node.content).join('\n')
    expect(inlineContent).toContain('a')
    expect(inlineContent).toContain('x')
  })

  it('does not rewrite fenced or indented code that contains math-looking boundaries', () => {
    const md = getMarkdown('math-block-boundary-code-guard')

    const content = [
      '```',
      'literal $$',
      'E=mc^2',
      '$$ where it should stay fenced code',
      '```',
      '',
      '    literal $$',
      '    E=mc^2',
      '    $$ where it should stay indented code',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true })

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)

    const codeBlocks = collectByType(nodes, 'code_block')
    expect(codeBlocks).toHaveLength(2)

    const code = codeBlocks.map((node: any) => node.code).join('\n')
    expect(code).toContain('$$ where it should stay fenced code')
    expect(code).toContain('$$ where it should stay indented code')
  })

  it('does not split escaped $$ delimiters or close math blocks on escaped $$', () => {
    const md = getMarkdown('math-block-boundary-escaped-dollar')

    const content = 'Literal escaped \\$$ stays text.\n$$\na \\$$ b\n$$ after $x$ follows.'

    const nodes = parseMarkdownToStructure(content, md, { final: true })

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('\\$$')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('Literal escaped')
    expect(serialized).toContain('after')
    expect(serialized).toContain('follows')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('x')
  })

  it('keeps streaming output stable for blockquoted tolerant $$ boundaries', () => {
    const md = getMarkdown('stream-math-block-boundary-blockquote')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const chunks = [
      '> Before $a$ and display math $',
      '$\n> E=mc^2',
      '\n> $$ where $x$ follows.',
    ]

    let source = ''
    let nodes: any[] = []

    for (const chunk of chunks) {
      source += chunk
      expect(() => {
        nodes = parseMarkdownToStructure(source, md, {
          final: false,
          streamParse: true,
        }) as any[]
      }).not.toThrow()
    }

    const stableSerialized = JSON.stringify(nodes)

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('blockquote')
    expect(nodes[0]?.children?.map((node: any) => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    for (let index = 0; index < 10; index++) {
      expect(() => {
        nodes = parseMarkdownToStructure(source, md, {
          final: false,
          streamParse: true,
        }) as any[]
      }).not.toThrow()
      expect(JSON.stringify(nodes)).toBe(stableSerialized)
    }
  })

  it('does not loop or create math blocks for escaped delimiter noise during streaming', () => {
    const md = getMarkdown('stream-math-block-boundary-escaped-noise')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = Array.from({ length: 80 }, (_, index) => 'line ' + index + ' escaped \\$$').join('\n')

    let stableSerialized = ''
    let nodes: any[] = []

    for (let index = 0; index < 8; index++) {
      expect(() => {
        nodes = parseMarkdownToStructure(source, md, {
          final: false,
          streamParse: true,
        }) as any[]
      }).not.toThrow()

      const serialized = JSON.stringify(nodes)
      if (index === 0)
        stableSerialized = serialized
      else
        expect(serialized).toBe(stableSerialized)
    }

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
  })
})
