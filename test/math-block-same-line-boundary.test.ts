import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
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

  it('preserves inline math before tolerant $$$ block and text after closing $$', () => {
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
      'paragraph',
      'math_block',
      'paragraph',
    ])

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

    expect(streamingNodes.map(node => node.type)).toEqual([
      'paragraph',
      'paragraph',
      'math_block',
      'paragraph',
    ])
    expect(finalNodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])
    expect(collectByType(streamingNodes, 'math_block')).toHaveLength(1)
    expect(collectByType(finalNodes, 'math_block')).toHaveLength(1)
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

  it('does not split table rows that end with $$$ into display math blocks', () => {
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

  it('keeps streaming unmatched tolerant $$$ opener as a single loading block without duplicated prefix', () => {
    const md = getMarkdown('stream-math-block-boundary-unmatched-loading')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'Before $a$ and display $$',
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

    expect(nodes.map(node => node.type)).toEqual(['paragraph', 'math_block'])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].loading).toBe(true)
    expect(mathBlocks[0].content).toContain('E=mc^2')

    const paragraphNode = nodes.find((n: any) => n.type === 'paragraph')
    expect(paragraphNode?.raw).toContain('Before')
    expect(paragraphNode?.raw).toContain('display')
    expect(JSON.stringify(nodes)).toContain('display')
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
      'This ordinary prose line happens to end with $',
      'and this following line is still ordinary prose.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('paragraph')
    expect(nodes[0]?.raw).toContain('The first line belongs')
    expect(nodes[0]?.raw).toContain('happens to end with $')
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
      'This ordinary prose line happens to end with $',
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
    expect(nodes[0]?.raw).toContain('happens to end with $')
    expect(nodes[0]?.raw).toContain('following line is still ordinary prose')
  })

  it('does not split ordinary prose around tolerant $ when the middle line only has prose hyphens', () => {
    const md = getMarkdown('math-boundary-tolerant-dollar-prose-hyphen-no-block')

    const content = [
      'The first line belongs to the same paragraph and happens to end with $',
      'foo - bar',
      '$ after text should not become a display block.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(content, md, { final: true }) as any[]

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('paragraph')
    expect(nodes[0]?.raw).toContain('happens to end with $')
    expect(nodes[0]?.raw).toContain('foo - bar')
    expect(nodes[0]?.raw).toContain('after text should not become a display block')
  })

  it('keeps streaming ordinary prose stable around tolerant $ with prose hyphens', () => {
    const md = getMarkdown('stream-math-boundary-tolerant-dollar-prose-hyphen-no-block')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'The first line belongs to the same paragraph and happens to end with $',
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

  it('does not advance loading tolerant math blocks past the current streaming line range', () => {
    const md = getMarkdown('direct-md-parse-boundary-loading-map')

    const tokens = md.parse(`Before $a$ and display $$
E=mc^2`, { __markstreamFinal: false }) as any[]

    const inlineTokens = tokens.filter(token => token.type === 'inline')
    expect(inlineTokens.map(token => token.content)).toEqual([
      'Before $a$ and display',
    ])
    expect(inlineTokens[0].map).toEqual([0, 1])

    const mathBlocks = tokens.filter(token => token.type === 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].loading).toBe(true)
    expect(mathBlocks[0].map).toEqual([0, 2])
    expect(mathBlocks[0].content).toContain('E=mc^2')
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
})
