import type { ComponentType } from 'react'
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

export declare const MarkdownRender: ComponentType<NodeRendererProps>
export declare const NodeRenderer: ComponentType<NodeRendererProps>
export declare function setMermaidWorker(worker: Worker): void
export declare function setKaTeXWorker(worker: Worker): void
export declare function enableMermaid(): void
export declare function enableKatex(): void
export declare function setCustomComponents(...args: unknown[]): void

export default MarkdownRender
