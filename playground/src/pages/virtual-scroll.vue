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
  id: string
  role: 'user' | 'assistant'
  content: string
  final: boolean
  huge: boolean
  revision: number
}

const scrollRoot = ref<HTMLElement | null>(null)
const activeThreadId = ref<'thread-a' | 'thread-b'>('thread-a')
const viewportHeight = ref(720)
const scrollTop = ref(0)
const layoutWidth = ref(0)
const density = ref<'comfortable' | 'compact'>('comfortable')
const fontScale = ref(1)
const maxLiveNodes = ref(220)
const overscanPx = ref(1400)
const stressRunning = ref(false)

const itemHeights = reactive(new Map<string, number>())
const virtualStates = reactive(new Map<string, MarkstreamVirtualState>())
const threadScrollTops = reactive(new Map<string, number>())
const messageEls = new Map<string, HTMLElement>()
const markdownHostEls = new Map<string, HTMLElement>()

const domNodeCount = ref(0)
const messageDomCount = ref(0)
const markdownSlotCount = ref(0)
const markdownContentCount = ref(0)
const blankFrameCount = ref(0)
const clippedMessageCount = ref(0)
const maxItemHeightDriftPx = ref(0)
const worstHeightDriftMessageId = ref('')
const visibleCoverageOk = ref(true)
const maxDomNodeCount = ref(0)
const maxMarkdownSlotCount = ref(0)
const lastHeightEvent = ref<MarkstreamVirtualMetrics | null>(null)
const settledEvents = ref(0)
const scrollCompensationCount = ref(0)

let statsRaf = 0
let stressRaf = 0
let streamTimer: ReturnType<typeof window.setInterval> | null = null
let resizeObserver: ResizeObserver | null = null

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

