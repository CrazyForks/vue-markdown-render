<script setup lang="ts">
import type { ParsedNode } from 'stream-markdown-parser'
import type { CustomComponents } from '../../types'
import type { CodeBlockPreviewPayload } from '../../types/component-props'
import type {
  MarkstreamHeightCache,
  MarkstreamNodeLifecycle,
  MarkstreamRendererHandle,
  MarkstreamVirtualAnchor,
  MarkstreamVirtualMetrics,
  MarkstreamVirtualPhase,
  MarkstreamVirtualReason,
  MarkstreamVirtualState,
  NodeRendererProps,
} from '../../types/node-renderer-props'
import { computed, defineAsyncComponent, inject, markRaw, nextTick, onBeforeUnmount, provide, reactive, ref, watch } from 'vue'
import AdmonitionNode from '../../components/AdmonitionNode'
import BlockquoteNode from '../../components/BlockquoteNode'
import CheckboxNode from '../../components/CheckboxNode'
import DefinitionListNode from '../../components/DefinitionListNode'
import EmojiNode from '../../components/EmojiNode'
import EmphasisNode from '../../components/EmphasisNode'
import FootnoteAnchorNode from '../../components/FootnoteAnchorNode'
import FootnoteNode from '../../components/FootnoteNode'
import FootnoteReferenceNode from '../../components/FootnoteReferenceNode'
import HardBreakNode from '../../components/HardBreakNode'
import HeadingNode from '../../components/HeadingNode'
import HighlightNode from '../../components/HighlightNode'
import ImageNode from '../../components/ImageNode'
import InlineCodeNode from '../../components/InlineCodeNode'
import InsertNode from '../../components/InsertNode'
import LinkNode from '../../components/LinkNode'
import ListItemNode from '../../components/ListItemNode'
import ListNode from '../../components/ListNode'
import ParagraphNode from '../../components/ParagraphNode'
import PreCodeNode from '../../components/PreCodeNode'
import ReferenceNode from '../../components/ReferenceNode'
import StrikethroughNode from '../../components/StrikethroughNode'
import StrongNode from '../../components/StrongNode'
import SubscriptNode from '../../components/SubscriptNode'
import SuperscriptNode from '../../components/SuperscriptNode'
import TableNode from '../../components/TableNode'
import TextNode from '../../components/TextNode'
import ThematicBreakNode from '../../components/ThematicBreakNode'
import VmrContainerNode from '../../components/VmrContainerNode'
import { provideViewportPriority } from '../../composables/viewportPriority'
import {
  buildBlockTextProfile,
  createEmptySimpleTextProbeProfile,
  estimateCodeBlockHeight,
  estimateSimpleTextBlockHeight,
  getHeightEstimationExperiment,
  heightEstimationExperimentRevision,
  registerHeightEstimationRendererController,
} from '../../internal/heightEstimationExperiment'
import { clampInfographicPreviewHeight, clampMermaidPreviewHeight, estimateInfographicPreviewHeight, estimateMermaidPreviewHeight, parsePositiveNumber } from '../../utils/diagramHeight'
import { getCustomNodeAttrs, getHtmlTagFromContent, shouldRenderUnknownHtmlTagAsText, stripCustomHtmlWrapper } from '../../utils/htmlRenderer'
import { isReservedNodeComponentKey, useCustomNodeComponents } from '../../utils/nodeComponents'
import { MARKSTREAM_NODE_LIFECYCLE_KEY } from '../../utils/nodeLifecycle'
import HtmlBlockNode from '../HtmlBlockNode/HtmlBlockNode.vue'
import HtmlInlineNode from '../HtmlInlineNode/HtmlInlineNode.vue'
import MarkdownCodeBlockNode from '../MarkdownCodeBlockNode'
import { createMathBlockMinHeightCache, provideMathBlockMinHeightCache } from '../MathBlockNode/minHeightCache'
import { MathBlockNodeAsync, MathInlineNodeAsync } from './asyncComponent'
import { useBatchRenderingScheduler } from './composables/useBatchRenderingScheduler'
import { useBatchRenderingState } from './composables/useBatchRenderingState'
import { useFocusSyncScheduler } from './composables/useFocusSyncScheduler'
import { useHeightMeasurements } from './composables/useHeightMeasurements'
import { useLiveRangeState } from './composables/useLiveRangeState'
import { useMarkdownParsing } from './composables/useMarkdownParsing'
import { useNodeVisibilityState } from './composables/useNodeVisibilityState'
import { useResolvedRendererOptions } from './composables/useResolvedRendererOptions'
import { useSchedulerPlatform } from './composables/useSchedulerPlatform'
import { useScrollListener } from './composables/useScrollListener'
import { useScrollRestore } from './composables/useScrollRestore'
import { useSmoothStreamingBridge } from './composables/useSmoothStreamingBridge'
import { useViewportRoot } from './composables/useViewportRoot'
import FallbackComponent from './FallbackComponent.vue'
import { InfographicBlockNodeLoading } from './InfographicBlockNodeLoading'
import { MermaidBlockNodeLoading } from './MermaidBlockNodeLoading'

type RuntimeCodeBlockNode = ParsedNode & {
  type: 'code_block'
  language?: string
  loading?: boolean
  diff?: boolean
  code?: string
  originalCode?: string
  updatedCode?: string
  raw?: string
}
type RuntimeHtmlNode = ParsedNode & {
  type: 'html_block' | 'html_inline'
  tag?: string
  content?: string
}

defineOptions({ name: 'NodeRenderer' })

const props = withDefaults(defineProps<NodeRendererProps>(), {
  codeBlockStream: true,
  showTooltips: true,
  typewriter: false,
  smoothStreaming: 'auto',
  fade: true,
  batchRendering: true,
  debugPerformance: false,
  initialRenderBatchSize: 40,
  renderBatchSize: 80,
  renderBatchDelay: 16,
  renderBatchBudgetMs: 6,
  renderBatchIdleTimeoutMs: 120,
  deferNodesUntilVisible: true,
  maxLiveNodes: 320,
  liveNodeBuffer: 60,
})

const emit = defineEmits<{
  (e: 'copy', code: string): void
  (e: 'handleArtifactClick', payload: CodeBlockPreviewPayload): void
  (e: 'click', event: MouseEvent): void
  (e: 'mouseover', event: MouseEvent): void
  (e: 'mouseout', event: MouseEvent): void
  (e: 'virtual-state-change', payload: MarkstreamVirtualState): void
  (e: 'height-change', payload: MarkstreamVirtualMetrics): void
  (e: 'render-settled', payload: MarkstreamVirtualMetrics): void
  (e: 'render-final', payload: MarkstreamVirtualMetrics): void
  (e: 'anchor-change', payload: MarkstreamVirtualAnchor): void
}>()

/* eslint-disable vue/custom-event-name-casing -- Public virtualScroll events are kebab-case. */
function emitHeightChange(metrics: MarkstreamVirtualMetrics) {
  emit('height-change', metrics)
}

function emitVirtualStateChange(state: MarkstreamVirtualState) {
  emit('virtual-state-change', state)
}

function emitAnchorChange(anchor: MarkstreamVirtualAnchor) {
  emit('anchor-change', anchor)
}

function emitRenderSettled(metrics: MarkstreamVirtualMetrics) {
  emit('render-settled', metrics)
}

function emitRenderFinal(metrics: MarkstreamVirtualMetrics) {
  emit('render-final', metrics)
}
/* eslint-enable vue/custom-event-name-casing */

const MAX_DEFERRED_NODE_COUNT = 900
const MAX_VIEWPORT_OBSERVER_TARGETS = 640
const VIEWPORT_PRIORITY_RECOVERY_COUNT = 200
const CONTENT_STREAMING_TAIL_IDLE_MS = 1200
const HEIGHT_CACHE_WIDTH_BUCKET_PX = 32
const BOTTOM_ANCHOR_CAPTURE_MAX_DISTANCE_PX = 160
const BOTTOM_ANCHOR_RELEASE_THRESHOLD_PX = 32

const containerRef = ref<HTMLElement>()
const paragraphProbeWrapperRef = ref<HTMLElement | null>(null)
const listItemProbeWrapperRef = ref<HTMLElement | null>(null)
const listProbeWrapperRef = ref<HTMLElement | null>(null)
const headingProbeWrapperRefs = reactive<Record<number, HTMLElement | null>>({
  1: null,
  2: null,
  3: null,
  4: null,
  5: null,
  6: null,
})
const viewportPriorityAutoDisabled = ref(false)
const textStreamState = new Map<string, string>()
const streamRenderVersion = ref(0)
const experimentContainerWidth = ref(0)
const simpleTextProbeProfile = ref(createEmptySimpleTextProbeProfile())
function resolveVirtualScrollRoot() {
  const root = props.virtualScroll?.scrollRoot
  const resolved = typeof root === 'function' ? root() : root
  return unwrapVirtualScrollRoot(resolved)
}

function unwrapVirtualScrollRoot(value: unknown): HTMLElement | null {
  if (!value)
    return null

  if (typeof Element !== 'undefined' && value instanceof Element)
    return value as HTMLElement

  const candidate = value as Partial<HTMLElement>
  if (
    typeof candidate === 'object'
    && candidate != null
    && typeof candidate.nodeType === 'number'
    && typeof candidate.getBoundingClientRect === 'function'
  ) {
    return candidate as HTMLElement
  }

  if (typeof value === 'object' && 'value' in value)
    return unwrapVirtualScrollRoot((value as { value: unknown }).value)

  return null
}

const {
  isClient,
  renderAsFragment,
  debugPerformanceEnabled,
  resolvedShowTooltips,
  resolvedHtmlPolicy,
  inheritedSmoothStreaming,
  ownsTypewriterCursor,
} = useResolvedRendererOptions(props)
const {
  resolveViewportRoot,
  resolveScrollContainer,
  isReverseFlexScrollRoot,
  getNormalizedScrollTop,
  getOffsetTopWithinRoot,
} = useViewportRoot(containerRef, {
  isClient,
  scrollRoot: resolveVirtualScrollRoot,
})
provide('markstreamShowTooltips', resolvedShowTooltips)
provide('markstreamHtmlPolicy', resolvedHtmlPolicy)
provide('markstreamTypewriter', computed(() => props.typewriter !== false))
provide('markstreamFade', computed(() => props.fade !== false))
provide('markstreamTypewriterCursor', computed(() => true))
provide('markstreamTextStreamState', textStreamState)
provide('markstreamStreamVersion', streamRenderVersion)
provide('markstreamParseOptions', computed(() => props.parseOptions))
provide('markstreamCustomMarkdownIt', computed(() => props.customMarkdownIt))

const {
  smoothStreamingEnabled,
  renderContent,
  effectiveFinal,
} = useSmoothStreamingBridge(props, {
  isClient,
  inheritedSmoothStreaming,
})
provide('markstreamSmoothStreaming', smoothStreamingEnabled)
const contentStreamingTailActive = ref(false)
let previousContentStreamValue = ''
let hasSeenContentStreamValue = false
let contentStreamingTailIdleTimer: number | null = null

function clearContentStreamingTailIdleTimer() {
  if (!isClient || contentStreamingTailIdleTimer == null)
    return
  window.clearTimeout(contentStreamingTailIdleTimer)
  contentStreamingTailIdleTimer = null
}

function markContentStreamingTailActive() {
  contentStreamingTailActive.value = true
  if (!isClient)
    return

  clearContentStreamingTailIdleTimer()
  contentStreamingTailIdleTimer = window.setTimeout(() => {
    contentStreamingTailIdleTimer = null
    if (effectiveFinal.value === true || props.nodes?.length)
      return
    clearPendingHeightMeasurements()
    contentStreamingTailActive.value = false
    measureTrackedNodeHeights()
  }, CONTENT_STREAMING_TAIL_IDLE_MS)
}

function clearContentStreamingTailActive() {
  contentStreamingTailActive.value = false
  clearContentStreamingTailIdleTimer()
}

watch(
  [renderContent, () => props.nodes, effectiveFinal],
  ([content, nodes, final]) => {
    const nextContent = content ?? ''

    if (nodes?.length || final === true) {
      clearContentStreamingTailActive()
      previousContentStreamValue = nextContent
      hasSeenContentStreamValue = true
      return
    }

    if (!hasSeenContentStreamValue) {
      previousContentStreamValue = nextContent
      hasSeenContentStreamValue = true
      return
    }

    if (previousContentStreamValue && nextContent.length > previousContentStreamValue.length && nextContent.startsWith(previousContentStreamValue)) {
      markContentStreamingTailActive()
    }
    else if (nextContent.length < previousContentStreamValue.length || !nextContent.startsWith(previousContentStreamValue)) {
      clearContentStreamingTailActive()
    }

    previousContentStreamValue = nextContent
  },
  { flush: 'sync', immediate: true },
)

function logPerf(label: string, data: Record<string, unknown>) {
  if (!debugPerformanceEnabled.value)
    return
  console.info(`[markstream-vue][perf] ${label}`, data)
}
const instanceMsgId = props.customId
  ? `renderer-${props.customId}`
  : `renderer-${Date.now()}-${Math.random().toString(36).slice(2)}`
const mathBlockMinHeightCache = createMathBlockMinHeightCache(instanceMsgId)
const mathBlockCacheScope = computed(() => `${instanceMsgId}:${streamRenderVersion.value}`)
provideMathBlockMinHeightCache(mathBlockMinHeightCache)
const customComponentsMap = useCustomNodeComponents(() => props.customId)
const {
  effectiveCustomHtmlTagsSet,
  mergedParseOptions,
  parsedNodes,
} = useMarkdownParsing(props, {
  instanceMsgId,
  renderContent,
  effectiveFinal,
  smoothStreamingEnabled,
  debugPerformanceEnabled,
  customComponentsMap,
  logPerf,
})

watch(
  parsedNodes,
  () => {
    mathBlockMinHeightCache.clear()
    streamRenderVersion.value += 1
  },
  { immediate: true },
)
const nestedRendererProps = computed<Partial<NodeRendererProps>>(() => ({
  customId: props.customId,
  customHtmlTags: mergedParseOptions.value.customHtmlTags,
  parseOptions: props.parseOptions,
  customMarkdownIt: props.customMarkdownIt,
  htmlPolicy: resolvedHtmlPolicy.value,
  viewportPriority: props.viewportPriority,
  codeBlockStream: props.codeBlockStream,
  codeBlockDarkTheme: props.codeBlockDarkTheme,
  codeBlockLightTheme: props.codeBlockLightTheme,
  codeBlockMonacoOptions: props.codeBlockMonacoOptions,
  renderCodeBlocksAsPre: props.renderCodeBlocksAsPre,
  codeBlockMinWidth: props.codeBlockMinWidth,
  codeBlockMaxWidth: props.codeBlockMaxWidth,
  codeBlockProps: props.codeBlockProps,
  mermaidProps: props.mermaidProps,
  d2Props: props.d2Props,
  infographicProps: props.infographicProps,
  showTooltips: resolvedShowTooltips.value,
  themes: props.themes,
  isDark: props.isDark,
  typewriter: props.typewriter,
  smoothStreamingOptions: props.smoothStreamingOptions,
  parseCoalesceMs: props.parseCoalesceMs,
  fade: props.fade,
}))
provide('markstreamNestedRendererProps', nestedRendererProps)
const parsedNodesIdentity = computed(() => parsedNodes.value)
const parsedNodeCount = computed(() => parsedNodes.value.length)
const paragraphProbeNode = ref<ParsedNode | null>(null)
const listItemProbeNode = ref<ParsedNode | null>(null)
const listProbeNode = ref<ParsedNode | null>(null)
const headingProbeNodes = ref<Record<number, ParsedNode | null> | null>(null)
const isNestedListItemRenderer = props.indexKey != null && String(props.indexKey).startsWith('list-item-')
const initialHeightExperimentConfig = (!isNestedListItemRenderer && props.customId)
  ? getHeightEstimationExperiment(props.customId)
  : null
