<script setup lang="ts">
import type { CacheSnapshot, ScrollToOptions } from 'vue-virtual-scroller'
import type {
  MarkstreamOuterVirtualizerAdapter,
  MarkstreamThreadVirtualState,
} from '../../../src/exports'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import { getUseMonaco } from '../../../src/components/CodeBlockNode/monaco'
import MarkdownRender, { useMarkstreamVirtualAdapter } from '../../../src/exports'
import KatexWorker from '../../../src/workers/katexRenderer.worker?worker&inline'
import { setKaTeXWorker } from '../../../src/workers/katexWorkerClient'
import MermaidWorker from '../../../src/workers/mermaidParser.worker?worker&inline'
import { setMermaidWorker } from '../../../src/workers/mermaidWorkerClient'
import '../../../src/index.css'
import 'katex/dist/katex.min.css'
import 'vue-virtual-scroller/index.css'

type ThreadId = 'thread-a' | 'thread-b'

setKaTeXWorker(new KatexWorker())
setMermaidWorker(new MermaidWorker())
getUseMonaco()

interface BaseTimelineItem {
  threadId: ThreadId
  id: string
  key: string
  revision?: number
}

type TimelineItem
  = | (BaseTimelineItem & { kind: 'system-divider', text: string })
    | (BaseTimelineItem & { kind: 'user-message', text: string })
    | (BaseTimelineItem & { kind: 'assistant-markdown', content: string, final: boolean })
    | (BaseTimelineItem & { kind: 'tool-call', status: 'running' | 'done', label: string })
    | (BaseTimelineItem & { kind: 'error', message: string })

interface ScrollerHandle {
  $el?: Element
  scrollToItem?: (index: number, options?: ScrollToOptions) => void
  scrollToPosition?: (position: number, options?: ScrollToOptions) => void
  findItemIndex?: (offset: number) => number
  getItemOffset?: (index: number) => number
  getItemSize?: (item: TimelineItem, index?: number) => number
  scrollToBottom?: () => void
  forceUpdate?: (clear?: boolean) => void
  cacheSnapshot?: CacheSnapshot | { value: CacheSnapshot }
  restoreCache?: (snapshot: CacheSnapshot | null | undefined) => boolean
}

interface SavedThreadState {
  markstreamState: MarkstreamThreadVirtualState
  scrollerCache: CacheSnapshot | null
}

function makeKey(threadId: ThreadId, id: string) {
  return `${threadId}:${id}`
}

function makeSyntaxMarkdown(label: string) {
  return [
    `# ${label}: full Markdown coverage`,
    '',
    'This assistant row is intentionally shaped like a production answer: prose, inline formatting, nested blocks, tables, images, math, diagrams, and code all live inside one timeline item.',
    '',
    '## Inline elements',
    '',
    'Text with **bold**, *italic*, ~~deleted text~~, ==highlighted text==, `inline code`, a [link](https://github.com/Simon-He95/markstream-vue), <sub>subscript</sub>, <sup>superscript</sup>, and a footnote reference[^syntax-note].',
    '',
    '## Lists',
    '',
    '- First unordered item',
    '- Second item with **strong** content',
    '  - Nested item A',
    '  - Nested item B',
    '    - Deep nested item',
    '',
    '1. Collect messages',
    '2. Measure outer rows',
    '   1. Preserve bubble chrome',
    '   2. Keep Markdown logical height',
    '3. Restore the thread anchor',
    '',
    '- [x] Timeline rows virtualized by `DynamicScroller`',
    '- [x] Markdown nodes virtualized by markstream-vue',
    '- [ ] Product telemetry wired to the demo app',
    '',
    '## Quote and admonitions',
    '',
    '> A long assistant message should keep the scroll model stable even when expensive child blocks mount asynchronously.',
    '>',
    '> > Nested quotes should not collapse the measured wrapper height.',
    '',
    '::: note',
    'This note block uses the same Markdown row measurement path as the rest of the assistant bubble.',
    ':::',
    '',
    '::: warning',
    'Mermaid and KaTeX can settle after the first paint, so the outer row must be reconciled after `onHeightChange` and ResizeObserver callbacks.',
    ':::',
    '',
    '## Tables',
    '',
    '| Feature | Owner | Height risk | Status |',
    '| --- | --- | ---: | --- |',
    '| Timeline row virtualization | vue-virtual-scroller | 2 | done |',
    '| Markdown node virtualization | markstream-vue | 5 | done |',
    '| Mermaid preview | MermaidBlockNode | 4 | done |',
    '| KaTeX block math | MathBlockNode | 4 | done |',
    '| Rich code blocks | CodeBlockNode | 3 | done |',
    '',
    '## Image and HTML',
    '',
    '![Vue logo](https://vuejs.org/images/logo.png)',
    '',
    '<details>',
    '<summary>HTML block inside the assistant message</summary>',
    '',
    '<p>The wrapper measurement should include this block even if the Markdown node window changes.</p>',
    '</details>',
    '',
    '[^syntax-note]: Footnotes are part of the same logical Markdown height.',
  ].join('\n')
}

