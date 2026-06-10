import { getMarkdown, parseMarkdownToStructure, processTokens } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

describe('math block same-line boundary regression', () => {
  function collectByType(nodes: any, type: string, out: any[] = [], seen = new WeakSet<object>()) {
    if (!nodes)
      return out

    if (Array.isArray(nodes)) {
      for (const node of nodes)
        collectByType(node, type, out, seen)
      return out
    }

    if (typeof nodes === 'object') {
      if (seen.has(nodes))
        return out
      seen.add(nodes)

      if (nodes.type === type)
        out.push(nodes)

      // Walk all object fields, not only `children`.
      // List nodes store descendants under `items`, tables under rows/cells, etc.
      for (const value of Object.values(nodes))
        collectByType(value, type, out, seen)
    }

    return out
  }

  it('does not drop intentional duplicate paragraph triples in processTokens', () => {
    const makeParagraphTriple = () => [
      {
        type: 'paragraph_open',
        tag: 'p',
        nesting: 1,
      },
      {
        type: 'inline',
        tag: '',
        content: 'repeat',
        map: [0, 1],
        children: [
          {
            type: 'text',
            tag: '',
            content: 'repeat',
            raw: 'repeat',
          },
        ],
      },
      {
        type: 'paragraph_close',
        tag: 'p',
        nesting: -1,
      },
    ]

    const nodes = processTokens([
      ...makeParagraphTriple(),
      ...makeParagraphTriple(),
    ] as any)

    expect(nodes).toHaveLength(2)
    expect(nodes.map((node: any) => node.raw)).toEqual(['repeat', 'repeat'])

    const textNodes = collectByType(nodes, 'text')
    expect(textNodes.map((node: any) => node.content)).toEqual(['repeat', 'repeat'])
  })

  it('does not emit loading math_block for tolerant same-line $$ opener before close during streaming', () => {
    const md = getMarkdown('stream-tolerant-dollar-opener-waits-for-close')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const partial = `Before display $$
E=mc^2`

    const partialNodes = parseMarkdownToStructure(partial, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(collectByType(partialNodes, 'math_block')).toHaveLength(0)

    const partialSerialized = JSON.stringify(partialNodes)
    expect(partialSerialized).toContain('Before display')
    expect(partialSerialized).toContain('E=mc^2')

    const complete = `${partial}
$$ where $x$ follows.`

    let completeNodes = parseMarkdownToStructure(complete, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(completeNodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(completeNodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].loading).toBe(false)
    expect(mathBlocks[0].content).toContain('E=mc^2')

    const inlineMath = collectByType(completeNodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('x')

    const stableSerialized = JSON.stringify(completeNodes)
    for (let index = 0; index < 10; index++) {
      completeNodes = parseMarkdownToStructure(complete, md, {
        final: false,
        streamParse: true,
      }) as any[]

      expect(JSON.stringify(completeNodes)).toBe(stableSerialized)
    }
  })

  it('does not emit loading math_block for tolerant same-line \\[ opener before close during streaming', () => {
    const md = getMarkdown('stream-tolerant-bracket-opener-waits-for-close')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const partial = `Before display \\[
x + y = z`

    const partialNodes = parseMarkdownToStructure(partial, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(collectByType(partialNodes, 'math_block')).toHaveLength(0)

    const partialSerialized = JSON.stringify(partialNodes)
    expect(partialSerialized).toContain('Before display')
    expect(partialSerialized).toContain('x + y = z')

    const complete = `${partial}
\\] where $z$ follows.`

    let completeNodes = parseMarkdownToStructure(complete, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(completeNodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(completeNodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].loading).toBe(false)
    expect(mathBlocks[0].markup).toBe('\\[\\]')
    expect(mathBlocks[0].content).toContain('x + y = z')

    const inlineMath = collectByType(completeNodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('z')

    const stableSerialized = JSON.stringify(completeNodes)
    for (let index = 0; index < 10; index++) {
      completeNodes = parseMarkdownToStructure(complete, md, {
        final: false,
        streamParse: true,
      }) as any[]

      expect(JSON.stringify(completeNodes)).toBe(stableSerialized)
    }
  })

  it('still emits loading math_block for real standalone $$ opener during streaming', () => {
    const md = getMarkdown('stream-standalone-dollar-loading-still-supported')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const nodes = parseMarkdownToStructure(`$$
E=mc^2`, md, {
      final: false,
      streamParse: true,
    }) as any[]

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].loading).toBe(true)
    expect(mathBlocks[0].content).toContain('E=mc^2')
  })
  it('still emits loading math_block for real standalone $$ opener with weak spaced-subscript content during streaming', () => {
    const md = getMarkdown('stream-standalone-dollar-loading-spaced-subscript')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      '$$',
      'f _ { x }',
    ].join('\n')

    let nodes: any[] = []
    let stableSerialized = ''

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

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].markup).toBe('$$')
    expect(mathBlocks[0].loading).toBe(true)
    expect(mathBlocks[0].content).toContain('f _ { x }')
  })

  it('still emits loading math_block for real standalone explicit \\[ opener with weak spaced-subscript content during streaming', () => {
    const md = getMarkdown('stream-standalone-bracket-loading-spaced-subscript')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      '\\[',
      'f _ { x }',
    ].join('\n')

    let nodes: any[] = []
    let stableSerialized = ''

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

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].markup).toBe('\\[\\]')
    expect(mathBlocks[0].loading).toBe(true)
    expect(mathBlocks[0].content).toContain('f _ { x }')
  })

  it('preserves inline math before tolerant $$ block and text after closing $', () => {
    const md = getMarkdown('issue-492-math-boundary')

    const content = `Decentralized stochastic optimization is a fundamental paradigm for large-scale learning over networks, where agents communicate only with their neighbors and no central coordinator is required. For strongly convex problems, communication efficiency is mainly determined by the condition number $\\kappa=L/\\mu$ and the network spectral gap $1-\\beta$. Although deterministic decentralized methods can simultaneously achieve accelerated $\\sqrt{\\kappa}$ and $1/\\sqrt{1-\\beta}$ dependences, no existing stochastic method attains both improvements at once. In this paper, we propose *Multi-Gossip Accelerated DSGD* (MG-ADSGD), a decentralized stochastic algorithm that combines Nesterov-type primal--dual extrapolation with multi-round fast gossip averaging. The key idea is to couple the gossip depth with the mini-batch size so that additional communication rounds simultaneously improve consensus accuracy and reduce gradient variance. We show that MG-ADSGD achieves the communication complexity $$
\\widetilde{\\mathcal O}\\!\\left( \\frac{\\sigma^2}{\\mu n\\epsilon}\\log\\frac{1}{\\epsilon} + \\sqrt{\\frac{\\kappa}{1-\\beta}}\\log\\frac{1}{\\epsilon} \\right),
$$ where $\\epsilon$ denotes the target accuracy, $n$ is the number of nodes, and $\\sigma^2$ is the gradient variance. To the best of our knowledge, this bound yields the best currently available communication complexity for decentralized stochastic strongly convex optimization, up to logarithmic factors that are independent of $\\epsilon$.`

    const nodes = parseMarkdownToStructure(content, md, { final: true })

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('widetilde')
    expect(mathBlocks[0].markup).toBe('$$')
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

  it('keeps streaming output stable for tolerant $$$ block boundaries', () => {
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

    const prefixParagraphs = nodes.filter(
      (node: any) => node.type === 'paragraph' && String(node.raw ?? '').includes('display math'),
    )
    expect(prefixParagraphs).toHaveLength(1)

    // Re-parse the same completed source a few times. The result must stay
    // byte-for-byte stable.
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

    const stats = (md as any).stream.stats()
    expect(stats.total).toBeGreaterThan(0)
  })

  it('does not bypass top-level stream parser for math boundary cases', () => {
    const md = getMarkdown('stream-math-block-boundary-uses-stream-parser')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'Before $a$ and display math $$',
      'E=mc^2',
      '$$ where $x$ follows.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])
    expect(collectByType(nodes, 'math_block')).toHaveLength(1)

    // 这个断言很关键：不能为了解决 math boundary 直接 __disableStreamParse。
    // 否则大文档 streaming 会退化成每次全量 md.parse + stream cache reset。
    const stats = (md as any).stream.stats()
    expect(stats.total).toBe(1)
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

  it('does not rewrite raw HTML blocks that contain math-looking boundaries', () => {
    const md = getMarkdown('math-block-boundary-raw-html-guard')

    const content = [
      '<pre>',
      'literal $$',
      'E=mc^2',
      '$$ where it must stay raw html content',
      '</pre>',
      '',
      'after $x$ remains inline math',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true })

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('literal $$')
    expect(serialized).toContain('$$ where it must stay raw html content')
    expect(serialized).toContain('after')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('x')
  })

  it('does not rewrite configured custom HTML blocks that contain math-looking boundaries', () => {
    const md = getMarkdown('math-block-boundary-custom-html-guard')

    const content = [
      '<artifact>',
      'literal $$',
      'E=mc^2',
      '$$ where it must stay inside the custom node',
      '</artifact>',
      '',
      'outside display $$',
      'y = x + 1',
      '$$ after $x$ follows.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, {
      final: true,
      customHtmlTags: ['artifact'],
    })

    const customNodes = collectByType(nodes, 'artifact')
    expect(customNodes).toHaveLength(1)
    expect(String(customNodes[0].content)).toContain('literal $$')
    expect(String(customNodes[0].content)).toContain('$$ where it must stay inside the custom node')

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('y = x + 1')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('outside display')
    expect(serialized).toContain('after')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('x')
  })

  it('keeps streaming stable when protected custom HTML contains repeated math-looking boundaries', () => {
    const md = getMarkdown('stream-math-boundary-custom-html-no-loop')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const noisyCustomContent = Array.from(
      { length: 80 },
      (_, index) => `line ${index} literal $$`,
    ).join('\n')

    const source = [
      '<artifact>',
      noisyCustomContent,
      '$$ this must not become math',
      '</artifact>',
      '',
      'Plain $x$ text.',
    ].join('\n')

    let stableSerialized = ''
    let nodes: any[] = []

    for (let index = 0; index < 8; index++) {
      expect(() => {
        nodes = parseMarkdownToStructure(source, md, {
          final: false,
          streamParse: true,
          customHtmlTags: ['artifact'],
        }) as any[]
      }).not.toThrow()

      const serialized = JSON.stringify(nodes)
      if (index === 0)
        stableSerialized = serialized
      else
        expect(serialized).toBe(stableSerialized)
    }

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    expect(collectByType(nodes, 'artifact')).toHaveLength(1)
    expect(stableSerialized).toContain('$$ this must not become math')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('x')
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

  it('keeps streaming output stable for blockquoted tolerant $$$ boundaries', () => {
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

    const source = Array.from({ length: 80 }, (_, index) => `line ${index} escaped \\$$`).join('\n')

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

  it('normalizes a final tolerant $$$ opener after an earlier balanced same-line $$ pair', () => {
    const md = getMarkdown('math-block-boundary-balanced-prior-display-pair')

    const content = `Intro $$a+b$$ then display $$
E=mc^2
$$ after $x$ follows.`

    const nodes = parseMarkdownToStructure(content, md, { final: true })

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('E=mc^2')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('Intro')
    expect(serialized).toContain('then display')
    expect(serialized).toContain('after')
    expect(serialized).toContain('follows')

    const inlineMath = collectByType(nodes, 'math_inline')
    const inlineContent = inlineMath.map((node: any) => node.content).join('\n')
    expect(inlineContent).toContain('a+b')
    expect(inlineContent).toContain('x')
  })

  it('does not normalize a same-line $$ pair close as a tolerant block opener', () => {
    const md = getMarkdown('math-block-boundary-same-line-display-pair-close')

    const content = 'Inline display-like math $$a+b$$ stays in one paragraph.'
    const nodes = parseMarkdownToStructure(content, md, { final: true })

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('a+b')
    expect(JSON.stringify(nodes)).toContain('stays in one paragraph')
  })

  it('does not rewrite unfinished inline code spans ending with $$ during streaming', () => {
    const md = getMarkdown('stream-math-boundary-unclosed-inline-code-dollar')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = Array.from({ length: 80 }, (_, index) => `line ${index} \`unfinished code $$`).join('\n')

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
    expect(stableSerialized).toContain('unfinished code')
  })

  it('does not rewrite unfinished inline code spans ending with \\[ during streaming', () => {
    const md = getMarkdown('stream-math-boundary-unclosed-inline-code-bracket')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = Array.from({ length: 80 }, (_, index) => `line ${index} \`unfinished code \\\\[`).join('\n')

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
    expect(stableSerialized).toContain('unfinished code')
  })

  it('keeps streaming and final node order equivalent for tolerant $$$ boundaries', () => {
    const streamingMd = getMarkdown('stream-final-equivalence-math-boundary-stream')
    const finalMd = getMarkdown('stream-final-equivalence-math-boundary-final')
    ;(streamingMd as any).stream.reset()
    ;(streamingMd as any).stream.resetStats()

    const chunks = [
      'Before $a$ and display $',
      '$\nE=mc^2',
      '\n$$ where $x$ follows.',
    ]

    let source = ''
    let streamingNodes: any[] = []

    for (const chunk of chunks) {
      source += chunk
      streamingNodes = parseMarkdownToStructure(source, streamingMd, {
        final: false,
        streamParse: true,
      }) as any[]
    }

    const finalNodes = parseMarkdownToStructure(source, finalMd, {
      final: true,
      streamParse: true,
    }) as any[]

    expect(finalNodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])
    expect(streamingNodes.map(node => node.type)).toEqual(finalNodes.map(node => node.type))
    expect(collectByType(streamingNodes, 'math_block')).toHaveLength(1)
    expect(collectByType(finalNodes, 'math_block')).toHaveLength(1)
    expect(streamingNodes.filter((node: any) => node.type === 'paragraph' && String(node.raw ?? '').includes('Before'))).toHaveLength(1)
  })

  it('preserves math boundary text when callers use markdown-it parse directly', () => {
    const md = getMarkdown('direct-md-parse-math-boundary')

    const tokens = md.parse(`Before $a$ and display $$
E=mc^2
$$ where $x$ follows.`, { __markstreamFinal: true }) as any[]

    const mathBlocks = tokens.filter(token => token.type === 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('E=mc^2')

    const inlineContent = tokens
      .filter(token => token.type === 'inline')
      .map(token => token.content)
      .join('\n')

    expect(inlineContent).toContain('Before')
    expect(inlineContent).toContain('$a$')
    expect(inlineContent).toContain('where')
    expect(inlineContent).toContain('$x$')
  })

  it('keeps $$ math_block markup and accepts explicit display content with weak heuristic signals', () => {
    const md = getMarkdown('math-block-dollar-markup-weak-heuristic')

    const content = `Before.
$$
f _ { x }
$$ after $x$ follows.`

    const nodes = parseMarkdownToStructure(content, md, { final: true })

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].markup).toBe('$$')
    expect(mathBlocks[0].content).toContain('f _ { x }')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('Before')
    expect(serialized).toContain('after')
    expect(serialized).toContain('follows')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('x')
  })

  it('keeps $$ markup when callers use markdown-it parse directly with weak heuristic display content', () => {
    const md = getMarkdown('direct-md-parse-dollar-markup-weak-heuristic')

    const tokens = md.parse(`$$
f _ { x }
$$`, { __markstreamFinal: true }) as any[]

    const mathBlocks = tokens.filter(token => token.type === 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].markup).toBe('$$')
    expect(mathBlocks[0].content).toContain('f _ { x }')
  })

  it('keeps tolerant $$$ display math with spaced subscript content in final and streaming parses', () => {
    const finalMd = getMarkdown('math-block-tolerant-dollar-weak-heuristic-final')
    const streamingMd = getMarkdown('math-block-tolerant-dollar-weak-heuristic-stream')
    ;(streamingMd as any).stream.reset()
    ;(streamingMd as any).stream.resetStats()

    const content = `Before display $$
f _ { x }
$$ where $x$ follows.`

    const finalNodes = parseMarkdownToStructure(content, finalMd, { final: true }) as any[]

    const finalMathBlocks = collectByType(finalNodes, 'math_block')
    expect(finalMathBlocks).toHaveLength(1)
    expect(finalMathBlocks[0].markup).toBe('$$')
    expect(finalMathBlocks[0].content).toContain('f _ { x }')

    const chunks = [
      'Before display $',
      '$\nf _ { x }',
      '\n$$ where $x$ follows.',
    ]

    let source = ''
    let streamingNodes: any[] = []

    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index]
      source += chunk
      expect(() => {
        streamingNodes = parseMarkdownToStructure(source, streamingMd, {
          final: false,
          streamParse: true,
        }) as any[]
      }).not.toThrow()

      // Weak spaced subscript content alone is not enough to emit a tolerant
      // loading math_block. Wait for the closing `$` so streaming does not
      // split the prefix paragraph and then duplicate it when the close arrives.
      if (index < chunks.length - 1)
        expect(collectByType(streamingNodes, 'math_block')).toHaveLength(0)
    }

    expect(streamingNodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const stableSerialized = JSON.stringify(streamingNodes)
    for (let index = 0; index < 10; index++) {
      streamingNodes = parseMarkdownToStructure(source, streamingMd, {
        final: false,
        streamParse: true,
      }) as any[]
      expect(JSON.stringify(streamingNodes)).toBe(stableSerialized)
    }

    const streamingMathBlocks = collectByType(streamingNodes, 'math_block')
    expect(streamingMathBlocks).toHaveLength(1)
    expect(streamingMathBlocks[0].markup).toBe('$$')
    expect(streamingMathBlocks[0].content).toContain('f _ { x }')

    const serialized = stableSerialized
    expect(serialized).toContain('Before display')
    expect(serialized).toContain('where')
    expect(serialized).toContain('follows')

    const inlineMath = collectByType(streamingNodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('x')
  })

  it('keeps tolerant explicit \\[ display math with spaced subscript content in final and streaming parses', () => {
    const finalMd = getMarkdown('math-block-tolerant-bracket-weak-heuristic-final')
    const streamingMd = getMarkdown('math-block-tolerant-bracket-weak-heuristic-stream')
    ;(streamingMd as any).stream.reset()
    ;(streamingMd as any).stream.resetStats()

    const content = `Before display \\[
f _ { x }
\\] where $x$ follows.`

    const finalNodes = parseMarkdownToStructure(content, finalMd, { final: true }) as any[]

    expect(finalNodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const finalMathBlocks = collectByType(finalNodes, 'math_block')
    expect(finalMathBlocks).toHaveLength(1)
    expect(finalMathBlocks[0].markup).toBe('\\[\\]')
    expect(finalMathBlocks[0].content).toContain('f _ { x }')

    const chunks = [
      'Before display \\[\nf _ { x }',
      '\n\\] where $x$ follows.',
    ]

    let source = ''
    let streamingNodes: any[] = []

    for (let index = 0; index < chunks.length; index++) {
      source += chunks[index]
      expect(() => {
        streamingNodes = parseMarkdownToStructure(source, streamingMd, {
          final: false,
          streamParse: true,
        }) as any[]
      }).not.toThrow()

      // Weak spaced subscript content alone is not enough to emit a tolerant
      // loading math_block. Wait for the closing `\]` so streaming does not
      // split the prefix paragraph and then duplicate it when the close arrives.
      if (index < chunks.length - 1)
        expect(collectByType(streamingNodes, 'math_block')).toHaveLength(0)
    }

    expect(streamingNodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const stableSerialized = JSON.stringify(streamingNodes)
    for (let index = 0; index < 10; index++) {
      streamingNodes = parseMarkdownToStructure(source, streamingMd, {
        final: false,
        streamParse: true,
      }) as any[]
      expect(JSON.stringify(streamingNodes)).toBe(stableSerialized)
    }

    const streamingMathBlocks = collectByType(streamingNodes, 'math_block')
    expect(streamingMathBlocks).toHaveLength(1)
    expect(streamingMathBlocks[0].markup).toBe('\\[\\]')
    expect(streamingMathBlocks[0].content).toContain('f _ { x }')

    const serialized = stableSerialized
    expect(serialized).toContain('Before display')
    expect(serialized).toContain('where')
    expect(serialized).toContain('follows')

    const inlineMath = collectByType(streamingNodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('x')
  })

  it('preserves suffix after non-strict plain ] fallback for explicit \\[ blocks', () => {
    const md = getMarkdown('math-block-bracket-plain-close-suffix')

    const content = `Prefix before display \\[
x + y = z
] where $z$ follows.`

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].markup).toBe('\\[\\]')
    expect(mathBlocks[0].content).toContain('x + y = z')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('Prefix before display')
    expect(serialized).toContain('where')
    expect(serialized).toContain('follows')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('z')
  })

  it('does not hoist tolerant math blocks out of list items', () => {
    const md = getMarkdown('math-block-boundary-list-item')

    const content = `- Before $a$ $$
  E=mc^2
  $$ where $x$ follows.`

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('list')
    expect(nodes[0]?.items).toHaveLength(1)

    const itemChildren = nodes[0].items[0].children.map((node: any) => node.type)
    expect(itemChildren).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].markup).toBe('$$')
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

  it('does not split table rows that end with $$$$ into display math blocks', () => {
    const md = getMarkdown('math-block-boundary-table-row-guard')

    const content = [
      '| value |',
      '| --- |',
      '| literal $$ |',
      '| next |',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true })

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    expect(collectByType(nodes, 'table')).toHaveLength(1)

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('literal $$')
    expect(serialized).toContain('next')
  })

  it('does not carry normalized stream state into later non-normalized parses', () => {
    const md = getMarkdown('stream-math-boundary-normalized-to-normal-transition')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const normalizedSource = `Before $a$ and display $$
E=mc^2
$$ where $x$ follows.`

    const normalizedNodes = parseMarkdownToStructure(normalizedSource, md, {
      final: false,
      streamParse: true,
    })

    expect(collectByType(normalizedNodes, 'math_block')).toHaveLength(1)

    const plainNodes = parseMarkdownToStructure('Plain $y$ text.', md, {
      final: false,
      streamParse: true,
    })

    expect(collectByType(plainNodes, 'math_block')).toHaveLength(0)

    const serialized = JSON.stringify(plainNodes)
    expect(serialized).toContain('Plain')
    expect(serialized).toContain('text')
    expect(serialized).not.toContain('E=mc^2')
    expect(serialized).not.toContain('where')

    const inlineMath = collectByType(plainNodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('y')
  })

  it('does not mutate final unmatched tolerant $$$ opener into a display block', () => {
    const md = getMarkdown('math-block-boundary-final-unmatched-dollar')

    const content = [
      'This is ordinary final text ending with $$',
      'and this line should remain paragraph text, not loading math.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true })

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('ordinary final text')
    expect(serialized).toContain('should remain paragraph text')
    expect(serialized).toContain('$$')
  })

  it('does not mutate final unmatched tolerant \\[ opener into a display block', () => {
    const md = getMarkdown('math-block-boundary-final-unmatched-bracket')

    const content = [
      'This is ordinary final text ending with \\[',
      'and this line should remain paragraph text, not loading math.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true })

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('ordinary final text')
    expect(serialized).toContain('should remain paragraph text')
    expect(serialized).toContain('\\[')
  })

  it('ignores prior $$ delimiters inside code spans when detecting tolerant opener', () => {
    const md = getMarkdown('math-block-boundary-code-span-prior-dollar')

    const content = [
      'Before `literal $$` then display $$',
      'E=mc^2',
      '$$ after $x$ follows.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true })

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('E=mc^2')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('literal $$')
    expect(serialized).toContain('then display')
    expect(serialized).toContain('after')
    expect(serialized).toContain('follows')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('x')
  })

  it('ignores prior \\[ delimiters inside code spans when detecting tolerant opener', () => {
    const md = getMarkdown('math-block-boundary-code-span-prior-bracket')

    const content = [
      'Before `literal \\[` then display \\[',
      'x + y = z',
      '\\] after $z$ follows.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true })

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].markup).toBe('\\[\\]')
    expect(mathBlocks[0].content).toContain('x + y = z')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('literal \\\\[')
    expect(serialized).toContain('then display')
    expect(serialized).toContain('after')
    expect(serialized).toContain('follows')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('z')
  })

  it('keeps streaming unmatched tolerant $ opener as a single paragraph without emitting loading math_block', () => {
    const md = getMarkdown('stream-math-block-boundary-unmatched-loading')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'Before $a$ and display $',
      'E=mc^2',
    ].join('\n')

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

    // Tolerant same-line $ opener without close stays as paragraph — no loading math_block.
    expect(nodes.map(node => node.type)).toEqual(['paragraph'])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(0)

    const paragraphNode = nodes.find((n: any) => n.type === 'paragraph')
    expect(paragraphNode?.raw).toContain('Before')
    expect(paragraphNode?.raw).toContain('display')
    expect(paragraphNode?.raw).toContain('E=mc^2')
    expect(JSON.stringify(nodes)).toContain('display')
    expect(JSON.stringify(nodes)).toContain('E=mc^2')
  })

  it('does not misparse many final ordinary trailing $$ lines as math blocks', () => {
    const md = getMarkdown('math-block-boundary-final-ordinary-trailing-dollar-no-loop')

    const content = Array.from(
      { length: 120 },
      (_, index) => `line ${index} ordinary text ending with $$`,
    ).join('\n')

    let nodes: any[] = []
    expect(() => {
      nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]
    }).not.toThrow()

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('line 0 ordinary text')
    expect(serialized).toContain('line 119 ordinary text')
  })

  it('keeps streaming stable for many ordinary trailing $$ lines without repeated math parsing', () => {
    const md = getMarkdown('stream-math-boundary-ordinary-trailing-dollar-no-loop')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = Array.from(
      { length: 120 },
      (_, index) => `line ${index} ordinary text ending with $$`,
    ).join('\n')

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
    expect(stableSerialized).toContain('line 0 ordinary text')
    expect(stableSerialized).toContain('line 119 ordinary text')
  })

  it('does not make direct markdown-it parse treat ordinary tolerant $$$ pairs as math blocks', () => {
    const md = getMarkdown('direct-md-parse-ordinary-tolerant-dollar-pairs')

    const tokens = md.parse(`line 0 ordinary text ending with $$
line 1 ordinary text ending with $$`, { __markstreamFinal: true }) as any[]

    expect(tokens.filter(token => token.type === 'math_block')).toHaveLength(0)
  })

  it('does not let silent tolerant $$ detection split ordinary final paragraphs', () => {
    const md = getMarkdown('math-boundary-silent-final-dollar-no-paragraph-split')

    const content = [
      'The first line belongs to the same paragraph.',
      'This ordinary prose line happens to end with $$',
      'and this following line is still ordinary prose.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('paragraph')
    expect(nodes[0]?.raw).toContain('The first line belongs')
    expect(nodes[0]?.raw).toContain('happens to end with $$')
    expect(nodes[0]?.raw).toContain('following line is still ordinary prose')
  })

  it('does not let silent tolerant \\[ detection split ordinary final paragraphs', () => {
    const md = getMarkdown('math-boundary-silent-final-bracket-no-paragraph-split')

    const content = [
      'The first line belongs to the same paragraph.',
      'This ordinary prose line happens to end with \\[',
      'and this following line is still ordinary prose.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('paragraph')
    expect(nodes[0]?.raw).toContain('The first line belongs')
    expect(nodes[0]?.raw).toContain('happens to end with \\[')
    expect(nodes[0]?.raw).toContain('following line is still ordinary prose')
  })

  it('keeps streaming ordinary paragraphs stable when a middle line ends with $', () => {
    const md = getMarkdown('stream-math-boundary-silent-dollar-no-paragraph-split')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'The first line belongs to the same paragraph.',
      'This ordinary prose line happens to end with $$',
      'and this following line is still ordinary prose.',
    ].join('\n')

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
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('paragraph')
    expect(nodes[0]?.raw).toContain('The first line belongs')
    expect(nodes[0]?.raw).toContain('happens to end with $$')
    expect(nodes[0]?.raw).toContain('following line is still ordinary prose')
  })

  it('does not split ordinary prose around tolerant $ when the middle line only has prose hyphens', () => {
    const md = getMarkdown('math-boundary-tolerant-dollar-prose-hyphen-no-block')

    const content = [
      'The first line belongs to the same paragraph and happens to end with $$',
      'foo - bar',
      '$ after text should not become a display block.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('paragraph')
    expect(nodes[0]?.raw).toContain('happens to end with $$')
    expect(nodes[0]?.raw).toContain('foo - bar')
    expect(nodes[0]?.raw).toContain('after text should not become a display block')
  })

  it('keeps streaming ordinary prose stable around tolerant $ with prose hyphens', () => {
    const md = getMarkdown('stream-math-boundary-tolerant-dollar-prose-hyphen-no-block')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'The first line belongs to the same paragraph and happens to end with $$',
      'foo - bar',
      '$ after text should not become a display block.',
    ].join('\n')

    let nodes: any[] = []
    let stableSerialized = ''

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
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('paragraph')
    expect(nodes[0]?.raw).toContain('foo - bar')
  })

  it('still parses tolerant $$ content with a concrete formula operator signal', () => {
    const md = getMarkdown('math-boundary-tolerant-dollar-formula-signal')

    const content = [
      'Prefix text before display math $$',
      'x + y = z',
      '$$ where $z$ follows.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('x + y = z')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('Prefix text before display math')
    expect(serialized).toContain('where')
    expect(serialized).toContain('follows')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('z')
  })

  it('does not treat a plain ] followed by math continuation as a non-strict \\[ fallback close', () => {
    const md = getMarkdown('math-boundary-bracket-plain-close-math-continuation')

    const content = [
      '\\[',
      '] + x = 0',
      '\\] after $x$ follows.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(nodes.map(node => node.type)).toEqual([
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('] + x = 0')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('after')
    expect(serialized).toContain('follows')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('x')
  })

  it('attaches source line maps to synthetic boundary paragraphs for stream invalidation', () => {
    const md = getMarkdown('direct-md-parse-boundary-synthetic-paragraph-map')

    const tokens = md.parse(`Before $a$ and display $$
E=mc^2
$$ where $x$ follows.`, { __markstreamFinal: true }) as any[]

    const inlineTokens = tokens.filter(token => token.type === 'inline')
    expect(inlineTokens.map(token => token.content)).toEqual([
      'Before $a$ and display',
      'where $x$ follows.',
    ])

    expect(inlineTokens.map(token => token.map)).toEqual([
      [0, 1],
      [2, 3],
    ])

    const mathBlocks = tokens.filter(token => token.type === 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].map).toEqual([0, 3])
    expect(mathBlocks[0].content).toContain('E=mc^2')
  })

  it('keeps tolerant same-line $ opener as inline paragraph in streaming mode before close arrives', () => {
    const md = getMarkdown('direct-md-parse-boundary-loading-map')

    const tokens = md.parse(`Before $a$ and display $
E=mc^2`, { __markstreamFinal: false }) as any[]

    const inlineTokens = tokens.filter(token => token.type === 'inline')
    // Tolerant same-line opener without close stays as inline content — no math_block.
    expect(inlineTokens.map(token => token.content)).toEqual([
      'Before $a$ and display $\nE=mc^2',
    ])
    expect(inlineTokens[0].map).toEqual([0, 2])

    const mathBlocks = tokens.filter(token => token.type === 'math_block')
    expect(mathBlocks).toHaveLength(0)
  })

  it('parses tolerant display math after an escaped backtick in final mode', () => {
    const md = getMarkdown('math-boundary-escaped-backtick-before-opener-final')

    const content = [
      'Prefix escaped \\` marker before display $$',
      'E=mc^2',
      '$$ where $x$ follows.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('E=mc^2')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('Prefix escaped')
    expect(serialized).toContain('marker before display')
    expect(serialized).toContain('where')
    expect(serialized).toContain('follows')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('x')
  })

  it('keeps streaming stable for tolerant display math after an escaped backtick', () => {
    const md = getMarkdown('math-boundary-escaped-backtick-before-opener-streaming')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const chunks = [
      'Prefix escaped \\` marker before display $',
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

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const prefixParagraphs = nodes.filter(
      (node: any) => node.type === 'paragraph' && String(node.raw ?? '').includes('marker before display'),
    )
    expect(prefixParagraphs).toHaveLength(1)

    const stableSerialized = JSON.stringify(nodes)
    for (let index = 0; index < 10; index++) {
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]
      expect(JSON.stringify(nodes)).toBe(stableSerialized)
    }

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('E=mc^2')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('Prefix escaped')
    expect(serialized).toContain('marker before display')
    expect(serialized).toContain('where')
    expect(serialized).toContain('follows')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('x')
  })

  it('keeps streaming stable for tolerant explicit \\[ display math after an escaped backtick', () => {
    const md = getMarkdown('math-boundary-escaped-backtick-before-bracket-opener-streaming')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const chunks = [
      'Prefix escaped \\` marker before display \\',
      '[\nE=mc^2',
      '\n\\] where $x$ follows.',
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

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const prefixParagraphs = nodes.filter(
      (node: any) => node.type === 'paragraph' && String(node.raw ?? '').includes('marker before display'),
    )
    expect(prefixParagraphs).toHaveLength(1)

    const stableSerialized = JSON.stringify(nodes)
    for (let index = 0; index < 10; index++) {
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]
      expect(JSON.stringify(nodes)).toBe(stableSerialized)
    }

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].markup).toBe('\\[\\]')
    expect(mathBlocks[0].content).toContain('E=mc^2')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('Prefix escaped')
    expect(serialized).toContain('marker before display')
    expect(serialized).toContain('where')
    expect(serialized).toContain('follows')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('x')
  })

  it('does not drop a real previous paragraph that only resembles a stale boundary prefix', () => {
    const md = getMarkdown('stream-math-boundary-does-not-drop-real-previous-paragraph')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'Prefix escaped \\` marker before display $',
      '',
      'Prefix escaped \\` marker before display $$',
      'E=mc^2',
      '$$ where $x$ follows.',
    ].join('\n')

    let nodes: any[] = []
    let stableSerialized = ''

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

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'paragraph',
      'math_block',
      'paragraph',
    ])

    expect(nodes[0]?.raw).toContain('display $')
    expect(nodes[1]?.raw).toContain('marker before display')

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('E=mc^2')
  })

  it('does not dedupe a real suffix paragraph that equals the next tolerant prefix during streaming', () => {
    const md = getMarkdown('stream-math-boundary-suffix-prefix-same-content')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'First display $$',
      'a = 1',
      '$$ repeat',
      'repeat $$',
      'b = 2',
      '$$ done $x$.',
    ].join('\n')

    let nodes: any[] = []
    let stableSerialized = ''
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
    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const repeatParagraphs = nodes.filter((node: any) => node.type === 'paragraph' && node.raw === 'repeat')
    expect(repeatParagraphs).toHaveLength(2)

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(2)
    expect(mathBlocks[0].content).toContain('a = 1')
    expect(mathBlocks[1].content).toContain('b = 2')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('x')
  })

  it('keeps explicit standalone \\[ display math with weak spaced subscript content', () => {
    const md = getMarkdown('math-block-explicit-bracket-weak-spaced-subscript')

    const content = [
      '\\[',
      'f _ { x }',
      '\\] after $x$ follows.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(nodes.map(node => node.type)).toEqual([
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].markup).toBe('\\[\\]')
    expect(mathBlocks[0].content).toContain('f _ { x }')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('after')
    expect(serialized).toContain('follows')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('x')
  })

  it('keeps explicit standalone \\[ weak content stable during streaming', () => {
    const md = getMarkdown('stream-math-block-explicit-bracket-weak-spaced-subscript')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const chunks = [
      '\\[\nf _ { x }',
      '\n\\] after $x$ follows.',
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

    expect(nodes.map(node => node.type)).toEqual([
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].markup).toBe('\\[\\]')
    expect(mathBlocks[0].content).toContain('f _ { x }')

    const stableSerialized = JSON.stringify(nodes)
    for (let index = 0; index < 10; index++) {
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]
      expect(JSON.stringify(nodes)).toBe(stableSerialized)
    }

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('x')
  })

  it('treats plain ] followed by prose hyphen as non-strict \\[ fallback close suffix', () => {
    const md = getMarkdown('math-block-bracket-plain-close-prose-hyphen-suffix')

    const content = [
      'Prefix before display \\[',
      'x + y = z',
      '] - where $z$ follows in prose.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].markup).toBe('\\[\\]')
    expect(mathBlocks[0].content).toContain('x + y = z')
    expect(mathBlocks[0].content).not.toContain('where')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('Prefix before display')
    expect(serialized).toContain('where')
    expect(serialized).toContain('follows in prose')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('z')
  })

  it('keeps plain ] followed by math hyphen as \\[ content instead of fallback close', () => {
    const md = getMarkdown('math-block-bracket-plain-close-math-hyphen-continuation')

    const content = [
      '\\[',
      '] - x = 0',
      '\\] after $x$ follows.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(nodes.map(node => node.type)).toEqual([
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('] - x = 0')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('after')
    expect(serialized).toContain('follows')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('x')
  })

  it('keeps streaming stable for plain ] prose-hyphen fallback close suffix', () => {
    const md = getMarkdown('stream-math-block-bracket-plain-close-prose-hyphen-suffix')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const chunks = [
      'Prefix before display \\[\nx + y = z',
      '\n] - where $z$ follows in prose.',
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

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const stableSerialized = JSON.stringify(nodes)
    for (let index = 0; index < 10; index++) {
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]
      expect(JSON.stringify(nodes)).toBe(stableSerialized)
    }

    expect(stableSerialized).toContain('where')
    expect(stableSerialized).toContain('follows in prose')
    expect(collectByType(nodes, 'math_block')).toHaveLength(1)
  })

  it('does not let tolerant $$ scan cross a blank line before a later unrelated close', () => {
    const md = getMarkdown('math-boundary-tolerant-dollar-no-cross-blank-line')

    const content = [
      'This paragraph happens to end with $$',
      'x + y = z',
      '',
      'Later text with $z$ inline math.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('This paragraph happens to end with')
    expect(serialized).toContain('x + y = z')
    expect(serialized).toContain('Later text with')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('z')
  })

  it('keeps streaming stable when tolerant $$ candidate is separated from later $$ by a blank line', () => {
    const md = getMarkdown('stream-math-boundary-dollar-no-cross-blank-line')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'This paragraph happens to end with $$',
      'x + y = z',
      '',
      'Later text with $z$ inline math.',
    ].join('\n')

    let nodes: any[] = []
    let stableSerialized = ''

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
    expect(stableSerialized).toContain('This paragraph happens to end with')
    expect(stableSerialized).toContain('x + y = z')
    expect(stableSerialized).toContain('Later text with')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('z')
  })

  it('does not let tolerant $$ scan cross a heading/list/fence boundary', () => {
    const md = getMarkdown('math-boundary-tolerant-dollar-no-cross-block-markers')

    const cases = [
      [
        'heading',
        [
          'Text before malformed candidate $$',
          'x + y = z',
          '## Next section',
          'Some $$ later $z$ text.',
        ].join('\n'),
      ],
      [
        'list',
        [
          'Text before malformed candidate $$',
          'x + y = z',
          '- next item',
          'Some $$ later $z$ text.',
        ].join('\n'),
      ],
      [
        'fence',
        [
          'Text before malformed candidate $$',
          'x + y = z',
          '```ts',
          'Some $$ later $z$ text.',
          '```',
        ].join('\n'),
      ],
    ] as const

    for (const [name, content] of cases) {
      const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]
      const serialized = JSON.stringify(nodes)

      expect(collectByType(nodes, 'math_block'), name).toHaveLength(0)
      expect(serialized, name).toContain('Text before malformed candidate')
      expect(serialized, name).toContain('x + y = z')
      expect(serialized, name).toContain('later')
    }
  })

  it('does not let tolerant explicit \\[ scan cross a blank line before a later unrelated close', () => {
    const md = getMarkdown('math-boundary-tolerant-bracket-no-cross-blank-line')

    const content = [
      'This paragraph happens to end with \\[',
      'x + y = z',
      '',
      '\\] appears later as ordinary text, with $z$ inline.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('This paragraph happens to end with')
    expect(serialized).toContain('x + y = z')
    expect(serialized).toContain('appears later as ordinary text')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('z')
  })

  it('keeps streaming stable when tolerant explicit \\[ candidate is separated from later \\] by a blank line', () => {
    const md = getMarkdown('stream-math-boundary-bracket-no-cross-blank-line')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'This paragraph happens to end with \\[',
      'x + y = z',
      '',
      '\\] appears later as ordinary text, with $z$ inline.',
    ].join('\n')

    let nodes: any[] = []
    let stableSerialized = ''

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
    expect(stableSerialized).toContain('This paragraph happens to end with')
    expect(stableSerialized).toContain('x + y = z')
    expect(stableSerialized).toContain('appears later as ordinary text')
  })

  it('does not let tolerant $ close on a heading boundary that contains $', () => {
    const md = getMarkdown('math-boundary-dollar-no-close-on-heading-boundary')

    const content = [
      'Text before malformed candidate $$',
      'x + y = z',
      '## Section $ should not close previous display math',
      'after $z$ remains inline.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('Text before malformed candidate')
    expect(serialized).toContain('x + y = z')
    expect(serialized).toContain('Section')
    expect(serialized).toContain('should not close previous display math')
    expect(serialized).toContain('after')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('z')
  })

  it('keeps streaming stable when tolerant $ candidate reaches a heading boundary containing $', () => {
    const md = getMarkdown('stream-math-boundary-dollar-no-close-on-heading-boundary')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'Text before malformed candidate $$',
      'x + y = z',
      '## Section $ should not close previous display math',
      'after $z$ remains inline.',
    ].join('\n')

    let nodes: any[] = []
    let stableSerialized = ''

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
    expect(stableSerialized).toContain('Text before malformed candidate')
    expect(stableSerialized).toContain('x + y = z')
    expect(stableSerialized).toContain('Section')
    expect(stableSerialized).toContain('should not close previous display math')
    expect(stableSerialized).toContain('after')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('z')
  })

  it('does not let tolerant explicit \\[ close on a list boundary that contains \\]', () => {
    const md = getMarkdown('math-boundary-bracket-no-close-on-list-boundary')

    const content = [
      'Text before malformed candidate \\[',
      'x + y = z',
      '- list item \\] should not close previous display math',
      'after $z$ remains inline.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('Text before malformed candidate')
    expect(serialized).toContain('x + y = z')
    expect(serialized).toContain('list item')
    expect(serialized).toContain('should not close previous display math')
    expect(serialized).toContain('after')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('z')
  })

  it('keeps streaming stable when tolerant explicit \\[ candidate reaches a list boundary containing \\]', () => {
    const md = getMarkdown('stream-math-boundary-bracket-no-close-on-list-boundary')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'Text before malformed candidate \\[',
      'x + y = z',
      '- list item \\] should not close previous display math',
      'after $z$ remains inline.',
    ].join('\n')

    let nodes: any[] = []
    let stableSerialized = ''

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
    expect(stableSerialized).toContain('Text before malformed candidate')
    expect(stableSerialized).toContain('x + y = z')
    expect(stableSerialized).toContain('list item')
    expect(stableSerialized).toContain('should not close previous display math')
    expect(stableSerialized).toContain('after')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('z')
  })

  it('parses tolerant $$ display math whose first content line starts with absolute-value pipes', () => {
    const md = getMarkdown('math-boundary-dollar-absolute-value-first-line')

    const content = [
      'Before absolute value display $$',
      '|x| = y',
      '$$ where $y$ follows.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].markup).toBe('$$')
    expect(mathBlocks[0].content).toContain('|x| = y')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('Before absolute value display')
    expect(serialized).toContain('where')
    expect(serialized).toContain('follows')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('y')
  })

  it('parses tolerant $$ display math whose first content line uses spaced absolute-value pipes', () => {
    const md = getMarkdown('math-boundary-dollar-spaced-absolute-value-first-line')

    const content = [
      'Before absolute value display $$',
      '| x | = y',
      '$$ where $y$ follows.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].markup).toBe('$$')
    expect(mathBlocks[0].content).toContain('| x | = y')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('Before absolute value display')
    expect(serialized).toContain('where')
    expect(serialized).toContain('follows')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('y')
  })

  it('keeps streaming stable for tolerant $$ spaced absolute-value display math', () => {
    const md = getMarkdown('stream-math-boundary-dollar-spaced-absolute-value-first-line')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const chunks = [
      'Before absolute value display $',
      '$\n| x | = y',
      '\n$$ where $y$ follows.',
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

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const stableSerialized = JSON.stringify(nodes)
    for (let index = 0; index < 10; index++) {
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]
      expect(JSON.stringify(nodes)).toBe(stableSerialized)
    }

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].markup).toBe('$$')
    expect(mathBlocks[0].content).toContain('| x | = y')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('y')
  })

  it('keeps streaming stable for tolerant $$ absolute-value display math', () => {
    const md = getMarkdown('stream-math-boundary-dollar-absolute-value-first-line')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const chunks = [
      'Before absolute value display $',
      '$\n|x| = y',
      '\n$$ where $y$ follows.',
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

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const stableSerialized = JSON.stringify(nodes)
    for (let index = 0; index < 10; index++) {
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]
      expect(JSON.stringify(nodes)).toBe(stableSerialized)
    }

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('|x| = y')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('y')
  })

  it('still treats real one-column markdown table rows as tolerant-scan boundaries', () => {
    const md = getMarkdown('math-boundary-dollar-one-column-table-stop')

    const content = [
      'This paragraph happens to end with $$',
      '| value |',
      '| --- |',
      '| $x$ |',
      '$$ should remain ordinary text.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    expect(collectByType(nodes, 'table')).toHaveLength(1)

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('happens to end with')
    expect(serialized).toContain('should remain ordinary text')
  })

  it('parses inline children for synthetic prefix and suffix paragraphs in direct markdown-it parse', () => {
    const md = getMarkdown('direct-md-parse-synthetic-boundary-inline-children')

    const tokens = md.parse(`Before $a$ and display $$
E=mc^2
$$ where $x$ follows.`, { __markstreamFinal: true }) as any[]

    const inlineTokens = tokens.filter(token => token.type === 'inline')
    expect(inlineTokens.map(token => token.content)).toEqual([
      'Before $a$ and display',
      'where $x$ follows.',
    ])

    const prefixMath = inlineTokens[0]?.children?.filter((child: any) => child.type === 'math_inline') ?? []
    const suffixMath = inlineTokens[1]?.children?.filter((child: any) => child.type === 'math_inline') ?? []

    expect(prefixMath.map((child: any) => child.content)).toContain('a')
    expect(suffixMath.map((child: any) => child.content)).toContain('x')

    const mathBlocks = tokens.filter(token => token.type === 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('E=mc^2')
  })

  it('produces correct tokens for synthetic prefix and suffix through full parse+render pipeline', () => {
    const md = getMarkdown('direct-md-render-synthetic-boundary-prefix-suffix')

    const tokens = md.parse(`Before $a$ and display $$
E=mc^2
$$ where $x$ follows.`, { __markstreamFinal: true }) as any[]

    // Verify structure: prefix paragraph, math_block, suffix paragraph
    const mathBlocks = tokens.filter(token => token.type === 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('E=mc^2')

    const inlineTokens = tokens.filter(token => token.type === 'inline')
    expect(inlineTokens).toHaveLength(2)
    expect(inlineTokens[0].content).toBe('Before $a$ and display')
    expect(inlineTokens[1].content).toBe('where $x$ follows.')

    // Verify inline children exist (math_inline in prefix and suffix)
    const prefixInlineMath = inlineTokens[0]?.children?.filter((c: any) => c.type === 'math_inline') ?? []
    const suffixInlineMath = inlineTokens[1]?.children?.filter((c: any) => c.type === 'math_inline') ?? []
    expect(prefixInlineMath.length).toBeGreaterThan(0)
    expect(suffixInlineMath.length).toBeGreaterThan(0)
  })

  it('does not let tolerant $$ scan consume markdown table rows without trailing pipe', () => {
    const md = getMarkdown('math-boundary-dollar-table-without-trailing-pipe-stop')

    const content = [
      'This paragraph happens to end with $$',
      '| x + y = z | label',
      '| --- | ---',
      '| $x$ | value',
      '$$ should remain ordinary text.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    expect(collectByType(nodes, 'table')).toHaveLength(1)

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('This paragraph happens to end with')
    expect(serialized).toContain('should remain ordinary text')
    expect(serialized).toContain('label')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('x')
  })

  it('keeps streaming stable when tolerant $$ candidate reaches table rows without trailing pipe', () => {
    const md = getMarkdown('stream-math-boundary-dollar-table-without-trailing-pipe-stop')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'This paragraph happens to end with $$',
      '| x + y = z | label',
      '| --- | ---',
      '| $x$ | value',
      '$$ should remain ordinary text.',
    ].join('\n')

    let nodes: any[] = []
    let stableSerialized = ''

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

    // In streaming mode, the standalone $$ on the last line is a line-start
    // display math delimiter and deserves a loading token.
    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].loading).toBe(true)
    expect(mathBlocks[0].markup).toBe('$$')
    expect(stableSerialized).toContain('This paragraph happens to end with')
    expect(stableSerialized).toContain('should remain ordinary text')
    expect(stableSerialized).toContain('label')
    expect(stableSerialized).toContain('value')

    const finalNodes = parseMarkdownToStructure(source, md, { final: true }) as any[]
    expect(collectByType(finalNodes, 'math_block')).toHaveLength(0)
    expect(collectByType(finalNodes, 'table')).toHaveLength(1)
  })

  it('still parses tolerant $$ absolute-value math and does not confuse it with a table', () => {
    const md = getMarkdown('math-boundary-dollar-absolute-value-not-table-after-tightening')

    const content = [
      'Before absolute value display $$',
      '|x| = y',
      '$$ where $y$ follows.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('|x| = y')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('y')
  })

  it('does not let tolerant $$ scan cross thematic or setext-style boundaries', () => {
    const md = getMarkdown('math-boundary-dollar-no-cross-rule-boundaries')

    const cases = [
      [
        'thematic-star',
        [
          'Text before malformed candidate $$',
          'x + y = z',
          '***',
          '$$ should remain ordinary text with $z$ inline.',
        ].join('\n'),
      ],
      [
        'thematic-dash',
        [
          'Text before malformed candidate $$',
          'x + y = z',
          '- - -',
          '$$ should remain ordinary text with $z$ inline.',
        ].join('\n'),
      ],
      [
        'setext-equals',
        [
          'Text before malformed candidate $$',
          'x + y = z',
          '===',
          '$$ should remain ordinary text with $z$ inline.',
        ].join('\n'),
      ],
    ] as const

    for (const [name, content] of cases) {
      const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]
      const serialized = JSON.stringify(nodes)

      expect(collectByType(nodes, 'math_block'), name).toHaveLength(0)
      expect(serialized, name).toContain('Text before malformed candidate')
      expect(serialized, name).toContain('x + y = z')
      expect(serialized, name).toContain('should remain ordinary text')

      const inlineMath = collectByType(nodes, 'math_inline')
      expect(inlineMath.map((node: any) => node.content).join('\n'), name).toContain('z')
    }
  })

  it('keeps streaming stable when tolerant $$ candidate reaches thematic or setext-style boundaries', () => {
    const md = getMarkdown('stream-math-boundary-dollar-no-cross-rule-boundaries')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'Text before malformed candidate $$',
      'x + y = z',
      '***',
      '$$ should remain ordinary text with $z$ inline.',
    ].join('\n')

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

    expect(stableSerialized).toContain('Text before malformed candidate')
    expect(stableSerialized).toContain('x + y = z')
    expect(stableSerialized).toContain('should remain ordinary text')
  })

  it('does not let tolerant $$ scan cross a table delimiter row without leading pipes', () => {
    const md = getMarkdown('math-boundary-dollar-no-cross-table-without-leading-pipe')

    const content = [
      'Text before malformed candidate $$',
      'A | B',
      '--- | ---',
      'E=mc^2 | F=ma',
      '$$ should remain ordinary text with $z$ inline.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]
    const serialized = JSON.stringify(nodes)

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    expect(serialized).toContain('Text before malformed candidate')
    expect(serialized).toContain('A')
    expect(serialized).toContain('B')
    expect(serialized).toContain('E=mc')
    expect(serialized).toContain('F=ma')
    expect(serialized).toContain('should remain ordinary text')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('z')
  })

  it('keeps streaming stable when tolerant $$ candidate reaches a table delimiter row without leading pipes', () => {
    const md = getMarkdown('stream-math-boundary-dollar-no-cross-table-without-leading-pipe')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'Text before malformed candidate $$',
      'A | B',
      '--- | ---',
      'E=mc^2 | F=ma',
      '$$ should remain ordinary text with $z$ inline.',
    ].join('\n')

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

    expect(stableSerialized).toContain('Text before malformed candidate')
    expect(stableSerialized).toContain('E=mc')
    expect(stableSerialized).toContain('F=ma')
    expect(stableSerialized).toContain('should remain ordinary text')
  })

  it('does not let tolerant $$ scan cross a one-column markdown table delimiter row', () => {
    const md = getMarkdown('math-boundary-dollar-no-cross-one-column-table-delimiter')

    const content = [
      'Text before malformed candidate $$',
      '| value |',
      '| --- |',
      '| $x$ |',
      '$$ should remain ordinary text with $z$ inline.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]
    const serialized = JSON.stringify(nodes)

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    expect(collectByType(nodes, 'table')).toHaveLength(1)
    expect(serialized).toContain('Text before malformed candidate')
    expect(serialized).toContain('should remain ordinary text')
  })

  it('keeps streaming stable when tolerant $$ reaches a one-column markdown table delimiter row', () => {
    const md = getMarkdown('stream-math-boundary-dollar-no-cross-one-column-table-delimiter')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'Text before malformed candidate $$',
      '| value |',
      '| --- |',
      '| $x$ |',
      '$$ should remain ordinary text with $z$ inline.',
    ].join('\n')

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

    // In streaming mode, the standalone $$ on the last line is a line-start
    // display math delimiter and deserves a loading token.
    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].loading).toBe(true)
    expect(mathBlocks[0].markup).toBe('$$')
    expect(stableSerialized).toContain('Text before malformed candidate')
    expect(stableSerialized).toContain('should remain ordinary text')
  })

  it('does not let tolerant $$ scan cross an HTML closing block boundary', () => {
    const md = getMarkdown('math-boundary-dollar-no-cross-html-close-boundary')

    const content = [
      'Text before malformed candidate $$',
      'x + y = z',
      '</section>',
      '$$ should remain ordinary text with $z$ inline.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]
    const serialized = JSON.stringify(nodes)

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    expect(serialized).toContain('Text before malformed candidate')
    expect(serialized).toContain('x + y = z')
    expect(serialized).toContain('</section>')
    expect(serialized).toContain('should remain ordinary text')
  })

  it('does not let tolerant explicit \\[ scan cross thematic boundaries before a later unrelated close', () => {
    const md = getMarkdown('math-boundary-bracket-no-cross-rule-boundary')

    const content = [
      'Text before malformed candidate \\[',
      'x + y = z',
      '***',
      '\\] should remain ordinary text with $z$ inline.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]
    const serialized = JSON.stringify(nodes)

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    expect(serialized).toContain('Text before malformed candidate')
    expect(serialized).toContain('x + y = z')
    expect(serialized).toContain('should remain ordinary text')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('z')
  })

  it('does not duplicate inline math inside synthetic prefix/suffix paragraphs', () => {
    const md = getMarkdown('math-boundary-no-duplicate-synthetic-inline-children')

    const content = [
      'Before $a$ and display $$',
      'E=mc^2',
      '$$ where $x$ follows.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('E=mc^2')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content)).toEqual(['a', 'x'])
  })

  it('lets markdown-it core parse synthetic inline paragraphs exactly once', () => {
    const md = getMarkdown('direct-md-parse-synthetic-inline-once')

    const tokens = md.parse([
      'Before $a$ and display $$',
      'E=mc^2',
      '$$ where $x$ follows.',
    ].join('\n'), { __markstreamFinal: true }) as any[]

    const inlineTokens = tokens.filter(token => token.type === 'inline')
    expect(inlineTokens.map(token => token.content)).toEqual([
      'Before $a$ and display',
      'where $x$ follows.',
    ])

    expect(inlineTokens).toHaveLength(2)

    const inlineMathContents = inlineTokens.flatMap((token: any) =>
      (token.children ?? [])
        .filter((child: any) => child.type === 'math_inline')
        .map((child: any) => child.content),
    )

    expect(inlineMathContents).toEqual(['a', 'x'])

    for (const inlineToken of inlineTokens) {
      const mathChildren = (inlineToken.children ?? []).filter((child: any) => child.type === 'math_inline')
      expect(mathChildren).toHaveLength(1)
    }
  })

  it('still emits loading math_block for standalone $$ opener with weak single-token content during streaming', () => {
    const md = getMarkdown('stream-standalone-dollar-weak-single-token-loading')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      '$$',
      'x',
    ].join('\n')

    let nodes: any[] = []
    let stableSerialized = ''

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

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].markup).toBe('$$')
    expect(mathBlocks[0].loading).toBe(true)
    expect(mathBlocks[0].content).toBe('x')
    expect(stableSerialized).toContain('x')
  })

  it('still emits loading math_block for standalone explicit \\[ opener with weak single-token content during streaming', () => {
    const md = getMarkdown('stream-standalone-bracket-weak-single-token-loading')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      '\\[',
      'y',
    ].join('\n')

    let nodes: any[] = []
    let stableSerialized = ''

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

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].markup).toBe('\\[\\]')
    expect(mathBlocks[0].loading).toBe(true)
    expect(mathBlocks[0].content).toBe('y')
    expect(stableSerialized).toContain('y')
  })

  it('does not emit loading math_block for tolerant same-line $$ opener with weak content before close arrives', () => {
    const md = getMarkdown('stream-tolerant-dollar-weak-content-waits-for-close')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'Before display $$',
      'x',
    ].join('\n')

    let nodes: any[] = []
    let stableSerialized = ''

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
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('paragraph')
    expect(nodes[0]?.raw).toContain('Before display')
    expect(nodes[0]?.raw).toContain('x')
  })

  it('does not backtrack on long near-thematic tolerant $ boundary candidates', () => {
    const md = getMarkdown('math-boundary-long-near-thematic-no-redos')

    // A very long thematic break line (7000 underscores) is a valid
    // horizontal-rule boundary that the tolerant scan must stop at.
    // The old nested-quantifier regex `(?:_[\t ]*){3,}` can go
    // pathological on this input; the deterministic scanner handles
    // it in O(n).
    const thematicLine = '_'.repeat(7000)
    const content = [
      'Text before malformed candidate $$',
      'x + y = z',
      thematicLine,
      'Later text with $z$ inline math.',
    ].join('\n')

    let nodes: any[] = []
    expect(() => {
      nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]
    }).not.toThrow()

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('Text before malformed candidate')
    expect(serialized).toContain('Later text')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('z')
  })

  it('keeps streaming stable on long near-thematic tolerant $ boundary candidates', () => {
    const md = getMarkdown('stream-math-boundary-long-near-thematic-no-redos')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const thematicLine = '_'.repeat(7000)
    const source = [
      'Text before malformed candidate $$',
      'x + y = z',
      thematicLine,
      'Later text with $z$ inline math.',
    ].join('\n')

    let nodes: any[] = []
    let stableSerialized = ''
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
    expect(stableSerialized).toContain('Text before malformed candidate')
    expect(stableSerialized).toContain('Later text')
  })

  it('does not backtrack on long table-delimiter-like tolerant $ candidates', () => {
    const md = getMarkdown('math-boundary-long-malformed-table-delimiter-no-redos')

    // A single-cell table delimiter where the cell content is very long.
    // The old regex `:?-{3,}:?` can cause O(n) or worse scanning on long
    // dash runs. The deterministic scanner handles it in a single linear pass.
    const longDashes = '-'.repeat(7000)
    const content = [
      'Text before malformed candidate $$',
      `| ${longDashes} |`,
      'Later text with $z$ inline math.',
    ].join('\n')

    let nodes: any[] = []
    expect(() => {
      nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]
    }).not.toThrow()

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('Text before malformed candidate')
    expect(serialized).toContain('Later text')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('z')
  })

  it('parses closed tolerant $$ display math with weak single-token content', () => {
    const md = getMarkdown('math-boundary-tolerant-dollar-closed-single-token')

    const content = [
      'Before display $$',
      'x',
      '$$ where $x$ follows.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].markup).toBe('$$')
    expect(mathBlocks[0].content).toBe('x')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content)).toContain('x')
  })

  it('keeps streaming closed tolerant $$ single-token display math stable', () => {
    const md = getMarkdown('stream-math-boundary-tolerant-dollar-closed-single-token')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const chunks = [
      'Before display $',
      '$\nx',
      '\n$$ where $x$ follows.',
    ]

    let source = ''
    let nodes: any[] = []

    for (let index = 0; index < chunks.length; index++) {
      source += chunks[index]
      expect(() => {
        nodes = parseMarkdownToStructure(source, md, {
          final: false,
          streamParse: true,
        }) as any[]
      }).not.toThrow()

      // Do not emit a synthetic prefix paragraph + loading math_block before the
      // closing "$$" arrives. This is the stale/duplicate-token shape that caused
      // several previous streaming regressions.
      if (index < chunks.length - 1)
        expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    }

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const stableSerialized = JSON.stringify(nodes)
    for (let index = 0; index < 10; index++) {
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]
      expect(JSON.stringify(nodes)).toBe(stableSerialized)
    }

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toBe('x')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content)).toContain('x')
  })

  it('parses closed tolerant explicit \\[ display math with weak single-token content', () => {
    const md = getMarkdown('math-boundary-tolerant-bracket-closed-single-token')

    const content = [
      'Before display \\[',
      'y',
      '\\] where $y$ follows.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].markup).toBe('\\[\\]')
    expect(mathBlocks[0].content).toBe('y')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content)).toContain('y')
  })

  it('does not promote a closed tolerant $$ block whose content is only a prose word', () => {
    const md = getMarkdown('math-boundary-tolerant-dollar-prose-word-no-block')

    const content = [
      'This prose line happens to end with $$',
      'hello',
      '$$ should stay ordinary text with $x$ inline.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('happens to end with')
    expect(serialized).toContain('hello')
    expect(serialized).toContain('should stay ordinary text')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content)).toContain('x')
  })

  it('does not close explicit \\[ display math on escaped \\] inside content', () => {
    const md = getMarkdown('math-boundary-bracket-escaped-close-inside-content')

    const content = [
      'Before display \\[',
      'a \\\\] b = c',
      '\\] where $c$ follows.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].markup).toBe('\\[\\]')
    expect(mathBlocks[0].content).toContain('b = c')
    expect(mathBlocks[0].content).not.toContain('where')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content)).toContain('c')
  })

  it('keeps streaming stable when explicit \\[ content contains escaped \\]', () => {
    const md = getMarkdown('stream-math-boundary-bracket-escaped-close-inside-content')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const chunks = [
      'Before display \\[\na \\\\] b = c',
      '\n\\] where $c$ follows.',
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

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const stableSerialized = JSON.stringify(nodes)
    for (let index = 0; index < 10; index++) {
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]
      expect(JSON.stringify(nodes)).toBe(stableSerialized)
    }

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('b = c')
  })

  it('preserves tolerant math block boundaries with CRLF newlines', () => {
    const md = getMarkdown('math-boundary-crlf-tolerant-dollar')

    const content = [
      'Before $a$ and display $$',
      'E=mc^2',
      '$$ where $x$ follows.',
    ].join('\r\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('E=mc^2')

    const inlineMath = collectByType(nodes, 'math_inline')
    const inlineContent = inlineMath.map((node: any) => node.content).join('\n')
    expect(inlineContent).toContain('a')
    expect(inlineContent).toContain('x')
  })

  it('keeps issue-492 delimiter-adjacent prefixes parseable during streaming', () => {
    const md = getMarkdown('stream-issue-492-prefix-checkpoints')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'Decentralized stochastic optimization is a fundamental paradigm for large-scale learning over networks. For strongly convex problems, communication efficiency is mainly determined by the condition number $\\kappa=L/\\mu$ and the network spectral gap $1-\\beta$. We show that MG-ADSGD achieves the communication complexity $$',
      '\\widetilde{\\mathcal O}\\!\\left( \\frac{\\sigma^2}{\\mu n\\epsilon}\\log\\frac{1}{\\epsilon} + \\sqrt{\\frac{\\kappa}{1-\\beta}}\\log\\frac{1}{\\epsilon} \\right),',
      '$$ where $\\epsilon$ denotes the target accuracy, $n$ is the number of nodes, and $\\sigma^2$ is the gradient variance.',
    ].join('\n')

    const checkpoints = new Set<number>([source.length])
    const sensitive = new Set(['$', '\\', '\n'])
    for (let index = 1; index <= source.length; index++) {
      if (
        index % 31 === 0
        || sensitive.has(source[index - 1])
        || sensitive.has(source[index] ?? '')
      ) {
        checkpoints.add(index)
      }
    }

    let nodes: any[] = []
    for (const end of [...checkpoints].sort((a, b) => a - b)) {
      expect(() => {
        nodes = parseMarkdownToStructure(source.slice(0, end), md, {
          final: false,
          streamParse: true,
        }) as any[]
      }).not.toThrow()
    }

    // The streaming checkpoint scan must not leave stale paragraph tokens from
    // the pre-close state. This is the important invariant for issue #492:
    // once the close delimiter arrives, the stream result must be the same
    // block shape as the final parse.
    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])
    expect(collectByType(nodes, 'math_block')).toHaveLength(1)

    const stableSerialized = JSON.stringify(nodes)
    for (let index = 0; index < 10; index++) {
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]
      expect(JSON.stringify(nodes)).toBe(stableSerialized)
    }

    // Verify the non-streaming final parse produces the correct structure.
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()
    const finalNodes = parseMarkdownToStructure(source, md, { final: true }) as any[]
    expect(finalNodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(finalNodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('widetilde')

    const inlineMath = collectByType(finalNodes, 'math_inline')
    const inlineContent = inlineMath.map((node: any) => node.content).join('\n')
    expect(inlineContent).toContain('kappa')
    expect(inlineContent).toContain('epsilon')
    expect(inlineContent).toContain('sigma')
  })

  it('does not close tolerant $ on a markdown table header row before delimiter', () => {
    const md = getMarkdown('math-boundary-dollar-no-close-on-table-header')

    const content = [
      'Text before malformed candidate $',
      'x + y = z',
      'Name $ | Value',
      '--- | ---',
      '$x$ | value',
      'after $z$ remains inline.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]
    const serialized = JSON.stringify(nodes)

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    expect(serialized).toContain('Text before malformed candidate')
    expect(serialized).toContain('x + y = z')
    expect(serialized).toContain('Name')
    expect(serialized).toContain('Value')
    expect(serialized).toContain('after')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('z')
  })

  it('keeps streaming stable when tolerant $ reaches a markdown table header row before delimiter', () => {
    const md = getMarkdown('stream-math-boundary-dollar-no-close-on-table-header')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'Text before malformed candidate $',
      'x + y = z',
      'Name $ | Value',
      '--- | ---',
      '$x$ | value',
      'after $z$ remains inline.',
    ].join('\n')

    let nodes: any[] = []
    let stableSerialized = ''

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
    expect(stableSerialized).toContain('Text before malformed candidate')
    expect(stableSerialized).toContain('Name')
    expect(stableSerialized).toContain('Value')
    expect(stableSerialized).toContain('after')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('z')
  })

  it('does not close tolerant $ on a reference definition without whitespace after colon', () => {
    const md = getMarkdown('math-boundary-dollar-no-close-on-reference-definition-no-space')

    const content = [
      'Text before malformed candidate $',
      'x + y = z',
      '[math-ref]:https://example.com/$-literal',
      'after $z$ remains inline.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]
    const serialized = JSON.stringify(nodes)

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    expect(serialized).toContain('Text before malformed candidate')
    expect(serialized).toContain('x + y = z')
    expect(serialized).toContain('after')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('z')
  })

  it('keeps streaming stable when tolerant $ reaches a no-space reference definition', () => {
    const md = getMarkdown('stream-math-boundary-dollar-no-close-on-reference-definition-no-space')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'Text before malformed candidate $',
      'x + y = z',
      '[math-ref]:https://example.com/$-literal',
      'after $z$ remains inline.',
    ].join('\n')

    let nodes: any[] = []
    let stableSerialized = ''

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
    expect(stableSerialized).toContain('Text before malformed candidate')
    expect(stableSerialized).toContain('x + y = z')
    expect(stableSerialized).toContain('after')

    const inlineMath = collectByType(nodes, 'math_inline')
    expect(inlineMath.map((node: any) => node.content).join('\n')).toContain('z')
  })
})