const heightExperimentConfig = computed(() => {
  if (!initialHeightExperimentConfig)
    return null
  void heightEstimationExperimentRevision.value
  return getHeightEstimationExperiment(props.customId)
})
const heightExperimentEnabled = computed(() => Boolean(
  isClient
  && !renderAsFragment.value
  && props.customId
  && !isNestedListItemRenderer
  && heightExperimentConfig.value?.enabled,
))
const virtualScrollRequested = computed(() => Boolean(
  !renderAsFragment.value
  && props.virtualScroll?.enabled,
))
const virtualScrollEnabled = computed(() => Boolean(
  isClient
  && virtualScrollRequested.value,
))
const heightEstimationActive = computed(() => heightExperimentEnabled.value || virtualScrollEnabled.value)
const textEstimationEnabled = computed(() => {
  return heightEstimationActive.value
    && heightExperimentConfig.value?.textEstimation !== false
})
const codeBlockEstimationEnabled = computed(() => {
  return heightEstimationActive.value
    && heightExperimentConfig.value?.codeBlockEstimation !== false
})
const experimentProbeWidth = computed(() => Math.max(320, experimentContainerWidth.value || containerRef.value?.clientWidth || 640))
const maxLiveNodesResolved = computed(() => Math.max(1, props.maxLiveNodes ?? 320))
const virtualizationEnabled = computed(() => {
  if (renderAsFragment.value)
    return false
  if ((props.maxLiveNodes ?? 0) <= 0)
    return false
  return parsedNodes.value.length > maxLiveNodesResolved.value
})
const shouldMeasureNodeHeights = computed(() => virtualizationEnabled.value || heightExperimentEnabled.value || virtualScrollEnabled.value)
// Viewport priority is used to defer heavy work (Monaco/Mermaid/KaTeX) until
// nodes approach the viewport. Node-level deferral is controlled separately
// via `deferNodes`.
const viewportPriorityEnabled = computed(() => {
  if (props.viewportPriority === false)
    return false
  if (viewportPriorityAutoDisabled.value)
    return false
  return true
})
// Provide viewport-priority registrar so heavy nodes can defer work until visible
const registerNodeVisibility = provideViewportPriority(
  target => resolveViewportRoot(target ?? containerRef.value ?? null),
  viewportPriorityEnabled,
)
const {
  requestFrame,
  cancelFrame,
  hasIdleCallback,
  isTestEnv,
} = useSchedulerPlatform({
  isClient,
})
const {
  resolvedBatchSize,
  resolvedInitialBatch,
  batchingEnabled,
  incrementalRenderingActive,
  renderedCount,
  previousRenderContext,
  adaptiveBatchSize,
  previousBatchConfig,
} = useBatchRenderingState(props, {
  isClient,
  isTestEnv,
  renderAsFragment,
})
const nodeSlotElements = new Map<number, HTMLElement | null>()
const nodeContentResizeObservers = new Map<number, ResizeObserver>()
const codeBlockRenderCache = new WeakMap<object, { signature: string, node: ParsedNode }>()
const nodeSlotVersion = ref(0)
const sortedNodeSlots = computed(() => {
  // Track a manual version so we only rebuild when slots change.
  void nodeSlotVersion.value
  return Array.from(nodeSlotElements.entries()).sort((a, b) => a[0] - b[0])
})
const scrollRootElement = ref<HTMLElement | null>(null)
const activeVirtualBottomAnchor = ref<Extract<MarkstreamVirtualAnchor, { type: 'bottom' }> | null>(null)
let virtualBottomRestoreRaf: number | null = null
const {
  activeRestoreAnchor,
  getRelativeScrollTopWithinContainer,
  setRelativeScrollTopWithinContainer,
  resolveAnchorOffset,
  clearRestoreReconcile,
  scheduleRestoreReconcile,
  captureRestoreAnchor,
  restoreAnchor,
  getAnchorDrift,
} = useScrollRestore({
  isClient,
  containerRef,
  parsedNodeCount,

  requestFrame,
  cancelFrame,

  resolveScrollContainer: () => scrollRootElement.value || resolveScrollContainer(),
  getNormalizedScrollTop,
  getOffsetTopWithinRoot,
  isReverseFlexScrollRoot,

  estimateIndexForOffset,
  estimateHeightRange,
  getFallbackNodeHeight,
  clamp,
})
const {
  nodeHeights,
  heightStats,
  heightTreeSize,
  heightSumTree,
  heightKnownTree,
  averageNodeHeight,
  resetHeightMeasurements,
  pruneHeightMeasurements,
  rebuildHeightTrees,
  recordNodeHeight,
  exportHeightCache,
  importHeightCache,
  fenwickRangeSum,
} = useHeightMeasurements({
  onHeightRecorded: () => {
    markFallbackHeightPrefixDirty()
    if (activeRestoreAnchor.value)
      scheduleRestoreReconcile()
    if (activeVirtualBottomAnchor.value)
      scheduleVirtualBottomRestoreReconcile()
    scheduleVirtualMetricsEmit('node-resize')
  },
})
const deferNodes = computed(() => {
  if (renderAsFragment.value)
    return false
  if (props.deferNodesUntilVisible === false)
    return false
  // In the incremental/batched mode (`maxLiveNodes <= 0`), placeholders are
  // driven by the batch scheduler rather than viewport deferral.
  if ((props.maxLiveNodes ?? 0) <= 0)
    return false
  // When virtualization is active, the virtual window already limits DOM work.
  // Keep rendering immediate within that window (no placeholders).
  if (virtualizationEnabled.value)
    return false
  // Avoid registering too many observer targets in non-virtualized mode.
  if (parsedNodes.value.length > MAX_DEFERRED_NODE_COUNT)
    return false
  return viewportPriorityEnabled.value
})
const shouldObserveSlots = computed(() => !!registerNodeVisibility && (deferNodes.value || virtualizationEnabled.value))
const scrollListenerEnabled = computed(() => virtualizationEnabled.value || virtualScrollEnabled.value)
const {
  liveNodeBufferResolved,
  focusIndex,
  liveRange,
  updateLiveRange,
} = useLiveRangeState(props, {
  parsedNodeCount,
  virtualizationEnabled,
  maxLiveNodesResolved,
  clamp,
})
const nodeContentElements = new Map<number, HTMLElement | null>()
const nodeContentVersions = new Map<number, number>()
const nodeContentDeferredMeasureTimers = new Map<number, number[]>()
const finalHeightConvergenceTimers: number[] = []
const pendingHeightMeasurements = new Map<number, { height: number, allowShrink: boolean, version: number, el: HTMLElement }>()
const activeHeightSettlingTimers = new Set<number>()
const heightSettlingTimerVersion = ref(0)
let heightSettlingTimerVersionQueued = false
const pendingHeightSettlingTaskCount = computed(() => {
  void heightSettlingTimerVersion.value
  return activeHeightSettlingTimers.size
})
const pendingAsyncNodeCounts = new Map<string, number>()
const pendingAsyncNodeVersion = ref(0)
const pendingAsyncNodeCount = computed(() => {
  void pendingAsyncNodeVersion.value
  return pendingAsyncNodeCounts.size
})
let heightMeasurementRaf: number | null = null
let fallbackHeightPrefixDirty = true
let fallbackHeightPrefixCache: number[] = [0]
let fallbackHeightPrefixCacheKey = ''

function markFallbackHeightPrefixDirty() {
  fallbackHeightPrefixDirty = true
}

const desiredRenderedCount = computed(() => {
  if (!virtualizationEnabled.value)
    return parsedNodes.value.length
  const overscan = liveNodeBufferResolved.value
  const windowEnd = Math.max(liveRange.end + overscan, resolvedInitialBatch.value)
  const target = Math.min(parsedNodes.value.length, windowEnd)
  return Math.max(renderedCount.value, target)
})

function bumpHeightSettlingTimerVersion() {
  if (heightSettlingTimerVersionQueued)
    return

  heightSettlingTimerVersionQueued = true
  queueMicrotask(() => {
    heightSettlingTimerVersionQueued = false
    heightSettlingTimerVersion.value += 1
  })
}

function scheduleHeightSettlingTimer(
  delay: number,
  task: () => void,
  reason: MarkstreamVirtualReason = 'node-resize',
) {
  if (!isClient || typeof window === 'undefined')
    return null

  const timer = window.setTimeout(() => {
    if (activeHeightSettlingTimers.delete(timer))
      bumpHeightSettlingTimerVersion()

    try {
      task()
    }
    finally {
      scheduleVirtualMetricsEmit(reason)
    }
  }, Math.max(0, delay))

  activeHeightSettlingTimers.add(timer)
  bumpHeightSettlingTimerVersion()
  return timer
}

function clearHeightSettlingTimer(timer: number | null | undefined) {
  if (!isClient || timer == null)
    return

  if (activeHeightSettlingTimers.delete(timer))
    bumpHeightSettlingTimerVersion()

  window.clearTimeout(timer)
}

function clearAllHeightSettlingTimers() {
  if (isClient && typeof window !== 'undefined') {
    for (const timer of activeHeightSettlingTimers)
      window.clearTimeout(timer)
  }

  if (activeHeightSettlingTimers.size) {
    activeHeightSettlingTimers.clear()
    bumpHeightSettlingTimerVersion()
  }

  finalHeightConvergenceTimers.length = 0
  nodeContentDeferredMeasureTimers.clear()
}

function ensureExperimentProbeNodes() {
  if (paragraphProbeNode.value && listItemProbeNode.value && listProbeNode.value && headingProbeNodes.value?.[1])
    return

  const paragraph = markRaw({
    type: 'paragraph',
    children: [{ type: 'text', content: 'Probe paragraph text', raw: 'Probe paragraph text' }],
    raw: 'Probe paragraph text',
  }) as ParsedNode
  const listItem = markRaw({
    type: 'list_item',
    children: [paragraph],
    raw: '- Probe paragraph text',
  }) as ParsedNode
  const list = markRaw({
    type: 'list',
    ordered: false,
    items: [listItem],
    raw: '- Probe paragraph text',
  }) as ParsedNode

  paragraphProbeNode.value = paragraph
  listItemProbeNode.value = listItem
  listProbeNode.value = list
  const headings: Record<number, ParsedNode | null> = {
    1: null,
    2: null,
    3: null,
    4: null,
    5: null,
    6: null,
  }
  for (let level = 1; level <= 6; level++) {
    headings[level] = markRaw({
      type: 'heading',
      level,
      text: 'Probe heading',
      children: [{ type: 'text', content: 'Probe heading', raw: 'Probe heading' }],
      raw: `${'#'.repeat(level)} Probe heading`,
    }) as ParsedNode
  }
  headingProbeNodes.value = headings
}

function getHeadingProbeNode(level: number) {
  return headingProbeNodes.value?.[level] ?? null
}

const {
  cancelScheduledFocusSync,
  scheduleFocusSync,
} = useFocusSyncScheduler({
  isClient,
  containerRef,
  virtualizationEnabled,
  requestFrame,
  cancelFrame,
  syncFocusToScroll,
})

const {
  visibleNodeIndices,
  nodeVisibilityHandles,
  nodeVisibilityWatchStops,
  nodeVisibilityFallbackTimers,
  clearVisibilityFallback,
  markNodeVisible,
  cleanupNodeVisibility,
  destroyNodeVisibilityState,
} = useNodeVisibilityState({
  isClient,
  shouldTrackVisibleNodeIndices: () => deferNodes.value,
  shouldCleanupNodeVisibility: () => virtualizationEnabled.value,
  onNodeMarkedVisible: (index) => {
    if (virtualizationEnabled.value)
      scheduleFocusSync()
    else
      focusIndex.value = clamp(index, 0, Math.max(0, parsedNodes.value.length - 1))
  },
  onNodeVisibilityCleaned: (index) => {
    if (nodeSlotElements.delete(index))
      bumpNodeSlotVersion()
  },
})

const {
  cleanupScrollListener,
  setupScrollListener,
} = useScrollListener({
  isClient,
  virtualizationEnabled,
  listenerEnabled: scrollListenerEnabled,
  scrollRootElement,
  resolveScrollContainer,
  scheduleFocusSync,
  onScroll: handleVirtualScrollRootScroll,
})

