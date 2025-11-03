import type { HtmlBlockNode, MarkdownToken } from '../../types'

export function parseHtmlBlock(token: MarkdownToken): HtmlBlockNode {
  return {
    type: 'html_block',
    content: String(token.content ?? ''),
    raw: String(token.content ?? ''),
    loading: false,
  }
}
