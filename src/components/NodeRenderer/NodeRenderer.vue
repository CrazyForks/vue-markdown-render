<script setup lang="ts">
import type { BaseNode, ParsedNode, ParseOptions } from 'stream-markdown-parser'
import type { VisibilityHandle } from '../../composables/viewportPriority'
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { computed, defineAsyncComponent, markRaw, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import AdmonitionNode from '../../components/AdmonitionNode'
import BlockquoteNode from '../../components/BlockquoteNode'
import CheckboxNode from '../../components/CheckboxNode'
import DefinitionListNode from '../../components/DefinitionListNode'
import EmojiNode from '../../components/EmojiNode'
import EmphasisNode from '../../components/EmphasisNode'
import FootnoteNode from '../../components/FootnoteNode'
import FootnoteReferenceNode from '../../components/FootnoteReferenceNode'
import HardBreakNode from '../../components/HardBreakNode'
import HeadingNode from '../../components/HeadingNode'
import HighlightNode from '../../components/HighlightNode'
import ImageNode from '../../components/ImageNode'
import InlineCodeNode from '../../components/InlineCodeNode'
import InsertNode from '../../components/InsertNode'
import LinkNode from '../../components/LinkNode'
import ListNode from '../../components/ListNode'
import MermaidBlockNode from '../../components/MermaidBlockNode'
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
import { provideViewportPriority } from '../../composables/viewportPriority'
import { getCustomNodeComponents } from '../../utils/nodeComponents'
import HtmlBlockNode from '../HtmlBlockNode/HtmlBlockNode.vue'
import { MathBlockNodeAsync, MathInlineNodeAsync } from './asyncComponent'
import FallbackComponent from './FallbackComponent.vue'

// 组件接收的 props
// 增加用于统一设置所有 code_block 主题和 Monaco 选项的外部 API
interface IdleDeadlineLike {
  timeRemaining?: () => number
}

// Exported props interface so declaration generators can include prop types
export interface NodeRendererProps {
  content?: string
  nodes?: BaseNode[]
  /** Options forwarded to parseMarkdownToStructure when content is provided */
  parseOptions?: ParseOptions
  /** Enable priority rendering for visible viewport area */
  viewportPriority?: boolean
  /**
   * Whether code_block renders should stream updates.
   * When false, code blocks stay in a loading state and render once when final content is ready.
   * Default: true
   */
  codeBlockStream?: boolean
  // 全局传递到每个 CodeBlockNode 的主题（monaco theme 对象）
  codeBlockDarkTheme?: any
  codeBlockLightTheme?: any
  // 传递给 CodeBlockNode 的 monacoOptions（比如 fontSize, MAX_HEIGHT 等）
  codeBlockMonacoOptions?: Record<string, any>
  /** If true, render all `code_block` nodes as plain <pre><code> blocks instead of the full CodeBlockNode */
  renderCodeBlocksAsPre?: boolean
  /** Minimum width forwarded to CodeBlockNode (px or CSS unit) */
  codeBlockMinWidth?: string | number
  /** Maximum width forwarded to CodeBlockNode (px or CSS unit) */
  codeBlockMaxWidth?: string | number
  /** Arbitrary props to forward to every CodeBlockNode */
  codeBlockProps?: Record<string, any>
  themes?: string[]
  isDark?: boolean
  customId?: string
  indexKey?: number | string
  /** Enable/disable the non-code-node enter transition (typewriter). Default: true */
  typewriter?: boolean
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
}

const props = withDefaults(defineProps<NodeRendererProps>(), {
  codeBlockStream: true,
  typewriter: true,
  batchRendering: true,
  initialRenderBatchSize: 40,
  renderBatchSize: 80,
  renderBatchDelay: 16,
  renderBatchBudgetMs: 6,
  renderBatchIdleTimeoutMs: 120,
  deferNodesUntilVisible: true,
  maxLiveNodes: 320,
  liveNodeBuffer: 60,
})

// 定义事件
const emit = defineEmits(['copy', 'handleArtifactClick', 'click', 'mouseover', 'mouseout'])
const md = getMarkdown()
const containerRef = ref<HTMLElement>()
// Provide viewport-priority registrar so heavy nodes can defer work until visible
const viewportPriorityEnabled = ref(props.viewportPriority !== false)
const registerNodeVisibility = provideViewportPriority(() => containerRef.value, viewportPriorityEnabled)
const parsedNodes = computed<ParsedNode[]>(() => {
  // 解析 content 字符串为节点数组
  if (props.nodes?.length)
    return props.nodes as unknown as ParsedNode[]
  if (props.content) {
    const parsed = parseMarkdownToStructure(props.content, md, props.parseOptions)
    return markRaw(parsed)
  }
  return []
})
const isClient = typeof window !== 'undefined'
const requestFrame = isClient && typeof window.requestAnimationFrame === 'function'
  ? window.requestAnimationFrame.bind(window)
  : null
const cancelFrame = isClient && typeof window.cancelAnimationFrame === 'function'
  ? window.cancelAnimationFrame.bind(window)
  : null
const isTestEnv = typeof globalThis !== 'undefined'
  && typeof (globalThis as any).process !== 'undefined'
  && (globalThis as any).process?.env?.NODE_ENV === 'test'
const hasIdleCallback = isClient && typeof window.requestIdleCallback === 'function'
const resolvedBatchSize = computed(() => {
  const size = Math.trunc(props.renderBatchSize ?? 80)
  return Number.isFinite(size) ? Math.max(0, size) : 0
})
const resolvedInitialBatch = computed(() => {
  const initial = Math.trunc(props.initialRenderBatchSize ?? resolvedBatchSize.value)
  if (!Number.isFinite(initial))
    return resolvedBatchSize.value
  return Math.max(0, initial)
})
const batchingEnabled = computed(() => props.batchRendering !== false && resolvedBatchSize.value > 0 && isClient && !isTestEnv)
const renderedCount = ref(0)
const previousRenderContext = ref<{ key: typeof props.indexKey, total: number }>({
  key: props.indexKey,
  total: 0,
})
const previousBatchConfig = ref({
  batchSize: resolvedBatchSize.value,
  initial: resolvedInitialBatch.value,
  delay: props.renderBatchDelay ?? 16,
  enabled: batchingEnabled.value,
})
const renderedNodes = shallowRef<ParsedNode[]>([])
const adaptiveBatchSize = ref(Math.max(1, resolvedBatchSize.value || 1))
const nodeVisibilityState = reactive<Record<number, boolean>>({})
const nodeVisibilityHandles = new Map<number, VisibilityHandle>()
const nodeSlotElements = new Map<number, HTMLElement | null>()
const deferNodes = computed(() => props.deferNodesUntilVisible !== false && viewportPriorityEnabled.value !== false)
const virtualizationEnabled = computed(() => (props.maxLiveNodes ?? 0) > 0)
const shouldObserveSlots = computed(() => !!registerNodeVisibility && (deferNodes.value || virtualizationEnabled.value))
const maxLiveNodesResolved = computed(() => Math.max(1, props.maxLiveNodes ?? 320))
const liveNodeBufferResolved = computed(() => Math.max(0, props.liveNodeBuffer ?? 60))
const focusIndex = ref(0)
const liveRange = reactive({ start: 0, end: 0 })
const nodeContentElements = new Map<number, HTMLElement | null>()
const desiredRenderedCount = computed(() => {
  if (!virtualizationEnabled.value)
    return parsedNodes.value.length
  const overscan = liveNodeBufferResolved.value
  const windowEnd = Math.max(liveRange.end + overscan, resolvedInitialBatch.value)
  const target = Math.min(parsedNodes.value.length, windowEnd)
  return Math.max(renderedCount.value, target)
})
function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
function updateLiveRange() {
  const total = parsedNodes.value.length
  if (!virtualizationEnabled.value || total === 0) {
    liveRange.start = 0
    liveRange.end = total
    return
  }
  const windowSize = Math.min(maxLiveNodesResolved.value, total)
  const buffer = liveNodeBufferResolved.value
  const desiredStart = clamp(focusIndex.value - buffer, 0, Math.max(0, total - windowSize))
  liveRange.start = desiredStart
  liveRange.end = Math.min(total, desiredStart + windowSize)
}

const nodeHeights = reactive<Record<number, number>>({})
const heightStats = reactive({ total: 0, count: 0 })

function recordNodeHeight(index: number, height: number) {
  if (!Number.isFinite(height) || height <= 0)
    return
  const previous = nodeHeights[index]
  nodeHeights[index] = height
  if (previous) {
    heightStats.total += height - previous
  }
  else {
    heightStats.total += height
    heightStats.count++
  }
}

const averageNodeHeight = computed(() => {
  return heightStats.count > 0 ? Math.max(12, heightStats.total / heightStats.count) : 32
})

function estimateHeightRange(start: number, end: number) {
  if (start >= end)
    return 0
  let total = 0
  for (let i = start; i < end; i++)
    total += nodeHeights[i] ?? averageNodeHeight.value
  return total
}

const visibleNodes = computed(() => {
  if (!virtualizationEnabled.value)
    return renderedNodes.value.map((node, index) => ({ node, index }))
  const total = renderedNodes.value.length
  const start = clamp(liveRange.start, 0, total)
  const end = clamp(liveRange.end, start, total)
  return renderedNodes.value.slice(start, end).map((node, idx) => ({
    node,
    index: start + idx,
  }))
})

const topSpacerHeight = computed(() => {
  if (!virtualizationEnabled.value)
    return 0
  return estimateHeightRange(0, Math.min(liveRange.start, renderedNodes.value.length))
})

const bottomSpacerHeight = computed(() => {
  if (!virtualizationEnabled.value)
    return 0
  const total = renderedNodes.value.length
  const end = Math.min(liveRange.end, total)
  return estimateHeightRange(end, Math.min(total, renderedCount.value))
})

function syncRenderedNodes() {
  const total = parsedNodes.value.length
  const limit = Math.min(total, renderedCount.value)
  if (limit <= 0) {
    renderedNodes.value = []
    cleanupNodeVisibility(0)
    return
  }
  if (limit >= total) {
    renderedNodes.value = parsedNodes.value
    cleanupNodeVisibility(limit)
    return
  }
  renderedNodes.value = parsedNodes.value.slice(0, limit)
  cleanupNodeVisibility(limit)
}

function cleanupNodeVisibility(maxIndex: number) {
  if (!nodeVisibilityHandles.size)
    return
  for (const [index, handle] of nodeVisibilityHandles) {
    if (index >= maxIndex) {
      handle.destroy()
      nodeVisibilityHandles.delete(index)
      if (deferNodes.value)
        delete nodeVisibilityState[index]
      nodeSlotElements.delete(index)
    }
  }
}

function markNodeVisible(index: number, visible: boolean) {
  if (deferNodes.value)
    nodeVisibilityState[index] = visible
  if (visible)
    focusIndex.value = clamp(index, 0, Math.max(0, parsedNodes.value.length - 1))
}

function shouldRenderNode(index: number) {
  if (!deferNodes.value)
    return true
  if (index < resolvedInitialBatch.value)
    return true
  return nodeVisibilityState[index] === true
}

function destroyNodeHandle(index: number) {
  const handle = nodeVisibilityHandles.get(index)
  if (handle) {
    handle.destroy()
    nodeVisibilityHandles.delete(index)
  }
}

function setNodeSlotElement(index: number, el: HTMLElement | null) {
  if (el)
    nodeSlotElements.set(index, el)
  else
    nodeSlotElements.delete(index)

  if (!shouldObserveSlots.value || !registerNodeVisibility) {
    destroyNodeHandle(index)
    if (el)
      markNodeVisible(index, true)
    else if (deferNodes.value)
      delete nodeVisibilityState[index]
    return
  }

  if (index < resolvedInitialBatch.value && !virtualizationEnabled.value) {
    destroyNodeHandle(index)
    markNodeVisible(index, true)
    return
  }

  if (!el) {
    destroyNodeHandle(index)
    if (deferNodes.value)
      delete nodeVisibilityState[index]
    return
  }

  destroyNodeHandle(index)
  const handle = registerNodeVisibility(el, { rootMargin: '400px' })
  if (!handle)
    return
  nodeVisibilityHandles.set(index, handle)
  markNodeVisible(index, handle.isVisible.value)
  handle.whenVisible.then(() => {
    markNodeVisible(index, true)
  }).catch(() => {})
}

function setNodeContentRef(index: number, el: HTMLElement | null) {
  if (!el) {
    nodeContentElements.delete(index)
    return
  }
  nodeContentElements.set(index, el)
  queueMicrotask(() => {
    recordNodeHeight(index, el.offsetHeight)
  })
}

let batchRaf: number | null = null
let batchTimeout: number | null = null
let batchPending = false
let pendingIncrement: number | null = null
let batchIdle: number | null = null

function cancelBatchTimers() {
  if (!isClient)
    return
  if (batchRaf != null) {
    cancelFrame?.(batchRaf)
    batchRaf = null
  }
  if (batchTimeout != null) {
    window.clearTimeout(batchTimeout)
    batchTimeout = null
  }
  if (batchIdle != null && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(batchIdle)
    batchIdle = null
  }
  batchPending = false
  pendingIncrement = null
}

function scheduleBatch(increment: number, opts: { immediate?: boolean } = {}) {
  if (!batchingEnabled.value)
    return
  const target = desiredRenderedCount.value
  if (renderedCount.value >= target)
    return

  const amount = Math.max(1, increment)
  const run = (deadline?: IdleDeadlineLike) => {
    batchRaf = null
    batchTimeout = null
    batchIdle = null
    batchPending = false
    const applied = pendingIncrement != null ? pendingIncrement : amount
    pendingIncrement = null
    const budgetMs = Math.max(2, props.renderBatchBudgetMs ?? 6)

    const applyAndMeasure = (size: number) => {
      const start = typeof performance !== 'undefined' ? performance.now() : Date.now()
      renderedCount.value = Math.min(target, renderedCount.value + Math.max(1, size))
      syncRenderedNodes()
      const end = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const elapsed = end - start
      adjustAdaptiveBatchSize(elapsed)
      return elapsed
    }

    let nextSize = applied
    while (true) {
      applyAndMeasure(nextSize)
      if (renderedCount.value >= target)
        break
      if (!deadline)
        break
      const remaining = typeof deadline.timeRemaining === 'function'
        ? deadline.timeRemaining()
        : 0
      if (remaining <= budgetMs * 0.5)
        break
      nextSize = Math.max(1, Math.round(adaptiveBatchSize.value))
    }

    if (renderedCount.value < target)
      queueNextBatch()
  }

  if (!isClient || opts.immediate) {
    run()
    return
  }

  const delay = Math.max(0, props.renderBatchDelay ?? 16)
  pendingIncrement = pendingIncrement != null ? Math.max(pendingIncrement, amount) : amount
  if (batchPending)
    return
  batchPending = true

  if (!isTestEnv && hasIdleCallback && window.requestIdleCallback) {
    const timeout = Math.max(0, props.renderBatchIdleTimeoutMs ?? 120)
    batchIdle = window.requestIdleCallback((deadline) => {
      run(deadline)
    }, { timeout })
    return
  }

  if (!requestFrame || isTestEnv) {
    batchTimeout = window.setTimeout(() => run(), delay)
    return
  }
  batchRaf = requestFrame(() => {
    if (delay === 0) {
      run()
      return
    }
    batchTimeout = window.setTimeout(() => run(), delay)
  })
}

function queueNextBatch() {
  const dynamicSize = batchingEnabled.value
    ? Math.max(1, Math.round(adaptiveBatchSize.value))
    : Math.max(1, resolvedBatchSize.value)
  scheduleBatch(dynamicSize)
}

function adjustAdaptiveBatchSize(elapsed: number) {
  if (!batchingEnabled.value)
    return
  const budget = Math.max(2, props.renderBatchBudgetMs ?? 6)
  const maxSize = Math.max(1, resolvedBatchSize.value || 1)
  const minSize = Math.max(1, Math.floor(maxSize / 4))
  if (elapsed > budget * 1.2) {
    adaptiveBatchSize.value = Math.max(minSize, Math.floor(adaptiveBatchSize.value * 0.7))
  }
  else if (elapsed < budget * 0.5 && adaptiveBatchSize.value < maxSize) {
    adaptiveBatchSize.value = Math.min(maxSize, Math.ceil(adaptiveBatchSize.value * 1.2))
  }
}

watch(
  [
    () => parsedNodes.value,
    () => parsedNodes.value.length,
    () => batchingEnabled.value,
    () => resolvedBatchSize.value,
    () => resolvedInitialBatch.value,
    () => props.renderBatchDelay,
    () => props.indexKey,
  ],
  () => {
    const nodes = parsedNodes.value
    const total = nodes.length
    const prevCtx = previousRenderContext.value
    const datasetKey = props.indexKey
    const datasetChanged = datasetKey !== undefined
      ? datasetKey !== prevCtx.key
      : total !== prevCtx.total
    previousRenderContext.value = { key: datasetKey, total }

    const prevBatch = previousBatchConfig.value
    const currentDelay = props.renderBatchDelay ?? 16
    const batchConfigChanged
      = prevBatch.batchSize !== resolvedBatchSize.value
        || prevBatch.initial !== resolvedInitialBatch.value
        || prevBatch.delay !== currentDelay
        || prevBatch.enabled !== batchingEnabled.value

    previousBatchConfig.value = {
      batchSize: resolvedBatchSize.value,
      initial: resolvedInitialBatch.value,
      delay: currentDelay,
      enabled: batchingEnabled.value,
    }

    if (datasetChanged || batchConfigChanged || !batchingEnabled.value)
      cancelBatchTimers()
    if (datasetChanged || batchConfigChanged)
      adaptiveBatchSize.value = Math.max(1, resolvedBatchSize.value || 1)

    const targetCount = desiredRenderedCount.value

    if (!total) {
      renderedCount.value = 0
      syncRenderedNodes()
      return
    }

    if (!batchingEnabled.value) {
      renderedCount.value = targetCount
      syncRenderedNodes()
      return
    }

    if (datasetChanged || batchConfigChanged)
      renderedCount.value = Math.min(targetCount, resolvedInitialBatch.value)
    else
      renderedCount.value = Math.min(renderedCount.value, targetCount)

    const baseInitial = Math.max(1, resolvedInitialBatch.value || resolvedBatchSize.value || total)
    if (renderedCount.value < targetCount)
      scheduleBatch(baseInitial, { immediate: !isClient })
    else
      syncRenderedNodes()
  },
  { immediate: true },
)

watch(
  () => deferNodes.value,
  (enabled) => {
    if (!enabled) {
      for (const handle of nodeVisibilityHandles.values())
        handle.destroy()
      nodeVisibilityHandles.clear()
      for (const key of Object.keys(nodeVisibilityState))
        delete nodeVisibilityState[key]
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
  () => renderedCount.value,
  (count, prev) => {
    if (!virtualizationEnabled.value)
      return
    if (typeof prev === 'number' && count <= prev)
      return
    if (count > 0)
      focusIndex.value = count - 1
  },
)

watch(
  [focusIndex, maxLiveNodesResolved, liveNodeBufferResolved, () => parsedNodes.value.length, virtualizationEnabled],
  () => {
    updateLiveRange()
  },
  { immediate: true },
)

watch(
  () => desiredRenderedCount.value,
  (target, prev) => {
    if (!batchingEnabled.value)
      return
    if (typeof prev === 'number' && target <= prev)
      return
    if (target > renderedCount.value)
      queueNextBatch()
  },
)

onBeforeUnmount(() => {
  cancelBatchTimers()
  for (const handle of nodeVisibilityHandles.values())
    handle.destroy()
  nodeVisibilityHandles.clear()
})

// 异步按需加载 CodeBlock 组件；失败时退回为 InlineCodeNode（内联代码渲染）
const CodeBlockNodeAsync = defineAsyncComponent(async () => {
  try {
    const mod = await import('../../components/CodeBlockNode')
    return mod.default
  }
  catch (e) {
    console.warn(
      '[vue-markdown-render] Optional peer dependencies for CodeBlockNode are missing. Falling back to inline-code rendering (no Monaco). To enable full code block features, please install "stream-monaco".',
      e,
    )
    return PreCodeNode
  }
})

// 组件映射表
const codeBlockComponent = computed(() => props.renderCodeBlocksAsPre ? PreCodeNode : CodeBlockNodeAsync)
const nodeComponents = {
  text: TextNode,
  paragraph: ParagraphNode,
  heading: HeadingNode,
  code_block: CodeBlockNodeAsync,
  list: ListNode,
  blockquote: BlockquoteNode,
  table: TableNode,
  definition_list: DefinitionListNode,
  footnote: FootnoteNode,
  footnote_reference: FootnoteReferenceNode,
  admonition: AdmonitionNode,
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
  reference: ReferenceNode,
  html_block: HtmlBlockNode,
  // 可以添加更多节点类型
  // 例如:custom_node: CustomNode,
  ...getCustomNodeComponents(props.customId),
}

// Decide which component to use for a given node. Ensure that code blocks
// with language `mermaid` are rendered with `MermaidBlockNode` (unless a
// custom component named `mermaid` is registered for the given customId).
function getNodeComponent(node: ParsedNode) {
  if (!node)
    return FallbackComponent
  if (node.type === 'code_block') {
    const lang = String((node as any).language ?? '').trim().toLowerCase()
    if (lang === 'mermaid') {
      const custom = getCustomNodeComponents(props.customId).mermaid
      return (custom as any) || MermaidBlockNode
    }
    return codeBlockComponent.value
  }
  return (nodeComponents as any)[String((node as any).type)] || FallbackComponent
}

function getBindingsFor(node: ParsedNode) {
  // For mermaid blocks we don't forward CodeBlock-specific props
  if (node?.type === 'code_block' && String((node as any).language ?? '').trim().toLowerCase() === 'mermaid')
    return {}

  return node.type === 'code_block'
    ? {
        // streaming behavior control for CodeBlockNode
        stream: props.codeBlockStream,
        darkTheme: props.codeBlockDarkTheme,
        lightTheme: props.codeBlockLightTheme,
        monacoOptions: props.codeBlockMonacoOptions,
        themes: props.themes,
        minWidth: props.codeBlockMinWidth,
        maxWidth: props.codeBlockMaxWidth,
        ...(props.codeBlockProps || {}),
      }
    : {
        // Forward `typewriter` flag to non-code node components so they can
        // opt in/out of enter transitions or other typewriter-like behaviour.
        typewriter: props.typewriter,
      }
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
</script>

<template>
  <div
    ref="containerRef"
    class="markdown-renderer"
    @click="handleContainerClick"
    @mouseover="handleContainerMouseover"
    @mouseout="handleContainerMouseout"
  >
    <div>
      <div
        v-if="virtualizationEnabled"
        class="node-spacer"
        :style="{ height: `${topSpacerHeight}px` }"
        aria-hidden="true"
      />
      <template v-for="item in visibleNodes" :key="item.index">
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
              v-if="item.node.type !== 'code_block' && props.typewriter !== false"
              name="typewriter"
              appear
            >
              <component
                :is="getNodeComponent(item.node)"
                :node="item.node"
                :loading="item.node.loading"
                :index-key="`${indexKey || 'markdown-renderer'}-${item.index}`"
                v-bind="getBindingsFor(item.node)"
                :custom-id="props.customId"
                :is-dark="props.isDark"
                @copy="emit('copy', $event)"
                @handle-artifact-click="emit('handleArtifactClick', $event)"
              />
            </transition>

            <component
              :is="getNodeComponent(item.node)"
              v-else
              :node="item.node"
              :loading="item.node.loading"
              :index-key="`${indexKey || 'markdown-renderer'}-${item.index}`"
              v-bind="getBindingsFor(item.node)"
              :custom-id="props.customId"
              :is-dark="props.isDark"
              @copy="emit('copy', $event)"
              @handle-artifact-click="emit('handleArtifactClick', $event)"
            />
          </div>
          <div
            v-else
            class="node-placeholder"
            :style="{ height: `${nodeHeights[item.index] ?? averageNodeHeight}px` }"
          />
        </div>
      </template>
      <div
        v-if="virtualizationEnabled"
        class="node-spacer"
        :style="{ height: `${bottomSpacerHeight}px` }"
        aria-hidden="true"
      />
    </div>
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

.node-slot {
  width: 100%;
}

.node-content {
  width: 100%;
}

.node-placeholder {
  width: 100%;
  min-height: 1rem;
  margin: 0.25rem 0;
  border-radius: 0.5rem;
  background-image: linear-gradient(90deg, rgba(148, 163, 184, 0.18), rgba(148, 163, 184, 0.05), rgba(148, 163, 184, 0.18));
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
  color: #6a737d;
  font-style: italic;
  margin: 1rem 0;
}
</style>

<style>
/* Global (unscoped) CSS for TransitionGroup enter animations */
.typewriter-enter-from {
  opacity: 0;
}
.typewriter-enter-active {
  transition: opacity var(--typewriter-fade-duration, 900ms)
    var(--typewriter-fade-ease, ease-out);
  will-change: opacity;
}
.typewriter-enter-to {
  opacity: 1;
}
</style>
