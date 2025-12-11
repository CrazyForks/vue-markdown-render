import type { InlineCodeNode, MarkdownToken, ParsedNode } from '../../types'

type ParseInlineTokensFn = (
  tokens: MarkdownToken[],
  raw?: string,
  pPreToken?: MarkdownToken,
  options?: { requireClosingStrong?: boolean },
) => ParsedNode[]

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

function getTagName(html: string) {
  const match = html.match(/^<\s*(?:\/\s*)?([\w-]+)/)
  return match ? match[1].toLowerCase() : ''
}

function isClosingTag(html: string) {
  return /^<\s*\//.test(html)
}

function isSelfClosing(tag: string, html: string) {
  return /\/\s*>\s*$/.test(html) || VOID_TAGS.has(tag)
}

function tokenToRaw(token: MarkdownToken) {
  const shape = token as { raw?: string, markup?: string, content?: string }
  const raw = shape.raw ?? shape.content ?? shape.markup ?? ''
  return String(raw ?? '')
}

function stringifyTokens(tokens: MarkdownToken[]) {
  return tokens.map(tokenToRaw).join('')
}

function findMatchingClosing(tokens: MarkdownToken[], startIndex: number, tag: string) {
  let depth = 0
  for (let idx = startIndex; idx < tokens.length; idx++) {
    const t = tokens[idx]
    if (t.type !== 'html_inline')
      continue
    const content = String(t.content ?? '')
    const tTag = getTagName(content)
    const closing = isClosingTag(content)
    const selfClosing = isSelfClosing(tTag, content)
    if (!closing && !selfClosing && tTag === tag) {
      depth++
      continue
    }
    if (closing && tTag === tag) {
      if (depth === 0)
        return idx
      depth--
    }
  }
  return -1
}

function collectHtmlFragment(tokens: MarkdownToken[], startIndex: number, tag: string) {
  const openToken = tokens[startIndex]
  const fragmentTokens: MarkdownToken[] = [openToken]
  let innerTokens: MarkdownToken[] = []
  let nextIndex = startIndex + 1
  let closed = false

  const closingIndex = tag ? findMatchingClosing(tokens, startIndex + 1, tag) : -1
  if (closingIndex !== -1) {
    innerTokens = tokens.slice(startIndex + 1, closingIndex)
    fragmentTokens.push(...innerTokens, tokens[closingIndex])
    nextIndex = closingIndex + 1
    closed = true
  }
  else if (tokens[startIndex + 1]?.type === 'text') {
    innerTokens = [tokens[startIndex + 1]]
    fragmentTokens.push(tokens[startIndex + 1])
    nextIndex = startIndex + 2
  }

  return {
    closed,
    html: stringifyTokens(fragmentTokens),
    innerTokens,
    nextIndex,
  }
}

// Parse inline HTML and return an appropriate ParsedNode depending on tag.
export function parseHtmlInlineCodeToken(
  token: MarkdownToken,
  tokens: MarkdownToken[],
  i: number,
  parseInlineTokens: ParseInlineTokensFn,
  raw?: string,
  pPreToken?: MarkdownToken,
  options?: { requireClosingStrong?: boolean },
): [ParsedNode, number] {
  const code = String(token.content ?? '')
  const tag = getTagName(code)

  if (!tag) {
    return [
      {
        type: 'inline_code',
        code,
        raw: code,
      } as InlineCodeNode,
      i + 1,
    ]
  }

  if (tag === 'br') {
    return [
      {
        type: 'hardbreak',
        raw: code,
      } as ParsedNode,
      i + 1,
    ]
  }

  const closing = isClosingTag(code)
  const selfClosing = isSelfClosing(tag, code)

  if (closing) {
    return [
      {
        type: 'html_inline',
        tag,
        content: code,
        children: [],
        raw: code,
        loading: false,
      } as ParsedNode,
      i + 1,
    ]
  }

  if (tag === 'a') {
    const fragment = collectHtmlFragment(tokens, i, tag)
    const innerTokens = fragment.innerTokens
    const hrefMatch = code.match(/href\s*=\s*"([^"]+)"|href\s*=\s*'([^']+)'|href\s*=\s*([^\s>]+)/i)
    const href = hrefMatch ? (hrefMatch[1] || hrefMatch[2] || hrefMatch[3]) : ''
    const children = innerTokens.length
      ? parseInlineTokens(innerTokens, raw, pPreToken, options)
      : []
    const textContent = innerTokens.length ? stringifyTokens(innerTokens) : href || ''

    if (!children.length && textContent) {
      children.push({
        type: 'text',
        content: textContent,
        raw: textContent,
      } as ParsedNode)
    }

    return [
      {
        type: 'link',
        href: String(href ?? ''),
        title: null,
        text: textContent,
        children,
        loading: !fragment.closed,
        raw: fragment.html || code,
      } as ParsedNode,
      fragment.nextIndex,
    ]
  }

  if (selfClosing) {
    return [
      {
        type: 'html_inline',
        tag,
        content: code,
        children: [],
        raw: code,
        loading: false,
      } as ParsedNode,
      i + 1,
    ]
  }

  const fragment = collectHtmlFragment(tokens, i, tag)

  if (tag === 'p' || tag === 'div') {
    const children = fragment.innerTokens.length
      ? parseInlineTokens(fragment.innerTokens, raw, pPreToken, options)
      : []
    return [
      {
        type: 'paragraph',
        children,
        raw: fragment.html,
      } as ParsedNode,
      fragment.nextIndex,
    ]
  }

  const children = fragment.innerTokens.length
    ? parseInlineTokens(fragment.innerTokens, raw, pPreToken, options)
    : []

  return [
    {
      type: 'html_inline',
      tag,
      content: fragment.html || code,
      children,
      raw: fragment.html || code,
      loading: !fragment.closed,
    } as ParsedNode,
    fragment.nextIndex,
  ]
}
