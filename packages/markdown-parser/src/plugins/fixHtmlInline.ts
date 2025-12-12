import type { MarkdownIt, Token } from 'markdown-it-ts'

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

// A conservative set of common HTML tags used to detect streaming mid-states.
// We only suppress/merge partial tags for these names to avoid false positives
// (e.g., autolinks like <http://...>).
const BASE_COMMON_HTML_TAGS = new Set<string>([
  ...Array.from(VOID_TAGS),
  // inline/common
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'button',
  'cite',
  'code',
  'data',
  'del',
  'dfn',
  'em',
  'i',
  'img',
  'input',
  'ins',
  'kbd',
  'label',
  'mark',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
  // block/common
  'article',
  'aside',
  'blockquote',
  'div',
  'details',
  'figcaption',
  'figure',
  'footer',
  'header',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
  // svg-ish (often embedded inline)
  'svg',
  'g',
  'path',
])

const OPEN_TAG_RE = /<([A-Z][\w-]*)(?=[\s/>]|$)/gi
const CLOSE_TAG_RE = /<\/\s*([A-Z][\w-]*)(?=[\s/>]|$)/gi
// Match a complete HTML tag starting at "<", capturing the tag name.
// The attribute part is optional but requires leading whitespace, which
// prevents ambiguous adjacent quantifiers and avoids super-linear backtracking.
const FULL_TAG_RE = /^<\s*(?:\/\s*)?([A-Z][\w-]*)(?:\s[^>]*?)?\/?>/i

function tokenToRaw(token: Token) {
  const shape = token as unknown as { raw?: string, markup?: string, content?: string }
  return String(shape.raw ?? shape.content ?? shape.markup ?? '')
}

function buildCommonHtmlTagSet(extraTags?: readonly string[]) {
  const set = new Set(BASE_COMMON_HTML_TAGS)
  if (extraTags && Array.isArray(extraTags)) {
    for (const t of extraTags) {
      const raw = String(t ?? '').trim()
      if (!raw)
        continue
      const m = raw.match(/^[<\s/]*([A-Z][\w-]*)/i)
      if (!m)
        continue
      set.add(m[1].toLowerCase())
    }
  }
  return set
}

function isCommonHtmlTagOrPrefix(tag: string, tagSet: Set<string>) {
  if (tagSet.has(tag))
    return true
  for (const common of tagSet) {
    if (common.startsWith(tag))
      return true
  }
  return false
}

function findFirstIncompleteTag(content: string, tagSet: Set<string>) {
  let first:
    | { index: number, tag: string, closing: boolean }
    | null = null

  for (const m of content.matchAll(OPEN_TAG_RE)) {
    const idx = m.index ?? -1
    if (idx < 0)
      continue
    const tag = (m[1] ?? '').toLowerCase()
    if (!tagSet.has(tag))
      continue
    const rest = content.slice(idx)
    if (rest.includes('>'))
      continue
    if (!first || idx < first.index)
      first = { index: idx, tag, closing: false }
  }

  for (const m of content.matchAll(CLOSE_TAG_RE)) {
    const idx = m.index ?? -1
    if (idx < 0)
      continue
    const tag = (m[1] ?? '').toLowerCase()
    // For closing tags we also accept prefixes of known HTML tags
    // (e.g., '</sp' while typing '</span>').
    if (!isCommonHtmlTagOrPrefix(tag, tagSet))
      continue
    const rest = content.slice(idx)
    if (rest.includes('>'))
      continue
    if (!first || idx < first.index)
      first = { index: idx, tag, closing: true }
  }

  // Also swallow bare "<" or "</" at the end while typing.
  const bareClose = /<\/\s*$/.exec(content)
  if (bareClose && typeof bareClose.index === 'number') {
    const idx = bareClose.index
    const rest = content.slice(idx)
    if (!rest.includes('>') && (!first || idx < first.index))
      first = { index: idx, tag: '', closing: true }
  }

  const bareOpen = /<\s*$/.exec(content)
  if (bareOpen && typeof bareOpen.index === 'number') {
    const idx = bareOpen.index
    const rest = content.slice(idx)
    // Avoid matching "</" which is handled above.
    if (!rest.startsWith('</') && !rest.includes('>') && (!first || idx < first.index))
      first = { index: idx, tag: '', closing: false }
  }

  return first
}

