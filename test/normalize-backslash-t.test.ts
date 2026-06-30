import { normalizeStandaloneBackslashT } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

describe('normalizeStandaloneBackslashT', () => {
  it('prefixes control characters with backslash', () => {
    // simulate strings where control escapes were interpreted
    const tab = normalizeStandaloneBackslashT('\t')
    expect(tab).toBe('\\t')

    const backspace = normalizeStandaloneBackslashT('\b')
    expect(backspace).toBe('\\b')
  })

  it('prefixes known katex command words without backslash', () => {
    expect(normalizeStandaloneBackslashT('in')).toBe('\\in')
    expect(normalizeStandaloneBackslashT('perp and more')).toBe('\\perp and more')
    expect(normalizeStandaloneBackslashT('alpha+beta')).toBe('\\alpha+\\beta')
  })

  it('escapes exclamation marks', () => {
    expect(normalizeStandaloneBackslashT('!')).toBe('\\!')
  })

  it('preserves factorial exclamation marks', () => {
    expect(normalizeStandaloneBackslashT('2! + n! + (n+1)! + \\alpha!')).toBe('2! + n! + (n+1)! + \\alpha!')
    expect(normalizeStandaloneBackslashT('π!')).toBe('π!')
    expect(normalizeStandaloneBackslashT('x\'!')).toBe('x\'!')
    expect(normalizeStandaloneBackslashT('|x|!')).toBe('|x|!')
    expect(normalizeStandaloneBackslashT('𝑛! + 𝟚! + x\u0301!')).toBe('𝑛! + 𝟚! + x\u0301!')
  })
})
