import { describe, expect, it } from 'vitest'
import { buildDiffPreviewPanes } from '../src/diff-preview'

describe('buildDiffPreviewPanes', () => {
  it('aligns changed source rows and collapses the same unchanged ranges in both panes', () => {
    const original = Array.from({ length: 50 }, (_, index) => `line ${index + 1}`)
    const modified = original.slice()
    modified[3] = 'changed line'

    const panes = buildDiffPreviewPanes({
      originalCode: original.join('\n'),
      updatedCode: modified.join('\n'),
      hideUnchangedRegions: {
        enabled: true,
        contextLineCount: 2,
        minimumLineCount: 4,
      },
    })

    expect(panes).toHaveLength(2)
    expect(panes[0].lines).toHaveLength(panes[1].lines.length)
    expect(panes[0].lines.map(line => line.kind)).toEqual([
      'context',
      'context',
      'context',
      'removed',
      'context',
      'context',
      'collapsed',
    ])
    expect(panes[1].lines.map(line => line.kind)).toEqual([
      'context',
      'context',
      'context',
      'added',
      'context',
      'context',
      'collapsed',
    ])
    expect(panes[0].lines.at(-1)?.code).toBe('44 unmodified lines')
    expect(panes[1].lines.at(-1)?.code).toBe('')
  })

  it('keeps side-by-side panes row aligned when one side has more changed lines', () => {
    const panes = buildDiffPreviewPanes({
      originalCode: 'before\nold one\nold two\nafter',
      updatedCode: 'before\nnew one\nafter',
    })

    expect(panes[0].lines.map(line => line.kind)).toEqual(['context', 'removed', 'removed', 'context'])
    expect(panes[1].lines.map(line => line.kind)).toEqual(['context', 'added', 'spacer', 'context'])
  })

  it('keeps multi-hunk row classification stable while streaming', () => {
    const original = Array.from({ length: 100 }, (_, index) => `line ${index + 1}`)
    const modified = original.slice()
    modified[4] = 'changed near start'
    modified[94] = 'changed near end'
    const options = {
      originalCode: original.join('\n'),
      updatedCode: modified.join('\n'),
      hideUnchangedRegions: true,
    }

    const streaming = buildDiffPreviewPanes({ ...options, loading: true })
    const complete = buildDiffPreviewPanes({ ...options, loading: false })

    expect(streaming).toEqual(complete)
    expect(streaming[0].lines.some(line => line.kind === 'collapsed')).toBe(true)
  })

  it('does not render git patch metadata as numbered source rows', () => {
    const panes = buildDiffPreviewPanes({
      code: [
        'diff --git a/file.ts b/file.ts',
        'index 1111111..2222222 100644',
        '--- a/file.ts',
        '+++ b/file.ts',
        '@@ -1 +1 @@',
        '-const oldValue = 1',
        '+const newValue = 1',
      ].join('\n'),
      language: 'diff',
    })

    expect(panes[0].lines.map(line => line.kind)).toEqual(['hunk', 'removed'])
    expect(panes[1].lines.map(line => line.kind)).toEqual(['hunk', 'added'])
    expect(panes[0].lines[1].number).toBe(1)
    expect(panes[1].lines[1].number).toBe(1)
  })
})
