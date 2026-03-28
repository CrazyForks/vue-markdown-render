import { compressToEncodedURIComponent } from 'lz-string'
import { describe, expect, it } from 'vitest'
import { createMarkdownHash, decodeMarkdownHash } from '../playground-shared/testPageState'

describe('playground share payload', () => {
  it('prefers the stronger deflate codec for large markdown payloads', () => {
    const input = [
      '# Shareable markdown',
      '',
      '```ts',
      ...Array.from({ length: 400 }, (_, index) => `console.log('line-${index}', ${index ** 2})`),
      '```',
      '',
      ...Array.from({ length: 400 }, (_, index) => `- 第 ${index + 1} 行：你好，世界 ${index.toString(36)}`),
    ].join('\n')
    const legacyHash = `data=${compressToEncodedURIComponent(input)}`
    const hash = createMarkdownHash(input)

    expect(hash.startsWith('data=z:')).toBe(true)
    expect(hash.length).toBeLessThan(legacyHash.length)
    expect(decodeMarkdownHash(hash)).toBe(input)
  })

  it('continues to decode legacy raw and lz-string payloads', () => {
    const input = `<a href=" ">示例链接1</a >\n<a href="https://github.com">GitHub</a >\n<a href="https://www.wikipedia.org">维基百科</a >`
    const legacyRawHash = `data=raw:${encodeURIComponent(input)}`
    const legacyLzHash = `data=${compressToEncodedURIComponent(input)}`

    expect(decodeMarkdownHash(legacyRawHash)).toBe(input)
    expect(decodeMarkdownHash(legacyLzHash)).toBe(input)
  })
})
