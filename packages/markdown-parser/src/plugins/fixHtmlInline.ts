import type { MarkdownIt, Token } from 'markdown-it-ts'

export function applyFixHtmlInlineTokens(md: MarkdownIt) {
  // Fix certain single-token inline HTML cases by expanding into [openTag, text, closeTag]
  // This helps downstream inline parsers (e.g., <a>text</a>) to recognize inner text reliably.
  md.core.ruler.push('fix_html_inline_tokens', (state: unknown) => {
    const s = state as unknown as { tokens?: Token[] }
    const toks = s.tokens ?? []

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

    for (let i = 0; i < toks.length; i++) {
      const t = toks[i] as Token & { content?: string, children: any[] }
      if (!t || t.type !== 'inline')
        continue

      if (/\s*<$/.test(t.content)) {
        t.children.length = 0
        continue
      }

      // 修复children 是单个 html_inline的场景
      if (t.children.length === 2 && t.children[0].type === 'html_inline') {
        t.children = [
          {
            type: 'html_block',
            content: t.children[0].content + t.children[1].content,
            tag: t.children[0].content.match(/<([^\s>/]+)/)?.[1] ?? '',
            loading: true,
          },
        ] as any[]
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
