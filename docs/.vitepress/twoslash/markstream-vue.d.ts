import type { DefineComponent } from 'vue'
import type { BaseNode } from 'stream-markdown-parser'
import type {
  CodeBlockDiffHunkActionContext,
  CodeBlockMonacoOptions,
  CodeBlockMonacoTheme,
  CodeBlockNodeProps,
  CustomComponents,
  D2BlockNodeProps,
  ImageNodeProps,
  MermaidBlockEvent,
  MermaidBlockNodeProps,
  PreCodeNodeProps,
} from '../../../src/exports'
import type { NodeRendererProps } from '../../../src/types/node-renderer-props'

export type {
  BaseNode,
  CodeBlockDiffHunkActionContext,
  CodeBlockMonacoOptions,
  CodeBlockMonacoTheme,
  CodeBlockNodeProps,
  CustomComponents,
  D2BlockNodeProps,
  ImageNodeProps,
  MermaidBlockEvent,
  MermaidBlockNodeProps,
  NodeRendererProps,
  PreCodeNodeProps,
}

export {
  CodeBlockNode,
  D2BlockNode,
  ImageNode,
  MarkdownCodeBlockNode,
  MermaidBlockNode,
  PreCodeNode,
  createKaTeXWorkerFromCDN,
  createMermaidWorkerFromCDN,
  enableD2,
  enableKatex,
  enableMermaid,
  getRegisteredThemes,
  getMarkdown,
  getUseMonaco,
  parseMarkdownToStructure,
  preloadExtendedLanguageIcons,
  registerIconTheme,
  removeCustomComponents,
  setCustomComponents,
  setD2Loader,
  setDefaultI18nMap,
  setDefaultMathOptions,
  setIconTheme,
  setKaTeXWorker,
  setKatexLoader,
  setLanguageIconResolver,
  setMermaidLoader,
  setMermaidWorker,
  VueRendererMarkdown,
} from '../../../src/exports'

export declare const MarkdownRender: DefineComponent<NodeRendererProps>

export default MarkdownRender
