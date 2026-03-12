import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'

export interface FrameworkTarget {
  id: string
  origin: string
  localPort: number | null
}

export interface LocationLike {
  hostname: string
  protocol: string
}

const FALLBACK_ORIGIN = 'https://markstream.local'

export function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

export function encodeMarkdownPayload(markdown: string) {
  const encodedRaw = encodeURIComponent(markdown)
  const compressed = compressToEncodedURIComponent(markdown)

  if (!compressed && !encodedRaw)
    return ''

  return (compressed && compressed.length < encodedRaw.length) ? compressed : `raw:${encodedRaw}`
}

export function createMarkdownHash(markdown: string) {
  const payload = encodeMarkdownPayload(markdown)
  return payload ? `data=${payload}` : ''
}

export function decodeMarkdownHash(hash: string) {
  const matched = (hash || '').match(/(?:^#?)data=([^&]+)/)
  if (!matched?.[1])
    return null

  const payload = matched[1]
  if (payload.startsWith('raw:')) {
    try {
      return decodeURIComponent(payload.slice(4))
    }
    catch {
      return null
    }
  }

  try {
    return decompressFromEncodedURIComponent(payload) || null
  }
  catch {
    return null
  }
}

export function withMarkdownHash(baseUrl: string, markdown: string) {
  const nextHash = createMarkdownHash(markdown)
  if (!nextHash)
    return baseUrl

  const isAbsolute = /^[a-z]+:\/\//i.test(baseUrl)
  const url = new URL(baseUrl, FALLBACK_ORIGIN)
  url.hash = nextHash

  if (isAbsolute)
    return url.toString()

  return `${url.pathname}${url.search}${url.hash}`
}

export function resolveFrameworkTestHref(
  framework: FrameworkTarget,
  currentFrameworkId: string,
  markdown: string,
  locationLike?: LocationLike,
) {
  let baseUrl = framework.id === currentFrameworkId
    ? '/test'
    : `${framework.origin}/test`

  if (
    framework.id !== currentFrameworkId
    && locationLike
    && framework.localPort
    && isLocalHost(locationLike.hostname)
  ) {
    baseUrl = `${locationLike.protocol}//${locationLike.hostname}:${framework.localPort}/test`
  }

  return withMarkdownHash(baseUrl, markdown)
}
