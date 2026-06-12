import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'
import {
  getTolerantMathBlockBoundaryStreamKey,
  mayContainTolerantMathBlockBoundaryOpener,
} from '../src/plugins/math'

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

    for (const value of Object.values(nodes))
      collectByType(value, type, out, seen)
  }

  return out
}

describe('math block same-line boundary', () => {
  it('preserves issue-492 prefix inline math, display math, and suffix inline math', () => {
    const md = getMarkdown('issue-492-final')
    const source = `Decentralized stochastic optimization is a fundamental paradigm for large-scale learning over networks, where agents communicate only with their neighbors and no central coordinator is required. For strongly convex problems, communication efficiency is mainly determined by the condition number $\\kappa=L/\\mu$ and the network spectral gap $1-\\beta$. Although deterministic decentralized methods can simultaneously achieve accelerated $\\sqrt{\\kappa}$ and $1/\\sqrt{1-\\beta}$ dependences, no existing stochastic method attains both improvements at once. We show that MG-ADSGD achieves the communication complexity $$
\\widetilde{\\mathcal O}\\!\\left( \\frac{\\sigma^2}{\\mu n\\epsilon}\\log\\frac{1}{\\epsilon} + \\sqrt{\\frac{\\kappa}{1-\\beta}}\\log\\frac{1}{\\epsilon} \\right),
$$ where $\\epsilon$ denotes the target accuracy, $n$ is the number of nodes, and $\\sigma^2$ is the gradient variance.`

    const nodes = parseMarkdownToStructure(source, md, { final: true }) as any[]

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].loading).toBe(false)
    expect(mathBlocks[0].content).toContain('widetilde')
    expect(mathBlocks[0].content).toContain('sigma')
    expect(mathBlocks[0].content).not.toContain('where')

    const inlineContent = collectByType(nodes, 'math_inline')
      .map((node: any) => node.content)
      .join('\n')

    expect(inlineContent).toContain('kappa')
    expect(inlineContent).toContain('1-\\beta')
    expect(inlineContent).toContain('epsilon')
    expect(inlineContent).toContain('n')
    expect(inlineContent).toContain('sigma')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('where')
    expect(serialized).toContain('target accuracy')
  })

  it('keeps streaming stable when tolerant $$ boundary is completed with split close delimiter and suffix', () => {
    const md = getMarkdown('issue-492-streaming')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats?.()

    const stream = (md as any).stream
    const originalReset = stream.reset.bind(stream)
    let resetCount = 0
    stream.reset = () => {
      resetCount++
      return originalReset()
    }

    const chunks = [
      'Before $a$ display $$\n',
      '\\widetilde{\\mathcal O}(a+b)\n',
      '$',
      '$ where $b$ follows.',
    ]

    let source = ''
    let nodes: any[] = []

    for (const chunk of chunks) {
      source += chunk
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]
    }

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].loading).toBe(false)
    expect(mathBlocks[0].content).toContain('widetilde')
    expect(mathBlocks[0].content).not.toContain('where')

    expect(collectByType(nodes, 'math_inline').map((node: any) => node.content)).toEqual(['a', 'b'])

    const stable = JSON.stringify(nodes)
    for (let index = 0; index < 8; index++) {
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]

      expect(JSON.stringify(nodes)).toBe(stable)
      expect(collectByType(nodes, 'math_block')).toHaveLength(1)
    }

    expect(resetCount).toBeLessThanOrEqual(2)
  })

  it('preserves suffix when close delimiter shares a line with formula content', () => {
    const md = getMarkdown('math-close-line-with-content-and-suffix')
    const source = [
      'Before $a$ display $$',
      'x + y = z $$ where $z$ follows.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(source, md, { final: true }) as any[]

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('x + y = z')
    expect(mathBlocks[0].content).not.toContain('where')

    expect(collectByType(nodes, 'math_inline').map((node: any) => node.content)).toEqual(['a', 'z'])
  })

  it('supports explicit bracket tolerant boundary without swallowing suffix', () => {
    const md = getMarkdown('bracket-tolerant-boundary')
    const source = [
      'Before $a$ bracket display \\[',
      'x + y = z',
      '\\] where $z$ follows.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(source, md, { final: true }) as any[]

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].markup).toBe('\\[\\]')
    expect(mathBlocks[0].content).toContain('x + y = z')

    expect(collectByType(nodes, 'math_inline').map((node: any) => node.content)).toEqual(['a', 'z'])
  })

  it('does not convert prose-only tolerant-looking boundary into math', () => {
    const md = getMarkdown('tolerant-boundary-prose-false-positive')
    const source = [
      'This is not display math $$',
      'hello world prose',
      '$$ after text with $x$ inline.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(source, md, { final: true }) as any[]
    const serialized = JSON.stringify(nodes)

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    expect(collectByType(nodes, 'math_inline').map((node: any) => node.content)).toContain('x')
    expect(serialized).toContain('hello world prose')
    expect(serialized).toContain('after text')
  })

  it('does not enter tolerant math for escaped or code-span openers', () => {
    const cases = [
      [
        'escaped dollar',
        [
          'Escaped marker \\$$',
          'x + y = z',
          '$$ after $x$.',
        ].join('\n'),
      ],
      [
        'code span dollar',
        [
          'Code marker `literal $$`',
          'x + y = z',
          '$$ after $x$.',
        ].join('\n'),
      ],
      [
        'escaped bracket',
        [
          'Escaped marker \\\\[',
          'x + y = z',
          '\\] after $x$.',
        ].join('\n'),
      ],
    ] as const

    for (const [name, source] of cases) {
      const md = getMarkdown(`tolerant-boundary-guard-${name}`)
      const nodes = parseMarkdownToStructure(source, md, { final: true }) as any[]

      expect(collectByType(nodes, 'math_block'), name).toHaveLength(0)
      expect(collectByType(nodes, 'math_inline').map((node: any) => node.content), name).toContain('x')
      expect(JSON.stringify(nodes), name).toContain('x + y = z')
    }
  })

  it('keeps active stream key bounded for long near-miss input', () => {
    const source = [
      'This prose line happens to end with $$',
      ...Array.from({ length: 200 }, (_, index) => `plain prose line ${index} ${'- '.repeat(80)}tail`),
      'tail with inline $x$ only',
    ].join('\n')

    expect(() => getTolerantMathBlockBoundaryStreamKey(source)).not.toThrow()
    expect(getTolerantMathBlockBoundaryStreamKey(source)).toBe(null)
  })

  it('does not reset stream cache for large inline-math-only documents', () => {
    const md = getMarkdown('large-inline-only-no-tolerant-reset')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats?.()

    const stream = (md as any).stream
    const originalReset = stream.reset.bind(stream)
    let resetCount = 0
    stream.reset = () => {
      resetCount++
      return originalReset()
    }

    let source = Array.from(
      { length: 600 },
      (_, index) => `line ${index}: inline $x_${index}$ only`,
    ).join('\n')

    let nodes: any[] = []
    for (let index = 0; index < 30; index++) {
      source += ` append-${index} with inline $y_${index}$`
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]
    }

    expect(resetCount).toBe(0)
    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    expect(collectByType(nodes, 'math_inline').length).toBeGreaterThan(600)
  })

  it('marks a cached tolerant opener line as pending candidate before math content arrives', () => {
    expect(mayContainTolerantMathBlockBoundaryOpener('Before display $$')).toBe(true)
    expect(mayContainTolerantMathBlockBoundaryOpener('Before display $$\n')).toBe(true)
    expect(mayContainTolerantMathBlockBoundaryOpener('Before display \\[')).toBe(true)

    // Same-line inline display math ends with "$$", but the last "$$" is a close,
    // not a tolerant opener.
    expect(mayContainTolerantMathBlockBoundaryOpener('Inline display $$E=mc^2$$')).toBe(false)

    // Escaped/code-span tails must not enter the tolerant path.
    expect(mayContainTolerantMathBlockBoundaryOpener('Escaped marker \\$$')).toBe(false)
    expect(mayContainTolerantMathBlockBoundaryOpener('Code marker `literal $$`')).toBe(false)
  })

  it('resets when math content arrives after a previously cached tolerant opener line', () => {
    const md = getMarkdown('stream-cached-opener-then-math-content-reset')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats?.()

    const stream = (md as any).stream
    const originalReset = stream.reset.bind(stream)
    let resetCount = 0
    stream.reset = () => {
      resetCount++
      return originalReset()
    }

    let source = 'Before $a$ display $'
    let nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)

    source += '$'
    nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)

    source += '\n'
    nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(collectByType(nodes, 'math_block')).toHaveLength(0)

    source += '\\widetilde{\\mathcal O}(a+b)'
    nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    const resetCountAfterMathContent = resetCount
    expect(resetCountAfterMathContent).toBeGreaterThanOrEqual(1)
    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
    ])

    let mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].loading).toBe(true)
    expect(mathBlocks[0].content).toContain('widetilde')

    let paragraphs = nodes.filter((node: any) => node.type === 'paragraph')
    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0].raw).toContain('Before $a$ display')

    source += '\n$'
    nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].loading).toBe(true)

    source += '$ where $b$ follows.'
    nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBeGreaterThanOrEqual(resetCountAfterMathContent + 1)
    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].loading).toBe(false)
    expect(mathBlocks[0].content).toContain('widetilde')
    expect(mathBlocks[0].content).not.toContain('where')

    const inlineMath = collectByType(nodes, 'math_inline').map((node: any) => node.content)
    expect(inlineMath).toEqual(['a', 'b'])

    paragraphs = nodes.filter((node: any) => node.type === 'paragraph')
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0].raw).toContain('Before $a$ display')
    expect(paragraphs[1].raw).toContain('where $b$ follows.')

    const completedSerialized = JSON.stringify(nodes)
    const completedResetCount = resetCount

    for (let index = 0; index < 10; index++) {
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]

      expect(JSON.stringify(nodes)).toBe(completedSerialized)
      expect(collectByType(nodes, 'math_block')).toHaveLength(1)
      expect(collectByType(nodes, 'math_block')[0].loading).toBe(false)
      expect(resetCount).toBe(completedResetCount)
    }
  })

  it('does not repeatedly reset while a tolerant math boundary stays pending', () => {
    const md = getMarkdown('stream-pending-tolerant-boundary-no-reset-loop')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats?.()

    const stream = (md as any).stream
    const originalReset = stream.reset.bind(stream)
    let resetCount = 0
    stream.reset = () => {
      resetCount++
      return originalReset()
    }

    let source = 'Before display $$'
    for (let index = 0; index < 50; index++) {
      source += `\nx_${index} + y_${index} = z_${index}`
      const nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]

      expect(collectByType(nodes, 'math_block')).toHaveLength(1)
    }

    expect(resetCount).toBe(1)

    source += '\n$$'
    parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    })

    expect(resetCount).toBe(2)
  })

  it('does not duplicate issue-492 content or leave math loading during streaming', () => {
    const md = getMarkdown('stream-issue-492-no-duplicate-no-loading')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats?.()

    const chunks = [
      'Decentralized stochastic optimization is a fundamental paradigm for large-scale learning over networks, where agents communicate only with their neighbors and no central coordinator is required. For strongly convex problems, communication efficiency is mainly determined by the condition number $\\kappa=L/\\mu$ and the network spectral gap $1-\\beta$. Although deterministic decentralized methods can simultaneously achieve accelerated $\\sqrt{\\kappa}$ and $1/\\sqrt{1-\\beta}$ dependences, no existing stochastic method attains both improvements at once. In this paper, we propose *Multi-Gossip Accelerated DSGD* (MG-ADSGD), a decentralized stochastic algorithm that combines Nesterov-type primal--dual extrapolation with multi-round fast gossip averaging. The key idea is to couple the gossip depth with the mini-batch size so that additional communication rounds simultaneously improve consensus accuracy and reduce gradient variance. We show that MG-ADSGD achieves the communication complexity $$\n',
      '\\widetilde{\\mathcal O}\\!\\left( \\frac{\\sigma^2}{\\mu n\\epsilon}\\log\\frac{1}{\\epsilon} + \\sqrt{\\frac{\\kappa}{1-\\beta}}\\log\\frac{1}{\\epsilon} \\right),\n',
      '$',
      '$ where $\\epsilon$ denotes the target accuracy, $n$ is the number of nodes, and $\\sigma^2$ is the gradient variance.',
      ' To the best of our knowledge, this bound yields the best currently available communication complexity for decentralized stochastic strongly convex optimization, up to logarithmic factors that are independent of $\\epsilon$.',
    ]

    let source = ''
    let nodes: any[] = []

    for (const chunk of chunks) {
      source += chunk
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]
    }

    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].loading).toBe(false)
    expect(mathBlocks[0].content).toContain('widetilde')
    expect(mathBlocks[0].content).toContain('sigma')
    expect(mathBlocks[0].content).not.toContain('where')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('target accuracy')
    expect(serialized).toContain('best currently available communication complexity')

    const paragraphs = nodes.filter((node: any) => node.type === 'paragraph')
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0].raw.match(/Decentralized stochastic optimization/g)?.length).toBe(1)
    expect(paragraphs[0].raw).toContain('achieves the communication complexity')
    expect(paragraphs[1].raw).toContain('where $\\epsilon$ denotes the target accuracy')
    expect(paragraphs[1].raw).toContain('best currently available communication complexity')

    const inlineContent = collectByType(nodes, 'math_inline')
      .map((node: any) => node.content)
      .join('\n')

    expect(inlineContent).toContain('kappa')
    expect(inlineContent).toContain('epsilon')
    expect(inlineContent).toContain('sigma')

    const stableSerialized = JSON.stringify(nodes)
    for (let index = 0; index < 10; index++) {
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]

      expect(JSON.stringify(nodes)).toBe(stableSerialized)
      expect(collectByType(nodes, 'math_block')).toHaveLength(1)
      expect(collectByType(nodes, 'math_block')[0].loading).toBe(false)
    }
  })
})