function splitTextToken(token: Token, content: string) {
  const t = token as Token & { content?: string, raw?: string }
  // Preserve the original Token prototype (markdown-it-ts attaches helper methods).
  const nt = Object.assign(
    Object.create(Object.getPrototypeOf(t)),
    t,
    { type: 'text', content, raw: content },
  ) as Token
  return nt
}

function fixStreamingHtmlInlineChildren(children: Token[], tagSet: Set<string>) {
  if (!children.length)
    return { children }

  const out: Token[] = []
  let pending: { tag: string, buffer: string, closing: boolean } | null = null
  let pendingAtEnd: string | null = null

  function pushTextPart(text: string, baseToken?: Token) {
    if (!text)
      return
    if (baseToken)
      out.push(splitTextToken(baseToken, text))
    else
      out.push({ type: 'text', content: text, raw: text } as any)
  }

  function splitCompleteHtmlFromText(chunk: string, baseToken?: Token) {
    let cursor = 0
    while (cursor < chunk.length) {
      const lt = chunk.indexOf('<', cursor)
      if (lt === -1) {
        pushTextPart(chunk.slice(cursor), baseToken)
        break
      }
      pushTextPart(chunk.slice(cursor, lt), baseToken)
      const sub = chunk.slice(lt)
      const fullMatch = sub.match(FULL_TAG_RE)
      if (!fullMatch) {
        pushTextPart('<', baseToken)
        cursor = lt + 1
        continue
      }
      const tagText = fullMatch[0]
      const tagName = (fullMatch[1] ?? '').toLowerCase()
      if (tagSet.has(tagName)) {
        out.push({
          type: 'html_inline',
          tag: '',
          content: tagText,
          raw: tagText,
        } as any)
      }
      else {
        pushTextPart(tagText, baseToken)
      }
      cursor = lt + tagText.length
    }
  }

  function processTextChunk(chunk: string, baseToken?: Token) {
    if (!chunk)
      return
    const match = findFirstIncompleteTag(chunk, tagSet)
    if (!match) {
      splitCompleteHtmlFromText(chunk, baseToken)
      return
    }

    const before = chunk.slice(0, match.index)
    if (before)
      splitCompleteHtmlFromText(before, baseToken)
    pending = {
      tag: match.tag,
      buffer: chunk.slice(match.index),
      closing: match.closing,
    }
    pendingAtEnd = pending.buffer
  }

  for (const child of children) {
    if (pending) {
      pending.buffer += tokenToRaw(child)
      pendingAtEnd = pending.buffer
      const closeIdx = pending.buffer.indexOf('>')
      if (closeIdx === -1) {
        // still incomplete: swallow this token to avoid rendering jitter
        continue
      }

      const tagChunk = pending.buffer.slice(0, closeIdx + 1)
      const afterChunk = pending.buffer.slice(closeIdx + 1)
      out.push({
        type: 'html_inline',
        tag: '',
        content: tagChunk,
        raw: tagChunk,
      } as any)
      pending = null
      pendingAtEnd = null
      if (afterChunk)
        processTextChunk(afterChunk)
      continue
    }

    if (child.type === 'text') {
      const content = String((child as any).content ?? '')
      if (!content.includes('<')) {
        out.push(child)
        continue
      }
      processTextChunk(content, child)
      continue
    }

    out.push(child)
  }

  return {
    children: out,
    pendingBuffer: pendingAtEnd ?? undefined,
  }
}

export interface FixHtmlInlineOptions {
  /**
   * Custom HTML-like tag names that should participate in streaming
   * mid-state suppression and complete-tag splitting (e.g. ['thinking']).
   */
  customHtmlTags?: readonly string[]
}

