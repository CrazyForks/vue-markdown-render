import type { BaseNode } from 'stream-markdown-parser'

export interface MarkstreamAngularComponentProps {
  content?: string
  nodes?: BaseNode[]
  final?: boolean
  fade?: boolean
  isDark?: boolean
  mermaidProps?: Record<string, unknown>
  codeBlockProps?: Record<string, unknown>
  [key: string]: unknown
}

export declare const MarkstreamAngularComponent: unknown
export declare const MarkdownRenderComponent: unknown
export declare function setMermaidWorker(worker: Worker): void
export declare function setKaTeXWorker(worker: Worker): void
export declare function enableMermaid(): void
export declare function enableKatex(): void

export default MarkstreamAngularComponent
