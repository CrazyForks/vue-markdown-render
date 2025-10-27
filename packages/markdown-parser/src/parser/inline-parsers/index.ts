import type { LinkNode, MarkdownToken, ParsedNode, TextNode } from '../../types'
import { parseCheckboxInputToken, parseCheckboxToken } from './checkbox-parser'
import { parseEmojiToken } from './emoji-parser'
import { parseEmphasisToken } from './emphasis-parser'
import { parseFenceToken } from './fence-parser'
import { fixLinkToken } from './fixLinkToken'
import { fixListItem } from './fixListItem'
import { fixStrongTokens } from './fixStrongTokens'
import { parseFootnoteRefToken } from './footnote-ref-parser'
import { parseHardbreakToken } from './hardbreak-parser'
import { parseHighlightToken } from './highlight-parser'
import { parseImageToken } from './image-parser'
import { parseInlineCodeToken } from './inline-code-parser'
import { parseInsertToken } from './insert-parser'
import { parseLinkToken } from './link-parser'
import { parseMathInlineToken } from './math-inline-parser'
import { parseReferenceToken } from './reference-parser'
import { parseStrikethroughToken } from './strikethrough-parser'
import { parseStrongToken } from './strong-parser'
import { parseSubscriptToken } from './subscript-parser'
import { parseSuperscriptToken } from './superscript-parser'
import { parseTextToken } from './text-parser'