export function applyFixHtmlInlineTokens(md: MarkdownIt, options: FixHtmlInlineOptions = {}) {
  const commonHtmlTags = buildCommonHtmlTagSet(options.customHtmlTags)
  // Tags that should stay inline when we auto-append a closing tag at core stage.
  const autoCloseInlineTagSet = new Set<string>([
    'a',
    'span',
    'strong',
    'em',
    'b',
    'i',
    'u',
  ])
  const customTagSet = new Set<string>()
  if (options.customHtmlTags?.length) {
    for (const t of options.customHtmlTags) {
      const raw = String(t ?? '').trim()
      if (!raw)
        continue
      const m = raw.match(/^[<\s/]*([A-Z][\w-]*)/i)
      if (!m)
        continue
      const name = m[1].toLowerCase()
      customTagSet.add(name)
      autoCloseInlineTagSet.add(name)
    }
  }
  // Streaming mid-state: suppress partial inline HTML in text tokens until the
  // tag is fully closed with `>`, then allow it to be tokenized as html_inline.
  md.core.ruler.after('inline', 'fix_html_inline_streaming', (state: unknown) => {
    const s = state as unknown as { tokens?: Token[] }
    const toks = s.tokens ?? []
    for (const t of toks) {
      const tok = t as Token & { children?: Token[], content?: string, raw?: string }
      if (tok.type !== 'inline' || !Array.isArray(tok.children))
        continue

      // markdown-it-ts may emit inline tokens with empty children when the
      // content starts with an incomplete HTML-ish fragment like "<span ...".
      // In that case, synthesize a text token so we can suppress mid-states.
      const originalContent = String(tok.content ?? '')
      const sourceChildren = tok.children.length
        ? tok.children
        : (originalContent.includes('<')
            ? [{ type: 'text', content: originalContent, raw: originalContent } as any]
            : null)

      if (!sourceChildren)
        continue

      try {
        const fixed = fixStreamingHtmlInlineChildren(sourceChildren, commonHtmlTags)
        tok.children = fixed.children
        if (fixed.pendingBuffer) {
          const idx = originalContent.lastIndexOf(fixed.pendingBuffer)
          if (idx !== -1) {
            const trimmed = originalContent.slice(0, idx)
            tok.content = trimmed
            // keep raw in sync if present
            if (typeof tok.raw === 'string')
              tok.raw = trimmed
          }
        }
      }
      catch (e) {
        console.error('[applyFixHtmlInlineTokens] failed to fix streaming html inline', e)
      }
    }
  })

  // Fix certain single-token inline HTML cases by expanding into [openTag, text, closeTag]
  // This helps downstream inline parsers (e.g., <a>text</a>) to recognize inner text reliably.
  md.core.ruler.push('fix_html_inline_tokens', (state: unknown) => {
    const s = state as unknown as { tokens?: Token[] }
    const toks = s.tokens ?? []

    // 有一些很特殊的场景，比如 html_block 开始 <thinking>，但是后面跟着很多段落,如果没匹配到</thinking>，中间的都应该合并为html_block的 content
    const tagStack: [string, number][] = []
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i] as Token & { content?: string, children: any[] }
      if (t.type === 'html_block') {
        const tag = (t.content?.match(/<([^\s>/]+)/)?.[1] ?? '').toLowerCase()
        const isClosingTag = /<\s*\/\s*[^\s>]+\s*>/.test(t.content || '')
        if (!isClosingTag) {
          // 开始标签，入栈
          tagStack.push([tag, i])
        }
        else {
          // 结束标签，出栈
          if (tagStack.length > 0 && tagStack[tagStack.length - 1][0] === tag) {
            tagStack.pop()
          }
        }
        continue
      }
      else if (tagStack.length > 0) {
        // 如果在标签栈中，说明是未闭合标签的内容，合并到上一个 html_block
        if (t.type === 'paragraph_open' || t.type === 'paragraph_close') {
          // 应该删除这些标签
          toks.splice(i, 1)
          i-- // 调整索引
          continue
        }
        const content = t.content || ''
        const CLOSING_TAG_REGEX = new RegExp(`<\\s*\\/\\s*${tagStack[tagStack.length - 1][0]}\\s*>`, 'i')
        const isClosingTag = CLOSING_TAG_REGEX.test(content)

        if (content) {
          // 插入到栈顶标签对应的 html_block 中
          const [, openIndex] = tagStack[tagStack.length - 1]
          const openToken = toks[openIndex] as Token & { content?: string, loading: boolean }
          openToken.content = `${openToken.content || ''}\n${content}`
          if (openToken.loading !== false)
            openToken.loading = !isClosingTag
        }
        if (isClosingTag) {
          tagStack.pop()
        }
        // 删除当前 token
        toks.splice(i, 1)
        i-- // 调整索引
      }
      else {
        continue
      }
    }

    for (let i = 0; i < toks.length; i++) {
      const t = toks[i] as Token & { content?: string, children: any[], loading?: boolean }
      if (t.type === 'html_block') {
        const rawTag = t.content?.match(/<([^\s>/]+)/)?.[1] ?? ''
        const tag = rawTag.toLowerCase()
        // Keep custom tags as html_block so block-level custom components work.

        // Do not attempt to convert or close comments/doctypes/processing-instructions
        if (tag.startsWith('!') || tag.startsWith('?')) {
          t.loading = false
          continue
        }
        // 如果是常见的 block 标签，则跳过，否则转换成 inline 处理
        if (['br', 'hr', 'img', 'input', 'link', 'meta', 'div', 'p', 'ul', 'li'].includes(tag))
          continue
        t.type = 'inline'
        const loading = t.content?.toLowerCase().includes(`</${tag}>`) ? false : t.loading !== undefined ? t.loading : true
        const attrs: [string, string][] = []
        // 解析属性
        const attrRegex = /\s([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
        let match
        while ((match = attrRegex.exec(t.content || '')) !== null) {
          const attrName = match[1]
          const attrValue = match[2] || match[3] || match[4] || ''
          attrs.push([attrName, attrValue])
        }
        if (customTagSet.has(tag)) {
          // 提取内容中间的文本作为 children
          const contentMatch = t.content?.match(new RegExp(`<\\s*${tag}[^>]*>([\\s\\S]*?)<\\s*\\/\\s*${tag}\\s*>`, 'i'))
          const raw = t.content
          const content = contentMatch ? contentMatch[1] : ''
          t.children = [
            {
              type: tag,
              content,
              raw,
              attrs,
              tag,
              loading,
            },
          ] as any[]
        }
        else {
          t.children = [
            {
              type: 'html_block',
              content: t.content,
              tag,
              loading,
            },
          ] as any[]
        }
        continue
      }
      if (!t || t.type !== 'inline')
        continue

      // 修复children 是单个 html_inline的场景
      if (t.children.length === 2 && t.children[0].type === 'html_inline') {
        // 补充一个闭合标签
        const rawTag = t.children[0].content?.match(/<([^\s>/]+)/)?.[1] ?? ''
        const tag = rawTag.toLowerCase()
        // 如果是常见的 inline标签（含用户自定义），则只追加结尾标签，否则转换成 html_block
        if (autoCloseInlineTagSet.has(tag)) {
          t.children[0].loading = true
          t.children[0].tag = tag
          t.children.push({
            type: 'html_inline',
            tag,
            loading: true,
            content: `</${tag}>`,
          } as any)
        }
        else {
          t.children = [
            {
              type: 'html_block',
              loading: true,
              tag,
              content: t.children[0].content + t.children[1].content,
            } as any,
          ]
        }
        continue
      }
      else if (t.children.length === 3 && t.children[0].type === 'html_inline' && t.children[2].type === 'html_inline') {
        const rawTag = t.children[0].content?.match(/<([^\s>/]+)/)?.[1] ?? ''
        const tag = rawTag.toLowerCase()
        // 如果是常见的 inline标签（含用户自定义），则不处理，否则转换成 html_block
        if (autoCloseInlineTagSet.has(tag))
          continue
        t.children = [
          {
            type: 'html_block',
            loading: false,
            tag,
            content: t.children.map(ct => ct.content).join(''),
          } as any,
        ]
        continue
      }
      // Only handle pathological cases where inline content is a single HTML-ish chunk
      if (!t.content?.startsWith('<') || (t as any).children?.length !== 1)
        continue

      const raw = String(t.content)
      const tagName = raw.match(/<([^\s>/]+)/)?.[1]?.toLowerCase() ?? ''
      if (!tagName)
        continue

      const selfClosing = /\/\s*>\s*$/.test(raw)
      const isVoid = selfClosing || VOID_TAGS.has(tagName)

      const htmlToken = t as unknown as { children: Array<{ type: string, content: string }> }

      if (isVoid) {
        // For void/self-closing tags, keep a single html_inline token
        htmlToken.children = [
          { type: 'html_inline', content: raw },
        ] as any
        continue
      }
      htmlToken.children.length = 0
    }
  })
}