function makeMessages(threadId: 'thread-a' | 'thread-b'): Message[] {
  const prefix = threadId === 'thread-a' ? 'A' : 'B'

  return Array.from({ length: 80 }, (_, index) => {
    const huge = index % 9 === 4 || index === 79
    const blocks = huge ? (index === 79 ? 900 : 360) : 6 + (index % 5)

    return {
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
  return `${activeThreadId.value}:${message.id}:${message.revision}`
}

function setMessageEl(message: Message, el: Element | null) {
  const key = messageKey(message)
  if (el instanceof HTMLElement)
    messageEls.set(key, el)
  else
    messageEls.delete(key)
}

function setMarkdownHostEl(message: Message, el: Element | null) {
  const key = messageKey(message)
  if (el instanceof HTMLElement)
    markdownHostEls.set(key, el)
  else
    markdownHostEls.delete(key)
}

function getEstimatedMessageHeight(message: Message) {
  return message.huge ? 2700 : 230
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

const renderedHugeMessageCount = computed(() => {
  return visibleItems.value.filter(item => item.message.huge).length
})

const expectedMarkdownSlotCeiling = computed(() => {
  return renderedHugeMessageCount.value * (maxLiveNodes.value + 96) + 600
})

const domSizeOk = computed(() => {
  return markdownSlotCount.value <= expectedMarkdownSlotCeiling.value
})

const blankFrameOk = computed(() => blankFrameCount.value === 0)

const layoutIntegrityOk = computed(() => {
  return clippedMessageCount.value === 0
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

  return {
    enabled: true,
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
  const outerAnchor = captureOuterAnchor()
  const measuredArticleHeight = messageEls.get(key)?.scrollHeight ?? 0
  const nextHeight = Math.max(
    1,
    Math.ceil(metrics.totalHeight + getMessageChromeHeight(key)),
    measuredArticleHeight,
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

function getMessageChromeHeight(key: string) {
  const article = messageEls.get(key)
  const markdownHost = markdownHostEls.get(key)

  if (!article || !markdownHost)
    return 72

  return Math.max(0, article.scrollHeight - markdownHost.offsetHeight)
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

  let clipped = 0
  let maxDrift = 0
  let worstId = ''

  for (const item of visibleItems.value) {
    const key = messageKey(item.message)
    const article = messageEls.get(key)
    if (!article)
      continue

    const actual = article.scrollHeight
    const expected = getItemHeight(item.message)
    const drift = actual - expected

    if (drift > 2) {
      clipped += 1
      if (drift > maxDrift) {
        maxDrift = drift
        worstId = item.message.id
      }
    }
  }

  clippedMessageCount.value = clipped
  maxItemHeightDriftPx.value = maxDrift
  worstHeightDriftMessageId.value = worstId

  const rootRect = root.getBoundingClientRect()
  const probePoints = [
    [0.5, 0.25],
    [0.5, 0.5],
    [0.5, 0.75],
  ] as const

  let covered = true

  for (const [xRatio, yRatio] of probePoints) {
    const probe = document.elementFromPoint(
      rootRect.left + rootRect.width * xRatio,
      rootRect.top + rootRect.height * yRatio,
    )

    if (!probe?.closest?.('.virtual-message') && totalHeight.value > viewportHeight.value) {
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
}

async function switchThread(threadId: 'thread-a' | 'thread-b') {
  if (threadId === activeThreadId.value)
    return

  saveThreadScroll()
  activeThreadId.value = threadId

  await nextTick()

  const root = scrollRoot.value
  if (root) {
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

  target.revision += 1
  target.content = full.slice(0, cursor)
  target.final = false

  streamTimer = window.setInterval(() => {
    cursor += 2400
    target.content = full.slice(0, cursor)

    if (cursor >= full.length) {
      target.content = full
      target.final = true

      if (streamTimer)
        window.clearInterval(streamTimer)
      streamTimer = null
    }
  }, 80)
}

function resetHeights() {
  itemHeights.clear()
  virtualStates.clear()
  messageEls.clear()
  markdownHostEls.clear()
  blankFrameCount.value = 0
  clippedMessageCount.value = 0
  maxItemHeightDriftPx.value = 0
  worstHeightDriftMessageId.value = ''
  visibleCoverageOk.value = true
  maxDomNodeCount.value = 0
  maxMarkdownSlotCount.value = 0
  scrollCompensationCount.value = 0
  scheduleStats()
}

watch([totalHeight, visibleRange], () => {
  scheduleStats()
}, { flush: 'post' })

onMounted(() => {
  const root = scrollRoot.value
  if (!root)
    return

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
        <span>markdown slots: {{ markdownSlotCount }}</span>
        <span>markdown content: {{ markdownContentCount }}</span>
        <span>dom nodes: {{ domNodeCount }}</span>
        <span>max dom: {{ maxDomNodeCount }}</span>
        <span>blank probes: {{ blankFrameCount }}</span>
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
        <li>markdown slots 应接近 renderedHugeMessageCount × maxLiveNodes，而不是随全文节点数线性增长。</li>
      </ol>
    </section>

    <section class="metrics">
      <span class="status-chip" :class="labStatus">
        status: {{ labStatus }}
      </span>
      <span>totalHeight: {{ Math.round(totalHeight) }}px</span>
      <span>scrollTop: {{ Math.round(scrollTop) }}px</span>
      <span>visible range: {{ visibleRange.start }} - {{ visibleRange.end }}</span>
      <span>maxLiveNodes: {{ maxLiveNodes }}</span>
      <span>settled events: {{ settledEvents }}</span>
      <span>slot ceiling: {{ expectedMarkdownSlotCeiling }}</span>
      <span>clipped: {{ clippedMessageCount }}</span>
      <span>max drift: {{ Math.round(maxItemHeightDriftPx) }}px</span>
      <span v-if="worstHeightDriftMessageId">
        worst drift: {{ worstHeightDriftMessageId }}
      </span>
      <span>coverage: {{ visibleCoverageOk ? 'ok' : 'risk' }}</span>
      <span v-if="lastHeightEvent">
        last markdown: {{ Math.round(lastHeightEvent.totalHeight) }}px /
        {{ lastHeightEvent.phase }} /
        measured {{ lastHeightEvent.measuredCount }}/{{ lastHeightEvent.nodeCount }}
      </span>
    </section>

    <main
      ref="scrollRoot"
      class="scroller"
      @scroll.passive="onScroll"
    >
      <div class="virtual-canvas" :style="{ height: `${totalHeight}px` }">
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
          <div class="message-card">
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