function syncFocusToScroll(force = false) {
  if (!virtualizationEnabled.value)
    return
  const root = scrollRootElement.value || resolveScrollContainer()
  if (!root)
    return
  const doc = root.ownerDocument || containerRef.value?.ownerDocument || document
  const view = doc?.defaultView || (typeof window !== 'undefined' ? window : null)
  const isViewportRoot = root === doc?.documentElement || root === doc?.body

  const total = parsedNodes.value.length
  const reverseFlex = !isViewportRoot && total > 0 && isReverseFlexScrollRoot(root)
  if (reverseFlex) {
    // In reverse-flex scroll roots (chat UIs), `scrollTop` is effectively the
    // distance from the bottom (often 0 when pinned). Estimating focus from
    // the end keeps the virtual window responsive while scrolling upward
    // through large spacers.
    const viewportHeight = root.clientHeight || 0
    const raw = root.scrollTop
    // Some browsers report negative scrollTop with `flex-direction: column-reverse`.
    const distanceFromBottom = raw < 0 ? -raw : raw
    const offsetFromBottom = Math.max(0, distanceFromBottom) + Math.max(0, viewportHeight) * 0.5
    const estimated = estimateIndexForOffsetFromEnd(offsetFromBottom)
    const next = clamp(estimated, 0, Math.max(0, total - 1))
    if (force || Math.abs(next - focusIndex.value) > 1)
      focusIndex.value = next
    return
  }

  const rootRect = !isViewportRoot ? root.getBoundingClientRect() : null
  const viewportTop = isViewportRoot ? 0 : rootRect!.top
  const viewportBottom = isViewportRoot
    ? (view?.innerHeight ?? root.clientHeight ?? 0)
    : rootRect!.bottom
  const entries = sortedNodeSlots.value
  let firstVisible: number | null = null
  let lastVisible: number | null = null
  for (const [index, el] of entries) {
    if (!el)
      continue
    const rect = el.getBoundingClientRect()
    if (rect.bottom <= viewportTop || rect.top >= viewportBottom)
      continue
    if (firstVisible == null)
      firstVisible = index
    lastVisible = index
  }
  if (firstVisible == null || lastVisible == null) {
    const container = containerRef.value
    if (!container)
      return
    const rootRect = isViewportRoot ? { top: 0 } : root.getBoundingClientRect()
    const rootScrollTop = getNormalizedScrollTop(root, doc, isViewportRoot)
    const relativeScrollTop = isViewportRoot
      ? (() => {
          // For viewport scrolling, estimate how far we've scrolled into the
          // container by its visual position (negative top means we've scrolled
          // past it).
          const containerRect = container.getBoundingClientRect()
          const rel = (isViewportRoot ? 0 : rootRect.top) - containerRect.top
          return Math.max(0, rel)
        })()
      : (() => {
          const offsetTop = getOffsetTopWithinRoot(container, root)
          return Math.max(0, rootScrollTop - offsetTop)
        })()
    const viewportHeight = isViewportRoot
      ? (view?.innerHeight ?? doc?.documentElement?.clientHeight ?? root.clientHeight ?? 0)
      : root.clientHeight
    const targetOffset = relativeScrollTop + Math.max(0, viewportHeight) * 0.5
    const estimated = estimateIndexForOffset(targetOffset)
    focusIndex.value = clamp(estimated, 0, Math.max(0, parsedNodes.value.length - 1))
    return
  }
  const midpoint = Math.round((firstVisible + lastVisible) / 2)
  if (!force && Math.abs(midpoint - focusIndex.value) <= 1)
    return
  focusIndex.value = clamp(midpoint, 0, Math.max(0, parsedNodes.value.length - 1))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getProbeRoot(wrapper: HTMLElement | null | undefined) {
  return wrapper?.firstElementChild as HTMLElement | null
}

function getProbeElement(root: HTMLElement | null | undefined, selector: string) {
  if (!root)
    return null
  if (root.matches?.(selector))
    return root
  return root.querySelector(selector) as HTMLElement | null
}

function setHeadingProbeWrapper(level: number, el: HTMLElement | null) {
  if (level < 1 || level > 6)
    return
  headingProbeWrapperRefs[level] = el
}

function readSimpleTextProbeProfile() {
  if (!heightEstimationActive.value || typeof window === 'undefined') {
    simpleTextProbeProfile.value = createEmptySimpleTextProbeProfile()
    markFallbackHeightPrefixDirty()
    return
  }

  const nextProfile = createEmptySimpleTextProbeProfile()
  const paragraphRoot = getProbeRoot(paragraphProbeWrapperRef.value)
  const paragraphTextEl = getProbeElement(paragraphRoot, '.paragraph-node')
  nextProfile.paragraph = buildBlockTextProfile(paragraphProbeWrapperRef.value, paragraphTextEl, 'pre-wrap')

  const listItemRoot = getProbeRoot(listItemProbeWrapperRef.value)
  const listItemTextEl = listItemRoot?.querySelector('.paragraph-node') as HTMLElement | null
  nextProfile.listItem = buildBlockTextProfile(listItemProbeWrapperRef.value, listItemTextEl, 'pre-wrap')

  const listHeight = listProbeWrapperRef.value?.offsetHeight ?? 0
  const listItemHeight = listItemProbeWrapperRef.value?.offsetHeight ?? 0
  nextProfile.listWrapperOverhead = Math.max(0, listHeight - listItemHeight)

  for (let level = 1; level <= 6; level++) {
    const headingRoot = getProbeRoot(headingProbeWrapperRefs[level])
    const headingTextEl = getProbeElement(headingRoot, `h${level}`)
    nextProfile.headings[level] = buildBlockTextProfile(headingProbeWrapperRefs[level], headingTextEl, 'pre-wrap')
  }

  simpleTextProbeProfile.value = nextProfile
  markFallbackHeightPrefixDirty()
}

function updateExperimentContainerWidth() {
  if (!heightEstimationActive.value) {
    experimentContainerWidth.value = 0
    return
  }
  const width = containerRef.value?.clientWidth ?? 0
  experimentContainerWidth.value = width > 0 ? width : 0
}

let experimentResizeObserver: ResizeObserver | null = null

function cleanupExperimentResizeObserver() {
  experimentResizeObserver?.disconnect()
  experimentResizeObserver = null
}

function setupExperimentResizeObserver() {
  cleanupExperimentResizeObserver()
  if (!heightEstimationActive.value || !containerRef.value || typeof ResizeObserver === 'undefined')
    return
  experimentResizeObserver = new ResizeObserver(() => {
    updateExperimentContainerWidth()
    if (activeRestoreAnchor.value)
      scheduleRestoreReconcile()
    if (activeVirtualBottomAnchor.value)
      scheduleVirtualBottomRestoreReconcile()
    scheduleVirtualMetricsEmit('resize')
  })
  experimentResizeObserver.observe(containerRef.value)
}

// 异步按需加载 CodeBlock 组件；失败时退回为 InlineCodeNode（内联代码渲染）
const CodeBlockNodeAsync = defineAsyncComponent(async () => {
  try {
    const mod = await import('../../components/CodeBlockNode/CodeBlockNode.vue')
    return mod.default
  }
  catch (e) {
    console.warn(
      '[markstream-vue] Optional peer dependencies for CodeBlockNode are missing. Falling back to inline-code rendering (no Monaco). To enable full code block features, please install "stream-monaco".',
      e,
    )
    return PreCodeNode
  }
})

const codeBlockComponent = computed(() => props.renderCodeBlocksAsPre ? PreCodeNode : CodeBlockNodeAsync)

function resolveCodeBlockRendererKind(node: ParsedNode) {
  if (node.type !== 'code_block')
    return null
  const component = getNodeComponent(node, getCodeBlockLanguage(node))
  if (component === MarkdownCodeBlockNode)
    return 'markdown'
  if (component === PreCodeNode)
    return 'pre'
  if (component === codeBlockComponent.value || component === CodeBlockNodeAsync)
    return 'monaco'
  return null
}

function resolveCodeBlockShowHeader() {
  const showHeader = props.codeBlockProps?.showHeader
  return showHeader !== false
}

const estimatedNodeHeights = computed(() => {
  const nodes = parsedNodes.value
  if (!nodes.length || !heightEstimationActive.value)
    return nodes.map(() => null)

  const width = experimentContainerWidth.value || containerRef.value?.clientWidth || 0
  if (!Number.isFinite(width) || width <= 0)
    return nodes.map(() => null)

  return nodes.map((node, index) => {
    const measuredHeight = nodeHeights[index]
    const hasMeasuredHeight = typeof measuredHeight === 'number' && measuredHeight > 0

    if (textEstimationEnabled.value && !hasMeasuredHeight) {
      const estimatedText = estimateSimpleTextBlockHeight(node, width, simpleTextProbeProfile.value)
      if (estimatedText)
        return estimatedText
    }

    if (codeBlockEstimationEnabled.value && node.type === 'code_block') {
      const rendererKind = resolveCodeBlockRendererKind(node)
      if (rendererKind === 'monaco' || rendererKind === 'markdown') {
        return estimateCodeBlockHeight(node, {
          rendererKind,
          monacoOptions: props.codeBlockMonacoOptions,
          showHeader: resolveCodeBlockShowHeader(),
        })
      }
    }

    return null
  })
})

function getFallbackNodeHeight(index: number) {
  return nodeHeights[index] ?? estimatedNodeHeights.value[index]?.height ?? averageNodeHeight.value
}

function getFallbackHeightPrefix() {
  const total = parsedNodes.value.length
  const width = experimentContainerWidth.value || containerRef.value?.clientWidth || 0
  const widthBucket = Number.isFinite(width) && width > 0
    ? Math.round(width / HEIGHT_CACHE_WIDTH_BUCKET_PX)
    : 0
  const measurementKey = props.virtualScroll?.measurementKey == null
    ? ''
    : String(props.virtualScroll.measurementKey)
  const key = [
    total,
    heightStats.count,
    Math.round(heightStats.total),
    Math.round(averageNodeHeight.value * 100),
    measurementKey,
    widthBucket,
    heightEstimationActive.value ? 1 : 0,
    heightEstimationExperimentRevision.value,
    streamRenderVersion.value,
  ].join(':')

  if (!fallbackHeightPrefixDirty && fallbackHeightPrefixCacheKey === key)
    return fallbackHeightPrefixCache

  const prefix = new Array<number>(total + 1)
  prefix[0] = 0

  for (let i = 0; i < total; i++) {
    prefix[i + 1] = prefix[i] + (
      heightEstimationActive.value
        ? getFallbackNodeHeight(i)
        : (nodeHeights[i] ?? averageNodeHeight.value)
    )
  }

  fallbackHeightPrefixCache = prefix
  fallbackHeightPrefixCacheKey = key
  fallbackHeightPrefixDirty = false

  return prefix
}

function estimateHeightRangeFromPrefix(start: number, end: number) {
  const total = parsedNodes.value.length
  const boundedStart = clamp(Math.trunc(start), 0, total)
  const boundedEnd = clamp(Math.trunc(end), boundedStart, total)
  if (boundedStart >= boundedEnd)
    return 0

  const prefix = getFallbackHeightPrefix()
  return (prefix[boundedEnd] ?? 0) - (prefix[boundedStart] ?? 0)
}

function estimateIndexForOffsetFromPrefix(offsetPx: number) {
  const nodes = parsedNodes.value
  const total = nodes.length
  if (total <= 0)
    return 0
  if (offsetPx <= 0)
    return 0

  const prefix = getFallbackHeightPrefix()
  const totalHeight = prefix[total] ?? 0
  if (offsetPx >= totalHeight)
    return total - 1

  let low = 0
  let high = total - 1
  let answer = total - 1

  while (low <= high) {
    const mid = (low + high) >> 1
    const midEnd = prefix[mid + 1] ?? 0

    if (midEnd >= offsetPx) {
      answer = mid
      high = mid - 1
    }
    else {
      low = mid + 1
    }
  }

  return answer
}

watch(
  () => parsedNodes.value.length,
  (length) => {
    markFallbackHeightPrefixDirty()
    if (length <= 0) {
      resetHeightMeasurements()
      return
    }
    if (length < heightTreeSize.value)
      pruneHeightMeasurements(length)
    if (length !== heightTreeSize.value)
      rebuildHeightTrees(length)
  },
  { immediate: true },
)

function estimateHeightRange(start: number, end: number) {
  if (start >= end)
    return 0
  if (heightEstimationActive.value) {
    return estimateHeightRangeFromPrefix(start, end)
  }
  if (heightTreeSize.value !== parsedNodes.value.length) {
    let total = 0
    for (let i = start; i < end; i++)
      total += nodeHeights[i] ?? averageNodeHeight.value
    return total
  }
  const sumTree = heightSumTree.value
  const countTree = heightKnownTree.value
  if (!sumTree.length || !countTree.length) {
    let total = 0
    for (let i = start; i < end; i++)
      total += nodeHeights[i] ?? averageNodeHeight.value
    return total
  }
  const sumKnown = fenwickRangeSum(sumTree, start, end)
  const countKnown = fenwickRangeSum(countTree, start, end)
  const unknownCount = (end - start) - countKnown
  return sumKnown + unknownCount * averageNodeHeight.value
}

const visibleNodes = computed(() => {
  // Use the full `parsedNodes` list to build the visible window so that
  // placeholders and spacer heights represent the entire dataset even when
  // only a subset of nodes has been fully rendered so far.
  if (!virtualizationEnabled.value)
    return parsedNodes.value.map((node, index) => ({ node, index }))
  const total = parsedNodes.value.length
  const start = clamp(liveRange.start, 0, total)
  const end = clamp(liveRange.end, start, total)
  return parsedNodes.value.slice(start, end).map((node, idx) => ({
    node,
    index: start + idx,
  }))
})

const topSpacerHeight = computed(() => {
  if (!virtualizationEnabled.value)
    return 0
  // Estimate height from the start up to the live window start based on
  // recorded heights or averages for the full parsedNodes list.
  return estimateHeightRange(0, Math.min(liveRange.start, parsedNodes.value.length))
})

const bottomSpacerHeight = computed(() => {
  if (!virtualizationEnabled.value)
    return 0
  // Estimate height after the live window end up to the total number of
  // parsed nodes. This ensures the scrollable area matches the full
  // dataset even when not all nodes are currently rendered.
  const total = parsedNodes.value.length
  const end = Math.min(liveRange.end, total)
  return estimateHeightRange(end, total)
})

interface VirtualHeightSummary {
  totalNodes: number
  measuredCount: number
  estimatedCount: number
  averageNodeHeight: number
  topSpacerHeight: number
  bottomSpacerHeight: number
  estimatedTotalHeight: number
  width: number
}

function getEstimatedNodeHeightCount() {
  if (!heightEstimationActive.value)
    return 0

  let count = 0
  const estimates = estimatedNodeHeights.value
  for (let i = 0; i < estimates.length; i++) {
    if (estimates[i])
      count++
  }
  return count
}

function buildVirtualHeightSummary(): VirtualHeightSummary {
  const totalNodes = parsedNodes.value.length

  return {
    totalNodes,
    measuredCount: heightStats.count,
    estimatedCount: getEstimatedNodeHeightCount(),
    averageNodeHeight: averageNodeHeight.value,
    topSpacerHeight: topSpacerHeight.value,
    bottomSpacerHeight: bottomSpacerHeight.value,
    estimatedTotalHeight: estimateHeightRange(0, totalNodes),
    width: getCurrentVirtualWidth(),
  }
}

function buildExperimentReport() {
  const nodes = parsedNodes.value
  const summary = buildVirtualHeightSummary()

  return {
    ...summary,
    probe: {
      paragraphReady: Boolean(simpleTextProbeProfile.value.paragraph),
      listItemReady: Boolean(simpleTextProbeProfile.value.listItem),
      listWrapperOverhead: simpleTextProbeProfile.value.listWrapperOverhead,
      headingReadyLevels: Object.entries(simpleTextProbeProfile.value.headings)
        .filter(([, value]) => Boolean(value))
        .map(([level]) => Number(level)),
    },
    nodes: nodes.map((node, index) => ({
      index,
      type: node.type,
      estimateKind: estimatedNodeHeights.value[index]?.kind ?? null,
      rendererKind: estimatedNodeHeights.value[index]?.rendererKind ?? null,
      estimatedHeight: estimatedNodeHeights.value[index]?.height ?? null,
      estimatedContentHeight: estimatedNodeHeights.value[index]?.contentHeight ?? null,
      measuredHeight: nodeHeights[index] ?? null,
    })),
  }
}

function getCurrentIndexPrefix() {
  if (props.indexKey != null)
    return String(props.indexKey)

  if (virtualScrollRequested.value)
    return `virtual-${getVirtualSessionKey()}`

  return 'markdown-renderer'
}

function resolveLifecycleNodeIndex(indexKey: string | number) {
  const key = String(indexKey)
  const prefix = `${getCurrentIndexPrefix()}-`
  if (!key.startsWith(prefix))
    return null

  const match = key.slice(prefix.length).match(/^(\d+)(?:$|-)/)
  if (!match)
    return null

  const index = Number(match[1])
  if (!Number.isInteger(index) || index < 0 || index >= parsedNodes.value.length)
    return null

  return index
}

function bumpAsyncNodeVersion() {
  pendingAsyncNodeVersion.value += 1
}

function incrementPendingAsyncNodeKey(key: string) {
  const previous = pendingAsyncNodeCounts.get(key) ?? 0
  pendingAsyncNodeCounts.set(key, previous + 1)

  if (previous === 0) {
    bumpAsyncNodeVersion()
    scheduleVirtualMetricsEmit('async-node')
  }
}

function decrementPendingAsyncNodeKey(key: string) {
  const previous = pendingAsyncNodeCounts.get(key) ?? 0
  if (previous <= 0)
    return false

  if (previous <= 1)
    pendingAsyncNodeCounts.delete(key)
  else
    pendingAsyncNodeCounts.set(key, previous - 1)

  if (previous === 1) {
    bumpAsyncNodeVersion()
    scheduleVirtualMetricsEmit('async-node')
  }

  return true
}

function clearPendingAsyncNodeKeysForIndex(index: number) {
  const nodeKey = `${getCurrentIndexPrefix()}-${index}`
  let changed = false

  for (const key of Array.from(pendingAsyncNodeCounts.keys())) {
    if (key === nodeKey || key.startsWith(`${nodeKey}-`)) {
      pendingAsyncNodeCounts.delete(key)
      changed = true
    }
  }

  if (changed) {
    bumpAsyncNodeVersion()
    scheduleVirtualMetricsEmit('async-node')
  }
}

const parentNodeLifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY, null)

const localNodeLifecycle: MarkstreamNodeLifecycle = {
  reportHeight(indexKey, height) {
    if (!virtualScrollEnabled.value)
      return

    const index = resolveLifecycleNodeIndex(indexKey)
    if (index == null)
      return

    const currentEl = nodeContentElements.get(index)
    if (!currentEl)
      return

    const measuredHeight = Number(height)
    const wrapperHeight = currentEl.offsetHeight
    const nextHeight = Number.isFinite(measuredHeight) && measuredHeight > 0
      ? Math.max(measuredHeight, wrapperHeight || 0)
      : wrapperHeight

    recordNodeHeight(index, nextHeight)
  },
  markPending(indexKey) {
    if (!virtualScrollEnabled.value)
      return

    const index = resolveLifecycleNodeIndex(indexKey)
    if (index == null)
      return

    const key = String(indexKey)
    incrementPendingAsyncNodeKey(key)
  },
  markSettled(indexKey) {
    if (!virtualScrollEnabled.value)
      return

    const index = resolveLifecycleNodeIndex(indexKey)
    if (index == null)
      return

    const key = String(indexKey)
    if (!decrementPendingAsyncNodeKey(key))
      return

    measureTrackedNodeHeights()
  },
}

const providedNodeLifecycle: MarkstreamNodeLifecycle = {
  reportHeight(indexKey, height) {
    localNodeLifecycle.reportHeight(indexKey, height)
    parentNodeLifecycle?.reportHeight(indexKey, height)
  },
  markPending(indexKey) {
    localNodeLifecycle.markPending(indexKey)
    parentNodeLifecycle?.markPending(indexKey)
  },
  markSettled(indexKey) {
    localNodeLifecycle.markSettled(indexKey)
    parentNodeLifecycle?.markSettled(indexKey)
  },
}

provide(MARKSTREAM_NODE_LIFECYCLE_KEY, providedNodeLifecycle)

function getVirtualSessionKey() {
  const explicit = props.virtualScroll?.sessionKey
  if (explicit != null && explicit !== '')
    return String(explicit)

  return String(props.indexKey ?? props.customId ?? instanceMsgId)
}

function getVirtualThreadKey() {
  const key = props.virtualScroll?.threadKey
  return key == null || key === '' ? undefined : String(key)
}

function isSameVirtualThreadKey(threadKey: string | undefined) {
  return (threadKey ?? '') === (getVirtualThreadKey() ?? '')
}

function getVirtualMeasurementKey() {
  const key = props.virtualScroll?.measurementKey
  return key == null ? '' : String(key)
}

function getCurrentVirtualWidth() {
  return experimentContainerWidth.value || containerRef.value?.clientWidth || 0
}

const virtualLayoutWidthBucket = computed(() => {
  const width = getCurrentVirtualWidth()
  if (!Number.isFinite(width) || width <= 0)
    return 0
  return Math.round(width / HEIGHT_CACHE_WIDTH_BUCKET_PX)
})

const virtualLayoutEpochKey = computed(() => {
  return [
    getVirtualMeasurementKey(),
    virtualLayoutWidthBucket.value,
  ].join('\u0000')
})

function getVisibleDomHeight() {
  let total = 0
  for (const el of nodeContentElements.values())
    total += el?.offsetHeight ?? 0
  return total || containerRef.value?.offsetHeight || 0
}

let imperativeVirtualSettleSessionKey: string | null = null
let imperativeVirtualSettleThreadKey: string | undefined

function hasManualSettleSignal(token: unknown) {
  return token !== false && token != null
}

function isInternalLayoutSettled() {
  return effectiveFinal.value === true
    && !contentStreamingTailActive.value
    && pendingAsyncNodeCount.value === 0
    && activeHeightSettlingTimers.size === 0
    && pendingHeightMeasurements.size === 0
    && heightMeasurementRaf == null
    && renderedCount.value >= desiredRenderedCount.value
}

function isHostSettleConfirmed() {
  if (props.virtualScroll?.settleMode !== 'manual')
    return true

  if (hasManualSettleSignal(props.virtualScroll?.settledToken))
    return true

  return imperativeVirtualSettleSessionKey === getVirtualSessionKey()
    && imperativeVirtualSettleThreadKey === getVirtualThreadKey()
}

function isLayoutSettled() {
  return isInternalLayoutSettled() && isHostSettleConfirmed()
}

function resolveVirtualPhase(phase?: MarkstreamVirtualPhase): MarkstreamVirtualPhase {
  if (phase)
    return phase
  if (effectiveFinal.value !== true)
    return parsedNodes.value.length > 0 ? 'streaming' : 'estimating'
  if (renderedCount.value < desiredRenderedCount.value || pendingHeightMeasurements.size > 0 || heightMeasurementRaf != null)
    return 'measuring'
  return isLayoutSettled() ? 'settled' : 'settling'
}