function makeCodeMarkdown(label: string, step: number) {
  return [
    `# ${label}: code-heavy response ${step}`,
    '',
    'The row below mixes Monaco-backed code blocks, lightweight pre blocks, JSON, shell, and diff content. This is the path that usually exposes row-height drift if the outer virtualizer only trusts the mounted DOM.',
    '',
    '```ts title="useStableTimeline.ts"',
    'import { computed, nextTick, reactive, ref } from "vue"',
    '',
    'interface TimelineRow {',
    '  key: string',
    '  markdown?: string',
    '  measuredHeight?: number',
    '}',
    '',
    'const rows = reactive(new Map<string, TimelineRow>())',
    'const scrollTop = ref(0)',
    '',
    'export function rememberHeight(key: string, height: number) {',
    '  const row = rows.get(key)',
    '  if (!row || Math.abs((row.measuredHeight ?? 0) - height) < 0.5)',
    '    return',
    '',
    '  row.measuredHeight = height',
    '  void nextTick(() => {',
    '    // DynamicScroller.forceUpdate(false) happens in the adapter.',
    '  })',
    '}',
    '',
    'export const totalMeasuredRows = computed(() => rows.size)',
    '```',
    '',
    '```vue title="AssistantMarkdownRow.vue"',
    '<template>',
    '  <article ref="rowEl" class="assistant-bubble">',
    '    <MarkdownRender',
    '      v-bind="adapter.markdownProps(item, index)"',
    '      :max-live-nodes="280"',
    '      :live-node-buffer="80"',
    '      :batch-rendering="true"',
    '    />',
    '  </article>',
    '</template>',
    '```',
    '',
    '```json',
    JSON.stringify({
      thread: label,
      revision: step,
      virtualizer: 'vue-virtual-scroller',
      markdownFeatures: ['code', 'table', 'math', 'mermaid', 'html'],
    }, null, 2),
    '```',
    '',
    '```bash',
    'pnpm add vue-virtual-scroller markstream-vue',
    'pnpm exec vitest --run test/playground-virtual-scroller-markstream-page.smoke.test.ts',
    'pnpm run -C playground build',
    '```',
    '',
    '```diff',
    '+ item height = max(wrapper height, markdown logical height)',
    '- item height = markdown logical height only',
    '+ restore DynamicScroller cache before restoring the markstream anchor',
    '```',
  ].join('\n')
}

