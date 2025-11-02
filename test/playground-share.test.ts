import { describe, it, expect } from 'vitest'
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'

function makeDataForUrl(input: string) {
  const encodedRaw = encodeURIComponent(input)
  let compressed = ''
  try {
    compressed = compressToEncodedURIComponent(input)
  }
  catch {
    compressed = ''
  }
  const data = (compressed && compressed.length < encodedRaw.length) ? compressed : `raw:${encodedRaw}`
  return data
}

function restoreFromData(payload: string) {
  if (payload.startsWith('raw:')) {
    try {
      return decodeURIComponent(payload.slice(4))
    }
    catch {
      return ''
    }
  }
  try {
    return decompressFromEncodedURIComponent(payload) || ''
  }
  catch {
    return ''
  }
}

describe('playground share payload', () => {
  it('chooses the shorter representation and can restore it (distinct links)', () => {
    const input = `<a href=" ">示例链接1</a >  \n<a href="https://www.google.com">Google</a >  \n<a href="https://github.com">GitHub</a >  \n<a href="https://stackoverflow.com">Stack Overflow</a >  \n<a href="https://www.wikipedia.org">维基百科</a >`
    const data = makeDataForUrl(input)
    // The implementation picks the shorter of compressed vs raw; ensure that holds
    const rawLen = encodeURIComponent(input).length
    expect(data.length).toBeLessThanOrEqual(rawLen)
    const restored = restoreFromData(data)
    expect(restored).toBe(input)
  })

  it('prefers compressed when input is repetitive', () => {
    const input = 'hello '.repeat(1000)
    const data = makeDataForUrl(input)
    // For repetitive input compressed should be shorter
    expect(data.startsWith('raw:')).toBe(false)
    const restored = restoreFromData(data)
    expect(restored).toBe(input)
    // sanity: compression should actually reduce length vs raw
    const rawLen = encodeURIComponent(input).length
    expect(data.length).toBeLessThan(rawLen)
  })
})
