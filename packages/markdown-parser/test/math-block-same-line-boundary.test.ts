import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'
import { hasClosedTolerantMathBlockBoundaryCandidate } from '../src/plugins/math'

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

    // Appending after an already completed boundary keeps the same boundary key,
    // so the stream parser should continue incrementally without another reset.
    expect(resetCount).toBe(1)
    expect(collectByType(nodes, 'math_block')).toHaveLength(1)
    expect(collectByType(nodes, 'math_block')[0].content).toContain('a = 1')

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

    expect(resetCount).toBe(2)
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
      expect(resetCount).toBe(2)
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

    expect(resetCount).toBe(0)
    expect(streamParseCount).toBe(1)

    const complete = [
      partial,
      '$$ after $a$ follows.',
    ].join('\n')

    let nodes = parseMarkdownToStructure(complete, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBe(1)
    expect(streamParseCount).toBe(1)
    expect(nodes.map(node => node.type)).toEqual(['paragraph', 'math_block', 'paragraph'])

    const appended = `${complete} More suffix text.`
    nodes = parseMarkdownToStructure(appended, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBe(1)
    expect(streamParseCount).toBe(2)
    expect(nodes.map(node => node.type)).toEqual(['paragraph', 'math_block', 'paragraph'])
    expect(JSON.stringify(nodes)).toContain('More suffix text')
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
    expect(collectByType(partialNodes, 'math_block')).toHaveLength(0)
    expect(resetCount).toBe(0)

    const complete = [
      partial,
      `> ${dollar} after display with $a$ inline.`,
    ].join('\n')

    const nodes = parseMarkdownToStructure(complete, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(resetCount).toBe(1)
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
})