// Process inline tokens (for text inside paragraphs, headings, etc.)
export function parseInlineTokens(tokens: MarkdownToken[], raw?: string, pPreToken?: MarkdownToken): ParsedNode[] {
  if (!tokens || tokens.length === 0)
    return []

  const result: ParsedNode[] = []
  let currentTextNode: TextNode | null = null

  let i = 0
  tokens = fixStrongTokens(tokens)
  tokens = fixListItem(tokens)
  tokens = fixLinkToken(tokens)

  // Helpers to manage text node merging and pushing parsed nodes
  function resetCurrentTextNode() {
    currentTextNode = null
  }

  function handleEmphasisAndStrikethrough(content: string, token: MarkdownToken): boolean {
    // strikethrough (~~)
    if (/[^~]*~{2,}[^~]+/.test(content)) {
      let idx = content.indexOf('~~')
      if (idx === -1)
        idx = 0
      const _text = content.slice(0, idx)
      if (_text) {
        if (currentTextNode) {
          currentTextNode.content += _text
          currentTextNode.raw += _text
        }
        else {
          currentTextNode = {
            type: 'text',
            content: String(_text ?? ''),
            raw: String(token.content ?? ''),
          }
          result.push(currentTextNode)
        }
      }
      const strikethroughContent = content.slice(idx)
      const { node } = parseStrikethroughToken([
        { type: 's_open', tag: 's', content: '', markup: '*', info: '', meta: null },
        { type: 'text', tag: '', content: strikethroughContent.replace(/~/g, ''), markup: '', info: '', meta: null },
        { type: 's_close', tag: 's', content: '', markup: '*', info: '', meta: null },
      ], 0)
      resetCurrentTextNode()
      pushNode(node)
      i++
      return true
    }

    // strong (**)
    if (/\*\*/.test(content)) {
      const openIdx = content.indexOf('**')
      const beforeText = openIdx > -1 ? content.slice(0, openIdx) : ''
      if (beforeText) {
        pushText(beforeText, beforeText)
      }

      if (openIdx === -1) {
        i++
        return true
      }

      // find the first matching closing ** pair in the content
      const re = /\*\*([\s\S]*?)\*\*/
      const exec = re.exec(content)
      let inner = ''
      let after = ''
      if (exec && typeof exec.index === 'number') {
        inner = exec[1]
        after = content.slice(exec.index + exec[0].length)
      }
      else {
        // no closing pair found: mid-state, take rest as inner
        inner = content.slice(openIdx + 2)
        after = ''
      }

      const { node } = parseStrongToken([
        { type: 'strong_open', tag: 'strong', content: '', markup: '*', info: '', meta: null },
        { type: 'text', tag: '', content: inner, markup: '', info: '', meta: null },
        { type: 'strong_close', tag: 'strong', content: '', markup: '*', info: '', meta: null },
      ], 0, raw)

      resetCurrentTextNode()
      pushNode(node)

      if (after) {
        pushText(after, after)
      }

      i++
      return true
    }

    // emphasis (*)
    if (/[^*]*\*[^*]+/.test(content)) {
      let idx = content.indexOf('*')
      if (idx === -1)
        idx = 0
      const _text = content.slice(0, idx)
      if (_text) {
        if (currentTextNode) {
          currentTextNode.content += _text
          currentTextNode.raw += _text
        }
        else {
          currentTextNode = { type: 'text', content: String(_text ?? ''), raw: String(token.content ?? '') }
          result.push(currentTextNode)
        }
      }
      const emphasisContent = content.slice(idx)
      const { node } = parseEmphasisToken([
        { type: 'em_open', tag: 'em', content: '', markup: '*', info: '', meta: null },
        { type: 'text', tag: '', content: emphasisContent.replace(/\*/g, ''), markup: '', info: '', meta: null },
        { type: 'em_close', tag: 'em', content: '', markup: '*', info: '', meta: null },
      ], 0)
      resetCurrentTextNode()
      pushNode(node)
      i++
      return true
    }

    return false
  }

  function handleInlineCodeContent(content: string, _token: MarkdownToken): boolean {
    if (!/`[^`]*/.test(content))
      return false

    // Close any current text node and handle inline code
    resetCurrentTextNode()
    const code_start = content.indexOf('`')
    const code_end = content.indexOf('`', code_start + 1)
    const _text = content.slice(0, code_start)
    const codeContent = code_end === -1 ? content.slice(code_start) : content.slice(code_start, code_end)
    const after = code_end === -1 ? '' : content.slice(code_end + 1)
    if (_text) {
      // Try to re-run emphasis/strong parsing on the fragment before the code span
      // but avoid mutating the outer token index `i` (handlers sometimes increment it).
      const handled = handleEmphasisAndStrikethrough(_text, _token)
      // restore index so we don't skip tokens in the outer loop
      if (!handled) {
        pushText(_text, _text)
      }
      else {
        i--
      }
    }

    const code = codeContent.replace(/`/g, '')
    pushParsed({
      type: 'inline_code',
      code,
      raw: String(code ?? ''),
    } as ParsedNode)

    // afterCode 可能也存在很多情况包括多个 code，我们递归处理 --- IGNORE ---
    if (after) {
      handleToken({
        type: 'text',
        content: after,
        raw: String(after ?? ''),
      })
      i--
    }
    else if (code_end === -1) {
      // 要把下一个 token 也合并进来，把类型变成 text
      const nextToken = tokens[i + 1]
      if (nextToken) {
        let fixedAfter = after
        for (let j = i + 1; j < tokens.length; j++) {
          fixedAfter += String(((tokens[j].content ?? '') + (tokens[j].markup ?? '')))
        }
        i = tokens.length - 1
        handleToken({
          type: 'text',
          content: fixedAfter,
          raw: String(fixedAfter ?? ''),
        })
      }
    }
    i++
    return true
  }

  function pushParsed(node: ParsedNode) {
    // ensure any ongoing text node is closed when pushing non-text nodes
    resetCurrentTextNode()
    result.push(node)
  }

  function pushToken(token: MarkdownToken) {
    // push a raw token into result as a ParsedNode (best effort cast)
    resetCurrentTextNode()
    result.push(token as ParsedNode)
  }

  // backward-compatible alias used by existing call sites that pass parsed nodes
  function pushNode(node: ParsedNode) {
    pushParsed(node)
  }

  function pushText(content: string, raw?: string) {
    if (currentTextNode) {
      currentTextNode.content += content
      currentTextNode.raw += raw ?? content
    }
    else {
      currentTextNode = {
        type: 'text',
        content: String(content ?? ''),
        raw: String(raw ?? content ?? ''),
      } as TextNode
      result.push(currentTextNode)
    }
  }

  while (i < tokens.length) {
    const token = tokens[i] as MarkdownToken
    handleToken(token)
  }

  function handleToken(token: MarkdownToken) {
    switch (token.type) {
      case 'text': {
        handleTextToken(token)
        break
      }

      case 'softbreak':
        if (currentTextNode) {
          // Append newline to the current text node
          currentTextNode.content += '\n'
          currentTextNode.raw += '\n' // Assuming raw should also reflect the newline
        }
        // Don't create a node for softbreak itself, just modify text
        i++
        break

      case 'code_inline':
        pushNode(parseInlineCodeToken(token))
        i++
        break

      case 'link_open': {
        handleLinkOpen(token)
        break
      }

      case 'image':
        resetCurrentTextNode()
        pushNode(parseImageToken(token))
        i++
        break

      case 'strong_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseStrongToken(tokens, i, token.content)
        pushNode(node)
        i = nextIndex
        break
      }

      case 'em_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseEmphasisToken(tokens, i)
        pushNode(node)
        i = nextIndex
        break
      }

      case 's_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseStrikethroughToken(tokens, i)
        pushNode(node)
        i = nextIndex
        break
      }

      case 'mark_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseHighlightToken(tokens, i)
        pushNode(node)
        i = nextIndex
        break
      }

      case 'ins_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseInsertToken(tokens, i)
        pushNode(node)
        i = nextIndex
        break
      }

      case 'sub_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseSubscriptToken(tokens, i)
        pushNode(node)
        i = nextIndex
        break
      }

      case 'sup_open': {
        resetCurrentTextNode()
        const { node, nextIndex } = parseSuperscriptToken(tokens, i)
        pushNode(node)
        i = nextIndex
        break
      }

      case 'sub':
        resetCurrentTextNode()
        pushNode({
          type: 'subscript',
          children: [
            {
              type: 'text',
              content: String(token.content ?? ''),
              raw: String(token.content ?? ''),
            },
          ],
          raw: `~${String(token.content ?? '')}~`,
        })
        i++
        break

      case 'sup':
        resetCurrentTextNode()
        pushNode({
          type: 'superscript',
          children: [
            {
              type: 'text',
              content: String(token.content ?? ''),
              raw: String(token.content ?? ''),
            },
          ],
          raw: `^${String(token.content ?? '')}^`,
        })
        i++
        break

      case 'emoji': {
        resetCurrentTextNode()
        const preToken = tokens[i - 1]
        if (preToken?.type === 'text' && /\|:-+/.test(String(preToken.content ?? ''))) {
          // 处理表格中的 emoji，跳过
          pushText('', '')
        }
        else {
          pushNode(parseEmojiToken(token))
        }
        i++
        break
      }
      case 'checkbox':
        resetCurrentTextNode()
        pushNode(parseCheckboxToken(token))
        i++
        break
      case 'checkbox_input':
        resetCurrentTextNode()
        pushNode(parseCheckboxInputToken(token))
        i++
        break
      case 'footnote_ref':
        resetCurrentTextNode()
        pushNode(parseFootnoteRefToken(token))
        i++
        break

      case 'hardbreak':
        resetCurrentTextNode()
        pushNode(parseHardbreakToken())
        i++
        break

      case 'fence': {
        resetCurrentTextNode()
        // Handle fenced code blocks with language specifications
        pushNode(parseFenceToken(tokens[i]))
        i++
        break
      }

      case 'math_inline': {
        resetCurrentTextNode()
        pushNode(parseMathInlineToken(token))
        i++
        break
      }

      case 'reference': {
        handleReference(token)
        break
      }

      default:
        // Skip unknown token types, ensure text merging stops
        pushToken(token)
        i++
        break
    }
  }

  function handleTextToken(token: MarkdownToken) {
    // 合并连续的 text 节点
    let index = result.length - 1
    let content = String(token.content ?? '').replace(/\\/g, '')
    if (content.startsWith(')') && result[result.length - 1]?.type === 'link') {
      content = content.slice(1)
    }

    if (content.endsWith('undefined') && !raw?.endsWith('undefined')) {
      content = content.slice(0, -9)
    }
    for (index; index >= 0; index--) {
      const item = result[index]
      if (item.type === 'text') {
        currentTextNode = null
        content = item.content + content
        continue
      }
      break
    }

    if (index < result.length - 1)
      result.splice(index + 1)

    const nextToken = tokens[i + 1]
    if (content === '`' || content === '|' || content === '$' || content === '1' || /^\*+$/.test(content) || /^\d$/.test(content)) {
      i++
      return
    }
    if (!nextToken && /[^\]]\s*\(\s*$/.test(content)) {
      content = content.replace(/\(\s*$/, '')
    }
    if (handleCheckboxLike(content))
      return
    if (content === '[') {
      i++
      return
    }
    if (handleInlineCodeContent(content, token))
      return
    if (handleEmphasisAndStrikethrough(content, token))
      return
    if (handleInlineImageContent(content, token))
      return

    const textNode = parseTextToken({ ...token, content })

    if (handleInlineLinkContent(content, token))
      return
    const preToken = tokens[i - 1]
    if (currentTextNode) {
      // Merge with the previous text node
      currentTextNode.content += textNode.content.replace(/(\*+|\(|\\)$/, '')
      currentTextNode.raw += textNode.raw
    }
    else {
      const maybeMath = preToken?.tag === 'br' && tokens[i - 2]?.content === '['
      // Start a new text node
      const nextToken = tokens[i + 1]
      if (!nextToken)
        textNode.content = textNode.content.replace(/(\*+|\(|\\)$/, '')

      currentTextNode = textNode
      currentTextNode.center = maybeMath
      result.push(currentTextNode)
    }
    i++
  }

  function handleLinkOpen(token: MarkdownToken) {
    // mirror logic previously in the switch-case for 'link_open'
    resetCurrentTextNode()
    const href = token.attrs?.find(([name]) => name === 'href')?.[1]
    // 如果 text 不在[]里说明，它不是一个link， 当 text 处理
    function escapeRegExp(str: string) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }

    if (raw && tokens[i + 1].type === 'text') {
      const text = String(tokens[i + 1]?.content ?? '')
      const escText = escapeRegExp(text)
      const reg = new RegExp(`\\[${escText}\\s*\\]`)
      if (!reg.test(raw)) {
        pushText(text, text)
        i += 3
        return
      }
    }
    if (raw && href) {
      const loadingMath = new RegExp(`\\(\\s*${escapeRegExp(href)}\\s*\\)`)
      const pre = result.length > 0 ? result[result.length - 1] : undefined as ParsedNode | undefined
      const loading = !loadingMath.test(raw)
      if (loading && pre) {
        let preText = ''
        if (pre) {
          if (pre.type === 'link')
            preText = String((pre as LinkNode).text ?? '')
          else if (pre.type === 'text')
            preText = String((pre as TextNode).content ?? '')
          else if (((pre as { content?: unknown }).content) && typeof (pre as { content?: unknown }).content === 'string')
            preText = String((pre as { content?: string }).content ?? '').slice(1, -1)
        }
        const isLinkMatch = new RegExp(`\\[${escapeRegExp(preText)}\\s*\\]\\(`)
        if (isLinkMatch.test(raw)) {
          const text = String(preText ?? '')
          resetCurrentTextNode()
          const node = {
            type: 'link',
            href: '',
            title: null,
            text,
            children: [
              { type: 'text', content: text, raw: text },
            ],
            loading,
          } as ParsedNode
          result.splice(result.length - 1, 1, node) // remove the pre node
          i += 3
          if (String(tokens[i]?.content ?? '') === '.')
            i++
          return
        }
      }
    }
    const { node, nextIndex } = parseLinkToken(tokens, i)
    i = nextIndex

    node.loading = false
    pushParsed(node)
  }

  function handleReference(token: MarkdownToken) {
    // mirror previous in-switch 'reference' handling
    resetCurrentTextNode()
    const nextToken = tokens[i + 1]
    const preToken = tokens[i - 1]
    const preResult = result[result.length - 1]

    const nextIsTextNotStartingParens = nextToken?.type === 'text' && !((String(nextToken.content ?? '')).startsWith('('))
    const preIsTextEndingBracketOrOnlySpace = preToken?.type === 'text' && /\]$|^\s*$/.test(String(preToken.content ?? ''))

    if (nextIsTextNotStartingParens || preIsTextEndingBracketOrOnlySpace) {
      pushNode(parseReferenceToken(token))
    }
    else if (nextToken && nextToken.type === 'text') {
      nextToken.content = String(token.markup ?? '') + String(nextToken.content ?? '')
    }
    else if (preResult && preResult.type === 'text') {
      preResult.content = String(preResult.content ?? '') + String(token.markup ?? '')
      preResult.raw = String(preResult.raw ?? '') + String(token.markup ?? '')
    }
    i++
  }

  function handleInlineLinkContent(content: string, _token: MarkdownToken): boolean {
    const linkStart = content.indexOf('[')
    if (linkStart === -1)
      return false

    let textNodeContent = content.slice(0, linkStart)
    const linkEnd = content.indexOf('](', linkStart)
    if (linkEnd !== -1) {
      const textToken = tokens[i + 2]
      let text = content.slice(linkStart + 1, linkEnd)
      if (text.includes('[')) {
        const secondLinkStart = text.indexOf('[')
        // adjust original linkStart and text
        textNodeContent += content.slice(0, linkStart + secondLinkStart + 1)
        const newLinkStart = linkStart + secondLinkStart + 1
        text = content.slice(newLinkStart + 1, linkEnd)
      }
      const nextToken = tokens[i + 1]
      if (content.endsWith('](') && nextToken?.type === 'link_open' && textToken) {
        const last = tokens[i + 4]
        let index = 4
        let loading = true
        if (last?.type === 'text' && last.content === ')') {
          index++
          loading = false
        }
        else if (last?.type === 'text' && last.content === '.') {
          i++
        }

        if (textNodeContent) {
          pushText(textNodeContent, textNodeContent)
        }
        pushParsed({
          type: 'link',
          href: String(textToken.content ?? ''),
          title: null,
          text,
          children: [{ type: 'text', content: text, raw: text }],
          loading,
        } as ParsedNode)
        i += index
        return true
      }

      const linkContentEnd = content.indexOf(')', linkEnd)
      const href = linkContentEnd !== -1 ? content.slice(linkEnd + 2, linkContentEnd) : ''
      const loading = linkContentEnd === -1

      if (textNodeContent) {
        pushText(textNodeContent, textNodeContent)
      }
      pushParsed({
        type: 'link',
        href,
        title: null,
        text,
        children: [{ type: 'text', content: text, raw: text }],
        loading,
      } as ParsedNode)

      const afterText = linkContentEnd !== -1 ? content.slice(linkContentEnd + 1) : ''
      if (afterText) {
        handleToken({ type: 'text', content: afterText, raw: afterText } as unknown as MarkdownToken)
        i--
      }
      i++
      return true
    }

    return false
  }

  function handleInlineImageContent(content: string, token: MarkdownToken): boolean {
    const imageStart = content.indexOf('![')
    if (imageStart === -1)
      return false

    const textNodeContent = content.slice(0, imageStart)
    if (!currentTextNode) {
      currentTextNode = {
        type: 'text',
        content: textNodeContent,
        raw: textNodeContent,
      }
    }
    else {
      currentTextNode.content += textNodeContent
    }
    result.push(currentTextNode)
    currentTextNode = null // Reset current text node
    pushParsed(parseImageToken(token, true) as ParsedNode)
    i++
    return true
  }

  function handleCheckboxLike(content: string): boolean {
    // Detect checkbox-like syntax at the start of a list item e.g. [x] or [ ]
    if (!(content?.startsWith('[') && pPreToken?.type === 'list_item_open'))
      return false

    const _content = content.slice(1)
    const w = _content.match(/[^\s\]]/)
    if (w === null) {
      i++
      return true
    }
    // If the first non-space/']' char is x/X treat as a checkbox input
    if (w && /x/i.test(w[0])) {
      const checked = w[0] === 'x' || w[0] === 'X'
      pushParsed({
        type: 'checkbox_input',
        checked,
        raw: checked ? '[x]' : '[ ]',
      } as ParsedNode)
      i++
      return true
    }

    return false
  }

  return result
}
