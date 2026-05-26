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

interface VirtualScrollLabSnapshot {
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

declare global {
  interface Window {
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

let statsRaf = 0
let stressRaf = 0
let streamTimer: ReturnType<typeof window.setInterval> | null = null
let resizeObserver: ResizeObserver | null = null
let streamBottomPinned = false

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
  return visibleItems.value.filter(item => item.message.huge || coordinateSmallMessages.value).length
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
  return clippedMessageCount.value === 0
    && heightDriftMessageCount.value === 0
    && maxItemHeightDriftPx.value <= 2
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
    restoreOuterAnchor(outerAnchor)
  }

  scheduleStats()
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

function restoreOuterAnchor(anchor: OuterAnchor | null) {
  if (!anchor)
    return

  void nextTick(() => {
    const root = scrollRoot.value
    if (!root)
      return

    if (anchor.type === 'bottom') {
      root.scrollTop = Math.max(
        0,
        totalHeight.value - root.clientHeight - Math.max(0, anchor.distanceFromBottomPx ?? 0),
      )
    }
    else {
      const index = Math.min(
        Math.max(0, anchor.index ?? 0),
        Math.max(0, messages.value.length - 1),
      )
      root.scrollTop = Math.max(
        0,
        (prefixTops.value[index] ?? 0) + Math.max(0, anchor.offsetPx ?? 0),
      )
    }

    scrollTop.value = root.scrollTop
    scrollCompensationCount.value += 1
    scheduleStats()
  })
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
  virtualStates.set(messageKey(message), state)
}

function onRenderSettled() {
  settledEvents.value += 1
  scheduleStats()
}

function onScroll() {
  const root = scrollRoot.value
  if (!root)
    return

  scrollTop.value = root.scrollTop

  if (streamBottomPinned && getCurrentDistanceFromBottom() > 64)
    streamBottomPinned = false

  scheduleStats()
}

function scheduleStats() {
  if (statsRaf)
    cancelAnimationFrame(statsRaf)

  statsRaf = requestAnimationFrame(() => {
    statsRaf = 0
    collectStats()
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

function collectStats() {
  const root = scrollRoot.value
  if (!root)
    return

  const domCount = root.querySelectorAll('*').length
  const messageCount = root.querySelectorAll('.virtual-message').length
  const slotCount = root.querySelectorAll('.node-slot').length
  const contentCount = root.querySelectorAll('.node-content').length

  domNodeCount.value = domCount
  messageDomCount.value = messageCount
  markdownSlotCount.value = slotCount
  markdownContentCount.value = contentCount
  maxDomNodeCount.value = Math.max(maxDomNodeCount.value, domCount)
  maxMarkdownSlotCount.value = Math.max(maxMarkdownSlotCount.value, slotCount)
  maxExpectedMarkdownSlotCeiling.value = Math.max(
    maxExpectedMarkdownSlotCeiling.value,
    expectedMarkdownSlotCeiling.value,
  )
  maxExpectedDomNodeCeiling.value = Math.max(
    maxExpectedDomNodeCeiling.value,
    expectedDomNodeCeiling.value,
  )

  let drifted = 0
  let maxDrift = 0
  let worstId = ''
  let heightChanged = false
  const outerAnchor: OuterAnchor | null = streamBottomPinned
    ? { type: 'bottom', distanceFromBottomPx: 0 }
    : captureOuterAnchor()

  for (const item of visibleItems.value) {
    const key = messageKey(item.message)
    const actual = getMeasuredMessageContentHeight(key)
    const expected = getItemHeight(item.message)
    const drift = actual - expected
    const absDrift = Math.abs(drift)

    if (actual > 0 && absDrift > 1) {
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
  }

  clippedMessageCount.value = drifted
  heightDriftMessageCount.value = drifted
  maxItemHeightDriftPx.value = maxDrift
  worstHeightDriftMessageId.value = worstId

  if (heightChanged)
    restoreOuterAnchor(outerAnchor)

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

  visibleCoverageOk.value = covered

  if (!covered)
    blankFrameCount.value += 1
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
  activeThreadId.value = threadId

  await nextTick()

  const root = scrollRoot.value
  if (!root)
    return

  const savedAnchor = threadAnchors.get(threadId)
  if (savedAnchor) {
    restoreOuterAnchor(savedAnchor)
  }
  else {
    root.scrollTop = threadScrollTops.get(threadId) ?? 0
    scrollTop.value = root.scrollTop
  }

  scheduleStats()
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

function startStreamingLastMessage() {
  if (streamTimer)
    window.clearInterval(streamTimer)

  const target = messages.value[messages.value.length - 1]
  const full = makeMarkdown(`${activeThreadId.value}-streaming`, 1100)
  let cursor = 1200
  streamBottomPinned = getCurrentDistanceFromBottom() <= 32

  target.revision += 1
  target.content = full.slice(0, cursor)
  target.final = false

  if (streamBottomPinned)
    restoreOuterAnchor({ type: 'bottom', distanceFromBottomPx: 0 })

  streamTimer = window.setInterval(() => {
    cursor += 2400
    target.content = full.slice(0, cursor)

    if (streamBottomPinned)
      restoreOuterAnchor({ type: 'bottom', distanceFromBottomPx: 0 })

    if (cursor >= full.length) {
      target.content = full
      target.final = true

      if (streamBottomPinned)
        restoreOuterAnchor({ type: 'bottom', distanceFromBottomPx: 0 })

      if (streamTimer)
        window.clearInterval(streamTimer)
      streamTimer = null
    }
  }, 80)
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
  scheduleStats()
}

function readLabSnapshot(): VirtualScrollLabSnapshot {
  collectStats()

  const root = scrollRoot.value
  const currentScrollTop = root?.scrollTop ?? scrollTop.value
  const currentViewportHeight = root?.clientHeight ?? viewportHeight.value

  return {
    labStatus: labStatus.value,
    activeThreadId: activeThreadId.value,
    totalHeight: totalHeight.value,
    scrollTop: currentScrollTop,
    viewportHeight: currentViewportHeight,
    distanceFromBottomPx: Math.max(0, totalHeight.value - currentScrollTop - currentViewportHeight),
    visibleRange: { ...visibleRange.value },
    messageDomCount: messageDomCount.value,
    domNodeCount: domNodeCount.value,
    markdownSlotCount: markdownSlotCount.value,
    markdownContentCount: markdownContentCount.value,
    maxDomNodeCount: maxDomNodeCount.value,
    maxMarkdownSlotCount: maxMarkdownSlotCount.value,
    expectedMarkdownSlotCeiling: expectedMarkdownSlotCeiling.value,
    expectedDomNodeCeiling: expectedDomNodeCeiling.value,
    maxExpectedMarkdownSlotCeiling: maxExpectedMarkdownSlotCeiling.value || expectedMarkdownSlotCeiling.value,
    maxExpectedDomNodeCeiling: maxExpectedDomNodeCeiling.value || expectedDomNodeCeiling.value,
    blankFrameCount: blankFrameCount.value,
    clippedMessageCount: clippedMessageCount.value,
    heightDriftMessageCount: heightDriftMessageCount.value,
    maxItemHeightDriftPx: maxItemHeightDriftPx.value,
    visibleCoverageOk: visibleCoverageOk.value,
    settledEvents: settledEvents.value,
    scrollCompensationCount: scrollCompensationCount.value,
  }
}

function exposeLabApi() {
  if (typeof window === 'undefined')
    return

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

watch([totalHeight, visibleRange], () => {
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
