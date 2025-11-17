import type { MarkdownIt } from 'markdown-it-ts'
import type { MarkdownToken } from '../types'

// todo: The code below has been refactored because it involves a lot of repetitive data transformations and needs to accommodate different scenarios, such as plain text. It should now be correctly converted to a link.
export function applyFixLinkTokens(md: MarkdownIt) {
  // Run after the inline rule so markdown-it has produced inline tokens
  // for block-level tokens; we then adjust each inline token's children
  // so downstream code receives corrected token arrays during the same
  // parsing pass.
  md.core.ruler.after('inline', 'fix_link_tokens', (state: unknown) => {
    const s = state as unknown as { tokens?: Array<{ type?: string, children?: any[] }> }
    const toks = s.tokens ?? []
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i]
      if (t && t.type === 'inline' && Array.isArray(t.children)) {
        try {
          t.children = fixLinkToken(t.children)
        }
        catch (e) {
          // Swallow errors to avoid breaking parsing; keep original children
          // so parse still succeeds even if our fix fails for an unexpected shape.
          // Errors should be rare and indicate malformed token arrays.

          console.error('[applyFixLinkTokens] failed to fix inline children', e)
        }
      }
    }
  })
}

// narrow helper to reduce non-null assertions on text tokens
function isTextToken(t?: MarkdownToken): t is MarkdownToken & { type: 'text', content: string } {
  return !!t && t.type === 'text' && typeof (t as any).content === 'string'
}

