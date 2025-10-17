import type { MarkdownToken, MathBlockNode } from '../../../types'

// Parse a math_block token (block/display math expressions)
export function parseMathBlock(token: MarkdownToken): MathBlockNode {
  return {
    type: 'math_block',
    content: token.content || '',
    loading: !!token.loading,
    raw: token.raw || '',
  }
}