function resolveVirtualConfidence(
  phase: MarkstreamVirtualPhase,
  report: Pick<VirtualHeightSummary, 'totalNodes' | 'measuredCount' | 'estimatedCount'>,
) {
  if (report.totalNodes <= 0)
    return phase === 'final' ? 'final' : 'estimate'

  if (report.measuredCount >= report.totalNodes)
    return phase === 'final' ? 'final' : 'measured'

  if (report.measuredCount > 0 || report.estimatedCount > 0)
    return 'mixed'

  return 'estimate'
}

function getVirtualMetrics(
  reason: MarkstreamVirtualReason = 'manual',
  phase?: MarkstreamVirtualPhase,
): MarkstreamVirtualMetrics {
  const summary = buildVirtualHeightSummary()
  const resolvedPhase = resolveVirtualPhase(phase)

  return {
    sessionKey: getVirtualSessionKey(),
    threadKey: getVirtualThreadKey(),
    phase: resolvedPhase,
    nodeCount: summary.totalNodes,
    liveRange: { start: liveRange.start, end: liveRange.end },
    renderedCount: renderedCount.value,
    measuredCount: summary.measuredCount,
    estimatedCount: summary.estimatedCount,
    averageNodeHeight: summary.averageNodeHeight,
    topSpacerHeight: summary.topSpacerHeight,
    bottomSpacerHeight: summary.bottomSpacerHeight,
    visibleDomHeight: getVisibleDomHeight(),
    totalHeight: summary.estimatedTotalHeight,
    width: summary.width,
    final: effectiveFinal.value === true,
    stable: isLayoutSettled(),
    confidence: resolveVirtualConfidence(resolvedPhase, summary),
    reason,
  }
}

function getScrollBox() {
  const root = scrollRootElement.value || resolveScrollContainer()
  const container = containerRef.value
  if (!root || !container)
    return null

  const doc = root.ownerDocument || container.ownerDocument || document
  const isViewportRoot = root === doc.documentElement
    || root === doc.body
    || root === doc.scrollingElement
  const scrollTop = getNormalizedScrollTop(root, doc, isViewportRoot)
  const scrollHeight = isViewportRoot
    ? Math.max(doc.documentElement?.scrollHeight ?? 0, doc.body?.scrollHeight ?? 0, root.scrollHeight ?? 0)
    : root.scrollHeight
  const clientHeight = isViewportRoot
    ? (doc.documentElement?.clientHeight || root.clientHeight || 0)
    : root.clientHeight

  return {
    root,
    doc,
    isViewportRoot,
    scrollTop,
    scrollHeight,
    clientHeight,
  }
}

function getRendererLogicalHeight() {
  const total = parsedNodes.value.length
  return Math.max(
    0,
    containerRef.value?.scrollHeight ?? 0,
    containerRef.value?.offsetHeight ?? 0,
    estimateHeightRange(0, total),
  )
}

function getViewportBottomInRoot(box: NonNullable<ReturnType<typeof getScrollBox>>) {
  return box.isViewportRoot
    ? box.clientHeight
    : box.root.getBoundingClientRect().bottom
}

function getRendererBottomDistanceFromViewport(
  box: NonNullable<ReturnType<typeof getScrollBox>>,
) {
  const container = containerRef.value
  if (!container)
    return null

  const containerRect = container.getBoundingClientRect()
  const viewportBottom = getViewportBottomInRoot(box)

  return viewportBottom - containerRect.bottom
}

function captureBottomVirtualAnchor(): MarkstreamVirtualAnchor | null {
  const box = getScrollBox()
  const container = containerRef.value
  if (!box || !container)
    return null

  const rendererBottomDistance = getRendererBottomDistanceFromViewport(box)
  if (rendererBottomDistance == null)
    return null

  const rendererBottomIsNearViewportBottom
    = rendererBottomDistance >= -8
      && rendererBottomDistance <= BOTTOM_ANCHOR_CAPTURE_MAX_DISTANCE_PX

  if (!rendererBottomIsNearViewportBottom)
    return null

  return {
    type: 'bottom',
    distanceFromBottomPx: Math.max(0, rendererBottomDistance),
  }
}

function captureVirtualAnchor(): MarkstreamVirtualAnchor | null {
  const bottomAnchor = captureBottomVirtualAnchor()
  if (bottomAnchor)
    return bottomAnchor

  const anchor = captureRestoreAnchor()
  if (!anchor)
    return null

  return {
    type: 'node',
    nodeIndex: anchor.nodeIndex,
    offsetWithinNodePx: anchor.offsetWithinNodePx,
  }
}

