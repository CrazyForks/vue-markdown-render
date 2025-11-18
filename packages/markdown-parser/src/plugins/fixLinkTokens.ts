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

function fixLinkToken(tokens: MarkdownToken[]): MarkdownToken[] {
  if (tokens.length < 4)
    return tokens

  for (let i = 0; i <= tokens.length - 1; i++) {
    if (!tokens[i])
      break
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
              raw: String(`[${text}](${href})`),
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
          let href = tokens[i + 2]?.content || ''
          if (tokens[i + 4]?.type === 'text' && !tokens[i + 4].content?.startsWith(')')) {
            href += tokens[i + 4]?.content || ''
            tokens[i + 4].content = ''
          }
          replacerTokens.push(...[
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
              raw: String(`[${text}](${href})`),
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
        continue
      }
    }
    else if (tokens[i].type === 'link_open' && tokens[i].markup === 'linkify' && tokens[i - 1]?.type === 'text' && tokens[i - 1].content?.endsWith('(')) {
      if (tokens[i - 2]?.type === 'link_close') {
        // 合并link
        const replacerTokens = []
        const text = (tokens[i - 3].content || '')
        let href = tokens[i].attrs?.find(attr => attr[0] === 'href')?.[1] || ''

        if (tokens[i + 3]?.type === 'text') {
          const m = (tokens[i + 3]?.content ?? '').indexOf(')')
          const loading = m === -1
          if (m === -1) {
            href += (tokens[i + 3]?.content?.slice(0, m) || '')
            tokens[i + 3].content = ''
          }

          replacerTokens.push({
            type: 'link',
            loading,
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
            raw: String(`[${text}](${href})`),
          })
          const afterText = tokens[i + 3].content?.replace(/^\)\**/, '')
          if (afterText) {
            replacerTokens.push({
              type: 'text',
              content: afterText,
              raw: afterText,
            })
          }
          tokens.splice(i - 4, 8, ...replacerTokens)
        }
        else {
          replacerTokens.push({
            type: 'link',
            loading: true,
            href,
            title: '',
            text,
            children: [
              {
                type: 'text',
                content: href,
                raw: href,
              },
            ],
            raw: String(`[${text}](${href})`),
          })
          tokens.splice(i - 4, 7, ...replacerTokens)
        }
        continue
      }
    }
    if (tokens[i].type === 'link_close' && tokens[i].nesting === -1 && tokens[i + 1]?.type === 'text' && tokens[i - 1]?.type === 'text' && tokens[i + 2]?.type !== 'link_open') {
      // 修复链接后多余文本被包含在链接内的问题
      tokens[i - 2].loading = true
      const text = tokens[i - 1].content || ''
      let href = tokens[i - 2].attrs?.[0]?.[1] || ''
      let count = 3
      if (tokens[i].markup === 'linkify' && tokens[i + 1]?.type === 'text' && !tokens[i + 1]?.content?.startsWith(' ')) {
        const m = (tokens[i + 1]?.content ?? '').indexOf(')')
        if (m === -1) {
          href += (tokens[i + 1]?.content?.slice(0, m) || '')
          tokens[i + 1].content = ''
        }
        count += 1
      }
      tokens.splice(i - 2, count, {
        type: 'link',
        loading: false,
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
        raw: String(`[${text}](${href})`),
      } as any)
    }
    else if (tokens[i].content?.startsWith('](') && tokens[i - 1].markup?.includes('*') && tokens[i - 4].type === 'text' && tokens[i - 4].content?.endsWith('[')) {
      const type = tokens[i - 1].markup!.length
      const replacerTokens = []
      const beforeText = tokens[i - 4].content!.slice(0, tokens[i - 4].content!.length - 1 - type)
      if (beforeText) {
        replacerTokens.push({
          type: 'text',
          content: beforeText,
          raw: beforeText,
        })
      }
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
      const text = tokens[i - 2].content || ''
      let href = tokens[i].content!.slice(2)
      let loading = true
      if (tokens[i + 1]?.type === 'text') {
        const m = (tokens[i + 1]?.content ?? '').indexOf(')')
        loading = m === -1
        if (m === -1) {
          href += (tokens[i + 1]?.content?.slice(0, m) || '')
          tokens[i + 1].content = ''
        }
      }
      replacerTokens.push({
        type: 'link',
        loading,
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
        raw: String(`[${text}](${href})`),
      })
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
      if (tokens[i + 1]?.type === 'text') {
        const afterText = tokens[i + 1].content?.replace(/^\)\**/, '')
        if (afterText) {
          replacerTokens.push({
            type: 'text',
            content: afterText,
            raw: afterText,
          })
        }
        tokens.splice(i - 4, 8, ...replacerTokens)
      }
      else if (tokens[i + 1]?.type === 'link_open') {
        // 特殊情况其实要把href也处理，这里可以直接跳过
        tokens.splice(i - 4, 10, ...replacerTokens)
      }
      else {
        tokens.splice(i - 4, 7, ...replacerTokens)
      }
      i -= (replacerTokens.length - 1)
      continue
    }
  }
  return tokens
}
