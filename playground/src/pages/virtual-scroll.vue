<script setup lang="ts">
import type {
  MarkstreamHeightCache,
  MarkstreamVirtualMetrics,
  MarkstreamVirtualScrollOptions,
  MarkstreamVirtualState,
} from '../../../src/types/node-renderer-props'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import MarkdownRender from '../../../src/components/NodeRenderer'
import '../../../src/index.css'

interface Message {
  threadId: ThreadId
  id: string
  role: 'user' | 'assistant'
  content: string
  final: boolean
  huge: boolean
  revision: number
}

type ThreadId = 'thread-a' | 'thread-b'

interface LabStats {
  visibleItemCount: number
  markdownRendererCount: number
  markdownSlotCount: number
  markdownContentCount: number
  blankProbeCount: number
  heightDriftPx: number
  maxItemHeightDriftPx: number
  domNodeCount: number
  messageDomCount: number
  visibleCoverageOk: boolean
  clippedMessageCount: number
  heightDriftMessageCount: number
  worstHeightDriftMessageId: string
}

interface LabHealth extends LabStats {
  eventCount: number
  maxObservedBlankProbes: number
  maxObservedMarkdownSlots: number
  maxObservedHeightDriftPx: number
  maxObservedScrollJumpPx: number
  virtualDomWithinLimit: boolean
  domSlotBudget: number
  layoutIntegrityOk: boolean
}

interface VirtualScrollLabSnapshot {
  ready: boolean
  threadId: ThreadId
  range: { start: number, end: number }
  firstVisibleMessageId: string
  outerAnchor: OuterAnchor | null
  stats: LabStats
  health: LabHealth
  events: LabEvent[]
  labStatus: string
  activeThreadId: ThreadId
  totalHeight: number
  scrollTop: number
  viewportHeight: number
  distanceFromBottomPx: number
  visibleRange: { start: number, end: number }
  messageDomCount: number
  domNodeCount: number
  markdownSlotCount: number
  markdownContentCount: number
  maxDomNodeCount: number
  maxMarkdownSlotCount: number
  expectedMarkdownSlotCeiling: number
  expectedDomNodeCeiling: number
  maxExpectedMarkdownSlotCeiling: number
  maxExpectedDomNodeCeiling: number
  blankFrameCount: number
  clippedMessageCount: number
  heightDriftMessageCount: number
  maxItemHeightDriftPx: number
  visibleCoverageOk: boolean
  settledEvents: number
  scrollCompensationCount: number
}

interface CollectStatsOptions {
  reconcile?: boolean
}

interface LabEvent {
  type: string
  at: number
  threadId: ThreadId
  scrollTop: number
  blankProbeCount?: number
  markdownSlotCount?: number
  heightDriftPx?: number
  maxItemHeightDriftPx?: number
  scrollJumpPx?: number
  fromThreadId?: ThreadId
  toThreadId?: ThreadId
}

interface StreamLastMessageOptions {
  blocks?: number
  initialChars?: number
  chunkSize?: number
  intervalMs?: number
}

declare global {
  interface Window {
    __markstreamVirtualScrollLab?: {
      read: () => VirtualScrollLabSnapshot
      scrollToRatio: (ratio: number) => Promise<void>
      switchThread: (threadId: ThreadId) => Promise<void>
      rapidSwitchThreads: (threadIds: ThreadId[], count?: number) => Promise<void>
      startStreamingLastMessage: (options?: StreamLastMessageOptions) => void
      toggleDensity: () => void
      toggleFontScale: () => void
      toggleSmallMessageCoordination: () => void
      nextFrame: () => Promise<void>
      clearEvents: () => void
    }
    __MARKSTREAM_VIRTUAL_SCROLL_LAB__?: {
      read: () => VirtualScrollLabSnapshot
      actions: {
        jumpToTop: () => void
        jumpToMiddle: () => void
        jumpToBottom: () => void
        startStressScroll: () => void
        stopStressScroll: () => void
        startStreamingLastMessage: () => void
        switchThread: (threadId: ThreadId) => Promise<void>
        toggleDensity: () => void
        toggleFontScale: () => void
        toggleSmallMessageCoordination: () => void
        resetHeights: () => void
      }
    }
  }
}

const scrollRoot = ref<HTMLElement | null>(null)
const activeThreadId = ref<ThreadId>('thread-a')
const viewportHeight = ref(720)
const scrollTop = ref(0)
const layoutWidth = ref(0)
const density = ref<'comfortable' | 'compact'>('comfortable')
const fontScale = ref(1)
const maxLiveNodes = ref(220)
const overscanPx = ref(1400)
const stressRunning = ref(false)
const coordinateSmallMessages = ref(false)

const itemHeights = reactive(new Map<string, number>())
const virtualStates = reactive(new Map<string, MarkstreamVirtualState>())
const threadScrollTops = reactive(new Map<ThreadId, number>())
const threadAnchors = reactive(new Map<ThreadId, OuterAnchor>())
const messageEls = new Map<string, HTMLElement>()
const messageCardEls = new Map<string, HTMLElement>()
const markdownHostEls = new Map<string, HTMLElement>()

const domNodeCount = ref(0)
const messageDomCount = ref(0)
const markdownSlotCount = ref(0)
const markdownContentCount = ref(0)
const blankFrameCount = ref(0)
const clippedMessageCount = ref(0)
const heightDriftMessageCount = ref(0)
const maxItemHeightDriftPx = ref(0)
const worstHeightDriftMessageId = ref('')
const visibleCoverageOk = ref(true)
const maxDomNodeCount = ref(0)
const maxMarkdownSlotCount = ref(0)
const maxExpectedMarkdownSlotCeiling = ref(0)
const maxExpectedDomNodeCeiling = ref(0)
const lastHeightEvent = ref<MarkstreamVirtualMetrics | null>(null)
const settledEvents = ref(0)
const scrollCompensationCount = ref(0)
const labEvents = reactive<LabEvent[]>([])

let statsRaf = 0
let stressRaf = 0
let streamTimer: ReturnType<typeof window.setInterval> | null = null
let resizeObserver: ResizeObserver | null = null
let streamBottomPinned = false
let lastObservedScrollTop = 0