function hashVirtualString(input: string) {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

function getNodeHeightCacheSignature(index: number) {
  const node = parsedNodes.value[index] as any
  if (!node)
    return ''

  const type = String(node.type ?? '')
  const language = String(node.language ?? '')
  const loading = node.loading === true ? '1' : '0'
  const raw = String(node.raw ?? '')
  const content = String(node.content ?? node.code ?? '')
  const payloadHash = hashVirtualString(raw || content)

  return [
    type,
    language,
    loading,
    payloadHash,
  ].join('\u0000')
}

function getVirtualContentHash() {
  let hash = 2166136261

  for (let i = 0; i < parsedNodes.value.length; i++) {
    const signature = getNodeHeightCacheSignature(i)
    for (let j = 0; j < signature.length; j++) {
      hash ^= signature.charCodeAt(j)
      hash = Math.imul(hash, 16777619)
    }
  }

  return (hash >>> 0).toString(36)
}

function exportVirtualHeightCache(): MarkstreamHeightCache {
  return exportHeightCache()
    .map((entry): MarkstreamHeightCache[number] | null => {
      const node = parsedNodes.value[entry.index] as any
      if (!node)
        return null

      return {
        ...entry,
        nodeType: String(node.type ?? ''),
        signature: getNodeHeightCacheSignature(entry.index),
      }
    })
    .filter((entry): entry is MarkstreamHeightCache[number] => Boolean(entry))
}

function isHeightCacheEntryCompatible(entry: MarkstreamHeightCache[number]) {
  const node = parsedNodes.value[entry.index] as any
  if (!node)
    return false

  if (entry.nodeType && entry.nodeType !== String(node.type ?? ''))
    return false

  if (entry.signature && entry.signature !== getNodeHeightCacheSignature(entry.index))
    return false

  return true
}

function captureVirtualStateFromMetrics(
  metrics: MarkstreamVirtualMetrics,
  options: {
    includeHeightCache?: boolean
    includeContentHash?: boolean
  } = {},
): MarkstreamVirtualState | null {
  const anchor = captureVirtualAnchor()
  if (!anchor)
    return null

  const includeHeightCache = options.includeHeightCache === true
  const includeContentHash = options.includeContentHash ?? includeHeightCache
  const heightCache = includeHeightCache
    ? exportVirtualHeightCache()
    : []

  return {
    sessionKey: metrics.sessionKey,
    threadKey: metrics.threadKey,
    anchor,
    metrics,
    width: metrics.width,
    contentHash: includeContentHash ? getVirtualContentHash() : undefined,
    measurementKey: getVirtualMeasurementKey() || undefined,
    heightCache: heightCache.length ? heightCache : undefined,
  }
}

function captureVirtualState() {
  return captureVirtualStateFromMetrics(getVirtualMetrics('manual'), {
    includeHeightCache: true,
  })
}

function setNormalizedScrollTop(root: HTMLElement, doc: Document, targetNormalized: number) {
  const target = Math.max(0, targetNormalized)

  if (!isReverseFlexScrollRoot(root)) {
    root.scrollTop = target
    return
  }

  const max = Math.max(0, (root.scrollHeight ?? 0) - (root.clientHeight ?? 0))
  const distanceFromBottom = Math.max(0, max - target)

  root.scrollTop = -distanceFromBottom

  const afterNegative = getNormalizedScrollTop(root, doc, false)
  if (Math.abs(afterNegative - target) <= 2)
    return

  root.scrollTop = distanceFromBottom
}

function applyBottomVirtualAnchor(anchor: Extract<MarkstreamVirtualAnchor, { type: 'bottom' }>) {
  const box = getScrollBox()
  const container = containerRef.value
  if (!box || !container)
    return

  const rendererTop = getOffsetTopWithinRoot(container, box.root)
  const rendererHeight = getRendererLogicalHeight()
  const distance = Math.max(0, anchor.distanceFromBottomPx)

  const target = Math.max(
    0,
    rendererTop + rendererHeight - box.clientHeight + distance,
  )

  if (box.isViewportRoot) {
    box.doc.defaultView?.scrollTo?.(0, target)
    return
  }

  setNormalizedScrollTop(box.root, box.doc, target)
}

const virtualBottomRestoreTimers: number[] = []

function clearVirtualBottomRestoreTimers() {
  if (!isClient)
    return

  if (virtualBottomRestoreRaf != null) {
    cancelFrame?.(virtualBottomRestoreRaf)
    virtualBottomRestoreRaf = null
  }

  while (virtualBottomRestoreTimers.length) {
    const timer = virtualBottomRestoreTimers.pop()
    if (timer != null)
      window.clearTimeout(timer)
  }
}

function clearActiveVirtualBottomAnchor() {
  activeVirtualBottomAnchor.value = null
  clearVirtualBottomRestoreTimers()
}

function scheduleVirtualBottomRestoreReconcile() {
  if (!activeVirtualBottomAnchor.value || !isClient)
    return

  if (virtualBottomRestoreRaf != null)
    return

  const run = () => {
    virtualBottomRestoreRaf = null

    const anchor = activeVirtualBottomAnchor.value
    if (anchor)
      applyBottomVirtualAnchor(anchor)
  }

  virtualBottomRestoreRaf = requestFrame
    ? requestFrame(run)
    : null

  if (virtualBottomRestoreRaf == null)
    run()
}

function handleVirtualScrollRootScroll() {
  const anchor = activeVirtualBottomAnchor.value
  if (!anchor)
    return

  const box = getScrollBox()
  if (!box)
    return

  const rendererBottomDistance = getRendererBottomDistanceFromViewport(box)
  if (rendererBottomDistance == null) {
    clearActiveVirtualBottomAnchor()
    return
  }

  if (
    rendererBottomDistance < -BOTTOM_ANCHOR_RELEASE_THRESHOLD_PX
    || (
      Math.abs(
        Math.max(0, rendererBottomDistance) - Math.max(0, anchor.distanceFromBottomPx),
      ) > BOTTOM_ANCHOR_RELEASE_THRESHOLD_PX
    )
  ) {
    clearActiveVirtualBottomAnchor()
  }
}

function restoreVirtualAnchor(anchor: MarkstreamVirtualAnchor) {
  if (anchor.type === 'node') {
    clearActiveVirtualBottomAnchor()

    restoreAnchor({
      nodeIndex: anchor.nodeIndex,
      offsetWithinNodePx: anchor.offsetWithinNodePx,
    })
    return
  }

  clearRestoreReconcile()
  activeRestoreAnchor.value = null
  activeVirtualBottomAnchor.value = anchor
  clearVirtualBottomRestoreTimers()

  applyBottomVirtualAnchor(anchor)

  if (!isClient)
    return

  for (const delay of [0, 120, 280, 480]) {
    virtualBottomRestoreTimers.push(window.setTimeout(() => {
      const activeAnchor = activeVirtualBottomAnchor.value
      if (activeAnchor)
        applyBottomVirtualAnchor(activeAnchor)
    }, delay))
  }
}

function getBoundedHeightCache(
  cache: MarkstreamHeightCache,
  options: { requireCompatibilityMetadata?: boolean } = {},
) {
  const length = parsedNodes.value.length
  if (length <= 0)
    return []
  return cache.filter((entry) => {
    if (!Number.isInteger(entry.index) || entry.index < 0 || entry.index >= length)
      return false

    if (!Number.isFinite(entry.height) || entry.height <= 0)
      return false

    if (options.requireCompatibilityMetadata && !entry.nodeType && !entry.signature)
      return false

    return isHeightCacheEntryCompatible(entry)
  })
}

function canReuseHeightCacheForWidth(savedWidth: number | null | undefined) {
  const currentWidth = getCurrentVirtualWidth()

  if (!Number.isFinite(currentWidth) || currentWidth <= 0)
    return false

  if (!Number.isFinite(savedWidth) || Number(savedWidth) <= 0)
    return false

  return Math.abs(currentWidth - Number(savedWidth)) <= HEIGHT_CACHE_WIDTH_BUCKET_PX
}

function getVirtualStateSavedWidth(state: MarkstreamVirtualState | null | undefined) {
  return state?.width || state?.metrics.width || null
}

function canRestoreVirtualStateCache(state: MarkstreamVirtualState) {
  if (state.sessionKey !== getVirtualSessionKey())
    return false

  if (!isSameVirtualThreadKey(state.threadKey))
    return false

  if ((state.measurementKey ?? '') !== getVirtualMeasurementKey())
    return false

  if (!canReuseHeightCacheForWidth(getVirtualStateSavedWidth(state)))
    return false

  if (!hasRestoreCacheCompatibilityMetadata(state))
    return false

  return true
}

function hasRestoreCacheCompatibilityMetadata(state: MarkstreamVirtualState) {
  if (!state.heightCache?.length)
    return false

  if (state.contentHash)
    return state.contentHash === getVirtualContentHash()

  return state.heightCache.every(entry => Boolean(entry.nodeType || entry.signature))
}

function canReuseStandaloneHeightCache() {
  const cacheWidth = props.virtualScroll?.heightCacheWidth
  return canReuseHeightCacheForWidth(cacheWidth)
}

let lastImportedVirtualHeightCacheSignature: string | null = null
let lastImportedVirtualHeightCacheSource: 'restore' | 'standalone' | null = null
let lastAppliedVirtualRestoreSignature: string | null = null
let pendingImperativeVirtualRestoreState: MarkstreamVirtualState | null = null

function getHeightCacheSignature(cache: MarkstreamHeightCache) {
  let checksum = 0
  for (const entry of cache) {
    checksum += (entry.index + 1) * 31
    checksum += Math.round(entry.height * 10)
  }

  const widthBucket = Math.round(getCurrentVirtualWidth() / HEIGHT_CACHE_WIDTH_BUCKET_PX)

  return [
    getVirtualThreadKey() ?? '',
    getVirtualSessionKey(),
    getVirtualMeasurementKey(),
    parsedNodes.value.length,
    widthBucket,
    cache.length,
    checksum,
  ].join(':')
}

function tryImportVirtualHeightCache(cache = props.virtualScroll?.heightCache) {
  if (!virtualScrollEnabled.value || !cache?.length)
    return false

  if (parsedNodes.value.length <= 0)
    return false

  if (!canReuseStandaloneHeightCache())
    return false

  const boundedCache = getBoundedHeightCache(cache, {
    requireCompatibilityMetadata: true,
  })

  if (!boundedCache.length)
    return false

  const signature = getHeightCacheSignature(boundedCache)
  if (signature === lastImportedVirtualHeightCacheSignature) {
    lastImportedVirtualHeightCacheSource = 'standalone'
    return true
  }

  importHeightCache(boundedCache, { mode: 'merge' })
  markFallbackHeightPrefixDirty()
  lastImportedVirtualHeightCacheSignature = signature
  lastImportedVirtualHeightCacheSource = 'standalone'
  scheduleVirtualMetricsEmit('restore')
  return true
}

function getVirtualRestoreAnchorToken() {
  const token = props.virtualScroll?.restoreAnchor

  if (token == null || token === false)
    return null

  return token === true ? 'true' : String(token)
}

function getVirtualAnchorRestoreSignature(
  state: MarkstreamVirtualState,
  token: string,
) {
  const anchor = state.anchor
  const anchorKey = anchor.type === 'bottom'
    ? `bottom:${Math.round(anchor.distanceFromBottomPx)}`
    : `node:${anchor.nodeIndex}:${Math.round(anchor.offsetWithinNodePx)}`

  return [
    getVirtualThreadKey() ?? '',
    getVirtualSessionKey(),
    getVirtualMeasurementKey(),
    virtualLayoutWidthBucket.value,
    token,
    anchorKey,
  ].join(':')
}

function applyVirtualRestoreState(
  state: MarkstreamVirtualState | null | undefined,
  options: {
    restoreAnchor?: boolean
    restoreToken?: string
  } = {},
) {
  if (!virtualScrollEnabled.value || !state)
    return false

  if (state.sessionKey !== getVirtualSessionKey())
    return false

  if (!isSameVirtualThreadKey(state.threadKey))
    return false

  if (parsedNodes.value.length <= 0)
    return false

  let importedCache = false

  if (state.heightCache?.length && canRestoreVirtualStateCache(state)) {
    const boundedCache = getBoundedHeightCache(state.heightCache, {
      requireCompatibilityMetadata: !state.contentHash,
    })

    if (boundedCache.length) {
      importHeightCache(boundedCache, { mode: 'merge' })
      markFallbackHeightPrefixDirty()
      lastImportedVirtualHeightCacheSignature = getHeightCacheSignature(boundedCache)
      lastImportedVirtualHeightCacheSource = 'restore'
      importedCache = true
    }
  }

  if (!options.restoreAnchor) {
    if (importedCache)
      scheduleVirtualMetricsEmit('restore')
    return true
  }

  const restoreToken = options.restoreToken ?? 'imperative'
  const signature = getVirtualAnchorRestoreSignature(state, restoreToken)

  if (lastAppliedVirtualRestoreSignature === signature)
    return true

  lastAppliedVirtualRestoreSignature = signature
  restoreVirtualAnchor(state.anchor)
  scheduleVirtualMetricsEmit('restore')
  return true
}

function shouldKeepPendingVirtualRestoreState(state: MarkstreamVirtualState) {
  return Boolean(
    state.heightCache?.length
    && !canReuseHeightCacheForWidth(getVirtualStateSavedWidth(state)),
  )
}

function restoreVirtualState(state: MarkstreamVirtualState) {
  pendingImperativeVirtualRestoreState = state

  if (
    applyVirtualRestoreState(state, {
      restoreAnchor: true,
      restoreToken: 'imperative',
    })
    && !shouldKeepPendingVirtualRestoreState(state)
  ) {
    pendingImperativeVirtualRestoreState = null
  }
}

function forceFlushPendingHeightMeasurements() {
  if (heightMeasurementRaf != null) {
    cancelFrame?.(heightMeasurementRaf)
    heightMeasurementRaf = null
  }
  flushPendingHeightMeasurements()
}

function waitForVirtualFrame() {
  if (!isClient)
    return Promise.resolve()

  return new Promise<void>((resolve) => {
    if (requestFrame) {
      requestFrame(() => resolve())
      return
    }
    window.setTimeout(resolve, 0)
  })
}

function waitForVirtualTimeout(timeoutMs: number) {
  if (!isClient || timeoutMs <= 0)
    return Promise.resolve()
  return new Promise<void>(resolve => window.setTimeout(resolve, timeoutMs))
}

async function forceMeasure(reason: MarkstreamVirtualReason = 'manual') {
  await nextTick()
  measureTrackedNodeHeights()
  forceFlushPendingHeightMeasurements()
  const metrics = getVirtualMetrics(reason)
  emitVirtualMetricsNow(metrics, true)
  return metrics
}

function isSameVirtualSession(
  sessionKey: string,
  threadKey = getVirtualThreadKey(),
  layoutEpochKey = virtualLayoutEpochKey.value,
) {
  return getVirtualSessionKey() === sessionKey
    && getVirtualThreadKey() === threadKey
    && virtualLayoutEpochKey.value === layoutEpochKey
}

async function settle(options: {
  frames?: number
  timeoutMs?: number
  reason?: MarkstreamVirtualReason
} = {}) {
  const sessionKeyAtStart = getVirtualSessionKey()
  const threadKeyAtStart = getVirtualThreadKey()
  const layoutEpochKeyAtStart = virtualLayoutEpochKey.value
  const frames = options.frames ?? 2
  const timeoutMs = options.timeoutMs ?? 120
  const reason = options.reason ?? 'manual'

  for (let i = 0; i < frames; i++) {
    await nextTick()
    if (!isSameVirtualSession(sessionKeyAtStart, threadKeyAtStart, layoutEpochKeyAtStart))
      return getVirtualMetrics(reason)

    await waitForVirtualFrame()
    if (!isSameVirtualSession(sessionKeyAtStart, threadKeyAtStart, layoutEpochKeyAtStart))
      return getVirtualMetrics(reason)

    measureTrackedNodeHeights()
    forceFlushPendingHeightMeasurements()
  }

  await waitForVirtualTimeout(timeoutMs)
  if (!isSameVirtualSession(sessionKeyAtStart, threadKeyAtStart, layoutEpochKeyAtStart))
    return getVirtualMetrics(reason)

  measureTrackedNodeHeights()
  forceFlushPendingHeightMeasurements()

  if (!isSameVirtualSession(sessionKeyAtStart, threadKeyAtStart, layoutEpochKeyAtStart))
    return getVirtualMetrics(reason)

  if (isInternalLayoutSettled()) {
    imperativeVirtualSettleSessionKey = sessionKeyAtStart
    imperativeVirtualSettleThreadKey = threadKeyAtStart
  }

  const finalPhase = isSameVirtualSession(sessionKeyAtStart, threadKeyAtStart, layoutEpochKeyAtStart) && isLayoutSettled()
  const metrics = getVirtualMetrics(reason, finalPhase ? 'final' : undefined)
  emitVirtualMetricsNow(metrics, true)
  return metrics
}

function scrollToNode(
  index: number,
  align: 'start' | 'center' | 'end' | 'nearest' = 'start',
) {
  const total = parsedNodes.value.length
  if (total <= 0)
    return

  const boundedIndex = clamp(index, 0, total - 1)
  const nodeTop = resolveAnchorOffset({
    nodeIndex: boundedIndex,
    offsetWithinNodePx: 0,
  })
  const nodeHeight = getFallbackNodeHeight(boundedIndex)
  const box = getScrollBox()
  const viewportHeight = box?.clientHeight ?? 0
  const current = getRelativeScrollTopWithinContainer()

  let target = nodeTop
  if (align === 'center') {
    target = nodeTop - viewportHeight / 2 + nodeHeight / 2
  }
  else if (align === 'end') {
    target = nodeTop - viewportHeight + nodeHeight
  }
  else if (align === 'nearest' && current != null) {
    if (nodeTop >= current && nodeTop + nodeHeight <= current + viewportHeight)
      return
    target = nodeTop < current ? nodeTop : nodeTop - viewportHeight + nodeHeight
  }

  setRelativeScrollTopWithinContainer(Math.max(0, target))
}

let pendingVirtualMetricsReason: MarkstreamVirtualReason = 'content'
let virtualMetricsEmitRaf: number | null = null
let virtualMetricsEmitTimer: number | null = null
let lastVirtualEmitAt = 0
let lastEmittedVirtualMetrics: MarkstreamVirtualMetrics | null = null
let lastSettledVirtualSignature: string | null = null
let lastFinalVirtualSignature: string | null = null

function getVirtualNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function shouldEmitVirtualMetrics(metrics: MarkstreamVirtualMetrics) {
  const previous = lastEmittedVirtualMetrics
  if (!previous)
    return true

  const threshold = props.virtualScroll?.heightDiffThresholdPx ?? 1

  return Math.abs(metrics.totalHeight - previous.totalHeight) > threshold
    || metrics.phase !== previous.phase
    || metrics.stable !== previous.stable
    || metrics.final !== previous.final
    || metrics.threadKey !== previous.threadKey
    || metrics.nodeCount !== previous.nodeCount
    || metrics.measuredCount !== previous.measuredCount
    || metrics.width !== previous.width
}

function emitVirtualMetricsNow(metrics: MarkstreamVirtualMetrics, force = false) {
  if (!virtualScrollEnabled.value)
    return

  const shouldEmit = force || shouldEmitVirtualMetrics(metrics)
  const shouldIncludeHeightCache = force || metrics.stable || metrics.phase === 'final'

  if (shouldEmit) {
    emitHeightChange(metrics)
    lastEmittedVirtualMetrics = metrics
    lastVirtualEmitAt = getVirtualNow()

    const state = captureVirtualStateFromMetrics(metrics, {
      includeHeightCache: shouldIncludeHeightCache,
    })
    if (state) {
      emitVirtualStateChange(state)
      emitAnchorChange(state.anchor)
    }
  }

  const settledSignature = [
    metrics.threadKey ?? '',
    metrics.sessionKey,
    getVirtualMeasurementKey(),
    virtualLayoutWidthBucket.value,
    metrics.nodeCount,
    Math.round(metrics.totalHeight),
    Math.round(metrics.width),
  ].join(':')
  if (metrics.stable && lastSettledVirtualSignature !== settledSignature) {
    const settledState = captureVirtualStateFromMetrics(metrics, {
      includeHeightCache: true,
    })
    if (settledState)
      emitVirtualStateChange(settledState)

    emitRenderSettled(metrics)
    lastSettledVirtualSignature = settledSignature
  }
  else if (!metrics.stable) {
    lastSettledVirtualSignature = null
  }

  if (metrics.phase === 'final' && lastFinalVirtualSignature !== settledSignature) {
    const finalState = captureVirtualStateFromMetrics(metrics, {
      includeHeightCache: true,
    })
    if (finalState)
      emitVirtualStateChange(finalState)

    emitRenderFinal(metrics)
    lastFinalVirtualSignature = settledSignature
  }
}

function clearVirtualMetricsSchedule() {
  if (virtualMetricsEmitRaf != null) {
    cancelFrame?.(virtualMetricsEmitRaf)
    virtualMetricsEmitRaf = null
  }
  if (virtualMetricsEmitTimer != null && isClient) {
    window.clearTimeout(virtualMetricsEmitTimer)
    virtualMetricsEmitTimer = null
  }
}

function flushVirtualMetricsEmit() {
  virtualMetricsEmitRaf = null
  virtualMetricsEmitTimer = null
  emitVirtualMetricsNow(getVirtualMetrics(pendingVirtualMetricsReason))
}

function scheduleVirtualMetricsEmit(reason: MarkstreamVirtualReason) {
  if (!virtualScrollEnabled.value)
    return

  pendingVirtualMetricsReason = reason
  if (virtualMetricsEmitRaf != null || virtualMetricsEmitTimer != null)
    return

  const interval = Math.max(0, props.virtualScroll?.emitIntervalMs ?? 32)
  const waitMs = Math.max(0, interval - (getVirtualNow() - lastVirtualEmitAt))
  const scheduleFrame = () => {
    virtualMetricsEmitTimer = null
    virtualMetricsEmitRaf = requestFrame
      ? requestFrame(flushVirtualMetricsEmit)
      : null

    if (virtualMetricsEmitRaf == null)
      flushVirtualMetricsEmit()
  }

  if (isClient && waitMs > 0) {
    virtualMetricsEmitTimer = window.setTimeout(scheduleFrame, waitMs)
    return
  }

  scheduleFrame()
}

defineExpose<MarkstreamRendererHandle>({
  getVirtualMetrics,
  captureVirtualState,
  restoreVirtualState,
  forceMeasure,
  settle,
  scrollToNode,
})

function estimateIndexForOffset(offsetPx: number) {
  if (offsetPx <= 0)
    return 0
  const nodes = parsedNodes.value
  if (heightEstimationActive.value) {
    return estimateIndexForOffsetFromPrefix(offsetPx)
  }
  if (heightTreeSize.value === nodes.length && heightSumTree.value.length && heightKnownTree.value.length) {
    const avg = averageNodeHeight.value
    const sumTree = heightSumTree.value
    const countTree = heightKnownTree.value
    const prefix = (endExclusive: number) => {
      if (endExclusive <= 0)
        return 0
      const sumKnown = fenwickRangeSum(sumTree, 0, endExclusive)
      const countKnown = fenwickRangeSum(countTree, 0, endExclusive)
      return sumKnown + (endExclusive - countKnown) * avg
    }
    let low = 0
    let high = nodes.length - 1
    let ans = nodes.length - 1
    while (low <= high) {
      const mid = (low + high) >> 1
      const height = prefix(mid + 1)
      if (height >= offsetPx) {
        ans = mid
        high = mid - 1
      }
      else {
        low = mid + 1
      }
    }
    return ans
  }
  let remaining = offsetPx
  for (let i = 0; i < nodes.length; i++) {
    const height = nodeHeights[i] ?? averageNodeHeight.value
    if (remaining <= height)
      return i
    remaining -= height
  }
  return Math.max(0, nodes.length - 1)
}

function estimateIndexForOffsetFromEnd(offsetPx: number) {
  const nodes = parsedNodes.value
  if (!nodes.length)
    return 0
  if (offsetPx <= 0)
    return Math.max(0, nodes.length - 1)
  if (heightEstimationActive.value) {
    const prefix = getFallbackHeightPrefix()
    const totalHeight = prefix[nodes.length] ?? 0
    return estimateIndexForOffsetFromPrefix(Math.max(0, totalHeight - offsetPx))
  }
  if (heightTreeSize.value === nodes.length) {
    const totalHeight = estimateHeightRange(0, nodes.length)
    const target = Math.max(0, totalHeight - offsetPx)
    return estimateIndexForOffset(target)
  }
  let remaining = offsetPx
  for (let i = nodes.length - 1; i >= 0; i--) {
    const height = nodeHeights[i] ?? averageNodeHeight.value
    if (remaining <= height)
      return i
    remaining -= height
  }
  return 0
}

function bumpNodeSlotVersion() {
  nodeSlotVersion.value += 1
}

function shouldRenderNode(index: number) {
  // Respect incremental rendering budget only when incremental batching
  // is active (virtualization disabled). Otherwise render immediately.
  if (incrementalRenderingActive.value && index >= renderedCount.value)
    return false
  if (!deferNodes.value)
    return true
  if (index < resolvedInitialBatch.value)
    return true
  return visibleNodeIndices.value.has(index)
}

function destroyNodeHandle(index: number) {
  const stopWatchingVisibility = nodeVisibilityWatchStops.get(index)
  if (stopWatchingVisibility) {
    stopWatchingVisibility()
    nodeVisibilityWatchStops.delete(index)
  }
  const handle = nodeVisibilityHandles.get(index)
  if (handle) {
    handle.destroy()
    nodeVisibilityHandles.delete(index)
  }
  clearVisibilityFallback(index)
}

function setNodeSlotElement(index: number, el: HTMLElement | null) {
  let slotsChanged = false
  if (el) {
    const prev = nodeSlotElements.get(index)
    nodeSlotElements.set(index, el)
    if (prev !== el)
      slotsChanged = true
  }
  else if (nodeSlotElements.delete(index)) {
    slotsChanged = true
  }
  if (slotsChanged)
    bumpNodeSlotVersion()
  if (!el)
    clearVisibilityFallback(index)

  if (!shouldObserveSlots.value || !registerNodeVisibility) {
    destroyNodeHandle(index)
    if (el)
      markNodeVisible(index, true)
    return
  }

  if (
    !virtualizationEnabled.value
    && deferNodes.value
    && !viewportPriorityAutoDisabled.value
    && nodeVisibilityHandles.size >= MAX_VIEWPORT_OBSERVER_TARGETS
  ) {
    autoDisableViewportPriority('too-many-targets')
    if (!shouldObserveSlots.value || !registerNodeVisibility) {
      destroyNodeHandle(index)
      if (el)
        markNodeVisible(index, true)
      return
    }
  }

  if (index < resolvedInitialBatch.value && !virtualizationEnabled.value) {
    destroyNodeHandle(index)
    markNodeVisible(index, true)
    return
  }

  if (visibleNodeIndices.value.has(index)) {
    destroyNodeHandle(index)
    markNodeVisible(index, true)
    return
  }

  if (!el) {
    destroyNodeHandle(index)
    return
  }

  destroyNodeHandle(index)
  const handle = registerNodeVisibility(el, { rootMargin: '400px' })
  if (!handle)
    return
  nodeVisibilityHandles.set(index, handle)
  markNodeVisible(index, handle.isVisible.value)
  if (deferNodes.value)
    scheduleVisibilityFallback(index)
  let stopWatchingVisibility: (() => void) | null = null
  stopWatchingVisibility = watch(
    () => handle.isVisible.value,
    (visible) => {
      if (!visible)
        return
      clearVisibilityFallback(index)
      markNodeVisible(index, true)
      stopWatchingVisibility?.()
      nodeVisibilityWatchStops.delete(index)
      // Once visibility is confirmed we can release the handle reference so
      // long-lived renders (no virtualization) do not leak observers.
      if (nodeVisibilityHandles.get(index) === handle)
        nodeVisibilityHandles.delete(index)
      try {
        handle.destroy()
      }
      catch {}
    },
    { immediate: true },
  )
  nodeVisibilityWatchStops.set(index, stopWatchingVisibility)

  if (virtualizationEnabled.value)
    scheduleFocusSync()
}

function flushPendingHeightMeasurements() {
  heightMeasurementRaf = null

  for (const [index, pending] of pendingHeightMeasurements) {
    pendingHeightMeasurements.delete(index)
    if (nodeContentElements.get(index) !== pending.el)
      continue
    if (nodeContentVersions.get(index) !== pending.version)
      continue
    recordNodeHeight(index, pending.height, { allowShrink: pending.allowShrink })
  }
}

function clearPendingHeightMeasurements() {
  if (heightMeasurementRaf != null) {
    cancelFrame?.(heightMeasurementRaf)
    heightMeasurementRaf = null
  }
  pendingHeightMeasurements.clear()
}

function bumpNodeContentVersion(index: number) {
  const next = (nodeContentVersions.get(index) ?? 0) + 1
  nodeContentVersions.set(index, next)
  return next
}

function queueNodeHeightRecord(index: number, el: HTMLElement, height: number) {
  if (!Number.isFinite(height) || height <= 0)
    return
  if (nodeContentElements.get(index) !== el)
    return

  const version = nodeContentVersions.get(index)
  if (version == null)
    return
  const node = parsedNodes.value[index] as (ParsedNode & { loading?: boolean }) | undefined
  const isContentStreamingTail = contentStreamingTailActive.value
    && effectiveFinal.value !== true
    && !props.nodes?.length
    && index >= parsedNodes.value.length - 2
  const allowShrink = !(node?.loading === true || isContentStreamingTail)
  const previous = pendingHeightMeasurements.get(index)
  const combinedAllowShrink = previous
    ? previous.allowShrink && allowShrink
    : allowShrink
  const nextHeight = previous && !combinedAllowShrink
    ? Math.max(previous.height, height)
    : height

  pendingHeightMeasurements.set(index, {
    height: nextHeight,
    allowShrink: combinedAllowShrink,
    version,
    el,
  })

  if (heightMeasurementRaf != null)
    return

  heightMeasurementRaf = requestFrame
    ? requestFrame(flushPendingHeightMeasurements)
    : null

  if (heightMeasurementRaf == null)
    flushPendingHeightMeasurements()
}

function measureNodeHeight(index: number, el: HTMLElement) {
  queueNodeHeightRecord(index, el, el.offsetHeight)
}

function measureTrackedNodeHeights() {
  for (const [index, el] of nodeContentElements) {
    if (el)
      measureNodeHeight(index, el)
  }
}

function clearFinalHeightConvergenceTimers() {
  while (finalHeightConvergenceTimers.length) {
    const timer = finalHeightConvergenceTimers.pop()
    clearHeightSettlingTimer(timer)
  }
}

function scheduleFinalHeightConvergence() {
  if (!isClient || !effectiveFinal.value || !nodeContentElements.size)
    return

  clearFinalHeightConvergenceTimers()
  for (const delay of [80, 240, 640]) {
    const timer = scheduleHeightSettlingTimer(delay, () => {
      for (const [index, el] of nodeContentElements) {
        if (el)
          measureNodeHeight(index, el)
      }
    }, 'final')

    if (timer != null)
      finalHeightConvergenceTimers.push(timer)
  }
}

function setNodeContentRef(index: number, el: HTMLElement | null) {
  if (!el)
    clearPendingAsyncNodeKeysForIndex(index)

  pendingHeightMeasurements.delete(index)
  bumpNodeContentVersion(index)
  const previousTimers = nodeContentDeferredMeasureTimers.get(index)
  if (previousTimers) {
    for (const id of previousTimers)
      clearHeightSettlingTimer(id)
    nodeContentDeferredMeasureTimers.delete(index)
  }
  const previousObserver = nodeContentResizeObservers.get(index)
  if (previousObserver) {
    previousObserver.disconnect()
    nodeContentResizeObservers.delete(index)
  }
  if (!el || !shouldMeasureNodeHeights.value) {
    nodeContentElements.delete(index)
    nodeContentVersions.delete(index)
    return
  }
  nodeContentElements.set(index, el)
  const measure = () => {
    measureNodeHeight(index, el)
  }
  queueMicrotask(measure)
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => {
      measure()
    })
    observer.observe(el)
    nodeContentResizeObservers.set(index, observer)
  }
  if (typeof window !== 'undefined') {
    const deferredMeasureDelays = parsedNodes.value[index]?.type === 'code_block'
      ? [16, 80, 240, 800]
      : effectiveFinal.value
        ? [80]
        : []

    if (deferredMeasureDelays.length) {
      const timers = deferredMeasureDelays
        .map(delay => scheduleHeightSettlingTimer(delay, measure, 'node-resize'))
        .filter((timer): timer is number => timer != null)

      if (timers.length)
        nodeContentDeferredMeasureTimers.set(index, timers)
    }
  }
}

