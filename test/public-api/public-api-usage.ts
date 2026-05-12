import type {
  CodeBlockNodeProps,
  CustomComponents,
  D2BlockNodeProps,
  ImageNodeProps,
  InfographicBlockNodeProps,
  LinkNodeProps,
  MathBlockNodeProps,
  MathInlineNodeProps,
  MermaidBlockNodeProps,
  NodeRendererProps,
  SmoothMarkdownStreamOptions,
} from 'markstream-vue'
import MarkdownRender, {
  clearGlobalCustomComponents,
  CodeBlockNode,
  D2BlockNode,
  disableD2,
  disableKatex,
  disableMermaid,
  enableD2,
  enableKatex,
  enableMermaid,
  getCustomNodeComponents,
  getMarkdown,
  InfographicBlockNode,
  isD2Enabled,
  isKatexEnabled,
  isMermaidEnabled,
  MathBlockNode,
  MathInlineNode,
  MermaidBlockNode,
  parseMarkdownToStructure,
  removeCustomComponents,
  setCustomComponents,
  setD2Loader,
  setDefaultMathOptions,
  setKatexLoader,
  setMermaidLoader,
  useSmoothMarkdownStream,
  VueRendererMarkdown,
} from 'markstream-vue'
import {
  safeCancelRaf,
  safeRaf,
} from 'markstream-vue/utils/safeRaf'
import {
  createKaTeXWorkerFromCDN,
} from 'markstream-vue/workers/katexCdnWorker'
import {
  createMermaidWorkerFromCDN,
} from 'markstream-vue/workers/mermaidCdnWorker'

const component = MarkdownRender
const plugin = VueRendererMarkdown

const props: NodeRendererProps = {
  content: '# Hello',
  final: true,
  typewriter: true,
  smoothStreaming: 'auto',
  maxLiveNodes: 320,
}

const options: SmoothMarkdownStreamOptions = {}
const customComponents: CustomComponents = {}

setCustomComponents('docs', customComponents)
setCustomComponents(customComponents)

const scopedComponents = getCustomNodeComponents('docs')

removeCustomComponents('docs')
clearGlobalCustomComponents()

enableKatex()
disableKatex()
const katexEnabled = isKatexEnabled()
setKatexLoader(async () => ({}))

enableMermaid()
disableMermaid()
const mermaidEnabled = isMermaidEnabled()
setMermaidLoader(async () => ({}))

enableD2()
disableD2()
const d2Enabled = isD2Enabled()
setD2Loader(async () => ({}))

setDefaultMathOptions({})

const markdown = getMarkdown('public-api-test')
const nodes = parseMarkdownToStructure('# API test', markdown, { final: true })
const controller = useSmoothMarkdownStream(options)

const codeBlockProps: Partial<CodeBlockNodeProps> = {}
const mermaidProps: Partial<MermaidBlockNodeProps> = {}
const mathProps: Partial<MathBlockNodeProps> = {}
const mathInlineProps: Partial<MathInlineNodeProps> = {}
const imageProps: Partial<ImageNodeProps> = {}
const linkProps: Partial<LinkNodeProps> = {}
const d2Props: Partial<D2BlockNodeProps> = {}
const infographicProps: Partial<InfographicBlockNodeProps> = {}

// Verify named async components retain their concrete types
// (not erased to generic Component)
const codeNode = {
  type: 'code_block',
  language: 'ts',
  code: 'console.log(1)',
  raw: 'console.log(1)',
} satisfies CodeBlockNodeProps['node']

const mathNode = {
  type: 'math_block',
  content: 'x^2',
  raw: '$$x^2$$',
} satisfies MathBlockNodeProps['node']

void component
void plugin
void props
void scopedComponents
void katexEnabled
void mermaidEnabled
void d2Enabled
void nodes
void controller
void codeBlockProps
void mermaidProps
void mathProps
void mathInlineProps
void imageProps
void linkProps
void d2Props
void infographicProps
void CodeBlockNode
void D2BlockNode
void MathBlockNode
void MathInlineNode
void MermaidBlockNode
void InfographicBlockNode
void codeNode
void mathNode
void safeRaf
void safeCancelRaf
void createKaTeXWorkerFromCDN
void createMermaidWorkerFromCDN