function repeatedText(seed: string, index: number) {
  return [
    `This is paragraph ${index} in a long virtual scroll transcript.`,
    `seed=${seed}; the text is intentionally wide enough to reflow when the container width changes.`,
    'The quick brown fox jumps over the lazy dog. '.repeat(4),
  ].join(' ')
}

function makeMarkdown(seed: string, blocks: number) {
  const parts: string[] = [
    `# Virtual Scroll Fixture ${seed}`,
    `This document contains ${blocks} blocks for DOM size, spacer height, scroll restore, and blank-frame checks.`,
  ]

  for (let i = 1; i <= blocks; i++) {
    parts.push(`## ${seed} Section ${i}`)
    parts.push(repeatedText(seed, i))

    if (i % 7 === 0) {
      parts.push([
        `> Quote block ${i}`,
        '> A second quote line verifies block margin and formatting-context measurement.',
      ].join('\n'))
    }

    if (i % 11 === 0) {
      parts.push([
        '| index | value | note |',
        '| --- | ---: | --- |',
        `| ${i} | ${i * 13} | table row for virtual scroll |`,
        `| ${i + 1} | ${(i + 1) * 13} | another row |`,
      ].join('\n'))
    }

    if (i % 17 === 0) {
      parts.push([
        '```ts',
        `export function fixture${i}(input: string) {`,
        `  return input.split('').reverse().join('')`,
        '}',
        '```',
      ].join('\n'))
    }

    if (i % 23 === 0) {
      parts.push([
        '- nested list item A',
        '  - child A1',
        '  - child A2',
        '- nested list item B',
      ].join('\n'))
    }
  }

  return parts.join('\n\n')
}

function makeMessages(threadId: ThreadId): Message[] {
  const prefix = threadId === 'thread-a' ? 'A' : 'B'

  return Array.from({ length: 80 }, (_, index) => {
    const huge = index % 9 === 4 || index === 79
    const blocks = huge ? (index === 79 ? 900 : 360) : 6 + (index % 5)

    return {
      threadId,
      id: `${threadId}-msg-${index}`,
      role: index % 3 === 0 ? 'user' : 'assistant',
      huge,
      final: true,
      revision: 1,
      content: huge
        ? makeMarkdown(`${prefix}-${index}`, blocks)
        : [
            `### ${prefix} message ${index}`,
            repeatedText(prefix, index),
            index % 4 === 0 ? '`inline code` and **bold text**.' : '',
          ].join('\n\n'),
    }
  })
}

const threads = reactive({
  'thread-a': makeMessages('thread-a'),
  'thread-b': makeMessages('thread-b'),
})

const messages = computed(() => threads[activeThreadId.value])

const measurementKey = computed(() => [
  density.value,
  fontScale.value,
  Math.round(layoutWidth.value / 32) * 32,
  maxLiveNodes.value,
].join(':'))

function messageKey(message: Message) {
  return `${message.threadId}:${message.id}:${message.revision}`
}

function setMessageEl(message: Message, el: Element | null) {
  const key = messageKey(message)
  if (el instanceof HTMLElement)
    messageEls.set(key, el)
  else
    messageEls.delete(key)
}

function setMessageCardEl(message: Message, el: Element | null) {
  const key = messageKey(message)
  if (el instanceof HTMLElement)
    messageCardEls.set(key, el)
  else
    messageCardEls.delete(key)
}

function setMarkdownHostEl(message: Message, el: Element | null) {
  const key = messageKey(message)
  if (el instanceof HTMLElement)
    markdownHostEls.set(key, el)
  else
    markdownHostEls.delete(key)
}

function getEstimatedMessageHeight(message: Message) {
  return message.huge
    ? Math.max(2700, Math.ceil(message.content.length * 0.62))
    : 230
}

function getItemHeight(message: Message) {
  return itemHeights.get(messageKey(message)) ?? getEstimatedMessageHeight(message)
}

function isCoordinatedMessage(message: Message) {
  return message.huge || coordinateSmallMessages.value
}

const prefixTops = computed(() => {
  const tops: number[] = [0]
  let total = 0

  for (const message of messages.value) {
    total += getItemHeight(message)
    tops.push(total)
  }

  return tops
})

const totalHeight = computed(() => prefixTops.value[prefixTops.value.length - 1] ?? 0)

function lowerBoundOffset(offset: number) {
  const tops = prefixTops.value
  let low = 0
  let high = Math.max(0, tops.length - 2)
  let answer = high

  while (low <= high) {
    const mid = (low + high) >> 1
    if ((tops[mid + 1] ?? 0) >= offset) {
      answer = mid
      high = mid - 1
    }
    else {
      low = mid + 1
    }
  }

  return answer
}

const visibleRange = computed(() => {
  const startOffset = Math.max(0, scrollTop.value - overscanPx.value)
  const endOffset = Math.min(
    totalHeight.value,
    scrollTop.value + viewportHeight.value + overscanPx.value,
  )

  const start = lowerBoundOffset(startOffset)
  let end = lowerBoundOffset(endOffset) + 1

  end = Math.min(messages.value.length, Math.max(start + 1, end))

  return { start, end }
})

const visibleItems = computed(() => {
  const { start, end } = visibleRange.value

  return messages.value.slice(start, end).map((message, localIndex) => {
    const index = start + localIndex
    return {
      message,
      index,
      top: prefixTops.value[index] ?? 0,
      height: getItemHeight(message),
    }
  })
})

const renderedCoordinatedMessageCount = computed(() => {
  return visibleItems.value.filter(item => isCoordinatedMessage(item.message)).length
})

const expectedMarkdownSlotCeiling = computed(() => {
  return renderedCoordinatedMessageCount.value * (maxLiveNodes.value + 96) + 600
})

const expectedDomNodeCeiling = computed(() => {
  return 1600 + messageDomCount.value * 80 + expectedMarkdownSlotCeiling.value * 8
})

const domSizeOk = computed(() => {
  return markdownSlotCount.value <= expectedMarkdownSlotCeiling.value
    && domNodeCount.value <= expectedDomNodeCeiling.value
})

const blankFrameOk = computed(() => blankFrameCount.value === 0)

const layoutIntegrityOk = computed(() => {
  return maxItemHeightDriftPx.value < 24
    && visibleCoverageOk.value
})