function fixLinkToken(tokens: MarkdownToken[]): MarkdownToken[] {
  const tokensAny = tokens as unknown as MarkdownToken[]
  tokens = fixLinkToken4(fixLinkToken6(tokens))
  if (tokens.length < 5)
    return fixLinkToken3(tokens)
  const first = tokens[tokens.length - 5]
  const firstAny = first as unknown as { content?: string }
  const firstContent = String(firstAny.content ?? '')
  // use OR and optional chaining to avoid unsafe access
  if (first.type !== 'text' || !firstContent.endsWith('['))
    return fixLinkTokens2(tokens)
  const second = tokens[tokens.length - 4]
  const secondAny = second as unknown as { tag?: string }
  const secondTag = secondAny.tag
  if (secondTag !== 'em')
    return fixLinkTokens2(tokens)
  const last = tokens[tokens.length - 1]
  const lastAny = last as unknown as { content?: string, type?: string }
  const lastContent = String(lastAny.content ?? '')
  if (last?.type === 'text' && !lastContent.startsWith(']'))
    return fixLinkTokens2(tokens)

  const third = tokens[tokens.length - 3]
  const thirdAny = third as unknown as { content?: string }
  const thirdContent = String(thirdAny.content ?? '')
  const href = lastContent.replace(/^\]\(*/, '')
  const loading = !lastContent.includes(')')
  tokensAny[tokens.length - 5].content = firstContent.replace(/\[$/, '')
  tokens.splice(tokens.length - 3, 1, {
    type: 'link',
    href,
    text: thirdContent,
    children: [
      {
        type: 'text',
        content: thirdContent,
        raw: thirdContent,
      },
    ],
    loading,
  } as MarkdownToken)
  tokens.splice(tokens.length - 1, 1)
  return tokens
}

function fixLinkTokens2(tokens: MarkdownToken[]): MarkdownToken[] {
  const tokensAny = tokens as unknown as MarkdownToken[]
  if (tokens.length < 8)
    return tokens
  let length = tokens.length
  let last = tokens[length - 1]
  if (!last)
    return tokens
  if (last.type !== 'link_close') {
    length--
    last = tokens[length - 1]
    if (last.type !== 'link_close')
      return tokens
  }
  const second = tokens[length - 7]
  if (second.type !== 'em_open')
    return tokens
  const third = tokens[length - 6]
  const first = tokens[length - 8]
  if (first.type !== 'text')
    return tokens
  let href = String(tokensAny[length - 2]?.content ?? '')
  let count = 4
  if (length !== tokens.length) {
    // 合并 last 到 href
    href += String(last.content ?? '')
    count++
  }
  tokens.splice(length - 4, count)
  const thirdAny = third as unknown as { content?: string }
  const content = String(thirdAny.content ?? '')
  length -= 4
  const firstAny = first as unknown as { content?: string }
  tokensAny[length - 8].content = String(firstAny.content ?? '').replace(/\[$/, '')
  tokens.splice(length - 2, 1, {
    type: 'link',
    href,
    text: content,
    children: [
      {
        type: 'text',
        content,
        raw: content,
      },
    ],
    loading: true,
  } as MarkdownToken)
  return tokens
}

function fixLinkToken3(tokens: MarkdownToken[]): MarkdownToken[] {
  const tokensAny = tokens as unknown as MarkdownToken[]
  const last = tokens[tokens.length - 1]
  const preLast = tokens[tokens.length - 2]
  const fixedTokens = [...tokens]
  if (!last)
    return tokens

  if (last.type !== 'text' || !(last as unknown as { content?: string }).content?.startsWith(')')) {
    return fixLinkToken5(tokens)
  }
  if (preLast.type !== 'link_close')
    return tokens

  if (isTextToken(tokens[tokens.length - 5]) && String(((tokens[tokens.length - 5]) as unknown as { content?: string }).content ?? '').endsWith('(')) {
    const a = tokensAny[tokens.length - 5] as unknown as { content?: string }
    const b = tokensAny[tokens.length - 3] as unknown as { content?: string }
    const content = String(a.content ?? '') + String(b.content ?? '') + String(last.content ?? '')
    // delete exactly 5 tokens starting at length - 5
    fixedTokens.splice(tokens.length - 5, 5, {
      type: 'text',
      content,
      raw: content,
    })
  }
  else {
    // avoid mutating the original array, update the copy
    const lc = ((last.content ?? '')).slice(1)
    fixedTokens[fixedTokens.length - 1] = { ...last, content: lc }
  }
  return fixedTokens
}

function fixLinkToken4(tokens: MarkdownToken[]): MarkdownToken[] {
  const tokensAny = tokens as unknown as MarkdownToken[]
  const fixedTokens = [...tokens]
  for (let i = tokens.length - 1; i >= 3; i--) {
    const token = tokens[i]
    if (token && token.type === 'link_close') {
      if (tokens[i - 3]?.content?.endsWith('(')) {
        const nextToken = tokens[i + 1]
        if (nextToken && nextToken?.type === 'text') {
          if (tokens[i - 1].type === 'text' && tokens[i - 3]?.type === 'text') {
            const nextTokenContent = String((nextToken as unknown as { content?: string }).content ?? '')
            const a = tokensAny[i - 3] as unknown as { content?: string }
            const b = tokensAny[i - 1] as unknown as { content?: string }
            const content = String(a.content ?? '') + String(b.content ?? '') + nextTokenContent
            fixedTokens.splice(i - 3, 5, {
              type: 'text',
              content,
              raw: content,
            })
            i -= 3
          }
        }
        else {
          if (tokens[i - 1].type === 'text' && tokens[i - 3]?.type === 'text') {
            const a = tokensAny[i - 3] as unknown as { content?: string }
            const b = tokensAny[i - 1] as unknown as { content?: string }
            const content = String(a.content ?? '') + String(b.content ?? '')
            fixedTokens.splice(i - 3, 4, {
              type: 'text',
              content,
              raw: content,
            })
          }
          i -= 3
        }
      }
    }
  }
  return fixedTokens
}

function fixLinkToken5(tokens: MarkdownToken[]): MarkdownToken[] {
  const firstToken = tokens[0]
  const nextToken = tokens[1]
  if (firstToken.type === 'text' && firstToken.content?.endsWith('(') && nextToken.type === 'link_open') {
    const linkText = firstToken.content.match(/\[([^\]]+)\]/)?.[1] || ''
    const href = tokens[2]?.content || ''
    const title = ''
    const newTokens = [
      {
        type: 'link',
        loading: true,
        href,
        title,
        text: linkText,
        children: [
          {
            type: 'text',
            content: linkText,
            raw: linkText,
          },
        ],
        raw: String(`[${linkText}](${href}${title ? ` "${title}"` : ''})`),
      },
    ]
    tokens.splice(0, 4, ...newTokens)
  }

  return tokens
}

function fixLinkToken6(tokens: MarkdownToken[]): MarkdownToken[] {
  if (tokens.length < 4)
    return tokens

  for (let i = 0; i <= tokens.length - 4; i++) {
    if (tokens[i]?.type === 'text' && tokens[i].content?.endsWith('(') && tokens[i + 1]?.type === 'link_open') {
      const match = tokens[i].content!.match(/\[([^\]]+)\]/)
      if (match) {
        let beforeText = tokens[i].content!.slice(0, match.index)
        const emphasisMatch = beforeText.match(/(\*+)$/)
        const replacerTokens = []
        if (emphasisMatch) {
          beforeText = beforeText.slice(0, emphasisMatch.index)
          if (beforeText) {
            replacerTokens.push({
              type: 'text',
              content: beforeText,
              raw: beforeText,
            })
          }
          const text = match[1]
          const type = emphasisMatch[1].length
          if (type === 1) {
            replacerTokens.push({ type: 'em_open', tag: 'em', nesting: 1 })
          }
          else if (type === 2) {
            replacerTokens.push({ type: 'strong_open', tag: 'strong', nesting: 1 })
          }
          else if (type === 3) {
            replacerTokens.push({ type: 'strong_open', tag: 'strong', nesting: 1 })
            replacerTokens.push({ type: 'em_open', tag: 'em', nesting: 1 })
          }
          let href = tokens[i + 2]?.content || ''
          if (tokens[i + 4]?.type === 'text' && !tokens[i + 4].content?.startsWith(')')) {
            href += tokens[i + 4]?.content || ''
            tokens[i + 4].content = ''
          }
          replacerTokens.push(
            {
              type: 'link',
              loading: !tokens[i + 4]?.content?.startsWith(')'),
              href,
              title: '',
              text,
              children: [
                {
                  type: 'text',
                  content: text,
                  raw: text,
                },
              ],
              raw: String(`[${text}](${tokens[i + 2]?.content || ''})`),
            },
          )
          if (type === 1) {
            replacerTokens.push({ type: 'em_close', tag: 'em', nesting: -1 })
          }
          else if (type === 2) {
            replacerTokens.push({ type: 'strong_close', tag: 'strong', nesting: -1 })
          }
          else if (type === 3) {
            replacerTokens.push({ type: 'em_close', tag: 'em', nesting: -1 })
            replacerTokens.push({ type: 'strong_close', tag: 'strong', nesting: -1 })
          }
          if (tokens[i + 4]?.type === 'text') {
            const afterText = tokens[i + 4].content?.replace(/^\)\**/, '')
            if (afterText) {
              replacerTokens.push({
                type: 'text',
                content: afterText,
                raw: afterText,
              })
            }
            tokens.splice(i, 5, ...replacerTokens)
          }
          else {
            tokens.splice(i, 4, ...replacerTokens)
          }
        }
        else {
          if (beforeText) {
            replacerTokens.push({
              type: 'text',
              content: beforeText,
              raw: beforeText,
            })
          }
          const text = match[1]
          replacerTokens.push(...[
            {
              type: 'link',
              loading: true,
              href: tokens[i + 2]?.content || '',
              title: '',
              text,
              children: [
                {
                  type: 'text',
                  content: text,
                  raw: text,
                },
              ],
              raw: String(`[${text}](${tokens[i + 2]?.content || ''})`),
            },
          ])
          if (tokens[i + 4]?.type === 'text') {
            const afterText = tokens[i + 4].content?.replace(/^\)/, '')
            if (afterText) {
              replacerTokens.push({
                type: 'text',
                content: afterText,
                raw: afterText,
              })
            }
            tokens.splice(i, 5, ...replacerTokens)
          }
          else {
            tokens.splice(i, 4, ...replacerTokens)
          }
        }
        i -= (replacerTokens.length - 1)
      }
    }
  }
  return tokens
}
