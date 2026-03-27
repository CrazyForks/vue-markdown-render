import type { HtmlBlockNode, MarkdownToken } from '../../types'
import { VOID_HTML_TAGS } from '../../htmlTags'

function findTagCloseIndexOutsideQuotes(input: string) {
  let inSingle = false
  let inDouble = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (!inDouble && ch === '\'') {
      inSingle = !inSingle
      continue
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble
      continue
    }
    if (!inSingle && !inDouble && ch === '>')
      return i
  }

  return -1
}

function findMatchingCloseTagEnd(rawHtml: string, tag: string, startIndex: number) {
  const lowerTag = tag.toLowerCase()
  const openTagRe = new RegExp(String.raw`^<\s*${lowerTag}(?=\s|>|/)`, 'i')
  const closeTagRe = new RegExp(String.raw`^<\s*\/\s*${lowerTag}(?=\s|>)`, 'i')

  let depth = 0
  let index = Math.max(0, startIndex)

  while (index < rawHtml.length) {
    const lt = rawHtml.indexOf('<', index)
    if (lt === -1)
      return -1

    const slice = rawHtml.slice(lt)
    if (closeTagRe.test(slice)) {
      const endRel = findTagCloseIndexOutsideQuotes(slice)
      if (endRel === -1)
        return -1
      if (depth === 0)
        return lt + endRel + 1
      depth--
      index = lt + endRel + 1
      continue
    }

    if (openTagRe.test(slice)) {
      const endRel = findTagCloseIndexOutsideQuotes(slice)
      if (endRel === -1)
        return -1
      const rawTag = slice.slice(0, endRel + 1)
      if (!/\/\s*>$/.test(rawTag))
        depth++
      index = lt + endRel + 1
      continue
    }

    index = lt + 1
  }

  return -1
}

export function parseTagAttrs(openTag: string): [string, string][] {
  const attrs: [string, string][] = []
  const attrRegex = /\s([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
  let match

  while ((match = attrRegex.exec(openTag)) !== null) {
    const attrName = match[1]
    if (!attrName)
      continue
    const attrValue = match[2] || match[3] || match[4] || ''
    attrs.push([attrName, attrValue])
  }

  return attrs
}

export function parseHtmlBlock(token: MarkdownToken): HtmlBlockNode {
  const raw = String(token.content ?? '')

  // Non-element html blocks (comments, doctypes, processing instructions) are non-closable
  if (/^\s*<!--/.test(raw) || /^\s*<!/.test(raw) || /^\s*<\?/.test(raw)) {
    return {
      type: 'html_block',
      content: raw,
      raw,
      tag: '',
      loading: false,
    }
  }

  // Extract first tag name (lowercased) like div, p, section, etc.
  const tagMatch = raw.match(/^\s*<([A-Z][\w:-]*)/i)
  const tag = (tagMatch?.[1] || '').toLowerCase()

  // Handle unknown or malformed tag gracefully
  if (!tag) {
    return {
      type: 'html_block',
      content: raw,
      raw,
      tag: '',
      loading: false,
    }
  }

  const openEnd = findTagCloseIndexOutsideQuotes(raw)
  const openTag = openEnd === -1 ? raw : raw.slice(0, openEnd + 1)
  // Self-closing first tag like <img ... />
  const selfClosing = openEnd !== -1 && /\/\s*>$/.test(openTag)
  const isVoid = VOID_HTML_TAGS.has(tag)
  const attrs = parseTagAttrs(openTag)

  const closeEnd = openEnd === -1 ? -1 : findMatchingCloseTagEnd(raw, tag, openEnd + 1)
  const hasClosing = closeEnd !== -1

  const loading = !(isVoid || selfClosing || hasClosing)

  const content = loading
    ? `${raw.replace(/<[^>]*$/, '')}\n</${tag}>`
    : raw

  return {
    type: 'html_block',
    content,
    raw,
    tag,
    attrs: attrs.length ? attrs : undefined,
    loading,
  }
}
