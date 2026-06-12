import type { BaseNode } from 'stream-markdown-parser'

export interface NodeRendererProps {
  content?: string
  nodes?: BaseNode[]
  final?: boolean
  fade?: boolean
  isDark?: boolean
  mermaidProps?: Record<string, unknown>
  codeBlockProps?: Record<string, unknown>
  [key: string]: unknown
}

export declare const MarkdownRender: unknown
export declare const NodeRenderer: unknown
export declare function setCustomComponents(...args: unknown[]): void

export default MarkdownRender
