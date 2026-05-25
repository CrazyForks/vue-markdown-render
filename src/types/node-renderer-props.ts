import type { BaseNode, HtmlPolicy, MarkdownIt, ParseOptions } from 'stream-markdown-parser'
import type { Ref } from 'vue'
import type { SmoothMarkdownStreamOptions } from '../composables/useSmoothMarkdownStream'
import type {
  CodeBlockMonacoOptions,
  CodeBlockMonacoTheme,
  CodeBlockNodeProps,
  D2BlockNodeProps,
  InfographicBlockNodeProps,
  MermaidBlockNodeProps,
} from './component-props'

export type NodeRendererCodeBlockProps = Partial<Omit<CodeBlockNodeProps, 'node'>> & Record<string, unknown>

export type MarkstreamVirtualPhase
  = | 'estimating'
    | 'streaming'
    | 'measuring'
    | 'settling'
    | 'settled'
    | 'final'

export type MarkstreamVirtualConfidence
  = | 'estimate'
    | 'mixed'
    | 'measured'
    | 'final'

export type MarkstreamVirtualReason
  = | 'content'
    | 'parse'
    | 'batch'
    | 'resize'
    | 'node-resize'
    | 'async-node'
    | 'font'
    | 'theme'
    | 'final'
    | 'restore'
    | 'manual'

export type MarkstreamVirtualAnchor
  = | {
    type: 'node'
    nodeIndex: number
    offsetWithinNodePx: number
  }
  | {
    type: 'bottom'
    distanceFromBottomPx: number
  }

export type MarkstreamHeightCache = Array<{
  index: number
  height: number
  nodeType?: string
  signature?: string
}>

export interface MarkstreamVirtualMetrics {
  sessionKey: string
  phase: MarkstreamVirtualPhase
  nodeCount: number
  liveRange: {
    start: number
    end: number
  }
  renderedCount: number
  measuredCount: number
  estimatedCount: number
  averageNodeHeight: number
  topSpacerHeight: number
  bottomSpacerHeight: number
  visibleDomHeight: number
  totalHeight: number
  width: number
  final: boolean
  stable: boolean
  confidence: MarkstreamVirtualConfidence
  reason: MarkstreamVirtualReason
}

export interface MarkstreamVirtualState {
  sessionKey: string
  anchor: MarkstreamVirtualAnchor
  metrics: MarkstreamVirtualMetrics
  width: number
  contentHash?: string
  heightCache?: MarkstreamHeightCache
}

export type MarkstreamScrollRoot = HTMLElement | null
export type MarkstreamScrollRootLike = MarkstreamScrollRoot | Ref<MarkstreamScrollRoot>
export type MarkstreamScrollRootResolver = () => MarkstreamScrollRootLike

export interface MarkstreamVirtualScrollOptions {
  enabled?: boolean
  scrollRoot?: MarkstreamScrollRootLike | MarkstreamScrollRootResolver
  sessionKey: string
  threadKey?: string
  restoreState?: MarkstreamVirtualState | null
  heightCache?: MarkstreamHeightCache | null
  settleMode?: 'auto' | 'manual'
  settledToken?: string | number | boolean
  emitIntervalMs?: number
  heightDiffThresholdPx?: number
}

export interface MarkstreamRendererHandle {
  getVirtualMetrics: () => MarkstreamVirtualMetrics
  captureVirtualState: () => MarkstreamVirtualState | null
  restoreVirtualState: (state: MarkstreamVirtualState) => void
  forceMeasure: (reason?: MarkstreamVirtualReason) => Promise<MarkstreamVirtualMetrics>
  settle: (options?: {
    frames?: number
    timeoutMs?: number
    reason?: MarkstreamVirtualReason
  }) => Promise<MarkstreamVirtualMetrics>
  scrollToNode: (
    index: number,
    align?: 'start' | 'center' | 'end' | 'nearest',
  ) => void
}

export interface MarkstreamNodeLifecycle {
  reportHeight: (indexKey: string | number, height: number) => void
  markPending: (indexKey: string | number) => void
  markSettled: (indexKey: string | number) => void
}

