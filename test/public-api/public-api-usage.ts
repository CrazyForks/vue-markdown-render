import type {
  CodeBlockNodeProps,
  CustomComponents,
  ImageNodeProps,
  LinkNodeProps,
  MathBlockNodeProps,
  MermaidBlockNodeProps,
  NodeRendererProps,
  SmoothMarkdownStreamOptions,
} from 'markstream-vue'
import MarkdownRender, {
  clearGlobalCustomComponents,
  disableD2,
  disableKatex,
  disableMermaid,
  enableD2,
  enableKatex,
  enableMermaid,
  getCustomNodeComponents,
  getMarkdown,
  isD2Enabled,
  isKatexEnabled,
  isMermaidEnabled,
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
const imageProps: Partial<ImageNodeProps> = {}
const linkProps: Partial<LinkNodeProps> = {}

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
void imageProps
void linkProps
