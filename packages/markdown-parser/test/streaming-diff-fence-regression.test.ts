import { describe, expect, it } from 'vitest'
import { parseFenceToken } from '../src'

function parseStreamingDiff(content: string, closed = false) {
  return parseFenceToken({
    type: 'fence',
    info: 'diff json:package.json',
    content,
    map: [0, 1],
    meta: { closed },
  } as any)
}

describe('parseFenceToken - streaming unified diff stability', () => {
  it('withholds an unfinished replacement hunk until the added side is available', () => {
    const node = parseStreamingDiff([
      '{',
      '  "name": "markstream-vue",',
      '- "version": "0.0.49",',
    ].join('\n'))

    expect(node.originalCode).toBe([
      '{',
      '  "name": "markstream-vue",',
    ].join('\n'))
    expect(node.updatedCode).toBe([
      '{',
      '  "name": "markstream-vue",',
    ].join('\n'))
  })

  it('flushes a finished replacement hunk once the added line becomes stable', () => {
    const node = parseStreamingDiff([
      '{',
      '  "name": "markstream-vue",',
      '- "version": "0.0.49",',
      '+ "version": "0.0.54-beta.1",',
      '',
    ].join('\n'))

    expect(node.originalCode).toBe([
      '{',
      '  "name": "markstream-vue",',
      '  "version": "0.0.49",',
    ].join('\n'))
    expect(node.updatedCode).toBe([
      '{',
      '  "name": "markstream-vue",',
      '  "version": "0.0.54-beta.1",',
    ].join('\n'))
  })

  it('withholds a trailing incomplete added line instead of leaking a mismatched preview', () => {
    const node = parseStreamingDiff([
      '{',
      '  "name": "markstream-vue",',
      '- "version": "0.0.49",',
      '+ "version": "0.0.54-b',
    ].join('\n'))

    expect(node.originalCode).toBe([
      '{',
      '  "name": "markstream-vue",',
    ].join('\n'))
    expect(node.updatedCode).toBe([
      '{',
      '  "name": "markstream-vue",',
    ].join('\n'))
  })

  it('flushes the trailing hunk once the fence is closed', () => {
    const node = parseStreamingDiff([
      '{',
      '  "name": "markstream-vue",',
      '- "version": "0.0.49",',
    ].join('\n'), true)

    expect(node.originalCode).toBe([
      '{',
      '  "name": "markstream-vue",',
      '  "version": "0.0.49",',
    ].join('\n'))
    expect(node.updatedCode).toBe([
      '{',
      '  "name": "markstream-vue",',
    ].join('\n'))
  })
})
