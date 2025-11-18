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

export function applyFixHtmlInlineTokens(md: MarkdownIt) {
  // Fix certain single-token inline HTML cases by expanding into [openTag, text, closeTag]
  // This helps downstream inline parsers (e.g., <a>text</a>) to recognize inner text reliably.
  md.core.ruler.push('fix_html_inline_tokens', (state: unknown) => {
    const s = state as unknown as { tokens?: Token[] }
    const toks = s.tokens ?? []

    for (let i = 0; i < toks.length; i++) {
      const t = toks[i] as Token & { content?: string, children: any[] }
      if (t.type === 'html_block' && /^<[^>\s/]+>$/.test(t.content)) {
        const tag = t.content?.match(/<([^\s>/]+)/)?.[1] ?? ''
        // 如果是常见的 block 标签，则跳过，否则转换成 inline 处理
        if (['br', 'hr', 'img', 'input', 'link', 'meta'].includes(tag))
          continue
        t.type = 'inline'
        t.children = [
          {
            type: 'html_block',
            content: t.content,
            tag: t.content?.match(/<([^\s>/]+)/)?.[1] ?? '',
            loading: true,
          },
        ] as any[]
        continue
      }
      if (!t || t.type !== 'inline')
        continue

      // 修复children 是单个 html_inline的场景
      if (t.children.length === 2 && t.children[0].type === 'html_inline') {
        // 补充一个闭合标签
        const tag = t.children[0].content?.match(/<([^\s>/]+)/)?.[1] ?? ''
        // 如果是常见的 inline标签，则只追加结尾标签，否则转换成 html_block
        if (['a', 'span', 'strong', 'em', 'b', 'i', 'u'].includes(tag)) {
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
        const tag = t.children[0].content?.match(/<([^\s>/]+)/)?.[1] ?? ''
        // 如果是常见的 inline标签，则不处理，否则转换成 html_block
        if (['a', 'span', 'strong', 'em', 'b', 'i', 'u'].includes(tag))
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