function makeDiagramMathMarkdown(label: string, step: number) {
  return [
    `# ${label}: Mermaid and KaTeX response ${step}`,
    '',
    'Inline math should render in prose: $E = mc^2$, $\\alpha + \\beta = \\gamma$, and $\\nabla \\cdot \\mathbf{E} = \\rho / \\varepsilon_0$.',
    '',
    'Block math should reserve and then reconcile height:',
    '',
    '$$',
    '\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}',
    '$$',
    '',
    '$$',
    '\\mathbf{K}(x_i, x_j) = \\exp\\left(-\\frac{\\lVert x_i - x_j \\rVert^2}{2\\sigma^2}\\right)',
    '$$',
    '',
    '```mermaid',
    'sequenceDiagram',
    '  participant U as User',
    '  participant V as DynamicScroller',
    '  participant M as markstream-vue',
    '  participant R as ResizeObserver',
    '  U->>V: drag scrollbar',
    '  V->>M: mount assistant row',
    '  M->>M: virtualize Markdown nodes',
    '  M-->>V: onHeightChange(totalHeight)',
    '  R-->>V: wrapper chrome changed',
    '  V-->>U: stable row offset',
    '```',
    '',
    '```mermaid',
    'graph TD',
    '  A[Thread cache] --> B[DynamicScroller cacheSnapshot]',
    '  A --> C[markstream virtual state]',
    '  B --> D[restoreCache]',
    '  C --> E[restoreThreadState]',
    '  D --> F[stable scrollbar]',
    '  E --> F',
    '```',
    '',
    '```infographic',
    'infographic list-row-simple-horizontal-arrow',
    'data',
    '  items',
    '    - label: Cache snapshot',
    '      desc: Restored before paint',
    '    - label: Markdown state',
    '      desc: Preloaded into adapter',
    '    - label: Diagram height',
    '      desc: Locked to estimated preview height',
    '```',
    '',
    '| Formula | Meaning |',
    '| --- | --- |',
    '| `$H = max(H_{wrapper}, H_{markdown})$` | timeline item size |',
    '| `$O_i = \\sum_{k < i} H_k$` | prefix offset |',
    '| `$B = 1800px$` | overscan buffer used by this demo |',
  ].join('\n')
}

function makeLongMarkdown(label: string, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const step = index + 1
    return [
      `## ${label} section ${step}`,
      'This assistant message is intentionally long. The outer DynamicScroller owns the message row, while markstream-vue virtualizes the Markdown nodes inside this row.',
      '',
      '| Metric | Value |',
      '| --- | --- |',
      `| Section | ${step} |`,
      `| Label | ${label} |`,
      `| Inline math | $x_${step} = ${step}^2$ |`,
      '',
      '```ts',
      `const payload${step} = ${JSON.stringify({ label, step })}`,
      `const stableHeight${step} = Math.max(wrapperHeight, markdownLogicalHeight)`,
      '```',
    ].join('\n')
  }).join('\n\n')
}

function makeMarkdown(label: string, step: number) {
  if (step % 5 === 1)
    return makeSyntaxMarkdown(label)
  if (step % 5 === 2)
    return makeDiagramMathMarkdown(label, step)
  if (step % 5 === 3)
    return makeCodeMarkdown(label, step)
  return makeLongMarkdown(`${label} long report ${step}`, step % 2 === 0 ? 16 : 10)
}

function createItem<T extends Omit<TimelineItem, 'key'>>(item: T): T & { key: string } {
  return {
    ...item,
    key: makeKey(item.threadId, item.id),
  }
}

function makeThread(threadId: ThreadId, label: string, markdownCount: number): TimelineItem[] {
  const items: TimelineItem[] = [
    createItem({ threadId, id: 'divider-1', kind: 'system-divider', text: label }),
  ]

  for (let index = 0; index < markdownCount; index++) {
    const step = index + 1
    items.push(
      createItem({
        threadId,
        id: `user-${step}`,
        kind: 'user-message',
        text: step % 3 === 0
          ? 'Keep the current scroll position stable while this long answer renders.'
          : 'Show the next analysis block.',
      }),
      createItem({
        threadId,
        id: `tool-${step}`,
        kind: 'tool-call',
        status: step % 4 === 0 ? 'running' : 'done',
        label: `Tool result ${step}`,
      }),
      createItem({
        threadId,
        id: `markdown-${step}`,
        kind: 'assistant-markdown',
        content: makeMarkdown(`${label} analysis ${step}`, step),
        final: true,
        revision: step,
      }),
    )
  }

  items.push(createItem({
    threadId,
    id: 'error-1',
    kind: 'error',
    message: 'A retryable tool error is measured as an ordinary timeline row.',
  }))

  return items
}

const activeThreadId = ref<ThreadId>('thread-a')
const scrollerRef = ref<ScrollerHandle | null>(null)
const itemHeights = new Map<string, number>()
const itemOffsets = new Map<string, number>()
const savedThreadStates = new Map<ThreadId, SavedThreadState>()
const rowRefCallbacks = new Map<string, (el: Element | { $el?: Element | null } | null | undefined) => void>()
const visibleRange = ref({ start: 0, end: 0 })
const scrollTop = ref(0)
const viewportHeight = ref(0)
const totalHeight = ref(0)
const widthBucket = ref(0)
const itemHeightVersion = ref(0)
const isRestoringThread = ref(false)
let rootResizeObserver: ResizeObserver | null = null
let itemHeightVersionPending = false
let scrollerRefreshPending = false

