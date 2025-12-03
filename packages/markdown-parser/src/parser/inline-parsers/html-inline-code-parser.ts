import type { InlineCodeNode, MarkdownToken, ParsedNode } from '../../types'

// Parse inline HTML and return an appropriate ParsedNode depending on tag.
export function parseHtmlInlineCodeToken(token: MarkdownToken, tokens: MarkdownToken[], i: number): [ParsedNode, number] {
  let code = String(token.content ?? '').trim()
  const nextToken = tokens[i + 1]
  const nnextToken = tokens[i + 2]

  // Quick tag detection
  const tagMatch = code.match(/^<\s*([\w-]+)/)
  const tag = tagMatch ? tagMatch[1].toLowerCase() : ''

  // Helper to extract inner text for tags like <a>...</a>, <p>...</p>, <div>...</div>
  function extractInner(html: string) {
    // Match the first closing sequence like >...< /tag>
    const m = html.match(/>([\s\S]*?)<\s*\/\s*[\w-]+>/)
    return m ? m[1] : ''
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

  if (tag === 'a') {
    let loading = false
    if (!nextToken || (nextToken?.type === 'text' && (!nnextToken || nnextToken.type !== 'html_inline')) || !nextToken) {
      loading = true
    }
    if (nextToken?.type === 'text' && (nnextToken?.type === 'html_inline' || !nnextToken)) {
      // Try to extract href and inner text
      const hrefMatch = code.match(/href\s*=\s*"([^"]+)"|href\s*=\s*'([^']+)'|href\s*=\s*([^\s>]+)/i)
      const href = hrefMatch ? (hrefMatch[1] || hrefMatch[2] || hrefMatch[3]) : ''
      let index = i + 1
      if (nextToken.type === 'text') {
        code = nextToken.content?.replace(/<[^>]*$/, '') ?? ''

        index = i + 2
      }
      if (nnextToken?.type === 'html_inline' && nextToken.type === 'text') {
        index = i + 3
      }
      const inner = code || href || ''
      return [
        {
          type: 'link',
          href: String(href ?? ''),
          title: null,
          text: code,
          children: [
            { type: 'text', content: inner, raw: inner },
          ],
          loading,
          raw: code,
        } as ParsedNode,
        index,
      ]
    }
  }

  if (tag === 'p' || tag === 'div') {
    const inner = extractInner(code) || ''
    return [
      {
        type: 'paragraph',
        children: [
          { type: 'text', content: inner, raw: inner },
        ],
        raw: code,
      } as ParsedNode,
      i + 1,
    ]
  }
  // Fallback: treat as inline code (preserve previous behavior)
  return [
    {
      type: 'inline_code',
      code,
      raw: code,
    } as InlineCodeNode,
    i + 1,
  ]
}