watch(
  () => shouldMeasureNodeHeights.value,
  (enabled) => {
    if (enabled)
      return
    for (const observer of nodeContentResizeObservers.values())
      observer.disconnect()
    nodeContentResizeObservers.clear()
    for (const timers of nodeContentDeferredMeasureTimers.values()) {
      for (const id of timers)
        clearHeightSettlingTimer(id)
    }
    nodeContentDeferredMeasureTimers.clear()
    nodeContentVersions.clear()
    clearFinalHeightConvergenceTimers()
    clearPendingHeightMeasurements()
  },
  { immediate: true },
)

watch(
  effectiveFinal,
  (final) => {
    if (final)
      scheduleFinalHeightConvergence()
    scheduleVirtualMetricsEmit(final ? 'final' : 'content')
  },
)

watch(
  [() => parsedNodes.value.length, () => renderedCount.value],
  () => {
    if (activeVirtualBottomAnchor.value)
      scheduleVirtualBottomRestoreReconcile()

    scheduleVirtualMetricsEmit('content')
  },
  { flush: 'post', immediate: true },
)

watch(
  [() => liveRange.start, () => liveRange.end],
  () => {
    scheduleVirtualMetricsEmit('batch')
  },
  { flush: 'post' },
)

const VIEWPORT_FALLBACK_DELAY = 1800
const VIEWPORT_FALLBACK_MARGIN_PX = 500

function scheduleVisibilityFallback(index: number) {
  if (!isClient || !deferNodes.value)
    return
  clearVisibilityFallback(index)
  // Spread timers a bit so long documents don't cause a thundering herd.
  const jitter = (index % 17) * 23
  const timer = window.setTimeout(() => {
    nodeVisibilityFallbackTimers.delete(index)
    if (!deferNodes.value)
      return
    if (visibleNodeIndices.value.has(index))
      return
    const el = nodeSlotElements.get(index)
    if (!el)
      return

    const root = resolveScrollContainer(el)
    const doc = el.ownerDocument || document
    const view = doc.defaultView || window
    const isViewportRoot = !root || root === doc.documentElement || root === doc.body
    const rootRect = !isViewportRoot && root ? root.getBoundingClientRect() : null
    const viewportTop = isViewportRoot ? 0 : rootRect!.top
    const viewportBottom = isViewportRoot
      ? (view.innerHeight ?? root?.clientHeight ?? 0)
      : rootRect!.bottom
    const rect = el.getBoundingClientRect()
    const nearViewport = rect.bottom >= (viewportTop - VIEWPORT_FALLBACK_MARGIN_PX)
      && rect.top <= (viewportBottom + VIEWPORT_FALLBACK_MARGIN_PX)

    // Only force-render when we're reasonably close to the viewport. If the
    // element is far away we leave it to the IO callback to avoid creating
    // an always-running timer loop for large documents.
    if (nearViewport)
      markNodeVisible(index, true)
  }, VIEWPORT_FALLBACK_DELAY + jitter)
  nodeVisibilityFallbackTimers.set(index, timer)
}

function autoDisableViewportPriority(reason: 'too-many-targets') {
  if (viewportPriorityAutoDisabled.value)
    return
  viewportPriorityAutoDisabled.value = true
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV && typeof console !== 'undefined')
    console.warn('[markstream-vue] viewportPriority auto-disabled:', reason)

  destroyNodeVisibilityState()
}

const {
  cleanupBatchScheduler,
} = useBatchRenderingScheduler({
  props,
  isClient,
  isTestEnv,
  parsedNodesIdentity,
  parsedNodeCount,
  desiredRenderedCount,
  batchingEnabled,
  incrementalRenderingActive,
  resolvedBatchSize,
  resolvedInitialBatch,
  renderedCount,
  adaptiveBatchSize,
  previousRenderContext,
  previousBatchConfig,
  requestFrame,
  cancelFrame,
  hasIdleCallback,
  cleanupNodeVisibility,
  onDatasetKeyChanged: (total) => {
    clearPendingHeightMeasurements()
    resetHeightMeasurements()
    markFallbackHeightPrefixDirty()
    if (total > 0)
      rebuildHeightTrees(total)
  },
  onDatasetChanged: () => {
    if (virtualizationEnabled.value)
      scheduleFocusSync({ immediate: true })
  },
})

watch(
  [
    scrollListenerEnabled,
    virtualizationEnabled,
    () => containerRef.value,
    () => resolveVirtualScrollRoot(),
  ],
  ([listenerEnabled, virtualized]) => {
    if (!listenerEnabled) {
      cleanupScrollListener()
      cancelScheduledFocusSync()
      return
    }

    setupScrollListener()

    if (virtualized)
      scheduleFocusSync({ immediate: true })
    else
      cancelScheduledFocusSync()
  },
  { flush: 'post', immediate: true },
)

// Some scroll containers (e.g. `flex-direction: column-reverse` chat lists)
// report `scrollTop=0` when visually at the bottom. To avoid a blank initial
// viewport in virtualized mode, resync focus after the DOM has committed.
watch(
  [() => parsedNodes.value.length, () => virtualizationEnabled.value],
  async ([length, enabled]) => {
    if (!enabled || !length || !isClient)
      return
    await nextTick()
    scheduleFocusSync({ immediate: true })
  },
  { flush: 'post' },
)

watch(
  heightEstimationActive,
  (enabled) => {
    if (!enabled)
      return
    ensureExperimentProbeNodes()
  },
  { immediate: true },
)

watch(
  [() => containerRef.value, heightEstimationActive],
  () => {
    if (!heightEstimationActive.value) {
      cleanupExperimentResizeObserver()
      experimentContainerWidth.value = 0
      return
    }
    updateExperimentContainerWidth()
    setupExperimentResizeObserver()
  },
  { immediate: true },
)

watch(
  [heightEstimationActive, experimentProbeWidth],
  async () => {
    if (!heightEstimationActive.value) {
      simpleTextProbeProfile.value = createEmptySimpleTextProbeProfile()
      markFallbackHeightPrefixDirty()
      return
    }
    await nextTick()
    readSimpleTextProbeProfile()
  },
  { flush: 'post', immediate: true },
)

watch(
  () => parsedNodes.value.length,
  () => {
    if (virtualizationEnabled.value)
      scheduleFocusSync({ immediate: true })
  },
)

watch(
  [heightEstimationActive, experimentContainerWidth],
  () => {
    markFallbackHeightPrefixDirty()
    if (virtualizationEnabled.value)
      scheduleFocusSync({ immediate: true })
    if (activeRestoreAnchor.value)
      scheduleRestoreReconcile()
    if (activeVirtualBottomAnchor.value)
      scheduleVirtualBottomRestoreReconcile()
    scheduleVirtualMetricsEmit('resize')
  },
  { immediate: false },
)

watch(
  () => deferNodes.value,
  (enabled) => {
    if (!enabled) {
      destroyNodeVisibilityState()
      for (const [index, el] of nodeSlotElements) {
        if (el)
          markNodeVisible(index, true)
      }
      return
    }
    for (const [index, el] of nodeSlotElements)
      setNodeSlotElement(index, el)
  },
  { immediate: false },
)

watch(
  [() => props.viewportPriority, () => parsedNodes.value.length],
  ([enabled, length]) => {
    if (enabled === false) {
      viewportPriorityAutoDisabled.value = false
      return
    }
    if (viewportPriorityAutoDisabled.value && length <= VIEWPORT_PRIORITY_RECOVERY_COUNT)
      viewportPriorityAutoDisabled.value = false
  },
)

watch(
  () => renderedCount.value,
  () => {
    if (virtualizationEnabled.value)
      scheduleFocusSync({ immediate: true })
  },
)

watch(
  [focusIndex, maxLiveNodesResolved, liveNodeBufferResolved, () => parsedNodes.value.length, virtualizationEnabled],
  () => {
    updateLiveRange()
  },
  { immediate: true },
)

let autoSettledVirtualSignature: string | null = null
let manualSettleInFlight = false
let lastManualSettleSignature: string | null = null
let lastVirtualLayoutEpochKey: string | null = null

function getAutoVirtualSettleSignature() {
  const total = parsedNodes.value.length

  return [
    getVirtualThreadKey() ?? '',
    getVirtualSessionKey(),
    getVirtualMeasurementKey(),
    virtualLayoutWidthBucket.value,
    total,
    Math.round(estimateHeightRange(0, total)),
    Math.round(getCurrentVirtualWidth()),
    heightStats.count,
    Math.round(heightStats.total),
  ].join(':')
}

function resetVirtualSessionMeasurements() {
  clearPendingHeightMeasurements()
  resetHeightMeasurements()
  markFallbackHeightPrefixDirty()

  const total = parsedNodes.value.length
  if (total > 0)
    rebuildHeightTrees(total)
}

function resetVirtualSessionRuntimeState() {
  clearVirtualMetricsSchedule()
  clearAllHeightSettlingTimers()
  autoSettledVirtualSignature = null
  imperativeVirtualSettleSessionKey = null
  imperativeVirtualSettleThreadKey = undefined
  lastEmittedVirtualMetrics = null
  lastSettledVirtualSignature = null
  lastFinalVirtualSignature = null
  lastImportedVirtualHeightCacheSignature = null
  lastImportedVirtualHeightCacheSource = null
  lastAppliedVirtualRestoreSignature = null
  lastManualSettleSignature = null
  pendingImperativeVirtualRestoreState = null
  manualSettleInFlight = false

  pendingAsyncNodeCounts.clear()
  bumpAsyncNodeVersion()

  clearRestoreReconcile()
  clearActiveVirtualBottomAnchor()
}

function resetVirtualLayoutMeasurements(reason: MarkstreamVirtualReason = 'resize') {
  clearPendingHeightMeasurements()
  resetHeightMeasurements()
  markFallbackHeightPrefixDirty()

  const total = parsedNodes.value.length
  if (total > 0)
    rebuildHeightTrees(total)

  lastImportedVirtualHeightCacheSignature = null
  lastImportedVirtualHeightCacheSource = null
  lastAppliedVirtualRestoreSignature = null
  lastEmittedVirtualMetrics = null
  lastSettledVirtualSignature = null
  lastFinalVirtualSignature = null
  lastManualSettleSignature = null
  autoSettledVirtualSignature = null
  imperativeVirtualSettleSessionKey = null
  imperativeVirtualSettleThreadKey = undefined
  manualSettleInFlight = false

  tryImportVirtualHeightCache()

  void nextTick(() => {
    measureTrackedNodeHeights()

    if (activeRestoreAnchor.value)
      scheduleRestoreReconcile()
    if (activeVirtualBottomAnchor.value)
      scheduleVirtualBottomRestoreReconcile()

    scheduleVirtualMetricsEmit(reason)
  })
}

watch(
  virtualScrollEnabled,
  (enabled, previous) => {
    if (enabled === previous)
      return

    if (!enabled) {
      resetVirtualSessionRuntimeState()
      clearVirtualMetricsSchedule()
      return
    }

    resetVirtualSessionRuntimeState()
    resetVirtualSessionMeasurements()
    lastVirtualLayoutEpochKey = virtualLayoutEpochKey.value
    scheduleVirtualMetricsEmit('content')
  },
  { flush: 'post' },
)

watch(
  [virtualScrollEnabled, virtualLayoutEpochKey],
  ([enabled, epochKey]) => {
    if (!enabled) {
      lastVirtualLayoutEpochKey = null
      return
    }

    if (lastVirtualLayoutEpochKey == null) {
      lastVirtualLayoutEpochKey = epochKey
      return
    }

    if (lastVirtualLayoutEpochKey === epochKey)
      return

    lastVirtualLayoutEpochKey = epochKey
    resetVirtualLayoutMeasurements('resize')
  },
  { flush: 'post', immediate: true },
)

watch(
  [() => getVirtualSessionKey(), () => getVirtualThreadKey()],
  () => {
    resetVirtualSessionRuntimeState()
    resetVirtualSessionMeasurements()
    scheduleVirtualMetricsEmit('content')
  },
)

watch(
  [
    virtualScrollEnabled,
    () => props.virtualScroll?.heightCache,
    () => props.virtualScroll?.heightCacheWidth,
    () => props.virtualScroll?.restoreState,
    () => props.virtualScroll?.measurementKey,
    () => parsedNodes.value.length,
    () => getVirtualSessionKey(),
    experimentContainerWidth,
  ],
  () => {
    tryImportVirtualHeightCache()
  },
  { flush: 'post', immediate: true },
)

watch(
  [
    virtualScrollEnabled,
    () => props.virtualScroll?.restoreState,
    () => props.virtualScroll?.restoreAnchor,
    () => props.virtualScroll?.measurementKey,
    () => parsedNodes.value.length,
    () => getVirtualSessionKey(),
    experimentContainerWidth,
  ],
  async ([enabled, state]) => {
    if (!enabled || !state)
      return

    await nextTick()

    const restoreToken = getVirtualRestoreAnchorToken()
    applyVirtualRestoreState(state, {
      restoreAnchor: restoreToken != null,
      restoreToken: restoreToken ?? undefined,
    })
  },
  { flush: 'post', immediate: true },
)

watch(
  [virtualScrollEnabled, experimentContainerWidth, () => props.virtualScroll?.restoreState, () => props.virtualScroll?.measurementKey],
  ([enabled]) => {
    if (!enabled)
      return

    const state = props.virtualScroll?.restoreState
    if (!state || !lastImportedVirtualHeightCacheSignature)
      return

    if (lastImportedVirtualHeightCacheSource !== 'restore')
      return

    if (canRestoreVirtualStateCache(state))
      return

    resetVirtualSessionMeasurements()
    lastImportedVirtualHeightCacheSignature = null
    lastImportedVirtualHeightCacheSource = null
    scheduleVirtualMetricsEmit('resize')
  },
  { flush: 'post' },
)

watch(
  [
    virtualScrollEnabled,
    () => parsedNodes.value.length,
    () => getVirtualSessionKey(),
    experimentContainerWidth,
  ],
  async ([enabled]) => {
    if (!enabled || !pendingImperativeVirtualRestoreState)
      return

    await nextTick()

    if (
      pendingImperativeVirtualRestoreState
      && applyVirtualRestoreState(pendingImperativeVirtualRestoreState, {
        restoreAnchor: true,
        restoreToken: 'imperative',
      })
      && !shouldKeepPendingVirtualRestoreState(pendingImperativeVirtualRestoreState)
    ) {
      pendingImperativeVirtualRestoreState = null
    }
  },
  { flush: 'post', immediate: true },
)

