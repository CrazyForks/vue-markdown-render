import type { LanguageIconResolver } from './utils/languageIcon'
import { setDefaultMathOptions } from 'stream-markdown-parser'
import AdmonitionNode from './components/AdmonitionNode'
import BlockquoteNode from './components/BlockquoteNode'
import CheckboxNode from './components/CheckboxNode'
import CodeBlockNode from './components/CodeBlockNode'
import DefinitionListNode from './components/DefinitionListNode'
import EmojiNode from './components/EmojiNode'
import EmphasisNode from './components/EmphasisNode'
import FootnoteAnchorNode from './components/FootnoteAnchorNode'
import FootnoteNode from './components/FootnoteNode'
import FootnoteReferenceNode from './components/FootnoteReferenceNode'
import HardBreakNode from './components/HardBreakNode'
import HeadingNode from './components/HeadingNode'
import HighlightNode from './components/HighlightNode'
import HtmlBlockNode from './components/HtmlBlockNode'
import HtmlInlineNode from './components/HtmlInlineNode'
import ImageNode from './components/ImageNode'
import D2BlockNode from './components/D2BlockNode'
import InfographicBlockNode from './components/InfographicBlockNode'
import InlineCodeNode from './components/InlineCodeNode'
import InsertNode from './components/InsertNode'
import LinkNode from './components/LinkNode'
import ListItemNode from './components/ListItemNode'
import ListNode from './components/ListNode'
import MarkdownCodeBlockNode from './components/MarkdownCodeBlockNode'
import MathBlockNode from './components/MathBlockNode'
import MathInlineNode from './components/MathInlineNode'
import { disableD2, enableD2, isD2Enabled, setD2Loader } from './components/D2BlockNode/d2'
import { disableKatex, enableKatex, isKatexEnabled, setKatexLoader } from './components/MathInlineNode/katex'
import MermaidBlockNode from './components/MermaidBlockNode'
import { disableMermaid, enableMermaid, isMermaidEnabled, setMermaidLoader } from './components/MermaidBlockNode/mermaid'
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
import Tooltip from './components/Tooltip'
import VmrContainerNode from './components/VmrContainerNode'
import { setDefaultI18nMap } from './composables/useSafeI18n'
import { setLanguageIconResolver } from './utils/languageIcon'
import { clearGlobalCustomComponents, getCustomNodeComponents, removeCustomComponents, setCustomComponents } from './utils/nodeComponents'
import './workers/katexRenderer.worker?worker'
import './workers/mermaidParser.worker?worker'
import './index.css'

export type { D2Loader } from './components/D2BlockNode/d2'
export type { KatexLoader } from './components/MathInlineNode/katex'
export type { MermaidLoader } from './components/MermaidBlockNode/mermaid'
export type { NodeRendererProps } from './components/NodeRenderer/NodeRenderer.vue'
export type {
  CodeBlockNodeProps,
  D2BlockNodeProps,
  ImageNodeProps,
  InfographicBlockNodeProps,
  LinkNodeProps,
  MathBlockNodeProps,
  MathInlineNodeProps,
  MermaidBlockEvent,
  MermaidBlockNodeProps,
  PreCodeNodeProps,
} from './types/component-props'
export * from './utils'
export * from './workers/katexCdnWorker'
export * from './workers/katexWorkerClient'
export * from './workers/mermaidCdnWorker'
export * from './workers/mermaidWorkerClient'
export { KATEX_COMMANDS, normalizeStandaloneBackslashT, setDefaultMathOptions } from 'stream-markdown-parser'
export type { MathOptions } from 'stream-markdown-parser'

export {
  AdmonitionNode,
  BlockquoteNode,
  CheckboxNode,
  clearGlobalCustomComponents,
  CodeBlockNode,
  D2BlockNode,
  DefinitionListNode,
  disableD2,
  disableKatex,
  disableMermaid,
  EmojiNode,
  EmphasisNode,
  enableD2,
  enableKatex,
  enableMermaid,
  FootnoteAnchorNode,
  FootnoteNode,
  FootnoteReferenceNode,
  getCustomNodeComponents,
  HardBreakNode,
  HeadingNode,
  HighlightNode,
  HtmlBlockNode,
  HtmlInlineNode,
  ImageNode,
  InfographicBlockNode,
  InlineCodeNode,
  InsertNode,
  isD2Enabled,
  isKatexEnabled,
  isMermaidEnabled,
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
  setD2Loader,
  setKatexLoader,
  setMermaidLoader,
  StrikethroughNode,
  StrongNode,
  SubscriptNode,
  SuperscriptNode,
  TableNode,
  TextNode,
  ThematicBreakNode,
  Tooltip,
  VmrContainerNode,
}

export default MarkdownRender

const componentMap: Record<string, any> = {
  AdmonitionNode,
  BlockquoteNode,
  CheckboxNode,
  CodeBlockNode,
  DefinitionListNode,
  EmojiNode,
  EmphasisNode,
  FootnoteNode,
  FootnoteReferenceNode,
  FootnoteAnchorNode,
  HardBreakNode,
  HeadingNode,
  HtmlBlockNode,
  HtmlInlineNode,
  HighlightNode,
  ImageNode,
  D2BlockNode,
  InlineCodeNode,
  PreCodeNode,
  InsertNode,
  LinkNode,
  ListItemNode,
  ListNode,
  MarkdownCodeBlockNode,
  MathBlockNode,
  MathInlineNode,
  MermaidBlockNode,
  InfographicBlockNode,
  ParagraphNode,
  StrikethroughNode,
  StrongNode,
  SubscriptNode,
  SuperscriptNode,
  TableNode,
  TextNode,
  ThematicBreakNode,
  VmrContainerNode,
  ReferenceNode,
}

export const VueRendererMarkdown = {
  install(Vue: any, options?: { getLanguageIcon?: LanguageIconResolver, mathOptions?: any }) {
    Object.entries(componentMap).forEach(([name, component]) => {
      Vue.component(name, component)
    })
    Vue.component('MarkdownRender', MarkdownRender)
    Vue.component('NodeRenderer', MarkdownRender)
    if (options?.getLanguageIcon)
      setLanguageIconResolver(options.getLanguageIcon)
    if (options?.mathOptions)
      setDefaultMathOptions(options.mathOptions)
  },
}