const VIRTUAL_SCROLLER_STORAGE_KEY = 'markstream-vue:virtual-scroller-markstream:thread-states:v1'

type PersistedScrollerThreadStates = Partial<Record<ThreadId, SavedThreadState>>

function readPersistedScrollerStates(): PersistedScrollerThreadStates {
  if (typeof window === 'undefined')
    return {}

  try {
    const raw = window.sessionStorage.getItem(VIRTUAL_SCROLLER_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  }
  catch {
    return {}
  }
}

const persistedScrollerStates = readPersistedScrollerStates()

for (const [threadId, state] of Object.entries(persistedScrollerStates) as Array<[ThreadId, SavedThreadState]>)
  savedThreadStates.set(threadId, state)

const threadItems: Record<ThreadId, TimelineItem[]> = {
  'thread-a': makeThread('thread-a', 'Thread A', 12),
  'thread-b': makeThread('thread-b', 'Thread B', 10),
}

const items = computed(() => threadItems[activeThreadId.value])
const indexByKey = computed(() => {
  const map = new Map<string, number>()
  for (let index = 0; index < items.value.length; index++)
    map.set(items.value[index]!.key, index)
  return map
})

const measurementKey = computed(() => [
  'vue-virtual-scroller-demo',
  widthBucket.value,
].join(':'))

const storedHeightCount = computed(() => {
  void itemHeightVersion.value

  let count = 0
  for (const item of items.value) {
    if (itemHeights.has(item.key))
      count += 1
  }
  return count
})

function getItemKey(item: TimelineItem) {
  return item.key
}

function getItemContent(item: TimelineItem) {
  return item.kind === 'assistant-markdown' ? item.content : ''
}

function getItemFinal(item: TimelineItem) {
  return item.kind !== 'assistant-markdown' || item.final
}

function getItemRevision(item: TimelineItem) {
  return item.kind === 'assistant-markdown' ? item.revision : undefined
}

function estimateItemHeight(item: TimelineItem) {
  if (item.kind === 'assistant-markdown')
    return Math.max(760, Math.min(2400, item.content.split('\n').length * 26))
  if (item.kind === 'system-divider')
    return 44
  if (item.kind === 'tool-call')
    return 74
  if (item.kind === 'error')
    return 78
  return 92
}

function rebuildOffsets() {
  let offset = 0
  itemOffsets.clear()

  for (const item of items.value) {
    itemOffsets.set(item.key, offset)
    offset += itemHeights.get(item.key) ?? estimateItemHeight(item)
  }
}

function scheduleItemHeightViewUpdate() {
  if (itemHeightVersionPending)
    return

  itemHeightVersionPending = true

  const update = () => {
    itemHeightVersionPending = false
    itemHeightVersion.value += 1
  }

  void nextTick(() => {
    if (typeof requestAnimationFrame === 'function')
      requestAnimationFrame(update)
    else
      update()
  })
}

function scheduleScrollerRefresh() {
  if (scrollerRefreshPending)
    return

  scrollerRefreshPending = true

  const refresh = () => {
    scrollerRefreshPending = false
    scrollerRef.value?.forceUpdate?.(false)
    updateScrollMetrics()
  }

  void nextTick(() => {
    if (typeof requestAnimationFrame === 'function')
      requestAnimationFrame(refresh)
    else
      refresh()
  })
}

function getScrollElement() {
  const element = scrollerRef.value?.$el
  return element instanceof HTMLElement ? element : null
}

function readCacheSnapshot() {
  const snapshot = scrollerRef.value?.cacheSnapshot
  if (!snapshot)
    return null
  return 'value' in snapshot ? snapshot.value : snapshot
}

function updateWidthBucket() {
  const width = getScrollElement()?.clientWidth ?? 0
  widthBucket.value = width > 0
    ? Math.round(width / 32) * 32
    : 0
}

function updateScrollMetrics() {
  const root = getScrollElement()
  scrollTop.value = root?.scrollTop ?? 0
  viewportHeight.value = root?.clientHeight ?? 0
  totalHeight.value = root?.scrollHeight ?? 0
  updateWidthBucket()

  const start = scrollerRef.value?.findItemIndex?.(scrollTop.value) ?? 0
  const end = scrollerRef.value?.findItemIndex?.(scrollTop.value + viewportHeight.value) ?? start
  const nextRange = {
    start: Math.min(Math.max(0, start), Math.max(0, items.value.length - 1)),
    end: Math.min(items.value.length, Math.max(end + 1, start + 1)),
  }

  if (visibleRange.value.start !== nextRange.start || visibleRange.value.end !== nextRange.end)
    visibleRange.value = nextRange
}

function getOffsetForKey(key: string) {
  const index = indexByKey.value.get(key)
  if (index != null) {
    const offset = scrollerRef.value?.getItemOffset?.(index)
    if (Number.isFinite(offset))
      return offset!
  }
  return itemOffsets.get(key) ?? 0
}

function getSizeForKey(key: string) {
  const index = indexByKey.value.get(key)
  const item = index == null ? undefined : items.value[index]
  if (item) {
    const size = scrollerRef.value?.getItemSize?.(item, index)
    if (Number.isFinite(size) && size! > 0)
      return size!
  }
  return itemHeights.get(key) ?? 0
}

const virtualizer: MarkstreamOuterVirtualizerAdapter = {
  getScrollElement,
  getScrollTop: () => getScrollElement()?.scrollTop ?? 0,
  setScrollTop: value => scrollerRef.value?.scrollToPosition?.(value),
  getViewportHeight: () => getScrollElement()?.clientHeight ?? 0,
  getTotalHeight: () => getScrollElement()?.scrollHeight ?? 0,
  getItemOffset: getOffsetForKey,
  getItemSize: getSizeForKey,
  setItemSize(key, size) {
    const previous = itemHeights.get(key)
    if (previous != null && Math.abs(previous - size) < 0.5)
      return

    itemHeights.set(key, size)
    rebuildOffsets()
    scheduleItemHeightViewUpdate()
    scheduleScrollerRefresh()
  },
  getVisibleRange: () => visibleRange.value,
  scrollToOffset: offset => scrollerRef.value?.scrollToPosition?.(offset),
  scrollToIndex: (index, align = 'start') => scrollerRef.value?.scrollToItem?.(index, { align }),
  measureElement: () => {},
}

const adapter = useMarkstreamVirtualAdapter<TimelineItem>({
  items,
  threadKey: activeThreadId,
  getKey: getItemKey,
  getKind: item => item.kind,
  getContent: getItemContent,
  getFinal: getItemFinal,
  getRevision: getItemRevision,
  estimateItemHeight,
  measurementKey,
  virtualizer,
})

const initialSavedState = savedThreadStates.get(activeThreadId.value)

if (initialSavedState)
  adapter.preloadThreadState(initialSavedState.markstreamState)

function measureRow(
  item: TimelineItem,
  index: number,
  el: Element | { $el?: Element | null } | null | undefined,
) {
  adapter.measureItem(item, index, el)
}

function getRowRef(item: TimelineItem, index: number) {
  const existing = rowRefCallbacks.get(item.key)
  if (existing)
    return existing

  const callback = (el: Element | { $el?: Element | null } | null | undefined) => {
    measureRow(item, index, el)
  }

  rowRefCallbacks.set(item.key, callback)
  return callback
}

function rememberThreadState(threadId: ThreadId = activeThreadId.value) {
  savedThreadStates.set(threadId, {
    markstreamState: adapter.captureThreadState(),
    scrollerCache: readCacheSnapshot(),
  })

  writePersistedScrollerStates()
}

function writePersistedScrollerStates() {
  if (typeof window === 'undefined')
    return

  const payload = Object.fromEntries(savedThreadStates.entries())

  try {
    window.sessionStorage.setItem(
      VIRTUAL_SCROLLER_STORAGE_KEY,
      JSON.stringify(payload),
    )
  }
  catch {}
}

async function switchThread(threadId: ThreadId) {
  if (threadId === activeThreadId.value)
    return

  isRestoringThread.value = true

  rememberThreadState()

  const saved = savedThreadStates.get(threadId)
  if (saved)
    adapter.preloadThreadState(saved.markstreamState)
  else
    adapter.preloadThreadState(null)

  activeThreadId.value = threadId
  rebuildOffsets()

  await nextTick()

  if (saved) {
    scrollerRef.value?.restoreCache?.(saved.scrollerCache)
    adapter.restoreThreadState(saved.markstreamState)
  }
  else {
    adapter.restoreThreadState(null)
    scrollerRef.value?.scrollToPosition?.(0)
  }

  scrollerRef.value?.forceUpdate?.(false)
  updateScrollMetrics()

  await nextTick()

  if (typeof requestAnimationFrame === 'function') {
    await new Promise<void>(resolve => requestAnimationFrame(() => {
      resolve()
    }))
  }

  isRestoringThread.value = false
}

function scrollToTop() {
  scrollerRef.value?.scrollToPosition?.(0)
  updateScrollMetrics()
}

function scrollToBottom() {
  scrollerRef.value?.scrollToBottom?.()
  updateScrollMetrics()
}

function onScroll() {
  updateScrollMetrics()
  rememberThreadState()
}

onMounted(async () => {
  rebuildOffsets()

  const initialSaved = savedThreadStates.get(activeThreadId.value)
  if (initialSaved) {
    isRestoringThread.value = true

    await nextTick()

    scrollerRef.value?.restoreCache?.(initialSaved.scrollerCache)
    adapter.restoreThreadState(initialSaved.markstreamState)
    scrollerRef.value?.forceUpdate?.(false)
  }

  updateScrollMetrics()

  const root = getScrollElement()
  root?.addEventListener('scroll', onScroll, { passive: true })

  if (root && typeof ResizeObserver !== 'undefined') {
    rootResizeObserver = new ResizeObserver(() => {
      updateScrollMetrics()
    })
    rootResizeObserver.observe(root)
  }

  if (initialSaved) {
    await nextTick()

    if (typeof requestAnimationFrame === 'function') {
      await new Promise<void>(resolve => requestAnimationFrame(() => {
        resolve()
      }))
    }

    isRestoringThread.value = false
  }
})

onBeforeUnmount(() => {
  rememberThreadState()
  getScrollElement()?.removeEventListener('scroll', onScroll)
  rootResizeObserver?.disconnect()
  adapter.dispose()
})
</script>

<template>
  <main class="virtual-scroller-markstream">
    <header class="lab-header">
      <div>
        <strong>markstream-vue + vue-virtual-scroller</strong>
        <span>Real mixed timeline with Markdown syntax, Mermaid, KaTeX, and rich code blocks.</span>
      </div>
      <div class="toolbar">
        <div class="thread-tabs">
          <button
            :class="{ active: activeThreadId === 'thread-a' }"
            @click="switchThread('thread-a')"
          >
            Thread A
          </button>
          <button
            :class="{ active: activeThreadId === 'thread-b' }"
            @click="switchThread('thread-b')"
          >
            Thread B
          </button>
        </div>
        <button class="icon-button" title="Scroll to top" @click="scrollToTop">
          ↑
        </button>
        <button class="icon-button" title="Scroll to bottom" @click="scrollToBottom">
          ↓
        </button>
      </div>
    </header>

    <section class="metrics-strip">
      <span>{{ items.length }} rows</span>
      <span>{{ storedHeightCount }} measured</span>
      <span>{{ Math.round(scrollTop) }}px scroll</span>
      <span>{{ Math.round(totalHeight) }}px total</span>
      <span>{{ visibleRange.start }}-{{ visibleRange.end }} visible</span>
    </section>

    <DynamicScroller
      ref="scrollerRef"
      class="message-scroller"
      :class="{ 'is-restoring-thread': isRestoringThread }"
      :items="items"
      key-field="key"
      :min-item-size="72"
      :buffer="1800"
      @resize="updateScrollMetrics"
      @visible="updateScrollMetrics"
    >
      <template #default="{ item, index, active }">
        <DynamicScrollerItem
          :item="item"
          :active="active"
          :index="index"
          tag="section"
          class="dynamic-row"
        >
          <article
            :ref="getRowRef(item, index)"
            class="timeline-row"
            :data-kind="item.kind"
          >
            <div
              v-if="item.kind === 'system-divider'"
              class="divider-row"
            >
              {{ item.text }}
            </div>

            <div
              v-else-if="item.kind === 'user-message'"
              class="message-bubble user-bubble"
            >
              {{ item.text }}
            </div>

            <div
              v-else-if="item.kind === 'tool-call'"
              class="status-row tool-row"
            >
              <span>{{ item.status }}</span>
              {{ item.label }}
            </div>

            <div
              v-else-if="item.kind === 'assistant-markdown'"
              class="message-bubble assistant-bubble"
            >
              <MarkdownRender
                v-bind="adapter.markdownProps(item, index)"
                class="assistant-markdown"
                :max-live-nodes="280"
                :live-node-buffer="80"
                :batch-rendering="true"
                :code-block-props="{
                  showHeader: true,
                  showCopyButton: true,
                  showCollapseButton: true,
                  showExpandButton: true,
                }"
              />
            </div>

            <div
              v-else-if="item.kind === 'error'"
              class="status-row error-row"
            >
              {{ item.message }}
            </div>
          </article>
        </DynamicScrollerItem>
      </template>
    </DynamicScroller>
  </main>
