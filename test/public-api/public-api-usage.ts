import type {
  CodeBlockNodeProps,
  CustomComponents,
  D2BlockNodeProps,
  ImageNodeProps,
  InfographicBlockNodeProps,
  LinkNodeProps,
  MarkdownIt,
  MarkdownPluginRegistration,
  MathBlockNodeProps,
  MathInlineNodeProps,
  MermaidBlockNodeProps,
  NodeRendererProps,
  SmoothMarkdownStreamOptions,
} from 'markstream-vue'
import MarkdownRender, {
  clearGlobalCustomComponents,
  clearRegisteredMarkdownPlugins,
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
  registerMarkdownPlugin,
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
  getLanguageIcon,
  normalizeLanguageIdentifier,
} from 'markstream-vue/utils'
import {
  recommendWorkerThreshold,
} from 'markstream-vue/utils/katex-threshold'
import {
  disablePerfMonitoring,
  enablePerfMonitoring,
  getPerfReport,
} from 'markstream-vue/utils/performance-monitor'
import {
  safeCancelRaf,
  safeRaf,
} from 'markstream-vue/utils/safeRaf'
import {
  createKaTeXWorkerFromCDN,
} from 'markstream-vue/workers/katexCdnWorker'
import {
  renderKaTeXInWorker,
} from 'markstream-vue/workers/katexWorkerClient'
import {
  createMermaidWorkerFromCDN,
} from 'markstream-vue/workers/mermaidCdnWorker'
import {
  findPrefixOffthread,
} from 'markstream-vue/workers/mermaidWorkerClient'

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

// Verify MarkdownIt plugin registration types are usable
const mdPlugin: MarkdownPluginRegistration = (md: MarkdownIt) => {
  md.inline.ruler.before('escape', 'public_api_rule', () => false)
  md.renderer.rules.text = (tokens, idx) => tokens[idx]?.content ?? ''
  return md
}

// Verify MarkdownIt tuple plugin registration type is usable
const tuplePlugin: MarkdownPluginRegistration = [
  (md: MarkdownIt, opts?: { name?: string }) => {
    md.core.ruler.push(opts?.name ?? 'public_api_core_rule', () => false)
  },
  { name: 'public_api_core_rule' },
]

registerMarkdownPlugin(mdPlugin)
registerMarkdownPlugin(tuplePlugin)
clearRegisteredMarkdownPlugins()

void component
void plugin
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
void getLanguageIcon
void normalizeLanguageIdentifier
void recommendWorkerThreshold
void enablePerfMonitoring
void disablePerfMonitoring
void getPerfReport
void createKaTeXWorkerFromCDN
void renderKaTeXInWorker
void createMermaidWorkerFromCDN
void findPrefixOffthread
void mdPlugin
void tuplePlugin
void registerMarkdownPlugin
void clearRegisteredMarkdownPlugins