const labStatus = computed(() => {
  if (!blankFrameOk.value)
    return 'blank-frame-risk'
  if (!layoutIntegrityOk.value)
    return 'layout-drift-risk'
  if (!domSizeOk.value)
    return 'dom-size-risk'
  return 'ok'
})

const labReady = computed(() => {
  return totalHeight.value > viewportHeight.value
    && messageDomCount.value > 0
    && markdownSlotCount.value > 0
})

function makeVirtualScrollOptions(message: Message): MarkstreamVirtualScrollOptions {
  const key = messageKey(message)
  const state = virtualStates.get(key)
  const heightCache = state?.heightCache as MarkstreamHeightCache | undefined
  const enabled = message.huge || coordinateSmallMessages.value

  return {
    enabled,
    sessionKey: key,
    threadKey: activeThreadId.value,
    scrollRoot: () => scrollRoot.value,
    restoreState: state ?? null,
    heightCache: heightCache ?? null,
    heightCacheWidth: state?.width,
    measurementKey: measurementKey.value,
    settleMode: 'manual',
    settledToken: message.final,
    emitIntervalMs: 32,
    heightDiffThresholdPx: 1,
  }
}

function onHeightChange(message: Message, metrics: MarkstreamVirtualMetrics) {
  const key = messageKey(message)
  const outerAnchor: OuterAnchor | null = streamBottomPinned
    ? { type: 'bottom', distanceFromBottomPx: 0 }
    : captureOuterAnchor()
  const measuredContentHeight = getMeasuredMessageContentHeight(key)
  const nextHeight = Math.max(
    1,
    Math.ceil(metrics.totalHeight + getMessageChromeHeight(key)),
    measuredContentHeight,
  )
  const previous = itemHeights.get(key)

  lastHeightEvent.value = metrics

  if (previous == null || Math.abs(previous - nextHeight) > 1) {
    itemHeights.set(key, nextHeight)
    void restoreOuterAnchor(outerAnchor, { immediate: true })
  }

  scheduleStats()
  scheduleLabEvent('markdown-height-change', {
    heightDriftPx: previous == null ? 0 : Math.abs(previous - nextHeight),
  })
}

interface OuterAnchor {
  type: 'item' | 'bottom'
  index?: number
  offsetPx?: number
  distanceFromBottomPx?: number
}

function captureOuterAnchor(): OuterAnchor | null {
  const root = scrollRoot.value
  if (!root)
    return null

  const distanceFromBottomPx = Math.max(
    0,
    totalHeight.value - root.scrollTop - root.clientHeight,
  )

  if (distanceFromBottomPx <= 8) {
    return {
      type: 'bottom',
      distanceFromBottomPx,
    }
  }

  const index = lowerBoundOffset(root.scrollTop + 1)
  return {
    type: 'item',
    index,
    offsetPx: root.scrollTop - (prefixTops.value[index] ?? 0),
  }
}

function clampOuterScrollTop(value: number) {
  const max = Math.max(0, totalHeight.value - viewportHeight.value)
  return Math.max(0, Math.min(value, max))
}

function applyOuterScrollTop(value: number) {
  const next = clampOuterScrollTop(value)

  scrollTop.value = next

  const root = scrollRoot.value
  if (root && Math.abs(root.scrollTop - next) > 1)
    root.scrollTop = next
}

function resolveOuterAnchorScrollTop(anchor: OuterAnchor) {
  if (anchor.type === 'bottom') {
    return clampOuterScrollTop(
      totalHeight.value
      - viewportHeight.value
      - Math.max(0, anchor.distanceFromBottomPx ?? 0),
    )
  }

  const index = Math.min(
    Math.max(0, anchor.index ?? 0),
    Math.max(0, messages.value.length - 1),
  )

  return clampOuterScrollTop(
    (prefixTops.value[index] ?? 0) + Math.max(0, anchor.offsetPx ?? 0),
  )
}

async function restoreOuterAnchor(
  anchor: OuterAnchor | null,
  options: { immediate?: boolean } = {},
) {
  if (!anchor)
    return

  const apply = () => {
    const previous = scrollTop.value
    applyOuterScrollTop(resolveOuterAnchorScrollTop(anchor))

    if (Math.abs(previous - scrollTop.value) > 1) {
      scrollCompensationCount.value += 1
      scheduleStats()
    }
  }

  if (options.immediate) {
    apply()
    void nextTick(() => {
      apply()
    })
    return
  }

  await nextTick()
  apply()
}

function getCurrentDistanceFromBottom() {
  const root = scrollRoot.value
  if (!root)
    return 0

  return Math.max(0, totalHeight.value - root.scrollTop - root.clientHeight)
}

