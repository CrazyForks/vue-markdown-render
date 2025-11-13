import type { HtmlBlockNode, MarkdownToken } from '../../types'

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

  // Self-closing first tag like <img ... />
  const selfClosing = /^\s*<[^>]*\/\s*>/.test(raw)
  const isVoid = VOID_TAGS.has(tag)

  // Already closed somewhere in the block (case-insensitive)
  const hasClosing = new RegExp(`<\\/\\s*${tag}\\b`, 'i').test(raw)

  const loading = !(isVoid || selfClosing || hasClosing)

  const content = loading
    ? `${raw.replace(/<[^>]*$/, '')}\n</${tag}>`
    : raw

  return {
    type: 'html_block',
    content,
    raw,
    tag,
    loading,
  }
}
