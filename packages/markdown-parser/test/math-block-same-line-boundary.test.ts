import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'
import {
  hasClosedTolerantMathBlockBoundaryCandidate,
  mayContainPendingTolerantMathBlockBoundaryCandidate,
  TOLERANT_BOUNDARY_SYNTHETIC_PARAGRAPH_META,
} from '../src/plugins/math'

function collectByType(nodes: any, type: string, out: any[] = []) {
  if (!nodes)
    return out
  if (Array.isArray(nodes)) {
    nodes.forEach((node: any) => collectByType(node, type, out))
    return out
  }
  if (nodes.type === type)
    out.push(nodes)
  for (const key of ['children', 'items', 'rows', 'cells']) {
    if (Array.isArray(nodes[key]))
      nodes[key].forEach((child: any) => collectByType(child, type, out))
  }
  return out
}

describe('math block same-line boundary regression', () => {
  it('resets stream cache for non-append replacements even when tolerant boundary key is unchanged', () => {
    const md = getMarkdown('stream-math-boundary-non-append-replacement-reset')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const stream = (md as any).stream
    const originalReset = stream.reset.bind(stream)
    let resetCount = 0
    stream.reset = () => {
      resetCount++
      return originalReset()
    }

    const first = [
      'Before display $$',
      'a = 1',
      '$$ after $a$.',
    ].join('\n')

    let nodes = parseMarkdownToStructure(first, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBe(1)
    expect(nodes.map((node: any) => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])
    expect(JSON.stringify(nodes)).toContain('Before display')

    const replaced = [
      'Prefix display $$',
      'a = 1',
      '$$ after $a$.',
    ].join('\n')

    nodes = parseMarkdownToStructure(replaced, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBe(2)
    expect(nodes.map((node: any) => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('Prefix display')
    expect(serialized).not.toContain('Before display')

    for (let index = 0; index < 6; index++) {
      nodes = parseMarkdownToStructure(replaced, md, {
        final: false,
        streamParse: true,
      }) as any[]

      expect(JSON.stringify(nodes)).toBe(serialized)
      expect(resetCount).toBe(2)
    }
  })

  it('does not reset pending tolerant boundary for absolute-value or angle-bracket math continuation lines', () => {
    const md = getMarkdown('stream-math-boundary-pending-absolute-angle-no-reset')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const stream = (md as any).stream
    const originalReset = stream.reset.bind(stream)
    const originalParse = stream.parse.bind(stream)
    let resetCount = 0
    let streamParseCount = 0

    stream.reset = () => {
      resetCount++
      return originalReset()
    }
    stream.parse = (...args: any[]) => {
      streamParseCount++
      return originalParse(...args)
    }

    let source = [
      'Before display $$',
      'a = 1',
    ].join('\n')

    let nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBe(1)
    expect(streamParseCount).toBe(1)
    expect(collectByType(nodes, 'math_block')).toHaveLength(1)
    expect(collectByType(nodes, 'math_block')[0].loading).toBe(true)

    source += '\n|x| = 2'
    nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBe(1)
    expect(streamParseCount).toBe(2)
    expect(collectByType(nodes, 'math_block')).toHaveLength(1)
    expect(collectByType(nodes, 'math_block')[0].content).toContain('|x| = 2')

    source += '\n<x, y> = 0'
    nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBe(1)
    expect(streamParseCount).toBe(3)
    expect(collectByType(nodes, 'math_block')).toHaveLength(1)
    expect(collectByType(nodes, 'math_block')[0].content).toContain('<x, y> = 0')
  })

  it('resets stream cache when completed tolerant boundary source changes, not for identical repeated parses', () => {
    const md = getMarkdown('stream-math-boundary-completed-reset')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const stream = (md as any).stream
    const originalReset = stream.reset.bind(stream)
    let resetCount = 0
    stream.reset = () => {
      resetCount++
      return originalReset()
    }

    const source = [
      'Prefix text $$',
      'a = 1',
      '$$ after display math with $y$ inline.',
    ].join('\n')

    let nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(collectByType(nodes, 'math_block')).toHaveLength(1)

    // The completed tolerant boundary rewrites a previously cached paragraph
    // shape, so the stream cache must be reset once when that completed
    // boundary first appears. Repeated parses of the same completed source
    // must not keep resetting the stream cache.
    expect(resetCount).toBe(1)

    const stableSerialized = JSON.stringify(nodes)
    for (let index = 0; index < 10; index++) {
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]

      expect(JSON.stringify(nodes)).toBe(stableSerialized)
      expect(resetCount).toBe(1)
    }

    const plainNodes = parseMarkdownToStructure('Plain $y$ text.', md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(collectByType(plainNodes, 'math_block')).toHaveLength(0)
    expect(collectByType(plainNodes, 'math_inline').map((node: any) => node.content)).toContain('y')
    // Leaving a completed-boundary source invalidates the normalized stream state.
    expect(resetCount).toBe(2)

    nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(nodes.map((node: any) => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])
    // Returning from a non-boundary source to a completed-boundary source needs one fresh reset.
    expect(resetCount).toBe(3)
  })

  it('resets stream cache when a later second tolerant boundary completes', () => {
    const md = getMarkdown('stream-math-boundary-second-completed-boundary-reset')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const stream = (md as any).stream
    const originalReset = stream.reset.bind(stream)
    let resetCount = 0
    stream.reset = () => {
      resetCount++
      return originalReset()
    }

    const firstComplete = [
      'First display $$',
      'a = 1',
      '$$ after first $a$.',
    ].join('\n')

    let nodes = parseMarkdownToStructure(firstComplete, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBe(1)
    expect(collectByType(nodes, 'math_block')).toHaveLength(1)

    const secondPartial = [
      firstComplete,
      '',
      'Second display $$',
      'b = 2',
    ].join('\n')

    nodes = parseMarkdownToStructure(secondPartial, md, {
      final: false,
      streamParse: true,
    }) as any[]

    // Appending a pending tolerant boundary triggers a reset for the new pending key.
    expect(resetCount).toBe(2)
    expect(collectByType(nodes, 'math_block')).toHaveLength(2)
    expect(collectByType(nodes, 'math_block')[0].content).toContain('a = 1')
    expect(collectByType(nodes, 'math_block')[1].content).toContain('b = 2')

    const secondComplete = [
      firstComplete,
      '',
      'Second display $$',
      'b = 2',
      '$$ after second $b$.',
    ].join('\n')

    nodes = parseMarkdownToStructure(secondComplete, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBe(3)
    expect(nodes.map(node => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(2)
    expect(mathBlocks[0].content).toContain('a = 1')
    expect(mathBlocks[1].content).toContain('b = 2')

    const inlineMath = collectByType(nodes, 'math_inline')
    const inlineContent = inlineMath.map((node: any) => node.content).join('\n')
    expect(inlineContent).toContain('a')
    expect(inlineContent).toContain('b')

    const stableSerialized = JSON.stringify(nodes)
    for (let index = 0; index < 10; index++) {
      nodes = parseMarkdownToStructure(secondComplete, md, {
        final: false,
        streamParse: true,
      }) as any[]

      expect(JSON.stringify(nodes)).toBe(stableSerialized)
      expect(resetCount).toBe(3)
    }
  })

  it('continues using stream parser after the first completed tolerant boundary while appending', () => {
    const md = getMarkdown('stream-math-boundary-append-keeps-stream-parser')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const stream = (md as any).stream
    const originalReset = stream.reset.bind(stream)
    const originalParse = stream.parse.bind(stream)
    let resetCount = 0
    let streamParseCount = 0

    stream.reset = () => {
      resetCount++
      return originalReset()
    }
    stream.parse = (...args: any[]) => {
      streamParseCount++
      return originalParse(...args)
    }

    const partial = [
      'Before display $$',
      'a = 1',
    ].join('\n')

    parseMarkdownToStructure(partial, md, {
      final: false,
      streamParse: true,
    })

    expect(resetCount).toBe(1)
    expect(streamParseCount).toBe(1)

    const complete = [
      partial,
      '\u0024\u0024 after $a$ follows.',
    ].join('\n')

    let nodes = parseMarkdownToStructure(complete, md, {
      final: false,
      streamParse: true,
    }) as any[]

    // Completion transitions from pending→closed: reset once, then rebuild the
    // stream cache from the full current source.
    expect(resetCount).toBe(2)
    expect(streamParseCount).toBe(2)
    expect(nodes.map(node => node.type)).toEqual(['paragraph', 'math_block', 'paragraph'])

    const appended = `${complete} More suffix text.`
    nodes = parseMarkdownToStructure(appended, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBe(2)
    expect(streamParseCount).toBe(3)
    expect(nodes.map(node => node.type)).toEqual(['paragraph', 'math_block', 'paragraph'])
    expect(collectByType(nodes, 'math_block')).toHaveLength(1)
    expect(collectByType(nodes, 'math_block')[0].loading).toBe(false)
    expect(JSON.stringify(nodes)).toContain('More suffix text')
  })

  it('keeps completed tolerant boundary on stream parser for repeated parses and plain appends', () => {
    const md = getMarkdown('stream-math-boundary-repeat-and-plain-append-stays-stream')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const stream = (md as any).stream
    const originalReset = stream.reset.bind(stream)
    const originalParse = stream.parse.bind(stream)
    let resetCount = 0
    let streamParseCount = 0

    stream.reset = () => {
      resetCount++
      return originalReset()
    }
    stream.parse = (...args: any[]) => {
      streamParseCount++
      return originalParse(...args)
    }

    let source = [
      'Before display $$',
      'a = 1',
      '$$ after $a$.',
    ].join('\n')

    let nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    // First parse with a completed tolerant boundary resets once and rebuilds
    // through stream.parse. Repeated parses must stay stable without reset.
    expect(resetCount).toBe(1)
    expect(streamParseCount).toBe(1)
    expect(nodes.map(node => node.type)).toEqual(['paragraph', 'math_block', 'paragraph'])

    const stableSerialized = JSON.stringify(nodes)
    for (let index = 0; index < 6; index++) {
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]

      expect(JSON.stringify(nodes)).toBe(stableSerialized)
      expect(resetCount).toBe(1)
    }

    expect(streamParseCount).toBe(7)

    // Append plain text without resetting since the new chunk cannot complete
    // or change a math boundary.
    source += ' More suffix text.'
    nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBe(1)
    expect(streamParseCount).toBe(8)
    expect(nodes.map(node => node.type)).toEqual(['paragraph', 'math_block', 'paragraph'])
    expect(collectByType(nodes, 'math_block')).toHaveLength(1)
    expect(collectByType(nodes, 'math_block')[0].loading).toBe(false)
    expect(JSON.stringify(nodes)).toContain('More suffix text')
  })

  it('does not reset on every normal chunk while a tolerant $$ boundary is pending', () => {
    const md = getMarkdown('stream-math-boundary-pending-append-no-reset-loop')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const stream = (md as any).stream
    const originalReset = stream.reset.bind(stream)
    const originalParse = stream.parse.bind(stream)
    let resetCount = 0
    let streamParseCount = 0

    stream.reset = () => {
      resetCount++
      return originalReset()
    }
    stream.parse = (...args: any[]) => {
      streamParseCount++
      return originalParse(...args)
    }

    let source = [
      'Before display $$',
      'a = 1',
    ].join('\n')

    let nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBe(1)
    expect(streamParseCount).toBe(1)
    expect(nodes.map((node: any) => node.type)).toEqual(['paragraph', 'math_block'])

    let mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].loading).toBe(true)
    expect(mathBlocks[0].content).toContain('a = 1')

    source += '\nb = 2'
    nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBe(1)
    expect(streamParseCount).toBe(2)
    expect(nodes.map((node: any) => node.type)).toEqual(['paragraph', 'math_block'])
    mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].loading).toBe(true)
    expect(mathBlocks[0].content).toContain('a = 1')
    expect(mathBlocks[0].content).toContain('b = 2')

    source += '\nc = 3'
    nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBe(1)
    expect(streamParseCount).toBe(3)
    expect(nodes.map((node: any) => node.type)).toEqual(['paragraph', 'math_block'])
    mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('c = 3')
  })

  it('resets once when tolerant $$ close delimiter is split across stream chunks', () => {
    const md = getMarkdown('stream-math-boundary-split-dollar-close')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const stream = (md as any).stream
    const originalReset = stream.reset.bind(stream)
    let resetCount = 0
    stream.reset = () => {
      resetCount++
      return originalReset()
    }

    let source = [
      'Before display $$',
      'a = 1',
      '$',
    ].join('\n')

    let nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBe(1)
    const splitPartialMath = collectByType(nodes, 'math_block')
    expect(splitPartialMath).toHaveLength(1)
    expect(splitPartialMath[0].loading).toBe(true)

    source += '$ after $a$.'
    nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBe(2)
    expect(nodes.map(node => node.type)).toEqual(['paragraph', 'math_block', 'paragraph'])
    expect(collectByType(nodes, 'math_inline').map((node: any) => node.content)).toContain('a')
  })

  it('resets once when tolerant \\] close delimiter is split across stream chunks', () => {
    const md = getMarkdown('stream-math-boundary-split-bracket-close')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const stream = (md as any).stream
    const originalReset = stream.reset.bind(stream)
    let resetCount = 0
    stream.reset = () => {
      resetCount++
      return originalReset()
    }

    let source = [
      'Before display \\[',
      'x + y = z',
      '\\',
    ].join('\n')

    let nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBe(1)
    const splitBracketPartialMath = collectByType(nodes, 'math_block')
    expect(splitBracketPartialMath).toHaveLength(1)
    expect(splitBracketPartialMath[0].loading).toBe(true)

    source += '] after $z$.'
    nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBe(2)
    expect(nodes.map(node => node.type)).toEqual(['paragraph', 'math_block', 'paragraph'])
    expect(collectByType(nodes, 'math_inline').map((node: any) => node.content)).toContain('z')
  })

  it('resets stream cache for completed tolerant boundary inside blockquotes when source changes', () => {
    const md = getMarkdown('stream-math-boundary-blockquote-completed-reset')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const stream = (md as any).stream
    const originalReset = stream.reset.bind(stream)
    let resetCount = 0
    stream.reset = () => {
      resetCount++
      return originalReset()
    }

    const dollar = '\u0024\u0024'
    const partial = [
      `> Text before display ${dollar}`,
      '> a = 1',
    ].join('\n')

    const partialNodes = parseMarkdownToStructure(partial, md, {
      final: false,
      streamParse: true,
    }) as any[]
    const partialMathBlocksBq = collectByType(partialNodes, 'math_block')
    expect(partialMathBlocksBq).toHaveLength(1)
    expect(partialMathBlocksBq[0].loading).toBe(true)
    expect(resetCount).toBe(1)

    const complete = [
      partial,
      `> ${dollar} after display with $a$ inline.`,
    ].join('\n')

    const nodes = parseMarkdownToStructure(complete, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBe(2)
    expect(collectByType(nodes, 'math_block')).toHaveLength(1)
    expect(collectByType(nodes, 'math_inline').map((node: any) => node.content)).toContain('a')
  })

  it('keeps math block boundary normalization inside blockquotes', () => {
    const md = getMarkdown('math-block-boundary-blockquote')
    const markdown = [
      '> Text before display $$',
      '> a = 1',
      '> $$ after display.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(markdown, md, {
      final: false,
      streamParse: true,
    }) as any[]

    const blockquotes = collectByType(nodes, 'blockquote')
    expect(blockquotes.length).toBeGreaterThanOrEqual(1)
    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].content).toContain('a = 1')
  })

  it('does not flag completed tolerant boundaries inside protected block syntax', () => {
    const cases = [
      [
        'fenced code',
        [
          '```',
          'literal $',
          'E=mc^2',
          '$ where this must stay code',
          '```',
        ].join('\n'),
      ],
      [
        'indented code',
        [
          '    literal $',
          '    E=mc^2',
          '    $ where this must stay code',
        ].join('\n'),
      ],
      [
        'raw html',
        [
          '<pre>',
          'literal $',
          'E=mc^2',
          '$ where this must stay html',
          '</pre>',
        ].join('\n'),
      ],
      [
        'tilde fence',
        [
          '~~~',
          'literal \\[',
          'x + y = z',
          '\\] where this must stay code',
          '~~~',
        ].join('\n'),
      ],
    ] as const

    for (const [name, source] of cases)
      expect(hasClosedTolerantMathBlockBoundaryCandidate(source), name).toBe(false)
  })

  it('does not reset stream cache for protected math-looking boundary noise', () => {
    const md = getMarkdown('stream-math-boundary-protected-no-reset')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const stream = (md as any).stream
    const originalReset = stream.reset.bind(stream)
    let resetCount = 0
    stream.reset = () => {
      resetCount++
      return originalReset()
    }

    const source = [
      '```',
      'literal $',
      'E=mc^2',
      '$ where this must stay fenced code',
      '```',
      '',
      '    literal $',
      '    E=mc^2',
      '    $ where this must stay indented code',
      '',
      '<pre>',
      'literal $',
      'E=mc^2',
      '$ where this must stay raw html',
      '</pre>',
      '',
      'Plain $x$ text.',
    ].join('\n')

    const nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBe(0)
    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    expect(collectByType(nodes, 'code_block')).toHaveLength(2)
    expect(JSON.stringify(nodes)).toContain('where this must stay raw html')
    expect(collectByType(nodes, 'math_inline').map((node: any) => node.content)).toContain('x')
  })

  it('does not flag completed or pending tolerant boundaries inside blockquoted protected blocks', () => {
    const cases = [
      [
        'blockquoted fenced code with dollar',
        [
          '> ```',
          '> literal $$',
          '> E=mc^2',
          '> $$ where this must stay code',
          '> ```',
        ].join('\n'),
      ],
      [
        'blockquoted fenced code with bracket',
        [
          '> ```',
          '> literal \\[',
          '> x + y = z',
          '> \\] where this must stay code',
          '> ```',
        ].join('\n'),
      ],
      [
        'blockquoted indented code',
        [
          '>     literal $$',
          '>     E=mc^2',
          '>     $$ where this must stay code',
        ].join('\n'),
      ],
      [
        'blockquoted raw html',
        [
          '> <pre>',
          '> literal $$',
          '> E=mc^2',
          '> $$ where this must stay html',
          '> </pre>',
        ].join('\n'),
      ],
    ] as const

    for (const [name, source] of cases) {
      expect(hasClosedTolerantMathBlockBoundaryCandidate(source), name).toBe(false)
      expect(mayContainPendingTolerantMathBlockBoundaryCandidate(source), name).toBe(false)
    }
  })

  it('does not create math blocks from blockquoted protected boundary-looking content in streaming mode', () => {
    const md = getMarkdown('pkg-stream-blockquote-protected-boundary-no-math')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const stream = (md as any).stream
    const originalReset = stream.reset.bind(stream)
    let resetCount = 0
    stream.reset = () => {
      resetCount++
      return originalReset()
    }

    const source = [
      '> ```',
      '> literal $$',
      '> E=mc^2',
      '> $$ where this must stay fenced code',
      '> ```',
      '',
      'after $x$ remains inline.',
    ].join('\n')

    let nodes: any[] = []
    let stableSerialized = ''

    for (let index = 0; index < 8; index++) {
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]

      const serialized = JSON.stringify(nodes)
      if (index === 0)
        stableSerialized = serialized
      else
        expect(serialized).toBe(stableSerialized)
    }

    expect(resetCount).toBe(0)
    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    expect(collectByType(nodes, 'code_block')).toHaveLength(1)
    expect(stableSerialized).toContain('where this must stay fenced code')
    expect(collectByType(nodes, 'math_inline').map((node: any) => node.content)).toContain('x')
  })

  it('does not duplicate or leave loading math_block when issue-492 tolerant boundary closes during streaming', () => {
    const md = getMarkdown('stream-issue-492-no-duplicate-or-loading-loop')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const chunks = [
      'Decentralized stochastic optimization is a fundamental paradigm for large-scale learning over networks, where agents communicate only with their neighbors and no central coordinator is required. For strongly convex problems, communication efficiency is mainly determined by the condition number $\\kappa=L/\\mu$ and the network spectral gap $1-\\beta$. Although deterministic decentralized methods can simultaneously achieve accelerated $\\sqrt{\\kappa}$ and $1/\\sqrt{1-\\beta}$ dependences, no existing stochastic method attains both improvements at once. In this paper, we propose *Multi-Gossip Accelerated DSGD* (MG-ADSGD), a decentralized stochastic algorithm that combines Nesterov-type primal--dual extrapolation with multi-round fast gossip averaging. The key idea is to couple the gossip depth with the mini-batch size so that additional communication rounds simultaneously improve consensus accuracy and reduce gradient variance. We show that MG-ADSGD achieves the communication complexity $$\n',
      '\\widetilde{\\mathcal O}\\!\\left( \\frac{\\sigma^2}{\\mu n\\epsilon}\\log\\frac{1}{\\epsilon} + \\sqrt{\\frac{\\kappa}{1-\\beta}}\\log\\frac{1}{\\epsilon} \\right),\n',
      '$',
      '$ where $\\epsilon$ denotes the target accuracy, $n$ is the number of nodes, and $\\sigma^2$ is the gradient variance.',
      ' To the best of our knowledge, this bound yields the best currently available communication complexity.',
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

    expect(nodes.map((node: any) => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].loading).toBe(false)
    expect(mathBlocks[0].content).toContain('widetilde')
    expect(mathBlocks[0].content).toContain('sigma')

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('where')
    expect(serialized).toContain('target accuracy')
    expect(serialized).toContain('best currently available communication complexity')

    const inlineMath = collectByType(nodes, 'math_inline')
    const inlineContent = inlineMath.map((node: any) => node.content).join('\n')
    expect(inlineContent).toContain('kappa')
    expect(inlineContent).toContain('epsilon')
    expect(inlineContent).toContain('n')
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

    for (const suffixChunk of [' More', ' suffix', ' tokens.']) {
      source += suffixChunk
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]

      expect(nodes.map((node: any) => node.type)).toEqual([
        'paragraph',
        'math_block',
        'paragraph',
      ])
      expect(collectByType(nodes, 'math_block')).toHaveLength(1)
      expect(collectByType(nodes, 'math_block')[0].loading).toBe(false)
    }
  })

  it('rebuilds stream cache while pending tolerant math content appends', () => {
    const md = getMarkdown('pkg-stream-tolerant-dollar-pending-append-cache-rebuild')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const stream = (md as any).stream
    const originalReset = stream.reset.bind(stream)
    const originalParse = stream.parse.bind(stream)
    let resetCount = 0
    let streamParseCount = 0
    stream.reset = () => {
      resetCount++
      return originalReset()
    }
    stream.parse = (...args: any[]) => {
      streamParseCount++
      return originalParse(...args)
    }

    let source = 'Before display $$'
    parseMarkdownToStructure(source, md, { final: false, streamParse: true })
    expect(resetCount).toBe(0)
    expect(streamParseCount).toBe(1)

    source += '\na = 1'
    let nodes = parseMarkdownToStructure(source, md, { final: false, streamParse: true }) as any[]
    expect(resetCount).toBe(1)
    expect(streamParseCount).toBe(2)
    expect(collectByType(nodes, 'math_block')).toHaveLength(1)
    expect(collectByType(nodes, 'math_block')[0].loading).toBe(true)

    source += '\n+ b = 2'
    nodes = parseMarkdownToStructure(source, md, { final: false, streamParse: true }) as any[]
    expect(resetCount).toBe(1)
    expect(streamParseCount).toBe(3)
    expect(collectByType(nodes, 'math_block')).toHaveLength(1)
    expect(collectByType(nodes, 'math_block')[0].content).toContain('+ b = 2')

    source += '\n$$ after $a$ follows.'
    nodes = parseMarkdownToStructure(source, md, { final: false, streamParse: true }) as any[]
    expect(resetCount).toBe(2)
    expect(streamParseCount).toBe(4)
    expect(nodes.map((node: any) => node.type)).toEqual(['paragraph', 'math_block', 'paragraph'])
  })

  it('keeps pending tolerant boundary stable for repeated parses', () => {
    const md = getMarkdown('pkg-stream-tolerant-pending-stable-repeated-parse')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const stream = (md as any).stream
    const originalReset = stream.reset.bind(stream)
    const originalParse = stream.parse.bind(stream)
    let resetCount = 0
    let streamParseCount = 0

    stream.reset = () => {
      resetCount++
      return originalReset()
    }
    stream.parse = (...args: any[]) => {
      streamParseCount++
      return originalParse(...args)
    }

    const source = [
      'Before display $$',
      'a = 1',
    ].join('\n')

    let nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBe(1)
    expect(streamParseCount).toBe(1)
    expect(nodes.map((node: any) => node.type)).toEqual(['paragraph', 'math_block'])

    const stableSerialized = JSON.stringify(nodes)
    for (let index = 0; index < 8; index++) {
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]

      expect(JSON.stringify(nodes)).toBe(stableSerialized)
    }

    expect(resetCount).toBe(1)
    expect(streamParseCount).toBe(9)
  })

  it('preserves legitimate duplicate paragraphs before pending tolerant math', () => {
    const md = getMarkdown('pkg-stream-tolerant-preserve-duplicate-paragraphs')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'repeat',
      '',
      'repeat $$',
      'a = 1',
    ].join('\n')

    const nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(nodes.map((node: any) => node.type)).toEqual(['paragraph', 'paragraph', 'math_block'])
    const repeatParagraphs = nodes.filter((node: any) => node.type === 'paragraph' && node.raw === 'repeat')
    expect(repeatParagraphs).toHaveLength(2)
    expect(collectByType(nodes, 'math_block')).toHaveLength(1)
  })

  it('does not reparse tolerant $$ close line as duplicate loading math_block', () => {
    const md = getMarkdown('pkg-stream-tolerant-dollar-close-line-not-new-opener')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'Before display $$',
      'a = 1',
      '$$ where $a$ follows.',
    ].join('\n')

    let nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    for (let index = 0; index < 8; index++) {
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]

      const mathBlocks = collectByType(nodes, 'math_block')
      expect(mathBlocks).toHaveLength(1)
      expect(mathBlocks[0].loading).toBe(false)
      expect(mathBlocks[0].content).toContain('a = 1')
      expect(mathBlocks[0].content).not.toContain('where')
    }
  })

  it('does not suppress a later legitimate line-start $$ block after a completed tolerant boundary in streaming mode', () => {
    const md = getMarkdown('pkg-stream-tolerant-followed-by-real-display-block')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'Before tolerant display $$',
      'a = 1',
      '$$ after first display with $a$ inline.',
      '',
      'Now a normal display block follows:',
      '$$',
      'b = 2',
      '$$',
      'After second display with $b$ inline.',
    ].join('\n')

    let nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    for (let index = 0; index < 8; index++) {
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]

      const mathBlocks = collectByType(nodes, 'math_block')
      expect(mathBlocks).toHaveLength(2)
      expect(mathBlocks[0].loading).toBe(false)
      expect(mathBlocks[1].loading).toBe(false)
      expect(mathBlocks[0].content).toContain('a = 1')
      expect(mathBlocks[1].content).toContain('b = 2')
    }

    const inlineMath = collectByType(nodes, 'math_inline')
      .map((node: any) => node.content)

    expect(inlineMath).toContain('a')
    expect(inlineMath).toContain('b')
    expect(JSON.stringify(nodes)).toContain('Now a normal display block follows')
    expect(JSON.stringify(nodes)).toContain('After second display')
  })

  it('does not suppress a later legitimate line-start $$ block after an intervening paragraph', () => {
    const md = getMarkdown('pkg-final-tolerant-followed-by-paragraph-and-real-display')

    const source = [
      'Before tolerant display $$',
      'a = 1',
      '$$ after first display.',
      '',
      'This paragraph is between the repaired block and the next block.',
      '',
      '$$',
      'c = 3',
      '$$',
    ].join('\n')

    const nodes = parseMarkdownToStructure(source, md, {
      final: true,
      streamParse: false,
    }) as any[]

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(2)
    expect(mathBlocks[0].content).toContain('a = 1')
    expect(mathBlocks[1].content).toContain('c = 3')
    expect(JSON.stringify(nodes)).toContain('paragraph is between')
  })

  it('does not hang or repeatedly reset on long near-miss tolerant-boundary noise while streaming', () => {
    const md = getMarkdown('pkg-stream-long-tolerant-boundary-near-miss-no-loop')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const stream = (md as any).stream
    const originalReset = stream.reset.bind(stream)
    let resetCount = 0
    stream.reset = () => {
      resetCount++
      return originalReset()
    }

    const noisyThematicLikeLine = `not-a-rule ${'- '.repeat(6000)}`
    const noisyReferenceLikeLine = `not-a-real-boundary-after-math [${'x'.repeat(6000)}]:`
    const source = [
      'This prose line happens to end with $$',
      noisyThematicLikeLine,
      noisyReferenceLikeLine,
      '',
      'Final paragraph with inline $x$.',
    ].join('\n')

    let stableSerialized = ''
    for (let index = 0; index < 12; index++) {
      const nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]

      const serialized = JSON.stringify(nodes)
      if (index === 0)
        stableSerialized = serialized
      else
        expect(serialized).toBe(stableSerialized)

      expect(collectByType(nodes, 'math_block')).toHaveLength(0)
      expect(collectByType(nodes, 'math_inline').map((node: any) => node.content)).toContain('x')
    }

    expect(resetCount).toBe(0)
  })

  it('distinguishes unresolved pending tolerant math tail from stopped ordinary trailing delimiters', () => {
    expect(
      mayContainPendingTolerantMathBlockBoundaryCandidate([
        'Before display $$',
        'a = 1',
      ].join('\n')),
    ).toBe(true)

    expect(
      mayContainPendingTolerantMathBlockBoundaryCandidate([
        'This prose line happens to end with $$',
        'hello world without math signal',
        '',
        'later normal text',
      ].join('\n')),
    ).toBe(false)

    expect(
      mayContainPendingTolerantMathBlockBoundaryCandidate([
        'This prose line happens to end with $$',
        'x + y = z',
        '## next section',
        'later normal text',
      ].join('\n')),
    ).toBe(false)

    expect(
      mayContainPendingTolerantMathBlockBoundaryCandidate([
        '> ```',
        '> literal $$',
        '> E=mc^2',
        '> $$ must stay code',
        '> ```',
      ].join('\n')),
    ).toBe(false)
  })

  it('does not repeatedly reset stream cache after a stopped false tolerant candidate', () => {
    const md = getMarkdown('stream-math-boundary-stopped-false-candidate-no-reset-loop')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const stream = (md as any).stream
    const originalReset = stream.reset.bind(stream)
    let resetCount = 0
    stream.reset = () => {
      resetCount++
      return originalReset()
    }

    let source = [
      'This prose line happens to end with $$',
      'x + y = z',
      '',
      'normal suffix',
    ].join('\n')

    let nodes: any[] = []
    for (let index = 0; index < 40; index++) {
      source += ` chunk-${index}`
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]
    }

    expect(resetCount).toBe(0)
    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    expect(JSON.stringify(nodes)).toContain('chunk-39')
  })

  it('keeps pending-tail detector linear on long near-boundary lines', () => {
    const longRuleLikeLine = '_'.repeat(7000)
    const longTableLikeLine = `| ${'-'.repeat(7000)} |`

    expect(
      mayContainPendingTolerantMathBlockBoundaryCandidate([
        'Text before malformed candidate $$',
        'x + y = z',
        longRuleLikeLine,
        'later text',
      ].join('\n')),
    ).toBe(false)

    expect(
      mayContainPendingTolerantMathBlockBoundaryCandidate([
        'Text before malformed candidate $$',
        longTableLikeLine,
        'later text',
      ].join('\n')),
    ).toBe(false)
  })

  it('treats signed prose list lines as tolerant-boundary stop lines, not math continuation', () => {
    for (const marker of ['+', '-']) {
      const source = [
        'Before display $$',
        'a = 1',
        `${marker} item should be a list boundary`,
      ].join('\n')

      expect(
        mayContainPendingTolerantMathBlockBoundaryCandidate(source),
        marker,
      ).toBe(false)
      expect(
        hasClosedTolerantMathBlockBoundaryCandidate(`${source}\n$$ after $a$`),
        marker,
      ).toBe(false)
    }
  })

  it('still allows short plus formula continuation in pending tolerant math', () => {
    const source = [
      'Before display $$',
      'a = 1',
      '+ y',
    ].join('\n')

    expect(mayContainPendingTolerantMathBlockBoundaryCandidate(source)).toBe(true)
  })

  it('allows first signed formula line in tolerant math during streaming', () => {
    const cases = [
      ['plus', '+ x = y'],
      ['minus', '- x = y'],
      ['negative tex', '- \\frac{a}{b} = c'],
    ] as const

    for (const [name, formulaLine] of cases) {
      const md = getMarkdown(`pkg-stream-tolerant-first-signed-formula-${name}`)
      ;(md as any).stream.reset()
      ;(md as any).stream.resetStats()

      const stream = (md as any).stream
      const originalReset = stream.reset.bind(stream)
      const originalParse = stream.parse.bind(stream)
      let resetCount = 0
      let streamParseCount = 0

      stream.reset = () => {
        resetCount++
        return originalReset()
      }
      stream.parse = (...args: any[]) => {
        streamParseCount++
        return originalParse(...args)
      }

      let source = [
        'Before display $$',
        formulaLine,
      ].join('\n')

      let nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]

      expect(collectByType(nodes, 'math_block'), name).toHaveLength(1)
      expect(collectByType(nodes, 'math_block')[0].loading, name).toBe(true)
      expect(collectByType(nodes, 'math_block')[0].content, name).toContain(formulaLine)
      expect(resetCount, name).toBe(1)
      expect(streamParseCount, name).toBe(1)

      source += '\n$$ after $y$ follows.'
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]

      expect(nodes.map((node: any) => node.type), name).toEqual([
        'paragraph',
        'math_block',
        'paragraph',
      ])
      expect(collectByType(nodes, 'math_block'), name).toHaveLength(1)
      expect(collectByType(nodes, 'math_block')[0].loading, name).toBe(false)
      expect(collectByType(nodes, 'math_inline').map((node: any) => node.content), name).toContain('y')
      expect(resetCount, name).toBe(2)
      expect(streamParseCount, name).toBe(2)
    }
  })

  it('treats indented code and table delimiter rows as pending tolerant-boundary stop lines', () => {
    const indentedCode = [
      'Before display $$',
      'a = 1',
      '    const x = 1',
    ].join('\n')

    const tableDelimiter = [
      'Before display $$',
      'a = 1',
      '--- | ---',
    ].join('\n')

    expect(mayContainPendingTolerantMathBlockBoundaryCandidate(indentedCode)).toBe(false)
    expect(mayContainPendingTolerantMathBlockBoundaryCandidate(tableDelimiter)).toBe(false)
  })

  it('does not close tolerant math across signed prose list boundaries', () => {
    for (const marker of ['+', '-']) {
      const md = getMarkdown(`math-boundary-signed-list-stop-before-close-${marker === '+' ? 'plus' : 'minus'}`)
      const source = [
        'Before display $$',
        'a = 1',
        `${marker} item should stay outside math`,
        '$$ should remain ordinary text with $x$ inline.',
      ].join('\n')

      const nodes = parseMarkdownToStructure(source, md, { final: true }) as any[]

      expect(collectByType(nodes, 'math_block'), marker).toHaveLength(0)
      const serialized = JSON.stringify(nodes)
      expect(serialized).toContain('item should stay outside math')
      expect(serialized).toContain('should remain ordinary text')
      expect(collectByType(nodes, 'math_inline').map((node: any) => node.content), marker).toContain('x')
    }
  })

  it('does not keep prose-only unresolved tolerant tail as a pending scan candidate', () => {
    expect(
      mayContainPendingTolerantMathBlockBoundaryCandidate([
        'This prose paragraph happens to end with $$',
        'hello world without math signal',
      ].join('\n')),
    ).toBe(false)

    expect(
      mayContainPendingTolerantMathBlockBoundaryCandidate([
        'This prose paragraph happens to end with \\[',
        'hello world without math signal',
      ].join('\n')),
    ).toBe(false)

    expect(
      mayContainPendingTolerantMathBlockBoundaryCandidate([
        'Before display $$',
        'x',
      ].join('\n')),
    ).toBe(true)

    expect(
      mayContainPendingTolerantMathBlockBoundaryCandidate([
        'Before display $$',
        'x +',
      ].join('\n')),
    ).toBe(true)
  })

  it('does not repeatedly reset stream cache for prose-only unresolved tolerant tails', () => {
    const md = getMarkdown('pkg-stream-prose-only-unresolved-tolerant-tail-no-reset-loop')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const stream = (md as any).stream
    const originalReset = stream.reset.bind(stream)
    let resetCount = 0
    stream.reset = () => {
      resetCount++
      return originalReset()
    }

    let source = [
      'This prose paragraph happens to end with $$',
      'hello world without math signal',
    ].join('\n')

    let nodes: any[] = []
    for (let index = 0; index < 40; index++) {
      source += ` chunk-${index}`
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]
    }

    expect(resetCount).toBe(0)
    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    expect(JSON.stringify(nodes)).toContain('chunk-39')
  })

  it('does not reparse indented list tolerant $$ close line as a second math_block', () => {
    const md = getMarkdown('pkg-stream-list-tolerant-dollar-close-line-not-new-opener')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      '- Before display $$',
      '  a = 1',
      '  $$ where $a$ follows.',
    ].join('\n')

    let nodes: any[] = []
    let stableSerialized = ''
    for (let index = 0; index < 12; index++) {
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]

      const serialized = JSON.stringify(nodes)
      if (index === 0)
        stableSerialized = serialized
      else
        expect(serialized).toBe(stableSerialized)
    }

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].loading).toBe(false)
    expect(mathBlocks[0].content).toContain('a = 1')
    expect(mathBlocks[0].content).not.toContain('where')
    expect(collectByType(nodes, 'math_inline').map((node: any) => node.content)).toContain('a')
  })

  it('does not reparse tolerant \\] close line as duplicate loading math_block', () => {
    const md = getMarkdown('pkg-stream-tolerant-bracket-close-line-not-new-opener')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      'Before display \\[',
      'x + y = z',
      '\\] where $z$ follows.',
    ].join('\n')

    let nodes: any[] = []
    let stableSerialized = ''

    for (let index = 0; index < 12; index++) {
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]

      const serialized = JSON.stringify(nodes)
      if (index === 0)
        stableSerialized = serialized
      else
        expect(serialized).toBe(stableSerialized)

      const mathBlocks = collectByType(nodes, 'math_block')
      expect(mathBlocks).toHaveLength(1)
      expect(mathBlocks[0].loading).toBe(false)
      expect(mathBlocks[0].markup).toBe('\\[\\]')
      expect(mathBlocks[0].content).toContain('x + y = z')
      expect(mathBlocks[0].content).not.toContain('where')
    }

    expect(nodes.map((node: any) => node.type)).toEqual([
      'paragraph',
      'math_block',
      'paragraph',
    ])
    expect(collectByType(nodes, 'math_inline').map((node: any) => node.content)).toContain('z')
  })

  it('does not reparse indented list tolerant \\] close line as duplicate math_block', () => {
    const md = getMarkdown('pkg-stream-list-tolerant-bracket-close-line-not-new-opener')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const source = [
      '- Before display \\[',
      '  x + y = z',
      '  \\] where $z$ follows.',
    ].join('\n')

    let nodes: any[] = []
    let stableSerialized = ''

    for (let index = 0; index < 12; index++) {
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]

      const serialized = JSON.stringify(nodes)
      if (index === 0)
        stableSerialized = serialized
      else
        expect(serialized).toBe(stableSerialized)
    }

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('list')

    const mathBlocks = collectByType(nodes, 'math_block')
    expect(mathBlocks).toHaveLength(1)
    expect(mathBlocks[0].loading).toBe(false)
    expect(mathBlocks[0].markup).toBe('\\[\\]')
    expect(mathBlocks[0].content).toContain('x + y = z')
    expect(mathBlocks[0].content).not.toContain('where')
    expect(collectByType(nodes, 'math_inline').map((node: any) => node.content)).toContain('z')
  })

  it('does not reset or create math_block for large inline-math-only streams without tolerant opener', () => {
    const md = getMarkdown('pkg-stream-large-inline-math-no-tolerant-opener')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const stream = (md as any).stream
    const originalReset = stream.reset.bind(stream)
    let resetCount = 0
    stream.reset = () => {
      resetCount++
      return originalReset()
    }

    let source = Array.from(
      { length: 600 },
      (_, index) => `line ${index}: inline math $x_${index}$ and text with no display opener.`,
    ).join('\n')

    let nodes: any[] = []
    let stableSerialized = ''

    for (let index = 0; index < 8; index++) {
      source += ` chunk-${index}`
      nodes = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      }) as any[]

      const serialized = JSON.stringify(nodes)
      if (index === 0)
        stableSerialized = serialized
      else
        expect(serialized).toContain(`chunk-${index}`)
    }

    expect(resetCount).toBe(0)
    expect(collectByType(nodes, 'math_block')).toHaveLength(0)
    expect(collectByType(nodes, 'math_inline').length).toBeGreaterThan(100)
    expect(JSON.stringify(nodes)).toContain('line 599')
    expect(stableSerialized).toContain('line 0')
  })

  it('keeps active tolerant-boundary detectors false for large inline-math-only documents', () => {
    const source = Array.from(
      { length: 600 },
      (_, index) => `line ${index}: inline math $x_${index}$ and $y_${index}$ only.`,
    ).join('\n')

    expect(hasClosedTolerantMathBlockBoundaryCandidate(source)).toBe(false)
    expect(mayContainPendingTolerantMathBlockBoundaryCandidate(source)).toBe(false)
  })

  it('compacts only synthetic duplicate tolerant-boundary prefix paragraphs', () => {
    const md = getMarkdown('pkg-stream-compact-synthetic-tolerant-prefix-only')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const syntheticMeta = {
      [TOLERANT_BOUNDARY_SYNTHETIC_PARAGRAPH_META]: true,
    }

    const makeParagraphTriplet = () => [
      {
        type: 'paragraph_open',
        tag: 'p',
        nesting: 1,
        map: [0, 1],
        meta: syntheticMeta,
      },
      {
        type: 'inline',
        tag: '',
        nesting: 0,
        content: 'Before display',
        map: [0, 1],
        children: [
          {
            type: 'text',
            tag: '',
            nesting: 0,
            content: 'Before display',
          },
        ],
        meta: syntheticMeta,
      },
      {
        type: 'paragraph_close',
        tag: 'p',
        nesting: -1,
        map: [0, 1],
        meta: syntheticMeta,
      },
    ]

    const loadingMath = {
      type: 'math_block',
      tag: 'math',
      nesting: 0,
      content: 'a = 1',
      markup: '$$',
      raw: '$$a = 1$$',
      map: [0, 2],
      block: true,
      loading: true,
      tolerantBoundary: true,
    }

    ;(md as any).stream.parse = () => [
      ...makeParagraphTriplet(),
      ...makeParagraphTriplet(),
      loadingMath,
    ]

    const nodes = parseMarkdownToStructure('placeholder', md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(nodes.map((node: any) => node.type)).toEqual([
      'paragraph',
      'math_block',
    ])
    expect(nodes.filter((node: any) => node.type === 'paragraph')).toHaveLength(1)
    expect(collectByType(nodes, 'math_block')).toHaveLength(1)
  })

  it('does not compact unmarked duplicate paragraph triples before tolerant loading math', () => {
    const md = getMarkdown('pkg-stream-do-not-compact-unmarked-duplicate-paragraphs')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const makeParagraphTriplet = () => [
      {
        type: 'paragraph_open',
        tag: 'p',
        nesting: 1,
        map: [0, 1],
      },
      {
        type: 'inline',
        tag: '',
        nesting: 0,
        content: 'repeat',
        map: [0, 1],
        children: [
          {
            type: 'text',
            tag: '',
            nesting: 0,
            content: 'repeat',
          },
        ],
      },
      {
        type: 'paragraph_close',
        tag: 'p',
        nesting: -1,
        map: [0, 1],
      },
    ]

    const loadingMath = {
      type: 'math_block',
      tag: 'math',
      nesting: 0,
      content: 'a = 1',
      markup: '$$',
      raw: '$$a = 1$$',
      map: [0, 2],
      block: true,
      loading: true,
      tolerantBoundary: true,
    }

    ;(md as any).stream.parse = () => [
      ...makeParagraphTriplet(),
      ...makeParagraphTriplet(),
      loadingMath,
    ]

    const nodes = parseMarkdownToStructure('placeholder', md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(nodes.map((node: any) => node.type)).toEqual([
      'paragraph',
      'paragraph',
      'math_block',
    ])
    expect(nodes.filter((node: any) => node.type === 'paragraph')).toHaveLength(2)
    expect(nodes.filter((node: any) => node.type === 'paragraph').map((node: any) => node.raw)).toEqual([
      'repeat',
      'repeat',
    ])
    expect(collectByType(nodes, 'math_block')).toHaveLength(1)
  })
})