function readPx(value: string | null | undefined) {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function getArticleVerticalPadding(key: string) {
  const article = messageEls.get(key)
  if (!article)
    return 0

  const style = window.getComputedStyle(article)
  return readPx(style.paddingTop) + readPx(style.paddingBottom)
}

function getMeasuredMessageContentHeight(key: string) {
  const card = messageCardEls.get(key)
  if (!card)
    return 0

  return Math.ceil(card.scrollHeight + getArticleVerticalPadding(key))
}

function getMessageChromeHeight(key: string) {
  const measured = getMeasuredMessageContentHeight(key)
  const markdownHost = markdownHostEls.get(key)

  if (!measured || !markdownHost)
    return 72

  const markdownHeight = Math.max(
    markdownHost.scrollHeight,
    markdownHost.offsetHeight,
  )

  return Math.max(0, measured - markdownHeight)
}

function onVirtualStateChange(message: Message, state: MarkstreamVirtualState) {
  const key = messageKey(message)
  const previous = virtualStates.get(key)
  virtualStates.set(key, mergeVirtualState(previous, state))
}

function canCarryHeightCache(
  previous: MarkstreamVirtualState | undefined,
  next: MarkstreamVirtualState,
) {
  if (!previous?.heightCache?.length)
    return false

  if (previous.sessionKey !== next.sessionKey)
    return false

  if ((previous.threadKey ?? '') !== (next.threadKey ?? ''))
    return false

  if ((previous.measurementKey ?? '') !== (next.measurementKey ?? ''))
    return false

  if (previous.contentHash && next.contentHash && previous.contentHash !== next.contentHash)
    return false

  return true
}

function mergeVirtualState(
  previous: MarkstreamVirtualState | undefined,
  next: MarkstreamVirtualState,
): MarkstreamVirtualState {
  if (next.heightCache?.length)
    return next

  if (!previous || !canCarryHeightCache(previous, next))
    return next

  const heightCache = previous.heightCache

  return {
    ...next,
    heightCache,
    width: previous.width || next.width,
    contentHash: previous.contentHash ?? next.contentHash,
    measurementKey: previous.measurementKey ?? next.measurementKey,
  }
}

function onRenderSettled() {
  settledEvents.value += 1
  scheduleStats()
  scheduleLabEvent('render-settled')
}

function onScroll() {
  const root = scrollRoot.value
  if (!root)
    return

  scrollTop.value = root.scrollTop
  threadScrollTops.set(activeThreadId.value, root.scrollTop)

  if (streamBottomPinned && !streamTimer && getCurrentDistanceFromBottom() > 64)
    streamBottomPinned = false

  scheduleVisibleDomReconcile()
  scheduleLabEvent('scroll')
}

function scheduleStats() {
  scheduleVisibleDomReconcile()
}

function scheduleVisibleDomReconcile() {
  if (statsRaf)
    return

  statsRaf = requestAnimationFrame(() => {
    statsRaf = 0
    applyLabStats(collectStats({ reconcile: true }))
  })
}

function isProbeCoveredByRenderedContent(probe: Element | null) {
  if (!probe)
    return false

  const element = probe instanceof Element ? probe : probe.parentElement
  if (!element)
    return false

  if (element.closest('.message-meta'))
    return true

  if (element.closest('.node-content, .node-placeholder'))
    return true

  if (element.closest('.markdown-renderer'))
    return false

  const card = element.closest('.message-card')
  if (card?.closest('.virtual-message.huge'))
    return false

  return Boolean(card)
}

function createEmptyLabStats(): LabStats {
  return {
    visibleItemCount: 0,
    markdownRendererCount: 0,
    markdownSlotCount: 0,
    markdownContentCount: 0,
    blankProbeCount: 0,
    heightDriftPx: 0,
    maxItemHeightDriftPx: 0,
    domNodeCount: 0,
    messageDomCount: 0,
    visibleCoverageOk: true,
    clippedMessageCount: 0,
    heightDriftMessageCount: 0,
    worstHeightDriftMessageId: '',
  }
}

function applyLabStats(stats: LabStats) {
  domNodeCount.value = stats.domNodeCount
  messageDomCount.value = stats.messageDomCount
  markdownSlotCount.value = stats.markdownSlotCount
  markdownContentCount.value = stats.markdownContentCount
  maxDomNodeCount.value = Math.max(maxDomNodeCount.value, stats.domNodeCount)
  maxMarkdownSlotCount.value = Math.max(maxMarkdownSlotCount.value, stats.markdownSlotCount)
  maxExpectedMarkdownSlotCeiling.value = Math.max(
    maxExpectedMarkdownSlotCeiling.value,
    expectedMarkdownSlotCeiling.value,
  )
  maxExpectedDomNodeCeiling.value = Math.max(
    maxExpectedDomNodeCeiling.value,
    expectedDomNodeCeiling.value,
  )
  clippedMessageCount.value = stats.clippedMessageCount
  heightDriftMessageCount.value = stats.heightDriftMessageCount
  maxItemHeightDriftPx.value = stats.maxItemHeightDriftPx
  worstHeightDriftMessageId.value = stats.worstHeightDriftMessageId
  visibleCoverageOk.value = stats.visibleCoverageOk

  if (stats.blankProbeCount > 0)
    blankFrameCount.value += 1
}

function collectStats(options: CollectStatsOptions = {}) {
  const root = scrollRoot.value
  if (!root)
    return createEmptyLabStats()

  const reconcile = options.reconcile === true

  const domCount = root.querySelectorAll('*').length
  const messageCount = root.querySelectorAll('.virtual-message').length
  const slotCount = root.querySelectorAll('.node-slot').length
  const contentCount = root.querySelectorAll('.node-content').length

  let drifted = 0
  let maxDrift = 0
  let worstId = ''
  let visibleItemCount = 0
  let blankProbeCount = 0
  let heightDriftPx = 0
  let heightChanged = false
  const outerAnchor: OuterAnchor | null = reconcile && streamBottomPinned
    ? { type: 'bottom', distanceFromBottomPx: 0 }
    : reconcile
      ? captureOuterAnchor()
      : null
  const viewportRect = root.getBoundingClientRect()
  const viewportTop = viewportRect.height > 0 ? viewportRect.top : 0
  const viewportBottom = viewportRect.height > 0 ? viewportRect.bottom : root.clientHeight

  for (const item of visibleItems.value) {
    const key = messageKey(item.message)
    const el = messageEls.get(key)
    if (!el)
      continue

    visibleItemCount++

    const expected = getItemHeight(item.message)
    const coordinated = isCoordinatedMessage(item.message)
    const measured = getMeasuredMessageContentHeight(key)
    const actual = measured || Math.ceil(el.offsetHeight || 0)
    const absDrift = actual > 0 ? Math.abs(actual - expected) : 0

    heightDriftPx += absDrift

    if (reconcile && !coordinated && actual > 0 && absDrift > 1) {
      itemHeights.set(key, Math.ceil(actual))
      heightChanged = true
    }

    if (actual > 0 && absDrift > 2) {
      drifted += 1
      if (absDrift > maxDrift) {
        maxDrift = absDrift
        worstId = item.message.id
      }
    }

    const rect = el.getBoundingClientRect()
    const intersects = rect.bottom > viewportTop && rect.top < viewportBottom
    if (intersects && actual <= 1)
      blankProbeCount++
  }

  if (heightChanged)
    void restoreOuterAnchor(outerAnchor, { immediate: true })

  const rootRect = root.getBoundingClientRect()
  const probePoints = [
    [0.5, 0.25],
    [0.5, 0.5],
    [0.5, 0.75],
    [0.25, 0.5],
    [0.75, 0.5],
  ] as const

  let covered = true

  for (const [xRatio, yRatio] of probePoints) {
    const probe = document.elementFromPoint(
      rootRect.left + rootRect.width * xRatio,
      rootRect.top + rootRect.height * yRatio,
    )

    if (!isProbeCoveredByRenderedContent(probe) && totalHeight.value > viewportHeight.value) {
      covered = false
      break
    }
  }

  if (messageCount === 0 && totalHeight.value > viewportHeight.value)
    blankProbeCount++

  return {
    visibleItemCount,
    markdownRendererCount: root.querySelectorAll('.markstream-vue').length,
    markdownSlotCount: slotCount,
    markdownContentCount: contentCount,
    blankProbeCount,
    heightDriftPx,
    maxItemHeightDriftPx: maxDrift,
    domNodeCount: domCount,
    messageDomCount: messageCount,
    visibleCoverageOk: covered,
    clippedMessageCount: drifted,
    heightDriftMessageCount: drifted,
    worstHeightDriftMessageId: worstId,
  }
}

function pushLabEvent(type: string, payload: Partial<LabEvent> = {}) {
  const now = typeof performance !== 'undefined'
    ? performance.now()
    : Date.now()
  const stats = collectStats({ reconcile: false })
  const currentScrollTop = scrollTop.value
  const scrollJumpPx = Math.abs(currentScrollTop - lastObservedScrollTop)

  lastObservedScrollTop = currentScrollTop

  labEvents.push({
    type,
    at: now,
    threadId: activeThreadId.value,
    scrollTop: currentScrollTop,
    blankProbeCount: stats.blankProbeCount,
    markdownSlotCount: stats.markdownSlotCount,
    heightDriftPx: stats.heightDriftPx,
    maxItemHeightDriftPx: stats.maxItemHeightDriftPx,
    scrollJumpPx,
    ...payload,
  })

  while (labEvents.length > 300)
    labEvents.shift()
}

function scheduleLabEvent(type: string, payload: Partial<LabEvent> = {}) {
  requestAnimationFrame(() => {
    applyLabStats(collectStats({ reconcile: true }))
    pushLabEvent(type, payload)
  })
}

function saveThreadScroll() {
  const root = scrollRoot.value
  if (!root)
    return

  threadScrollTops.set(activeThreadId.value, root.scrollTop)
  const anchor = captureOuterAnchor()
  if (anchor)
    threadAnchors.set(activeThreadId.value, anchor)
}

async function switchThread(threadId: ThreadId) {
  if (threadId === activeThreadId.value)
    return

  saveThreadScroll()
  const previousThreadId = activeThreadId.value
  const previousScrollTop = scrollTop.value

  activeThreadId.value = threadId

  const savedAnchor = threadAnchors.get(threadId)
  const savedScrollTop = threadScrollTops.get(threadId) ?? 0

  if (savedAnchor)
    await restoreOuterAnchor(savedAnchor, { immediate: true })
  else
    applyOuterScrollTop(savedScrollTop)

  await nextTick()

  const root = scrollRoot.value
  if (!root)
    return

  root.scrollTop = scrollTop.value

  applyLabStats(collectStats({ reconcile: true }))
  await waitFrame()

  pushLabEvent('thread-switch', {
    fromThreadId: previousThreadId,
    toThreadId: threadId,
    scrollJumpPx: Math.abs(scrollTop.value - previousScrollTop),
  })

  scheduleVisibleDomReconcile()
}

function jumpToTop() {
  if (!scrollRoot.value)
    return
  scrollRoot.value.scrollTop = 0
  onScroll()
}

function jumpToMiddle() {
  if (!scrollRoot.value)
    return
  scrollRoot.value.scrollTop = Math.max(0, totalHeight.value / 2 - viewportHeight.value / 2)
  onScroll()
}

function jumpToBottom() {
  if (!scrollRoot.value)
    return
  scrollRoot.value.scrollTop = Math.max(0, totalHeight.value - viewportHeight.value)
  onScroll()
}

function toggleDensity() {
  density.value = density.value === 'comfortable' ? 'compact' : 'comfortable'
  scheduleStats()
}

function toggleFontScale() {
  fontScale.value = fontScale.value === 1 ? 1.12 : 1
  scheduleStats()
}

function toggleSmallMessageCoordination() {
  coordinateSmallMessages.value = !coordinateSmallMessages.value
  scheduleStats()
}

function startStressScroll() {
  if (stressRunning.value)
    return

  stressRunning.value = true
  const startedAt = performance.now()

  const step = () => {
    if (!stressRunning.value || !scrollRoot.value)
      return

    const maxScroll = Math.max(0, totalHeight.value - viewportHeight.value)
    const t = performance.now() - startedAt
    const ratio = (Math.sin(t / 600) + 1) / 2

    scrollRoot.value.scrollTop = maxScroll * ratio
    onScroll()

    stressRaf = requestAnimationFrame(step)
  }

  stressRaf = requestAnimationFrame(step)
}

function stopStressScroll() {
  stressRunning.value = false
  if (stressRaf) {
    cancelAnimationFrame(stressRaf)
    stressRaf = 0
  }
}

function startStreamingLastMessage(options: StreamLastMessageOptions = {}) {
  if (streamTimer)
    window.clearInterval(streamTimer)

  const target = messages.value[messages.value.length - 1]
  const full = makeMarkdown(`${activeThreadId.value}-streaming`, options.blocks ?? 1100)
  const chunkSize = Math.max(1, options.chunkSize ?? 2400)
  const intervalMs = Math.max(0, options.intervalMs ?? 80)
  let cursor = Math.max(0, options.initialChars ?? 1200)
  streamBottomPinned = getCurrentDistanceFromBottom() <= 32

  target.revision += 1
  target.content = full.slice(0, cursor)
  target.final = false

  if (streamBottomPinned)
    void restoreOuterAnchor({ type: 'bottom', distanceFromBottomPx: 0 })

  streamTimer = window.setInterval(() => {
    cursor += chunkSize
    target.content = full.slice(0, cursor)

    if (streamBottomPinned)
      void restoreOuterAnchor({ type: 'bottom', distanceFromBottomPx: 0 })

    if (cursor >= full.length) {
      target.content = full
      target.final = true

      if (streamBottomPinned)
        void restoreOuterAnchor({ type: 'bottom', distanceFromBottomPx: 0 })

      if (streamTimer)
        window.clearInterval(streamTimer)
      streamTimer = null
    }
  }, intervalMs)
}

function resetHeights() {
  itemHeights.clear()
  virtualStates.clear()
  streamBottomPinned = false
  blankFrameCount.value = 0
  clippedMessageCount.value = 0
  heightDriftMessageCount.value = 0
  maxItemHeightDriftPx.value = 0
  worstHeightDriftMessageId.value = ''
  visibleCoverageOk.value = true
  maxDomNodeCount.value = 0
  maxMarkdownSlotCount.value = 0
  maxExpectedMarkdownSlotCeiling.value = 0
  maxExpectedDomNodeCeiling.value = 0
  scrollCompensationCount.value = 0
  labEvents.splice(0)
  lastObservedScrollTop = scrollTop.value
  scheduleStats()
}

function readLabHealth(stats = collectStats({ reconcile: false })): LabHealth {
  const maxObservedBlankProbes = Math.max(
    stats.blankProbeCount,
    0,
    ...labEvents.map(event => event.blankProbeCount ?? 0),
  )
  const maxObservedMarkdownSlots = Math.max(
    stats.markdownSlotCount,
    0,
    ...labEvents.map(event => event.markdownSlotCount ?? 0),
  )
  const maxObservedHeightDriftPx = Math.max(
    stats.maxItemHeightDriftPx,
    0,
    ...labEvents.map(event => event.maxItemHeightDriftPx ?? 0),
  )
  const maxObservedScrollJumpPx = Math.max(
    0,
    ...labEvents.map(event => event.scrollJumpPx ?? 0),
  )
  const domSlotBudget = Math.max(1, stats.markdownRendererCount) * 280
  const virtualDomWithinLimit = stats.markdownSlotCount <= domSlotBudget

  return {
    ...stats,
    eventCount: labEvents.length,
    maxObservedBlankProbes,
    maxObservedMarkdownSlots,
    maxObservedHeightDriftPx,
    maxObservedScrollJumpPx,
    virtualDomWithinLimit,
    domSlotBudget,
    layoutIntegrityOk:
      stats.blankProbeCount === 0
      && blankFrameCount.value === 0
      && stats.visibleCoverageOk
      && maxObservedBlankProbes === 0
      && virtualDomWithinLimit
      && maxObservedHeightDriftPx < 24,
  }
}

function readLabSnapshot(): VirtualScrollLabSnapshot {
  const stats = collectStats({ reconcile: false })
  const health = readLabHealth(stats)
  const firstVisibleMessageId = visibleItems.value[0]?.message.id ?? ''
  const outerAnchor = captureOuterAnchor()

  const root = scrollRoot.value
  const currentScrollTop = root?.scrollTop ?? scrollTop.value
  const currentViewportHeight = root?.clientHeight ?? viewportHeight.value

  return {
    ready: labReady.value,
    threadId: activeThreadId.value,
    range: { ...visibleRange.value },
    firstVisibleMessageId,
    outerAnchor,
    stats,
    health,
    events: labEvents.slice(),
    labStatus: labStatus.value,
    activeThreadId: activeThreadId.value,
    totalHeight: totalHeight.value,
    scrollTop: currentScrollTop,
    viewportHeight: currentViewportHeight,
    distanceFromBottomPx: Math.max(0, totalHeight.value - currentScrollTop - currentViewportHeight),
    visibleRange: { ...visibleRange.value },
    messageDomCount: stats.messageDomCount,
    domNodeCount: stats.domNodeCount,
    markdownSlotCount: stats.markdownSlotCount,
    markdownContentCount: stats.markdownContentCount,
    maxDomNodeCount: maxDomNodeCount.value,
    maxMarkdownSlotCount: maxMarkdownSlotCount.value,
    expectedMarkdownSlotCeiling: expectedMarkdownSlotCeiling.value,
    expectedDomNodeCeiling: expectedDomNodeCeiling.value,
    maxExpectedMarkdownSlotCeiling: maxExpectedMarkdownSlotCeiling.value || expectedMarkdownSlotCeiling.value,
    maxExpectedDomNodeCeiling: maxExpectedDomNodeCeiling.value || expectedDomNodeCeiling.value,
    blankFrameCount: blankFrameCount.value,
    clippedMessageCount: stats.clippedMessageCount,
    heightDriftMessageCount: stats.heightDriftMessageCount,
    maxItemHeightDriftPx: stats.maxItemHeightDriftPx,
    visibleCoverageOk: stats.visibleCoverageOk,
    settledEvents: settledEvents.value,
    scrollCompensationCount: scrollCompensationCount.value,
  }
}

const labSnapshot = computed(() => readLabSnapshot())

function waitFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

async function scrollToRatio(ratio: number) {
  const max = Math.max(0, totalHeight.value - viewportHeight.value)
  applyOuterScrollTop(max * Math.max(0, Math.min(1, ratio)))

  await nextTick()
  await waitFrame()
  applyLabStats(collectStats({ reconcile: true }))
  pushLabEvent('scroll-to-ratio')
  scheduleVisibleDomReconcile()
}

async function rapidSwitchThreads(threadIds: ThreadId[], count = 9) {
  for (let i = 0; i < count; i++) {
    await switchThread(threadIds[i % threadIds.length])
    await waitFrame()
  }
}

function clearLabEvents() {
  labEvents.splice(0)
  lastObservedScrollTop = scrollTop.value
}

function exposeLabApi() {
  if (typeof window === 'undefined')
    return

  window.__markstreamVirtualScrollLab = {
    read: readLabSnapshot,
    scrollToRatio,
    switchThread,
    rapidSwitchThreads,
    startStreamingLastMessage,
    toggleDensity,
    toggleFontScale,
    toggleSmallMessageCoordination,
    nextFrame: waitFrame,
    clearEvents: clearLabEvents,
  }

  window.__MARKSTREAM_VIRTUAL_SCROLL_LAB__ = {
    read: readLabSnapshot,
    actions: {
      jumpToTop,
      jumpToMiddle,
      jumpToBottom,
      startStressScroll,
      stopStressScroll,
      startStreamingLastMessage,
      switchThread,
      toggleDensity,
      toggleFontScale,
      toggleSmallMessageCoordination,
      resetHeights,
    },
  }
}

watch([totalHeight, visibleRange, viewportHeight], () => {
  scheduleStats()
}, { flush: 'post' })

onMounted(() => {
  const root = scrollRoot.value
  if (!root)
    return

  exposeLabApi()

  viewportHeight.value = root.clientHeight
  layoutWidth.value = root.clientWidth

  resizeObserver = new ResizeObserver(() => {
    viewportHeight.value = root.clientHeight
    layoutWidth.value = root.clientWidth
    scheduleStats()
  })
  resizeObserver.observe(root)

  scheduleStats()
})

onBeforeUnmount(() => {
  saveThreadScroll()
  stopStressScroll()
  streamBottomPinned = false

  if (typeof window !== 'undefined')
    delete window.__markstreamVirtualScrollLab

  if (typeof window !== 'undefined')
    delete window.__MARKSTREAM_VIRTUAL_SCROLL_LAB__

  messageEls.clear()
  messageCardEls.clear()
  markdownHostEls.clear()

  if (streamTimer)
    window.clearInterval(streamTimer)

  if (statsRaf)
    cancelAnimationFrame(statsRaf)

  resizeObserver?.disconnect()
})
</script>

<template>
  <div
    class="virtual-scroll-page"
    :class="[
      `density-${density}`,
      { 'font-large': fontScale > 1 },
    ]"
  >
    <header class="toolbar">
      <div class="toolbar-main">
        <strong>markstream-vue virtual-scroll coordination lab</strong>
        <span>thread: {{ activeThreadId }}</span>
        <span>messages: {{ messages.length }}</span>
        <span>outer rendered: {{ messageDomCount }}</span>
        <span data-testid="markdown-slots">markdown slots: {{ markdownSlotCount }}</span>
        <span>markdown content: {{ markdownContentCount }}</span>
        <span data-testid="dom-nodes">dom nodes: {{ domNodeCount }}</span>
        <span>max dom: {{ maxDomNodeCount }}</span>
        <span data-testid="blank-probes">blank probes: {{ blankFrameCount }}</span>
        <span>scroll compensations: {{ scrollCompensationCount }}</span>
      </div>

      <div class="toolbar-actions">
        <button @click="switchThread('thread-a')">
          Thread A
        </button>
        <button @click="switchThread('thread-b')">
          Thread B
        </button>
        <button @click="jumpToTop">
          Top
        </button>
        <button @click="jumpToMiddle">
          Middle
        </button>
        <button @click="jumpToBottom">
          Bottom
        </button>
        <button @click="toggleDensity">
          Density: {{ density }}
        </button>
        <button @click="toggleFontScale">
          Font: {{ fontScale }}
        </button>
        <button @click="toggleSmallMessageCoordination">
          Small coordination: {{ coordinateSmallMessages ? 'on' : 'off' }}
        </button>
        <button @click="startStreamingLastMessage">
          Stream last huge message
        </button>
        <button v-if="!stressRunning" @click="startStressScroll">
          Stress scroll
        </button>
        <button v-else @click="stopStressScroll">
          Stop stress
        </button>
        <button @click="resetHeights">
          Reset caches
        </button>
      </div>
    </header>

    <section class="checklist">
      <strong>验收步骤</strong>
      <ol>
        <li>点击 Bottom，然后点击 Stream last huge message，观察 scrollTop 是否保持 pinned，不应向上跳。</li>
        <li>点击 Stress scroll，连续 10 秒，blank probes 必须保持 0，coverage 必须为 ok。</li>
        <li>切换 Thread A / Thread B，再切回来，scrollTop 和 visible range 应恢复。</li>
        <li>切换 Density / Font，max drift 应回落到 0 或接近 0，不能长期 clipped。</li>
        <li>markdown slots 应接近 coordinated message count × maxLiveNodes，而不是随全文节点数线性增长。</li>
      </ol>
    </section>

    <section class="metrics">
      <span data-testid="lab-status" class="status-chip" :class="labStatus">
        status: {{ labStatus }}
      </span>
      <span>totalHeight: {{ Math.round(totalHeight) }}px</span>
      <span>scrollTop: {{ Math.round(scrollTop) }}px</span>
      <span>visible range: {{ visibleRange.start }} - {{ visibleRange.end }}</span>
      <span>maxLiveNodes: {{ maxLiveNodes }}</span>
      <span>settled events: {{ settledEvents }}</span>
      <span data-testid="slot-ceiling">slot ceiling: {{ expectedMarkdownSlotCeiling }}</span>
      <span data-testid="dom-ceiling">dom ceiling: {{ expectedDomNodeCeiling }}</span>
      <span>max slot ceiling: {{ maxExpectedMarkdownSlotCeiling }}</span>
      <span>clipped: {{ clippedMessageCount }}</span>
      <span>height drift items: {{ heightDriftMessageCount }}</span>
      <span data-testid="max-drift">max drift: {{ Math.round(maxItemHeightDriftPx) }}px</span>
      <span v-if="worstHeightDriftMessageId">
        worst drift: {{ worstHeightDriftMessageId }}
      </span>
      <span data-testid="coverage">coverage: {{ visibleCoverageOk ? 'ok' : 'risk' }}</span>
      <span v-if="lastHeightEvent">
        last markdown: {{ Math.round(lastHeightEvent.totalHeight) }}px /
        {{ lastHeightEvent.phase }} /
        measured {{ lastHeightEvent.measuredCount }}/{{ lastHeightEvent.nodeCount }}
      </span>
    </section>

    <section class="metrics-grid">
      <div>
        <strong>visible items</strong>
        <span>{{ labSnapshot.stats.visibleItemCount }}</span>
      </div>

      <div>
        <strong>markdown renderers</strong>
        <span>{{ labSnapshot.stats.markdownRendererCount }}</span>
      </div>

      <div>
        <strong>node-slot count</strong>
        <span>{{ labSnapshot.stats.markdownSlotCount }} / {{ labSnapshot.health.domSlotBudget }}</span>
      </div>

      <div>
        <strong>blank probes</strong>
        <span :class="{ bad: labSnapshot.health.maxObservedBlankProbes > 0 }">
          {{ labSnapshot.health.maxObservedBlankProbes }}
        </span>
      </div>

      <div>
        <strong>height drift</strong>
        <span>{{ Math.round(labSnapshot.health.maxObservedHeightDriftPx) }}px</span>
      </div>

      <div>
        <strong>layout</strong>
        <span :class="{ ok: labSnapshot.health.layoutIntegrityOk, bad: !labSnapshot.health.layoutIntegrityOk }">
          {{ labSnapshot.health.layoutIntegrityOk ? 'ok' : 'bad' }}
        </span>
      </div>
    </section>

    <main
      ref="scrollRoot"
      data-testid="virtual-scroll-root"
      class="scroller"
      @scroll.passive="onScroll"
    >
      <div
        data-testid="virtual-canvas"
        class="virtual-canvas"
        :style="{ height: `${totalHeight}px` }"
      >
        <article
          v-for="{ message, top, height } in visibleItems"
          :key="messageKey(message)"
          :ref="el => setMessageEl(message, el as Element | null)"
          class="virtual-message"
          :class="[message.role, { huge: message.huge }]"
          :style="{
            transform: `translateY(${top}px)`,
            height: `${height}px`,
          }"
        >
          <div
            :ref="el => setMessageCardEl(message, el as Element | null)"
            class="message-card"
          >
            <div class="message-meta">
              <strong>{{ message.role }}</strong>
              <span>{{ message.id }}</span>
              <span v-if="message.huge">huge</span>
              <span>{{ message.final ? 'final' : 'streaming' }}</span>
              <span>estimated item height: {{ Math.round(height) }}px</span>
            </div>

            <div
              :ref="el => setMarkdownHostEl(message, el as Element | null)"
              class="markdown-host"
            >
              <MarkdownRender
                :content="message.content"
                :final="message.final"
                :custom-id="message.id"
                :index-key="messageKey(message)"
                :max-live-nodes="message.huge ? maxLiveNodes : 0"
                :live-node-buffer="48"
                :batch-rendering="true"
                :initial-render-batch-size="40"
                :render-batch-size="80"
                :render-code-blocks-as-pre="true"
                :fade="false"
                :virtual-scroll="makeVirtualScrollOptions(message)"
                @height-change="onHeightChange(message, $event)"
                @virtual-state-change="onVirtualStateChange(message, $event)"
                @render-settled="onRenderSettled"
              />
            </div>
          </div>
        </article>
      </div>
    </main>
  </div>
