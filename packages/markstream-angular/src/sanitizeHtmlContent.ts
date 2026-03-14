import { escapeAttr, escapeHtml, isSafeAttrName } from './components/shared/node-helpers'

interface HtmlToken {
  type: 'text' | 'tag_open' | 'tag_close' | 'self_closing'
  tagName?: string
  attrs?: Record<string, string>
  content?: string
}

const DANGEROUS_ATTRS = new Set([
  'onclick',
  'onerror',
  'onload',
  'onmouseover',
  'onmouseout',
  'onmousedown',
  'onmouseup',
  'onkeydown',
  'onkeyup',
  'onfocus',
  'onblur',
  'onsubmit',
  'onreset',
  'onchange',
  'onselect',
  'ondblclick',
  'ontouchstart',
  'ontouchend',
  'ontouchmove',
  'ontouchcancel',
  'onwheel',
  'onscroll',
  'oncopy',
  'oncut',
  'onpaste',
  'oninput',
  'oninvalid',
  'onsearch',
])

const BLOCKED_TAGS = new Set(['script'])

const URL_ATTRS = new Set([
  'href',
  'src',
  'srcset',
  'xlink:href',
  'formaction',
])

const VOID_ELEMENTS = new Set([
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

function stripControlAndWhitespace(value: string): string {
  let out = ''
  for (const ch of value) {
    const code = ch.charCodeAt(0)
    if (code <= 0x1F || code === 0x7F)
      continue
    if (/\s/u.test(ch))
      continue
    out += ch
  }
  return out
}

function isUnsafeUrl(value: string): boolean {
  const normalized = stripControlAndWhitespace(value).toLowerCase()

  if (normalized.startsWith('javascript:') || normalized.startsWith('vbscript:'))
    return true

  if (normalized.startsWith('data:')) {
    return !(
      normalized.startsWith('data:image/')
      || normalized.startsWith('data:video/')
      || normalized.startsWith('data:audio/')
    )
  }

  return false
}

function sanitizeAttrs(attrs: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {}

  for (const [key, value] of Object.entries(attrs)) {
    const safeName = key.trim()
    const lowerKey = safeName.toLowerCase()
    if (!safeName || !isSafeAttrName(safeName))
      continue
    if (DANGEROUS_ATTRS.has(lowerKey))
      continue
    if (URL_ATTRS.has(lowerKey) && value && isUnsafeUrl(value))
      continue
    clean[safeName] = value
  }

  return clean
}

function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = []
  let pos = 0

  while (pos < html.length) {
    if (html.startsWith('<!--', pos)) {
      const commentEnd = html.indexOf('-->', pos)
      if (commentEnd !== -1) {
        pos = commentEnd + 3
        continue
      }
      break
    }

    const tagStart = html.indexOf('<', pos)
    if (tagStart === -1) {
      if (pos < html.length)
        tokens.push({ type: 'text', content: html.slice(pos) })
      break
    }

    if (tagStart > pos)
      tokens.push({ type: 'text', content: html.slice(pos, tagStart) })

    if (html.startsWith('![CDATA[', tagStart + 1)) {
      const cdataEnd = html.indexOf(']]>', tagStart)
      if (cdataEnd !== -1) {
        tokens.push({ type: 'text', content: html.slice(tagStart, cdataEnd + 3) })
        pos = cdataEnd + 3
        continue
      }
      break
    }

    if (html.startsWith('!', tagStart + 1)) {
      const specialEnd = html.indexOf('>', tagStart)
      if (specialEnd !== -1) {
        pos = specialEnd + 1
        continue
      }
      break
    }

    const tagEnd = html.indexOf('>', tagStart)
    if (tagEnd === -1)
      break

    const tagContent = html.slice(tagStart + 1, tagEnd).trim()
    if (!tagContent) {
      pos = tagEnd + 1
      continue
    }

    const isClosingTag = tagContent.startsWith('/')
    const isSelfClosing = tagContent.endsWith('/')

    if (isClosingTag) {
      const tagName = tagContent.slice(1).trim()
      tokens.push({ type: 'tag_close', tagName })
      pos = tagEnd + 1
      continue
    }

    const spaceIndex = tagContent.indexOf(' ')
    let tagName = ''
    let attrsStr = ''
    if (spaceIndex === -1) {
      tagName = isSelfClosing ? tagContent.slice(0, -1).trim() : tagContent.trim()
    }
    else {
      tagName = tagContent.slice(0, spaceIndex).trim()
      attrsStr = tagContent.slice(spaceIndex + 1)
    }

    const attrs: Record<string, string> = {}
    if (attrsStr) {
      const attrRegex = /([^\s=]+)(?:=(?:"([^"]*)"|'([^']*)'|(\S*)))?/g
      let attrMatch: RegExpExecArray | null
      while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
        const name = attrMatch[1]
        const value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? ''
        if (name && !name.endsWith('/'))
          attrs[name] = value
      }
    }

    tokens.push({
      type: isSelfClosing || VOID_ELEMENTS.has(tagName.toLowerCase()) ? 'self_closing' : 'tag_open',
      tagName,
      attrs,
    })

    pos = tagEnd + 1
  }

  return tokens
}

function normalizeTagName(tagName: string | undefined): string {
  return String(tagName ?? '').trim().toLowerCase()
}

function serializeAttrs(attrs: Record<string, string>): string {
  const pairs = Object.entries(attrs)
  if (pairs.length === 0)
    return ''

  return pairs
    .map(([name, value]) => value === '' ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`)
    .join('')
}

export function sanitizeHtmlContent(content: string): string {
  if (!content)
    return ''

  const tokens = tokenizeHtml(content)
  const stack: string[] = []
  const output: string[] = []
  let blockedDepth = 0

  for (const token of tokens) {
    if (token.type === 'text') {
      if (blockedDepth === 0)
        output.push(escapeHtml(token.content ?? ''))
      continue
    }

    const tagName = normalizeTagName(token.tagName)
    if (!tagName)
      continue

    if (BLOCKED_TAGS.has(tagName)) {
      if (token.type === 'tag_open')
        blockedDepth += 1
      else if (token.type === 'tag_close' && blockedDepth > 0)
        blockedDepth -= 1
      continue
    }

    if (blockedDepth > 0)
      continue

    if (token.type === 'self_closing') {
      output.push(`<${tagName}${serializeAttrs(sanitizeAttrs(token.attrs ?? {}))}>`)
      continue
    }

    if (token.type === 'tag_open') {
      output.push(`<${tagName}${serializeAttrs(sanitizeAttrs(token.attrs ?? {}))}>`)
      if (!VOID_ELEMENTS.has(tagName))
        stack.push(tagName)
      continue
    }

    const matchedIndex = stack.lastIndexOf(tagName)
    if (matchedIndex === -1)
      continue

    while (stack.length > matchedIndex + 1) {
      const danglingTag = stack.pop()
      if (danglingTag)
        output.push(`</${danglingTag}>`)
    }

    const closingTag = stack.pop()
    if (closingTag)
      output.push(`</${closingTag}>`)
  }

  while (stack.length > 0) {
    const danglingTag = stack.pop()
    if (danglingTag)
      output.push(`</${danglingTag}>`)
  }

  return output.join('')
}
