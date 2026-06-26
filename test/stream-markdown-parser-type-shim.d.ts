export interface BaseNode {
  type: string
  [key: string]: unknown
}

export interface ParsedNode extends BaseNode {}

export interface CodeBlockNode extends BaseNode {
  code?: string
  language?: string
  raw?: string
}

export type HtmlPolicy = 'safe' | 'trusted' | 'escape'
export type MarkdownIt = unknown
export type ParseOptions = Record<string, unknown>

export function normalizeCustomHtmlTagName(tagName: string): string