</template>

<style scoped>
.virtual-scroller-markstream {
  min-height: 100vh;
  padding: 20px;
  background: #f8fafc;
  color: #111827;
}

.lab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  max-width: 1120px;
  margin: 0 auto 12px;
}

.lab-header div:first-child {
  display: grid;
  gap: 4px;
}

.lab-header strong {
  font-size: 16px;
}

.lab-header span,
.metrics-strip {
  color: #475569;
  font-size: 13px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.thread-tabs {
  display: inline-flex;
  gap: 6px;
  padding: 4px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
}

.thread-tabs button,
.icon-button {
  min-width: 40px;
  padding: 7px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #334155;
  cursor: pointer;
}

.thread-tabs button {
  min-width: 86px;
}

.thread-tabs button.active,
.icon-button {
  background: #0f172a;
  color: #fff;
}

.metrics-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-width: 1120px;
  margin: 0 auto 12px;
}

.metrics-strip span {
  padding: 5px 8px;
  border: 1px solid #dbe3ef;
  border-radius: 6px;
  background: #fff;
}

.message-scroller {
  height: calc(100vh - 128px);
  max-width: 1120px;
  margin: 0 auto;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  overflow-y: auto;
  overflow-anchor: none;
  background: #fff;
}

.message-scroller.is-restoring-thread {
  pointer-events: none;
}