</template>

<style scoped>
.virtual-scroll-page {
  --lab-bg: #f8fafc;
  --lab-panel: #ffffff;
  --lab-panel-subtle: #f1f5f9;
  --lab-text: #172033;
  --lab-muted: #64748b;
  --lab-border: #d7dee8;
  --lab-accent: #2563eb;

  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--lab-bg);
  color: var(--lab-text);
}

.toolbar {
  flex: 0 0 auto;
  display: grid;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--lab-border);
  background: var(--lab-panel);
}

.checklist {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--lab-border);
  background: #fffbeb;
  color: #78350f;
  font-size: 12px;
}

.checklist ol {
  margin: 0.25rem 0 0;
  padding-left: 1.25rem;
}

.toolbar-main,
.toolbar-actions,
.metrics {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.toolbar-main span,
.metrics span {
  padding: 0.18rem 0.45rem;
  border-radius: 999px;
  background: var(--lab-panel-subtle);
  color: var(--lab-muted);
  font-size: 12px;
}

button {
  padding: 0.3rem 0.55rem;
  border: 1px solid var(--lab-border);
  border-radius: 0.5rem;
  background: var(--lab-panel);
  color: inherit;
  cursor: pointer;
}

button:hover {
  background: var(--lab-panel-subtle);
}

.metrics {
  flex: 0 0 auto;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--lab-border);
  background: color-mix(in srgb, var(--lab-panel) 92%, var(--lab-bg));
}

