import type { MarkdownToken } from '../../../types'

export function fixListItem(tokens: MarkdownToken[]): MarkdownToken[] {
  const last = tokens[tokens.length - 1]

  if (/\d+\.\s*$/.test(last.content) && tokens[tokens.length - 2]?.tag === 'br') {
    tokens.splice(tokens.length - 1, 1)
  }
  return tokens
}