watch(
  [
    virtualScrollEnabled,
    effectiveFinal,
    () => props.virtualScroll?.settleMode,
    () => getVirtualSessionKey(),
    () => getVirtualThreadKey(),
    virtualLayoutEpochKey,
    pendingAsyncNodeCount,
    pendingHeightSettlingTaskCount,
    () => renderedCount.value,
    desiredRenderedCount,
    () => heightStats.count,
    () => heightStats.total,
  ],
  ([enabled, final, settleMode]) => {
    if (!enabled || final !== true || settleMode === 'manual')
      return
    if (!isLayoutSettled())
      return

    const signature = getAutoVirtualSettleSignature()

    if (autoSettledVirtualSignature === signature)
      return

    autoSettledVirtualSignature = signature

    void settle({ reason: 'final' }).then((metrics) => {
      if (!metrics.stable && autoSettledVirtualSignature === signature)
        autoSettledVirtualSignature = null
    })
  },
  { flush: 'post', immediate: true },
)

function getManualSettleSignature(token: unknown) {
  return [
    getVirtualThreadKey() ?? '',
    getVirtualSessionKey(),
    getVirtualMeasurementKey(),
    virtualLayoutWidthBucket.value,
    String(token),
    parsedNodes.value.length,
    Math.round(estimateHeightRange(0, parsedNodes.value.length)),
    Math.round(getCurrentVirtualWidth()),
    heightStats.count,
    Math.round(heightStats.total),
  ].join(':')
}

async function runManualSettleIfReady() {
  const token = props.virtualScroll?.settledToken
  const sessionKeyAtStart = getVirtualSessionKey()
  const threadKeyAtStart = getVirtualThreadKey()
  const layoutEpochKeyAtStart = virtualLayoutEpochKey.value

  if (!virtualScrollEnabled.value)
    return
  if (props.virtualScroll?.settleMode !== 'manual')
    return
  if (!hasManualSettleSignal(token))
    return

  if (!isInternalLayoutSettled()) {
    scheduleVirtualMetricsEmit('manual')
    return
  }

  const signature = getManualSettleSignature(token)
  if (signature === lastManualSettleSignature || manualSettleInFlight)
    return

  manualSettleInFlight = true
  try {
    const metrics = await settle({ reason: 'manual' })
    if (
      metrics.sessionKey === sessionKeyAtStart
      && metrics.threadKey === threadKeyAtStart
      && metrics.stable
      && metrics.phase === 'final'
    ) {
      lastManualSettleSignature = signature
    }
  }
  finally {
    manualSettleInFlight = false

    await nextTick()
    if (
      isSameVirtualSession(sessionKeyAtStart, threadKeyAtStart, layoutEpochKeyAtStart)
      && lastManualSettleSignature !== signature
    ) {
      void runManualSettleIfReady()
    }
  }
}

watch(
  [
    virtualScrollEnabled,
    effectiveFinal,
    () => props.virtualScroll?.settleMode,
    () => props.virtualScroll?.settledToken,
    () => getVirtualSessionKey(),
    virtualLayoutEpochKey,
    pendingAsyncNodeCount,
    pendingHeightSettlingTaskCount,
    () => renderedCount.value,
    desiredRenderedCount,
    () => parsedNodes.value.length,
    () => heightStats.count,
    () => heightStats.total,
  ],
  () => {
    void runManualSettleIfReady()
  },
  { flush: 'post', immediate: true },
)

watch(
  [() => parsedNodes.value.length, virtualizationEnabled, maxLiveNodesResolved, liveNodeBufferResolved, () => liveRange.start, () => liveRange.end],
  ([length, virtualization, maxLiveNodes, buffer, start, end]) => {
    if (!debugPerformanceEnabled.value)
      return
    logPerf('virtualization', {
      nodes: length,
      virtualization,
      maxLiveNodes,
      buffer,
      focusIndex: focusIndex.value,
      scroll: virtualization
        ? (() => {
            const root = scrollRootElement.value || resolveScrollContainer()
            if (!root)
              return null
            return {
              reverse: isReverseFlexScrollRoot(root),
              scrollTop: Math.round(root.scrollTop),
              scrollTopAbs: Math.round(Math.abs(root.scrollTop)),
              scrollHeight: Math.round(root.scrollHeight),
              clientHeight: Math.round(root.clientHeight),
            }
          })()
        : null,
      liveRange: { start, end },
      rendered: renderedCount.value,
    })
  },
)

watch(
  [() => props.customId],
  ([customId], _prev, onCleanup) => {
    if (!customId || isNestedListItemRenderer)
      return
    const cleanup = registerHeightEstimationRendererController(customId, {
      captureRestoreAnchor,
      restoreAnchor,
      getAnchorDrift,
      getReport: buildExperimentReport,
    })
    onCleanup(() => {
      cleanup()
    })
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  cleanupBatchScheduler()
  destroyNodeVisibilityState()
  clearContentStreamingTailIdleTimer()
  for (const observer of nodeContentResizeObservers.values())
    observer.disconnect()
  nodeContentResizeObservers.clear()
  for (const timers of nodeContentDeferredMeasureTimers.values()) {
    for (const id of timers)
      clearHeightSettlingTimer(id)
  }
  nodeContentDeferredMeasureTimers.clear()
  nodeContentVersions.clear()
  clearFinalHeightConvergenceTimers()
  clearPendingHeightMeasurements()
  cleanupExperimentResizeObserver()
  clearRestoreReconcile()
  clearActiveVirtualBottomAnchor()
  clearVirtualMetricsSchedule()
  cleanupScrollListener()
  cancelScheduledFocusSync()
})

const MermaidBlockNodeAsync = defineAsyncComponent({
  loader: async () => {
    try {
      const mod = await import('../../components/MermaidBlockNode')
      return mod.default
    }
    catch (e) {
      console.warn(
        '[markstream-vue] Optional peer dependencies for MermaidBlockNode are missing. Falling back to preformatted code rendering. To enable Mermaid rendering, please install "mermaid".',
        e,
      )
      return PreCodeNode
    }
  },
  loadingComponent: MermaidBlockNodeLoading,
  delay: 0,
})

const InfographicBlockNodeAsync = defineAsyncComponent({
  loader: async () => {
    try {
      const mod = await import('../../components/InfographicBlockNode')
      return mod.default
    }
    catch (e) {
      console.warn(
        '[markstream-vue] Optional peer dependencies for InfographicBlockNode are missing. Falling back to preformatted code rendering. To enable Infographic rendering, please install "@antv/infographic".',
        e,
      )
      return PreCodeNode
    }
  },
  loadingComponent: InfographicBlockNodeLoading,
  delay: 0,
})

const D2BlockNodeAsync = defineAsyncComponent(async () => {
  try {
    const mod = await import('../../components/D2BlockNode')
    return mod.default
  }
  catch (e) {
    console.warn(
      '[markstream-vue] Optional peer dependencies for D2BlockNode are missing. Falling back to preformatted code rendering. To enable D2 rendering, please install "@terrastruct/d2".',
      e,
    )
    return PreCodeNode
  }
})

// 组件映射表
const nodeComponents: Partial<CustomComponents> = {
  text: TextNode,
  paragraph: ParagraphNode,
  heading: HeadingNode,
  code_block: CodeBlockNodeAsync,
  list: ListNode,
  list_item: ListItemNode,
  blockquote: BlockquoteNode,
  table: TableNode,
  definition_list: DefinitionListNode,
  footnote: FootnoteNode,
  footnote_reference: FootnoteReferenceNode,
  footnote_anchor: FootnoteAnchorNode,
  admonition: AdmonitionNode,
  vmr_container: VmrContainerNode,
  hardbreak: HardBreakNode,
  link: LinkNode,
  image: ImageNode,
  thematic_break: ThematicBreakNode,
  math_inline: MathInlineNodeAsync,
  math_block: MathBlockNodeAsync,
  strong: StrongNode,
  emphasis: EmphasisNode,
  strikethrough: StrikethroughNode,
  highlight: HighlightNode,
  insert: InsertNode,
  subscript: SubscriptNode,
  superscript: SuperscriptNode,
  emoji: EmojiNode,
  checkbox: CheckboxNode,
  checkbox_input: CheckboxNode,
  inline_code: InlineCodeNode,
  html_inline: HtmlInlineNode,
  reference: ReferenceNode,
  html_block: HtmlBlockNode,
  // 可以添加更多节点类型
  // 例如:custom_node: CustomNode,
}
const indexPrefix = computed(() => getCurrentIndexPrefix())
const codeBlockBindings = computed(() => ({
  // streaming behavior control for CodeBlockNode
  stream: props.codeBlockStream,
  darkTheme: props.codeBlockDarkTheme,
  lightTheme: props.codeBlockLightTheme,
  monacoOptions: props.codeBlockMonacoOptions,
  themes: props.themes,
  minWidth: props.codeBlockMinWidth,
  maxWidth: props.codeBlockMaxWidth,
  ...(typeof resolvedShowTooltips.value === 'boolean' ? { showTooltips: resolvedShowTooltips.value } : {}),
  ...(props.codeBlockProps || {}),
}))
const mermaidBindings = computed(() => ({
  ...(props.mermaidProps || {}),
}))
const d2Bindings = computed(() => ({
  ...(props.d2Props || {}),
}))
const infographicBindings = computed(() => ({
  ...(props.infographicProps || {}),
}))
const nonCodeBindings = computed(() => ({
  typewriter: props.typewriter,
  fade: props.fade,
  // Forward customHtmlTags for non-whitelisted tag detection in child components
  customHtmlTags: mergedParseOptions.value.customHtmlTags,
}))
const linkBindings = computed(() => ({
  ...nonCodeBindings.value,
  ...(typeof resolvedShowTooltips.value === 'boolean' ? { showTooltip: resolvedShowTooltips.value } : {}),
}))
const listBindings = computed(() => ({
  ...nonCodeBindings.value,
  ...(typeof resolvedShowTooltips.value === 'boolean' ? { showTooltips: resolvedShowTooltips.value } : {}),
}))

function getCodeBlockRenderNode(node: ParsedNode) {
  if (node.type !== 'code_block')
    return node

  const codeBlockNode = node as RuntimeCodeBlockNode
  const signature = [
    String(codeBlockNode.language ?? ''),
    String(codeBlockNode.loading ?? ''),
    String(codeBlockNode.diff ?? ''),
    String(codeBlockNode.code ?? ''),
    String(codeBlockNode.originalCode ?? ''),
    String(codeBlockNode.updatedCode ?? ''),
    String(codeBlockNode.raw ?? ''),
  ].join('\u0000')

  const cached = codeBlockRenderCache.get(codeBlockNode)
  if (cached && cached.signature === signature)
    return cached.node

  const cloned = { ...codeBlockNode } as ParsedNode
  codeBlockRenderCache.set(codeBlockNode, { signature, node: cloned })
  return cloned
}

function isCustomTagComponent(node: ParsedNode, component: unknown) {
  const type = String(node.type)
  return !isReservedNodeComponentKey(type) && customComponentsMap.value[type] === component
}

function hasSlotChildren(node: ParsedNode) {
  return Array.isArray((node as any).children) && (node as any).children.length > 0
}

const renderedItems = computed(() => {
  return visibleNodes.value.map((item) => {
    // Reuse the previous shallow clone for code blocks unless the visible
    // payload changed, so parent recomputations do not churn Monaco props.
    let node = getCodeBlockRenderNode(item.node)
    const language = getCodeBlockLanguage(node)
    let component = getNodeComponent(node, language)

    // When an html_block or html_inline node resolved to its default
    // component, check whether the node's tag matches a registered custom
    // component AND is listed in customHtmlTags.  This handles pre-parsed
    // nodes (via the `nodes` prop) that were not parsed with
    // `customHtmlTags`, so their type is still `html_block`/`html_inline`
    // but the tag references a known custom component.
    if (
      (node.type === 'html_block' || node.type === 'html_inline')
      && component === nodeComponents[node.type]
    ) {
      const htmlNode = node as RuntimeHtmlNode
      const tag = String(htmlNode.tag ?? '').trim().toLowerCase()
        || getHtmlTagFromContent(htmlNode.content)
      if (tag) {
        const customComponents = customComponentsMap.value
        const customForTag = customComponents[tag]

        // Check if tag is whitelisted in customHtmlTags
        if (effectiveCustomHtmlTagsSet.value.has(tag) && customForTag) {
          component = customForTag
          node = {
            ...htmlNode,
            type: tag,
            tag,
            content: stripCustomHtmlWrapper(htmlNode.content, tag),
          } as ParsedNode
        }
        else if (shouldRenderUnknownHtmlTagAsText(htmlNode.content ?? htmlNode.raw, tag)) {
          const rawContent = String(htmlNode.content ?? htmlNode.raw ?? '')

          if (node.type === 'html_inline') {
            component = TextNode
            node = {
              type: 'text',
              content: rawContent,
              raw: rawContent,
            } as ParsedNode
          }
          else {
            component = ParagraphNode
            node = {
              type: 'paragraph',
              children: [{ type: 'text', content: rawContent, raw: rawContent }],
              raw: rawContent,
            } as ParsedNode
          }
        }
      }
    }

    let bindings = { ...getBindingsFor(node, language) } as Record<string, unknown>
    const estimatedHeight = estimatedNodeHeights.value[item.index]
    if (node.type === 'code_block' && estimatedHeight?.kind === 'code-block') {
      bindings = {
        ...bindings,
        estimatedHeightPx: estimatedHeight.height,
        estimatedContentHeightPx: estimatedHeight.contentHeight,
      }
    }
    if (node.type === 'code_block' && language === 'mermaid' && parsePositiveNumber(bindings.estimatedPreviewHeightPx) == null) {
      bindings = {
        ...bindings,
        estimatedPreviewHeightPx: clampMermaidPreviewHeight(
          estimateMermaidPreviewHeight(String((node as RuntimeCodeBlockNode).code ?? '')),
        ),
      }
    }
    if (node.type === 'code_block' && language === 'infographic' && parsePositiveNumber(bindings.estimatedPreviewHeightPx) == null) {
      bindings = {
        ...bindings,
        estimatedPreviewHeightPx: clampInfographicPreviewHeight(
          estimateInfographicPreviewHeight(String((node as RuntimeCodeBlockNode).code ?? '')),
        ),
      }
    }
    if (node.type === 'math_block') {
      bindings = {
        ...bindings,
        cacheScope: mathBlockCacheScope.value,
      }
    }

    const rendersCustomNode = isCustomTagComponent(node, component)
    const customAttrs = rendersCustomNode
      ? getCustomNodeAttrs(node as any, resolvedHtmlPolicy.value)
      : undefined

    return {
      ...item,
      node,
      component,
      bindings,
      customBindings: {
        ...(customAttrs ?? {}),
        ...bindings,
      },
      rendersCustomNode,
      hasSlotChildren: hasSlotChildren(node),
      slotContent: String((node as any).content ?? ''),
      isCodeBlock: node.type === 'code_block',
      indexKey: `${indexPrefix.value}-${item.index}`,
    }
  })
})

function getCodeBlockLanguage(node: ParsedNode) {
  return node?.type === 'code_block'
    ? String((node as RuntimeCodeBlockNode).language ?? '').trim().toLowerCase()
    : ''
}

// Decide which component to use for a given node. Ensure that code blocks
// with language `mermaid` are rendered with `MermaidBlockNode` (unless a
// custom component named `mermaid` is registered for the given customId).
function getNodeComponent(node: ParsedNode, language?: string) {
  if (!node)
    return FallbackComponent
  const customComponents = customComponentsMap.value
  const customForType = customComponents[String(node.type)]
  if (node.type === 'code_block') {
    const lang = language ?? getCodeBlockLanguage(node)
    const customForLanguage = lang ? customComponents[lang] : undefined
    if (customForLanguage)
      return customForLanguage

    // Keep Mermaid blocks routed to MermaidBlockNode unless a specific
    // `mermaid` override is provided.
    if (lang === 'mermaid') {
      const customMermaid = customComponents.mermaid
      return customMermaid || MermaidBlockNodeAsync
    }

    // Keep Infographic blocks routed to InfographicBlockNode unless a specific
    // `infographic` override is provided.
    if (lang === 'infographic') {
      const customInfographic = customComponents.infographic
      return customInfographic || InfographicBlockNodeAsync
    }

    if (lang === 'd2' || lang === 'd2lang') {
      const customD2 = customComponents.d2
      return customD2 || D2BlockNodeAsync
    }

    if (customForType)
      return customForType

    // Honor a custom `code_block` component if the consumer registered one
    // via `setCustomComponents(customId, { code_block: MyComponent })`.
    const customCodeBlock = customComponents.code_block
    if (customCodeBlock)
      return customCodeBlock

    return codeBlockComponent.value
  }

  if (customForType)
    return customForType

  return nodeComponents[String(node.type)] || FallbackComponent
}

