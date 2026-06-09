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

  it('does not loop in stream parser when tolerant $ boundaries produce prefix/suffix inline tokens', () => {
    const md = getMarkdown('stream-math-block-boundary-no-loop')
    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const chunks = [
      'Before $a$ and display math $',
      '\nE=mc^2',
      '\n$ where $x$ follows.',
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

    // Re-parse the same completed source a few times to exercise stream cache
    // hits. A synthetic paragraph_open/close emitted from mathBlock can make
    // the streaming token state unstable here.
    for (let index = 0; index < 10; index++) {
      expect(() => {
        nodes = parseMarkdownToStructure(source, md, {
          final: false,
          streamParse: true,
        }) as any[]
      }).not.toThrow()
    }

    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('Before')
    expect(serialized).toContain('where')
    expect(serialized).toContain('follows')

    const inlineMath = collectByType(nodes, 'math_inline')
    const inlineContent = inlineMath.map((node: any) => node.content).join('\n')
    expect(inlineContent).toContain('a')
    expect(inlineContent).toContain('x')
  })
})