.message-scroller.is-restoring-thread :deep(.markdown-renderer),
.message-scroller.is-restoring-thread .timeline-row {
  transition: none !important;
  animation: none !important;
}

.dynamic-row,
.timeline-row {
  display: flow-root;
  overflow-anchor: none;
}

.timeline-row {
  box-sizing: border-box;
  padding: 6px 16px;
}

.message-bubble,
.status-row {
  max-width: 860px;
  margin: 8px 0;
  padding: 12px 14px;
  border-radius: 8px;
  line-height: 1.55;
}

.user-bubble {
  max-width: min(640px, 78%);
  margin-left: auto;
  background: #dcfce7;
  color: #14532d;
}

.assistant-bubble {
  border: 1px solid #e2e8f0;
  background: #fff;
}

.assistant-markdown {
  margin: 0;
}

.status-row {
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1e3a8a;
}

.tool-row span {
  display: inline-block;
  margin-right: 8px;
  color: #475569;
  font-size: 12px;
  text-transform: uppercase;
}

.error-row {
  border-color: #fecaca;
  background: #fef2f2;
  color: #991b1b;
}

.divider-row {
  padding: 12px 0;
  color: #64748b;
  font-size: 12px;
  text-align: center;
}

@media (max-width: 760px) {
  .virtual-scroller-markstream {
    padding: 12px;
  }

  .lab-header {
    align-items: stretch;
    flex-direction: column;
  }

  .toolbar {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .message-scroller {
    height: calc(100vh - 178px);
  }

  .timeline-row {
    padding: 5px 10px;
  }

  .message-bubble,
  .status-row {
    max-width: 100%;
  }
}
</style>