function getBindingsFor(node: ParsedNode, language?: string) {
  const lang = language ?? getCodeBlockLanguage(node)
  if (lang === 'mermaid')
    return mermaidBindings.value

  if (lang === 'infographic')
    return infographicBindings.value

  if (lang === 'd2' || lang === 'd2lang')
    return d2Bindings.value

  if (node.type === 'link')
    return linkBindings.value

  if (node.type === 'list')
    return listBindings.value

  return node.type === 'code_block'
    ? codeBlockBindings.value
    : nonCodeBindings.value
}

function handleContainerClick(event: MouseEvent) {
  emit('click', event)
}

function handleContainerMouseover(event: MouseEvent) {
  const target = (event.target as HTMLElement | null)?.closest('[data-node-index]')
  if (!target)
    return
  emit('mouseover', event)
}

function handleContainerMouseout(event: MouseEvent) {
  const target = (event.target as HTMLElement | null)?.closest('[data-node-index]')
  if (!target)
    return
  emit('mouseout', event)
}

function handleFragmentMouseover(event: MouseEvent) {
  emit('mouseover', event)
}

function handleFragmentMouseout(event: MouseEvent) {
  emit('mouseout', event)
}

const typewriterCursorRef = ref<HTMLElement | null>(null)
const showTypewriterCursor = ref(false)
let typewriterCursorTimeout: ReturnType<typeof setTimeout> | undefined
let lastTypewriterContentLength = 0
let lastTypewriterVisibleLength = 0
const TYPEWRITER_CURSOR_EXCLUDED_NODE_TYPES = new Set(['code_block', 'admonition', 'table', 'math_block', 'html_block', 'image'])

function shouldSkipTypewriterCursorForNode(node: unknown) {
  if (!node || typeof node !== 'object')
    return false
  const type = (node as Record<string, unknown>).type
  return typeof type === 'string' && TYPEWRITER_CURSOR_EXCLUDED_NODE_TYPES.has(type)
}

function shouldShowTypewriterCursorForCurrentNodes() {
  const lastNode = parsedNodes.value[parsedNodes.value.length - 1]
  return !shouldSkipTypewriterCursorForNode(lastNode)
}

function getNodeTextLength(node: unknown): number {
  if (!node || typeof node !== 'object')
    return 0

  const record = node as Record<string, unknown>
  const direct = record.raw ?? record.content ?? record.code
  if (typeof direct === 'string')
    return direct.length

  const children = record.children
  if (Array.isArray(children))
    return children.reduce((total, child) => total + getNodeTextLength(child), 0)

  const items = record.items
  if (Array.isArray(items))
    return items.reduce((total, item) => total + getNodeTextLength(item), 0)

  return 0
}

function getTypewriterContentLength() {
  if (props.nodes?.length)
    return props.nodes.reduce((total, node) => total + getNodeTextLength(node), 0)
  // Use raw content length, not renderContent (which may be the paced-out
  // visible portion when smooth streaming is active).  The cursor should
  // appear as long as the source content is growing, even if the visible
  // stream hasn't caught up yet.
  return (props.content ?? '').length
}

function getTypewriterVisibleLength() {
  if (props.nodes?.length)
    return props.nodes.reduce((total, node) => total + getNodeTextLength(node), 0)
  return renderContent.value.length
}

function clearTypewriterCursorTimeout() {
  if (!typewriterCursorTimeout)
    return
  clearTimeout(typewriterCursorTimeout)
  typewriterCursorTimeout = undefined
}

function hideTypewriterCursorElement() {
  if (typewriterCursorRef.value)
    typewriterCursorRef.value.style.visibility = 'hidden'
}

function getLastTextNode(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.textContent ?? ''
      if (!text.trim())
        return NodeFilter.FILTER_REJECT

      const parent = node.parentElement
      if (!parent)
        return NodeFilter.FILTER_REJECT
      if (parent.closest('.typewriter-cursor, .height-estimation-probes, [data-node-type="code_block"], [data-node-type="admonition"], [data-node-type="table"], [data-node-type="math_block"], [data-node-type="html_block"], [data-node-type="image"], script, style'))
        return NodeFilter.FILTER_REJECT

      return NodeFilter.FILTER_ACCEPT
    },
  })

  let last: Text | null = null
  let current = walker.nextNode()
  while (current) {
    last = current as Text
    current = walker.nextNode()
  }

  return last
}

function updateTypewriterCursorPosition() {
  if (!isClient || !showTypewriterCursor.value || !containerRef.value || !typewriterCursorRef.value)
    return

  const root = containerRef.value
  const cursor = typewriterCursorRef.value
  const lastText = getLastTextNode(root)
  const rootRect = root.getBoundingClientRect()
  cursor.style.visibility = 'hidden'
  let left = 0
  let top = 0
  let height = 20
  let measured = false

  if (lastText?.textContent) {
    const end = lastText.textContent.length
    const range = document.createRange()
    range.setStart(lastText, Math.max(0, end - 1))
    range.setEnd(lastText, end)
    const rects = typeof range.getClientRects === 'function'
      ? range.getClientRects()
      : undefined
    const rect = rects?.[rects.length - 1] ?? lastText.parentElement?.getBoundingClientRect()

    if (rect) {
      left = rect.right - rootRect.left + root.scrollLeft
      top = rect.top - rootRect.top + root.scrollTop
      height = rect.height || height
      measured = true
    }
    range.detach()
  }

  if (!measured)
    return

  cursor.style.transform = `translate(${Math.max(0, left)}px, ${Math.max(0, top)}px)`
  cursor.style.height = `${height}px`
  cursor.style.visibility = 'visible'
}

watch(
  [renderContent, () => props.content, () => props.nodes, () => props.typewriter, effectiveFinal],
  async () => {
    if (!isClient || renderAsFragment.value || !ownsTypewriterCursor.value)
      return

    // When the stream is final (and effective — smooth streaming has caught up),
    // hide the cursor immediately.
    if (effectiveFinal.value) {
      showTypewriterCursor.value = false
      clearTypewriterCursorTimeout()
      return
    }

    const nextLength = getTypewriterContentLength()
    const nextVisibleLength = getTypewriterVisibleLength()
    const cursorAllowed = shouldShowTypewriterCursorForCurrentNodes()
    const sourceGrowing = nextLength > lastTypewriterContentLength
    const visibleGrowing = nextVisibleLength > lastTypewriterVisibleLength
    if (props.typewriter === false || !cursorAllowed || (!sourceGrowing && !visibleGrowing)) {
      if (props.typewriter === false || !cursorAllowed)
        showTypewriterCursor.value = false
      lastTypewriterContentLength = nextLength
      lastTypewriterVisibleLength = nextVisibleLength
      return
    }

    lastTypewriterContentLength = nextLength
    lastTypewriterVisibleLength = nextVisibleLength
    showTypewriterCursor.value = true
    hideTypewriterCursorElement()
    clearTypewriterCursorTimeout()
    await nextTick()
    updateTypewriterCursorPosition()
    typewriterCursorTimeout = setTimeout(() => {
      showTypewriterCursor.value = false
    }, 3000)
  },
  { flush: 'post', immediate: true },
)

watch(
  showTypewriterCursor,
  async (visible) => {
    if (!visible)
      return
    await nextTick()
    updateTypewriterCursorPosition()
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  clearTypewriterCursorTimeout()
  mathBlockMinHeightCache.clear()
})
</script>

<template>
  <template v-if="renderAsFragment">
    <template
      v-for="item in renderedItems"
      :key="item.index"
    >
      <component
        :is="item.component"
        v-if="item.rendersCustomNode"
        v-bind="item.customBindings"
        :node="item.node"
        :loading="item.node.loading"
        :index-key="item.indexKey"
        :custom-id="props.customId"
        :is-dark="props.isDark"
        @click="handleContainerClick"
        @mouseover="handleFragmentMouseover"
        @mouseout="handleFragmentMouseout"
        @copy="emit('copy', $event)"
        @handle-artifact-click="emit('handleArtifactClick', $event)"
      >
        <NodeRenderer
          v-if="item.hasSlotChildren"
          v-bind="nestedRendererProps"
          :nodes="(item.node as any).children"
          :index-key="item.indexKey"
          :batch-rendering="false"
          :defer-nodes-until-visible="false"
          :render-as-fragment="true"
        />
        <NodeRenderer
          v-else-if="item.slotContent"
          v-bind="nestedRendererProps"
          :content="item.slotContent"
          :final="!item.node.loading"
          :index-key="`${item.indexKey}-content`"
          :smooth-streaming="false"
          :batch-rendering="false"
          :defer-nodes-until-visible="false"
          :render-as-fragment="true"
        />
      </component>
      <component
        :is="item.component"
        v-else
        :node="item.node"
        :loading="item.node.loading"
        :index-key="item.indexKey"
        v-bind="item.bindings"
        :custom-id="props.customId"
        :is-dark="props.isDark"
        @click="handleContainerClick"
        @mouseover="handleFragmentMouseover"
        @mouseout="handleFragmentMouseout"
        @copy="emit('copy', $event)"
        @handle-artifact-click="emit('handleArtifactClick', $event)"
      />
    </template>
  </template>
  <div
    v-else
    ref="containerRef"
    class="markstream-vue markdown-renderer"
    :class="[
      { dark: props.isDark },
      { virtualized: virtualizationEnabled },
      { 'virtual-scroll-coordinated': virtualScrollEnabled },
    ]"
    :data-custom-id="props.customId"
    @click="handleContainerClick"
    @mouseover="handleContainerMouseover"
    @mouseout="handleContainerMouseout"
  >
    <template v-if="heightEstimationActive || virtualizationEnabled">
      <div
        v-if="heightEstimationActive"
        class="height-estimation-probes"
        :style="{ width: `${experimentProbeWidth}px` }"
        aria-hidden="true"
      >
        <div ref="paragraphProbeWrapperRef" class="node-content" data-probe="paragraph">
          <ParagraphNode
            :node="paragraphProbeNode as any"
            index-key="probe-paragraph"
          />
        </div>
        <div ref="listItemProbeWrapperRef" class="node-content" data-probe="list-item">
          <ul class="m-0 p-0">
            <ListItemNode
              :node="listItemProbeNode as any"
              index-key="probe-list-item"
            />
          </ul>
        </div>
        <div ref="listProbeWrapperRef" class="node-content" data-probe="list">
          <ListNode
            :node="listProbeNode as any"
            index-key="probe-list"
          />
        </div>
        <div
          v-for="level in 6"
          :key="`probe-heading-${level}`"
          :ref="el => setHeadingProbeWrapper(level, el as HTMLElement | null)"
          class="node-content"
          :data-probe="`heading-${level}`"
        >
          <HeadingNode
            :node="getHeadingProbeNode(level) as any"
            :index-key="`probe-heading-${level}`"
          />
        </div>
      </div>
      <div
        v-if="virtualizationEnabled"
        class="node-spacer"
        :style="{ height: `${topSpacerHeight}px` }"
        aria-hidden="true"
      />
    </template>
    <template v-for="item in renderedItems" :key="item.index">
      <div
        :ref="el => setNodeSlotElement(item.index, el as HTMLElement | null)"
        class="node-slot"
        :data-node-index="item.index"
        :data-node-type="item.node.type"
      >
        <div
          v-if="shouldRenderNode(item.index)"
          :ref="el => setNodeContentRef(item.index, el as HTMLElement | null)"
          class="node-content"
        >
          <!-- Skip wrapping code_block nodes in transitions to avoid touching Monaco editor internals -->
          <transition
            v-if="!item.isCodeBlock && props.fade !== false"
            name="fade"
            appear
          >
            <component
              :is="item.component"
              v-if="item.rendersCustomNode"
              v-bind="item.customBindings"
              :node="item.node"
              :loading="item.node.loading"
              :index-key="item.indexKey"
              :custom-id="props.customId"
              :is-dark="props.isDark"
              @copy="emit('copy', $event)"
              @handle-artifact-click="emit('handleArtifactClick', $event)"
            >
              <NodeRenderer
                v-if="item.hasSlotChildren"
                v-bind="nestedRendererProps"
                :nodes="(item.node as any).children"
                :index-key="item.indexKey"
                :batch-rendering="false"
                :defer-nodes-until-visible="false"
                :render-as-fragment="true"
              />
              <NodeRenderer
                v-else-if="item.slotContent"
                v-bind="nestedRendererProps"
                :content="item.slotContent"
                :final="!item.node.loading"
                :index-key="`${item.indexKey}-content`"
                :smooth-streaming="false"
                :batch-rendering="false"
                :defer-nodes-until-visible="false"
                :render-as-fragment="true"
              />
            </component>
            <component
              :is="item.component"
              v-else
              :node="item.node"
              :loading="item.node.loading"
              :index-key="item.indexKey"
              v-bind="item.bindings"
              :custom-id="props.customId"
              :is-dark="props.isDark"
              @copy="emit('copy', $event)"
              @handle-artifact-click="emit('handleArtifactClick', $event)"
            />
          </transition>

          <component
            :is="item.component"
            v-else-if="item.rendersCustomNode"
            v-bind="item.customBindings"
            :node="item.node"
            :loading="item.node.loading"
            :index-key="item.indexKey"
            :custom-id="props.customId"
            :is-dark="props.isDark"
            @copy="emit('copy', $event)"
            @handle-artifact-click="emit('handleArtifactClick', $event)"
          >
            <NodeRenderer
              v-if="item.hasSlotChildren"
              v-bind="nestedRendererProps"
              :nodes="(item.node as any).children"
              :index-key="item.indexKey"
              :batch-rendering="false"
              :defer-nodes-until-visible="false"
              :render-as-fragment="true"
            />
            <NodeRenderer
              v-else-if="item.slotContent"
              v-bind="nestedRendererProps"
              :content="item.slotContent"
              :final="!item.node.loading"
              :index-key="`${item.indexKey}-content`"
              :smooth-streaming="false"
              :batch-rendering="false"
              :defer-nodes-until-visible="false"
              :render-as-fragment="true"
            />
          </component>
          <component
            :is="item.component"
            v-else
            :node="item.node"
            :loading="item.node.loading"
            :index-key="item.indexKey"
            v-bind="item.bindings"
            :custom-id="props.customId"
            :is-dark="props.isDark"
            @copy="emit('copy', $event)"
            @handle-artifact-click="emit('handleArtifactClick', $event)"
          />
        </div>
        <div
          v-else
          class="node-placeholder"
          :style="{ height: `${getFallbackNodeHeight(item.index)}px` }"
        />
      </div>
    </template>
    <span
      v-if="showTypewriterCursor"
      ref="typewriterCursorRef"
      class="typewriter-cursor"
      aria-hidden="true"
    />
    <div
      v-if="virtualizationEnabled"
      class="node-spacer"
      :style="{ height: `${bottomSpacerHeight}px` }"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
.markdown-renderer {
  position: relative;
  /* 防止内容更新时的布局抖动 */
  contain: layout;
   /* 优化不可见时的渲染成本 */
  content-visibility: auto;
  contain-intrinsic-size: 800px 600px;
}

.markdown-renderer.virtualized,
.markdown-renderer.virtual-scroll-coordinated {
  /* When virtualization is active, `content-visibility: auto` can keep the
     whole subtree unpainted until the scroll container dispatches a scroll
     event in some layouts (e.g. complex chat shells). The virtual window
     already limits DOM cost, so keep it visible to avoid a blank first paint. */
  content-visibility: visible;
  contain-intrinsic-size: auto;
}

.height-estimation-probes {
  position: absolute;
  left: -100000px;
  top: 0;
  visibility: hidden;
  pointer-events: none;
  overflow: hidden;
  z-index: -1;
}

.node-slot {
  display: flow-root;
  width: 100%;
}

.node-content {
  display: flow-root;
  width: 100%;
}

.node-placeholder {
  width: 100%;
  min-height: 1rem;
  margin: 0.25rem 0;
  border-radius: var(--ms-radius);
  background-image: linear-gradient(90deg, var(--loading-shimmer), transparent, var(--loading-shimmer));
  background-size: 200% 100%;
  animation: node-placeholder-shimmer 1.1s ease-in-out infinite;
}

.node-placeholder:first-child {
  margin-top: 0;
}

@keyframes node-placeholder-shimmer {
  from {
    background-position: 200% 0%;
  }
  to {
    background-position: -200% 0%;
  }
}

.node-spacer {
  width: 100%;
}

.unknown-node {
  color: hsl(var(--ms-muted-foreground));
  font-style: italic;
  margin: var(--ms-flow-paragraph-y) 0;
}

.typewriter-cursor {
  position: absolute;
  left: 0;
  top: 0;
  display: inline-block;
  width: 0.55em;
  height: 1em;
  margin-left: 0.08em;
  vertical-align: -0.12em;
  border-right: 2px solid currentColor;
  pointer-events: none;
  visibility: hidden;
  animation: typewriter-cursor-blink 1s steps(1, end) infinite;
}

@keyframes typewriter-cursor-blink {
  0%, 49% {
    opacity: 1;
  }
  50%, 100% {
    opacity: 0;
  }
}
</style>

<style>
/* Global (unscoped) CSS for enter animations */
.markstream-vue .fade-enter-from {
  opacity: 0;
}
.markstream-vue .fade-enter-active {
  transition: opacity var(--fade-duration, 280ms)
    var(--fade-ease, cubic-bezier(0.33, 0, 0.67, 1));
  will-change: opacity;
}
.markstream-vue .fade-enter-to {
  opacity: 1;
}
</style>
