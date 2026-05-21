import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function buildLargeAppendFriendlyDoc(paragraphs: number) {
  return `${Array.from(
    { length: paragraphs },
    (_, index) => `Paragraph ${index + 1} with enough text to keep this document above the stream optimization threshold.`,
  ).join('\n\n')}\n\n`
}

function getStreamStats(md: ReturnType<typeof getMarkdown>) {
  return (md as any).stream.stats()
}

describe('parseMarkdownToStructure stream parser integration', () => {
  it('uses markdown-it-ts stream.parse for top-level append-heavy parses', () => {
    const md = getMarkdown('stream-parser-top-level')
    ;(md as any).stream.resetStats()

    const first = buildLargeAppendFriendlyDoc(40)
    const second = `${first}Appended paragraph that should take the stream append path.\n\n`

    parseMarkdownToStructure(first, md)
    parseMarkdownToStructure(second, md)

    const stats = getStreamStats(md)
    expect(stats.total).toBe(2)
    expect(stats.appendHits + stats.tailHits + stats.cacheHits).toBeGreaterThan(0)
    expect(stats.fullParses).toBe(1)
    expect(stats.lastMode).not.toBe('full')
  })

  it('allows callers to opt out of stream.parse', () => {
    const md = getMarkdown('stream-parser-opt-out')
    ;(md as any).stream.resetStats()

    parseMarkdownToStructure(buildLargeAppendFriendlyDoc(40), md, { streamParse: false })

    expect(getStreamStats(md).total).toBe(0)
  })

  it('does not let details fragment parsing overwrite the top-level stream cache', () => {
    const md = getMarkdown('stream-parser-fragments')
    ;(md as any).stream.resetStats()

    parseMarkdownToStructure(
      [
        '<details>',
        '<summary>Steps</summary>',
        '',
        '- one',
        '- two',
        '',
        '</details>',
      ].join('\n'),
      md,
      { final: true },
    )

    expect(getStreamStats(md).total).toBe(1)
  })

  it('does not let generic html fragment parsing overwrite the top-level stream cache', () => {
    const md = getMarkdown('stream-parser-generic-html-fragments')
    ;(md as any).stream.resetStats()

    const nodes = parseMarkdownToStructure(
      [
        '<div>',
        '# Title',
        '- item',
        '</div>',
      ].join('\n'),
      md,
      { final: true },
    ) as any[]

    expect(nodes[0]?.children?.length).toBeGreaterThan(0)
    expect(getStreamStats(md).total).toBe(1)
  })

  it('does not let cached stream tokens leak mutations into repeated parses', () => {
    const md = getMarkdown('stream-parser-token-clone')
    const markdown = [
      '<span>',
      '',
      '- alpha',
      '- beta',
      '',
      '</span>',
    ].join('\n')

    parseMarkdownToStructure(markdown, md, { final: true })
    const second = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(second).toHaveLength(1)
    expect(second[0]?.type).toBe('html_block')
    expect(second[0]?.children).toHaveLength(1)
  })

  it('deep-clones cached stream token object fields before transform hooks', () => {
    const md = getMarkdown('stream-parser-token-deep-clone')
    ;(md as any).core.ruler.push('test_nested_token_fields', (state: any) => {
      const inline = state.tokens?.find((token: any) => token.type === 'inline')
      if (!inline)
        return

      inline.meta = { nested: { value: 'cached' } }
      inline.custom = { state: { value: 'cached' } }
    })
    ;(md as any).stream.resetStats()

    const markdown = buildLargeAppendFriendlyDoc(40)
    const seenMeta: string[] = []
    const seenCustom: string[] = []
    let mutate = true

    const options = {
      preTransformTokens(tokens: any[]) {
        const inline = tokens.find(token => token.type === 'inline')
        seenMeta.push(inline?.meta?.nested?.value)
        seenCustom.push(inline?.custom?.state?.value)

        if (mutate) {
          inline.meta.nested.value = 'mutated'
          inline.custom.state.value = 'mutated'
        }

        return tokens
      },
    }

    parseMarkdownToStructure(markdown, md, options)
    mutate = false
    parseMarkdownToStructure(markdown, md, options)

    const stats = getStreamStats(md)
    expect(stats.cacheHits + stats.appendHits + stats.tailHits).toBeGreaterThan(0)
    expect(seenMeta).toEqual(['cached', 'cached'])
    expect(seenCustom).toEqual(['cached', 'cached'])
  })

  it('keeps non-plain token meta objects usable when cloning cached stream tokens', () => {
    const md = getMarkdown('stream-parser-map-meta')
    ;(md as any).core.ruler.push('test_map_meta', (state: any) => {
      const inline = state.tokens?.find((token: any) => token.type === 'inline')
      if (inline)
        inline.meta = { map: new Map([['k', 'v']]) }
    })

    const markdown = buildLargeAppendFriendlyDoc(40)
    let seen: unknown

    parseMarkdownToStructure(markdown, md, {
      preTransformTokens(tokens: any[]) {
        seen = tokens.find(token => token.type === 'inline')?.meta?.map?.get('k')
        return tokens
      },
    })

    expect(seen).toBe('v')
  })
})