.metrics-grid {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 1px;
  border-bottom: 1px solid var(--lab-border);
  background: var(--lab-border);
}

.metrics-grid div {
  min-width: 0;
  display: grid;
  gap: 0.25rem;
  padding: 0.55rem 0.75rem;
  background: var(--lab-panel);
}

.metrics-grid strong {
  color: var(--lab-muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.metrics-grid span {
  color: var(--lab-text);
  font-size: 16px;
  font-weight: 700;
}

.metrics-grid .ok {
  color: #166534;
}

.metrics-grid .bad {
  color: #991b1b;
}

@media (max-width: 900px) {
  .metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.status-chip.ok {
  background: #dcfce7;
  color: #166534;
}

.status-chip.layout-drift-risk {
  background: #fef3c7;
  color: #92400e;
}

.status-chip.blank-frame-risk,
.status-chip.dom-size-risk {
  background: #fee2e2;
  color: #991b1b;
}

.scroller {
  flex: 1 1 auto;
  overflow: auto;
  contain: strict;
  position: relative;
}

.virtual-canvas {
  position: relative;
  width: 100%;
  min-height: 100%;
}

.virtual-message {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  box-sizing: border-box;
  padding: 0.75rem 1rem;
  will-change: transform;
  overflow: hidden;
}

.message-card {
  box-sizing: border-box;
  border: 1px solid var(--lab-border);
  border-radius: 0.5rem;
  background: var(--lab-panel);
  padding: 0.85rem;
  overflow: hidden;
}

.markdown-host {
  min-width: 0;
}

.virtual-message.user .message-card {
  background: color-mix(in srgb, var(--lab-panel) 88%, var(--lab-accent) 12%);
}

.virtual-message.huge .message-card {
  border-color: color-mix(in srgb, var(--lab-accent) 45%, var(--lab-border));
}

.message-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
  margin-bottom: 0.65rem;
  font-size: 12px;
  color: var(--lab-muted);
}

.message-meta span,
.message-meta strong {
  padding: 0.15rem 0.4rem;
  border-radius: 999px;
  background: var(--lab-panel-subtle);
}

.density-compact .message-card {
  padding: 0.55rem;
}

.density-compact .virtual-message {
  padding-block: 0.45rem;
}

.font-large {
  font-size: 112%;
}
</style>
