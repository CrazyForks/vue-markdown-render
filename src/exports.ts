import type { App, Component, Plugin } from 'vue'
import type { LanguageIconResolver } from './utils/languageIcon'
import { setDefaultMathOptions } from 'stream-markdown-parser'
import { defineAsyncComponent } from 'vue'
import AdmonitionNode from './components/AdmonitionNode'

import BlockquoteNode from './components/BlockquoteNode'
import CheckboxNode from './components/CheckboxNode'
import DefinitionListNode from './components/DefinitionListNode'
import EmojiNode from './components/EmojiNode'
import FootnoteNode from './components/FootnoteNode'
import FootnoteReferenceNode from './components/FootnoteReferenceNode'
import FootnoteAnchorNode from './components/FootnoteAnchorNode'
import HardBreakNode from './components/HardBreakNode'
import HeadingNode from './components/HeadingNode'
import HighlightNode from './components/HighlightNode'
import ImageNode from './components/ImageNode'
import InlineCodeNode from './components/InlineCodeNode'
import InsertNode from './components/InsertNode'
import LinkNode from './components/LinkNode'
import ListItemNode from './components/ListItemNode'
import ListNode from './components/ListNode'
import MarkdownCodeBlockNode from './components/MarkdownCodeBlockNode'
import MermaidBlockNode from './components/MermaidBlockNode'
import MarkdownRender from './components/NodeRenderer'
import ParagraphNode from './components/ParagraphNode'
import PreCodeNode from './components/PreCodeNode'
import ReferenceNode from './components/ReferenceNode'
import StrikethroughNode from './components/StrikethroughNode'
import StrongNode from './components/StrongNode'
import SubscriptNode from './components/SubscriptNode'
import SuperscriptNode from './components/SuperscriptNode'
import TableNode from './components/TableNode'
import TextNode from './components/TextNode'
import ThematicBreakNode from './components/ThematicBreakNode'
import { setDefaultI18nMap } from './composables/useSafeI18n'
import { setLanguageIconResolver } from './utils/languageIcon'
import { clearGlobalCustomComponents, getCustomNodeComponents, removeCustomComponents, setCustomComponents } from './utils/nodeComponents'
import './index.css'
// Re-add top-level worker imports so builds emit worker bundles into `dist/`
import './workers/katexRenderer.worker?worker'
import './workers/mermaidParser.worker?worker'

const CodeBlockNode = defineAsyncComponent(() => import('./components/CodeBlockNode'))
const MathBlockNode = defineAsyncComponent(() => import('./components/MathBlockNode'))
const MathInlineNode = defineAsyncComponent(() => import('./components/MathInlineNode'))

// Export centralized props interfaces so they appear in package d.ts
export * from './utils'

export * from './workers/katexWorkerClient'
export * from './workers/mermaidWorkerClient'
export { KATEX_COMMANDS, normalizeStandaloneBackslashT, setDefaultMathOptions } from 'stream-markdown-parser'
export type { MathOptions } from 'stream-markdown-parser'

export {
  AdmonitionNode,
  BlockquoteNode,
  CheckboxNode,
  clearGlobalCustomComponents,
  CodeBlockNode,
  DefinitionListNode,
  EmojiNode,
  FootnoteNode,
  FootnoteReferenceNode,
  FootnoteAnchorNode,
  getCustomNodeComponents,
  HardBreakNode,
  HeadingNode,
  HighlightNode,
  ImageNode,
  InlineCodeNode,
  InsertNode,
  LinkNode,
  ListItemNode,
  ListNode,
  MarkdownCodeBlockNode,
  MarkdownRender,
  MathBlockNode,
  MathInlineNode,
  MermaidBlockNode,
  ParagraphNode,
  PreCodeNode,
  ReferenceNode,
  removeCustomComponents,
  setCustomComponents,
  setDefaultI18nMap,
  StrikethroughNode,
  StrongNode,
  SubscriptNode,
  SuperscriptNode,
  TableNode,
  TextNode,
  ThematicBreakNode,
}

export default MarkdownRender

const componentMap: Record<string, Component> = {
  AdmonitionNode,
  BlockquoteNode,
  CheckboxNode,
  CodeBlockNode,
  DefinitionListNode,
  EmojiNode,
  FootnoteNode,
  FootnoteReferenceNode,
  FootnoteAnchorNode,
  HardBreakNode,
  HeadingNode,
  HighlightNode,
  ImageNode,
  InlineCodeNode,
  PreCodeNode,
  InsertNode,
  LinkNode,
  ListItemNode,
  ListNode,
  MathBlockNode,
  MathInlineNode,
  MermaidBlockNode,
  ParagraphNode,
  StrikethroughNode,
  StrongNode,
  SubscriptNode,
  SuperscriptNode,
  TableNode,
  TextNode,
  ThematicBreakNode,
  ReferenceNode,
  MarkdownCodeBlockNode,
}

export const VueRendererMarkdown: Plugin = {
  install(app: App, options?: { getLanguageIcon?: LanguageIconResolver, mathOptions?: any }) {
    Object.entries(componentMap).forEach(([name, component]) => {
      app.component(name, component)
    })
    if (options?.getLanguageIcon)
      setLanguageIconResolver(options.getLanguageIcon)
    // optional global math options
    // avoid importing inside module scope to keep SSR safe
    if (options?.mathOptions)
      setDefaultMathOptions(options.mathOptions)
  },
}