export interface NodeRendererProps {
  /** Raw Markdown input. Omit this when you pass pre-parsed nodes instead. */
  content?: string
  /** Pre-parsed Markdown nodes to render without running the internal parser. */
  nodes?: BaseNode[]
  /**
   * Whether the input stream is complete (end-of-stream). When true, the parser
   * will stop emitting streaming "loading" nodes for unfinished constructs.
   */
  final?: boolean
  /** Options forwarded to parseMarkdownToStructure when content is provided */
  parseOptions?: ParseOptions
  customMarkdownIt?: (md: MarkdownIt) => MarkdownIt
  /** Log parse/render timing and virtualization stats (dev only) */
  debugPerformance?: boolean
  /**
   * Custom HTML-like tags that participate in streaming mid-state handling
   * and are emitted as custom nodes (e.g. ['thinking']). Forwarded to `getMarkdown()`.
   */
  customHtmlTags?: readonly string[]
  /** HTML rendering policy for html_block/html_inline nodes. Default: safe */
  htmlPolicy?: HtmlPolicy
  /** Enable priority rendering for visible viewport area */
  viewportPriority?: boolean
  /**
   * Whether code_block renders should stream updates.
   * When false, code blocks stay in a loading state and render once when final content is ready.
   * Default: true
   */
  codeBlockStream?: boolean
  /** Preferred dark Monaco theme forwarded to every code block renderer. */
  codeBlockDarkTheme?: CodeBlockMonacoTheme
  /** Preferred light Monaco theme forwarded to every code block renderer. */
  codeBlockLightTheme?: CodeBlockMonacoTheme
  /** Monaco editor options forwarded to every `CodeBlockNode`. */
  codeBlockMonacoOptions?: CodeBlockMonacoOptions
  /** If true, render all `code_block` nodes as plain <pre><code> blocks instead of the full CodeBlockNode */
  renderCodeBlocksAsPre?: boolean
  /** Minimum width forwarded to CodeBlockNode (px or CSS unit) */
  codeBlockMinWidth?: string | number
  /** Maximum width forwarded to CodeBlockNode (px or CSS unit) */
  codeBlockMaxWidth?: string | number
  /** Arbitrary props to forward to every CodeBlockNode */
  codeBlockProps?: NodeRendererCodeBlockProps
  /** Props forwarded to MermaidBlockNode for mermaid fences */
  mermaidProps?: Partial<Omit<MermaidBlockNodeProps, 'node' | 'loading' | 'isDark'>>
  /** Props forwarded to D2BlockNode for d2/d2lang fences */
  d2Props?: Partial<Omit<D2BlockNodeProps, 'node' | 'loading' | 'isDark'>>
  /** Props forwarded to InfographicBlockNode for infographic fences */
  infographicProps?: Partial<Omit<InfographicBlockNodeProps, 'node' | 'loading' | 'isDark'>>
  /** Global tooltip toggle for link/code-block renderers (default: true) */
  showTooltips?: boolean
  /** Theme names or theme objects preloaded for Monaco-backed code blocks. */
  themes?: CodeBlockMonacoTheme[]
  /** Forces dark mode for built-in renderers such as Mermaid, D2, KaTeX, and code blocks. */
  isDark?: boolean
  /** Scope key used by `setCustomComponents()` and `data-custom-id` style overrides. */
  customId?: string
  indexKey?: number | string
  /** Show a blinking typewriter cursor while streamed content grows. Default: false */
  typewriter?: boolean
  /**
   * Enable built-in smooth pacing for streaming `content` updates.
   * - `true`: force-enable smooth streaming (content mode only)
   * - `false`: force-disable smooth streaming
   * - `'auto'` (default): enable only when typewriter/incremental mode is active
   * Applies when rendering from `content` (not `nodes`).
   * Default: 'auto'
   */
  smoothStreaming?: boolean | 'auto'
  /** Options forwarded to the built-in smooth streaming composable. */
  smoothStreamingOptions?: SmoothMarkdownStreamOptions
  /** Performance tuning knob for the minimum interval in ms between built-in smooth-streaming parse commits. Default: 80. */
  parseCoalesceMs?: number
  /** Enable/disable non-code-node enter and streamed-text fade animations. Default: true */
  fade?: boolean
  /** Enable incremental/batched rendering of nodes to avoid large single flush costs. Default: true */
  batchRendering?: boolean
  /** How many nodes to render immediately before batching kicks in. Default: 40 */
  initialRenderBatchSize?: number
  /** How many additional nodes to render per batch tick. Default: 80 */
  renderBatchSize?: number
  /** Extra delay (ms) before each batch after rAF; helps yield to input. Default: 16 */
  renderBatchDelay?: number
  /** Target budget (ms) for each batch before we shrink subsequent batch sizes. Default: 6 */
  renderBatchBudgetMs?: number
  /** Timeout (ms) for requestIdleCallback slices. Default: 120 */
  renderBatchIdleTimeoutMs?: number
  /** Defer rendering nodes until they are near the viewport */
  deferNodesUntilVisible?: boolean
  /** Maximum number of fully rendered nodes kept in DOM. Default: 320 */
  maxLiveNodes?: number
  /** Number of nodes to keep before/after focus. Default: 60 */
  liveNodeBuffer?: number
  /** Report logical height and restore state to an outer virtual scroller. */
  virtualScroll?: MarkstreamVirtualScrollOptions
  /** Internal: render nodes as a fragment without container wrappers */
  renderAsFragment?: boolean
}
