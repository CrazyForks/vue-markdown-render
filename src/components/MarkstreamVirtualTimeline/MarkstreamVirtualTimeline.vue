<script setup lang="ts">
import type {
  MarkstreamThreadAnchor,
  MarkstreamThreadVirtualState,
  MarkstreamVirtualMarkdownProps,
  MarkstreamVirtualTimelineProps,
} from '../../composables/useMarkstreamVirtualAdapter'
import type {
  MarkstreamVirtualMetrics,
  MarkstreamVirtualScrollOptions,
  MarkstreamVirtualState,
} from '../../types/node-renderer-props'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  estimateMarkstreamTimelineItemHeight,
  getMarkstreamTimelineItemContent,
  getMarkstreamTimelineItemFinal,
  getMarkstreamTimelineItemKey,
  getMarkstreamTimelineItemKind,
  getMarkstreamTimelineItemRevision,
  isMarkstreamMarkdownTimelineItem,
} from '../../composables/useMarkstreamVirtualAdapter'
import MarkdownRender from '../NodeRenderer'

defineOptions({ name: 'MarkstreamVirtualTimeline' })

const props = withDefaults(defineProps<MarkstreamVirtualTimelineProps<any>>(), {
  overscan: 4,
  overscanPx: 1200,
  stickToBottom: 'auto',
})

const emit = defineEmits<{
  (e: 'height-change', payload: { itemKey: string, metrics: MarkstreamVirtualMetrics }): void
  (e: 'virtual-state-change', payload: { itemKey: string, state: MarkstreamVirtualState }): void
  (e: 'range-change', payload: { start: number, end: number }): void
}>()

/* eslint-disable vue/custom-event-name-casing -- Public timeline events are kebab-case. */
function emitHeightChange(payload: { itemKey: string, metrics: MarkstreamVirtualMetrics }) {
  emit('height-change', payload)
}

function emitVirtualStateChange(payload: { itemKey: string, state: MarkstreamVirtualState }) {
  emit('virtual-state-change', payload)
}

function emitRangeChange(payload: { start: number, end: number }) {
  emit('range-change', payload)
}
/* eslint-enable vue/custom-event-name-casing */

interface TimelineRecord {
  item: any
  index: number
  key: string
  kind: string
  offset: number
  size: number
  markdown: boolean
  component?: unknown
}

const scrollRoot = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(0)
const layoutWidthBucket = ref(0)
const bottomPinned = ref(true)
const itemSizes = reactive(new Map<string, number>()) as Map<string, number>
const markdownStates = reactive(new Map<string, MarkstreamVirtualState>()) as Map<string, MarkstreamVirtualState>
const markdownLogicalHeights = reactive(new Map<string, number>()) as Map<string, number>
const measuredElements = new Map<string, HTMLElement>()
const resizeObservers = new Map<string, ResizeObserver>()
const threadStates = new Map<string, MarkstreamThreadVirtualState>()
const markdownRestoreItemKey = ref<string | null>(null)
const markdownRestoreToken = ref(0)
let rootResizeObserver: ResizeObserver | null = null

const normalizedThreadKey = computed(() => props.threadKey == null ? undefined : String(props.threadKey))
const timelineMeasurementKey = computed(() => {
  return [
    props.measurementKey == null ? '' : String(props.measurementKey),
    layoutWidthBucket.value,
  ].join(':')
})

const layout = computed(() => {
  const records: TimelineRecord[] = []
  let offset = 0

  for (let index = 0; index < props.items.length; index++) {
    const item = props.items[index]
    const key = getItemKey(item, index)
    const size = itemSizes.get(key) ?? estimateMarkstreamTimelineItemHeight(item, index, props)

    records.push({
      item,
      index,
      key,
      kind: getMarkstreamTimelineItemKind(item, index, props),
      offset,
      size,
      markdown: isMarkstreamMarkdownTimelineItem(item, index, props),
      component: item?.component,
    })

    offset += size
  }

  return {
    records,
    totalHeight: offset,
  }
})

function lowerBoundRecordByOffset(records: TimelineRecord[], offset: number) {
  let low = 0
  let high = Math.max(0, records.length - 1)
  let answer = records.length

  while (low <= high) {
    const mid = (low + high) >> 1
    const record = records[mid]!

    if (record.offset + record.size >= offset) {
      answer = mid
      high = mid - 1
    }
    else {
      low = mid + 1
    }
  }

  return Math.min(Math.max(0, answer), Math.max(0, records.length - 1))
}

const visibleWindow = computed(() => {
  const records = layout.value.records
  if (records.length === 0) {
    return {
      start: 0,
      end: 0,
      records: [] as TimelineRecord[],
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    }
  }

  const overscanItems = Math.max(0, props.overscan ?? 4)
  const overscanPx = Math.max(0, props.overscanPx ?? 1200)
  const viewportStart = Math.max(0, scrollTop.value)
  const viewportEnd = viewportStart + Math.max(1, viewportHeight.value)

  let start = lowerBoundRecordByOffset(
    records,
    Math.max(0, viewportStart - overscanPx),
  )
  let end = lowerBoundRecordByOffset(
    records,
    Math.min(layout.value.totalHeight, viewportEnd + overscanPx),
  ) + 1

  start = Math.max(0, start - overscanItems)
  end = Math.min(records.length, Math.max(end + overscanItems, start + 1))

  const visibleRecords = records.slice(start, end)
  const first = visibleRecords[0]
  const last = visibleRecords[visibleRecords.length - 1]

  return {
    start,
    end,
    records: visibleRecords,
    topSpacerHeight: first?.offset ?? 0,
    bottomSpacerHeight: Math.max(
      0,
      layout.value.totalHeight - ((last?.offset ?? 0) + (last?.size ?? 0)),
    ),
  }
})

function getItemKey(item: any, index: number) {
  return getMarkstreamTimelineItemKey(item, index, props)
}

function getSessionKey(record: TimelineRecord) {
  const revision = getMarkstreamTimelineItemRevision(record.item, record.index, props)
  return [
    normalizedThreadKey.value ?? 'timeline',
    record.key,
    revision == null ? '' : String(revision),
  ].join(':')
}

function shouldStickToBottom() {
  if (props.stickToBottom === true)
    return true
  if (props.stickToBottom === false)
    return false
  return bottomPinned.value
}

function distanceFromBottom() {
  return layout.value.totalHeight - viewportHeight.value - scrollTop.value
}

function updateBottomPinned() {
  if (props.stickToBottom === true) {
    bottomPinned.value = true
    return
  }
  if (props.stickToBottom === false) {
    bottomPinned.value = false
    return
  }
  bottomPinned.value = distanceFromBottom() <= 48
}

function updateLayoutWidthBucket() {
  const width = scrollRoot.value?.clientWidth ?? 0
  layoutWidthBucket.value = Number.isFinite(width) && width > 0
    ? Math.round(width / 32) * 32
    : 0
}

function updateScrollMetrics() {
  const root = scrollRoot.value
  scrollTop.value = root?.scrollTop ?? 0
  viewportHeight.value = root?.clientHeight ?? 0
  updateLayoutWidthBucket()
  updateBottomPinned()
  rememberThreadState()
}

function scrollToOffset(offset: number) {
  const root = scrollRoot.value
  if (!root)
    return

  root.scrollTop = Math.max(0, offset)
  updateScrollMetrics()
}

function scrollToBottom() {
  scrollToOffset(Math.max(0, layout.value.totalHeight - viewportHeight.value))
}

function scrollToIndex(index: number, align: 'start' | 'center' | 'end' = 'start') {
  const record = layout.value.records[index]
  if (!record)
    return

  let offset = record.offset
  if (align === 'center')
    offset -= (viewportHeight.value - record.size) / 2
  else if (align === 'end')
    offset -= viewportHeight.value - record.size

  scrollToOffset(offset)
}

function setItemSize(key: string, size: number) {
  if (!Number.isFinite(size) || size <= 0)
    return

  const previous = itemSizes.get(key)
  const next = Math.ceil(size)

  if (previous != null && Math.abs(previous - next) < 0.5)
    return

  const anchorBeforeChange = captureOuterAnchor()
  const shouldPin = shouldStickToBottom()

  itemSizes.set(key, next)
  rememberThreadState()

  scheduleScrollReconcileAfterSizeChange(anchorBeforeChange, shouldPin)
}

function scheduleScrollReconcileAfterSizeChange(anchor: MarkstreamThreadAnchor | undefined, shouldPin: boolean) {
  const apply = () => {
    if (shouldPin)
      scrollToBottom()
    else if (anchor)
      restoreOuterAnchor(anchor)

    updateScrollMetrics()
  }

  void nextTick(() => {
    apply()

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        apply()
      })
    }
  })
}

function resolveElement(el: Element | { $el?: Element | null } | null | undefined) {
  const value = el && '$el' in el ? el.$el : el
  return value instanceof HTMLElement ? value : null
}

function readElementHeight(element: HTMLElement | null | undefined) {
  if (!element)
    return 0

  return Math.ceil(Math.max(
    0,
    element.offsetHeight || 0,
    element.scrollHeight || 0,
    element.getBoundingClientRect?.().height || 0,
  ))
}

function cleanupMeasuredElement(key: string) {
  resizeObservers.get(key)?.disconnect()
  resizeObservers.delete(key)
  measuredElements.delete(key)
}

function reconcileRecordSize(record: TimelineRecord) {
  const measured = readElementHeight(measuredElements.get(record.key))
  const markdown = record.markdown
    ? (markdownLogicalHeights.get(record.key) ?? 0)
    : 0
  const next = Math.max(measured, markdown)

  if (next > 0)
    setItemSize(record.key, next)
}

function setMeasuredItemElement(record: TimelineRecord, el: Element | { $el?: Element | null } | null | undefined) {
  const element = resolveElement(el)
  const previous = measuredElements.get(record.key)

  if (!element) {
    cleanupMeasuredElement(record.key)
    reconcileRecordSize(record)
    return
  }

  if (previous === element) {
    reconcileRecordSize(record)
    return
  }

  cleanupMeasuredElement(record.key)
  measuredElements.set(record.key, element)
  reconcileRecordSize(record)

  if (typeof ResizeObserver === 'undefined')
    return

  const observer = new ResizeObserver(() => {
    reconcileRecordSize(record)
  })
  observer.observe(element)
  resizeObservers.set(record.key, observer)
}

function measureRecordElement(record: TimelineRecord) {
  return (el: Element | { $el?: Element | null } | null | undefined) => {
    setMeasuredItemElement(record, el)
  }
}

function getMarkdownProps(record: TimelineRecord): MarkstreamVirtualMarkdownProps {
  const final = getMarkstreamTimelineItemFinal(record.item, record.index, props)
  const virtualScroll: MarkstreamVirtualScrollOptions = {
    enabled: true,
    sessionKey: getSessionKey(record),
    threadKey: normalizedThreadKey.value,
    scrollRoot: () => scrollRoot.value,
    restoreState: markdownStates.get(record.key) ?? null,
    restoreAnchor: markdownRestoreItemKey.value === record.key ? markdownRestoreToken.value : false,
    measurementKey: timelineMeasurementKey.value,
    settleMode: 'manual',
    settledToken: final,
    emitIntervalMs: 32,
    heightDiffThresholdPx: 1,
  }

  return {
    content: getMarkstreamTimelineItemContent(record.item, record.index, props),
    final,
    nodeVirtual: 'auto' as const,
    indexKey: getSessionKey(record),
    virtualScroll,
    onHeightChange(metrics: MarkstreamVirtualMetrics) {
      markdownLogicalHeights.set(record.key, metrics.totalHeight)
      reconcileRecordSize(record)

      void nextTick(() => {
        reconcileRecordSize(record)
      })

      emitHeightChange({ itemKey: record.key, metrics })
    },
    onVirtualStateChange(state: MarkstreamVirtualState) {
      markdownStates.set(record.key, state)
      rememberThreadState()
      emitVirtualStateChange({ itemKey: record.key, state })
    },
  }
}

function getSlotProps(record: TimelineRecord) {
  return {
    item: record.item,
    index: record.index,
    itemKey: record.key,
    kind: record.kind,
    measureRef: measureRecordElement(record),
    markdownProps: getMarkdownProps(record),
  }
}

function getRecordText(record: TimelineRecord) {
  const item = record.item ?? {}
  if (typeof item.text === 'string')
    return item.text
  if (typeof item.message === 'string')
    return item.message
  if (typeof item.label === 'string')
    return item.label
  return getMarkstreamTimelineItemContent(record.item, record.index, props)
}

function captureOuterAnchor(): MarkstreamThreadAnchor | undefined {
  const bottomDistance = distanceFromBottom()
  if (bottomDistance <= 2) {
    return {
      type: 'bottom',
      distanceFromBottomPx: Math.max(0, bottomDistance),
    }
  }

  for (const record of layout.value.records) {
    if (scrollTop.value >= record.offset && scrollTop.value < record.offset + record.size) {
      return {
        type: 'item',
        itemKey: record.key,
        offsetWithinItemPx: scrollTop.value - record.offset,
      }
    }
  }

  const first = visibleWindow.value.records[0]
  if (!first)
    return undefined

  return {
    type: 'item',
    itemKey: first.key,
    offsetWithinItemPx: 0,
  }
}

function captureThreadState(): MarkstreamThreadVirtualState {
  const savedHeights: Record<string, number> = {}
  const savedMarkdownStates: Record<string, MarkstreamVirtualState> = {}

  for (const [key, size] of itemSizes)
    savedHeights[key] = size
  for (const [key, state] of markdownStates)
    savedMarkdownStates[key] = state

  return {
    threadKey: normalizedThreadKey.value,
    outerAnchor: captureOuterAnchor(),
    itemHeights: savedHeights,
    markdownStates: savedMarkdownStates,
  }
}

function rememberThreadState() {
  const key = normalizedThreadKey.value
  if (!key)
    return
  threadStates.set(key, captureThreadState())
}

function restoreOuterAnchor(anchor: MarkstreamThreadAnchor | undefined) {
  if (!anchor)
    return

  if (anchor.type === 'bottom') {
    scrollToOffset(Math.max(
      0,
      layout.value.totalHeight - viewportHeight.value - anchor.distanceFromBottomPx,
    ))
    return
  }

  const record = layout.value.records.find(item => item.key === anchor.itemKey)
  if (!record)
    return

  scrollToOffset(record.offset + anchor.offsetWithinItemPx)
}

function restoreThreadState(state: MarkstreamThreadVirtualState | null | undefined) {
  cleanupMeasuredElements()

  itemSizes.clear()
  markdownStates.clear()
  markdownLogicalHeights.clear()

  for (const [key, size] of Object.entries(state?.itemHeights ?? {}))
    itemSizes.set(key, size)
  for (const [key, markdownState] of Object.entries(state?.markdownStates ?? {}))
    markdownStates.set(key, markdownState)

  markdownRestoreItemKey.value = state?.outerAnchor?.type === 'item'
    ? state.outerAnchor.itemKey
    : null
  markdownRestoreToken.value += 1

  void nextTick(() => {
    if (state?.outerAnchor) {
      restoreOuterAnchor(state.outerAnchor)
    }
    else if (props.stickToBottom !== false) {
      bottomPinned.value = true
      scrollToBottom()
    }

    updateScrollMetrics()
  })
}

function cleanupMeasuredElements() {
  for (const observer of resizeObservers.values())
    observer.disconnect()

  resizeObservers.clear()
  measuredElements.clear()
}

function cleanupObservers() {
  cleanupMeasuredElements()
  markdownLogicalHeights.clear()
  rootResizeObserver?.disconnect()
  rootResizeObserver = null
}

watch(
  normalizedThreadKey,
  (threadKey) => {
    restoreThreadState(threadKey ? threadStates.get(threadKey) : null)
  },
)

watch(
  () => visibleWindow.value.records.map(record => record.key).join('\u0000'),
  () => {
    emitRangeChange({
      start: visibleWindow.value.start,
      end: visibleWindow.value.end,
    })
  },
  { immediate: true },
)

watch(
  () => [props.items.length, layout.value.totalHeight],
  () => {
    if (!shouldStickToBottom())
      return
    void nextTick(() => {
      scrollToBottom()
    })
  },
  { flush: 'post' },
)

onMounted(() => {
  updateScrollMetrics()

  if (scrollRoot.value && typeof ResizeObserver !== 'undefined') {
    rootResizeObserver = new ResizeObserver(() => {
      updateScrollMetrics()
    })
    rootResizeObserver.observe(scrollRoot.value)
  }

  if (props.stickToBottom !== false) {
    bottomPinned.value = true

    void nextTick(() => {
      scrollToBottom()
      updateScrollMetrics()
    })
  }
})

onBeforeUnmount(() => {
  rememberThreadState()
  cleanupObservers()
})

defineExpose({
  captureThreadState,
  restoreThreadState,
  scrollToBottom,
  scrollToIndex,
  scrollToOffset,
  getItemSize: (key: string) => itemSizes.get(key),
  getTotalHeight: () => layout.value.totalHeight,
  getVisibleRange: () => ({ start: visibleWindow.value.start, end: visibleWindow.value.end }),
})
</script>

<template>
  <div
    ref="scrollRoot"
    class="markstream-virtual-timeline"
    data-testid="markstream-virtual-timeline"
    @scroll="updateScrollMetrics"
  >
    <div
      class="markstream-virtual-timeline__spacer"
      :style="{ height: `${visibleWindow.topSpacerHeight}px` }"
      aria-hidden="true"
    />
    <div
      v-for="record in visibleWindow.records"
      :key="record.key"
      class="markstream-virtual-timeline__item"
      :data-markstream-item-key="record.key"
      :data-markstream-item-kind="record.kind"
    >
      <slot
        v-bind="getSlotProps(record)"
      >
        <MarkdownRender
          v-if="record.markdown"
          v-bind="getMarkdownProps(record)"
        />
        <component
          :is="record.component"
          v-else-if="record.component"
          :ref="measureRecordElement(record)"
          :item="record.item"
        />
        <div
          v-else
          :ref="measureRecordElement(record)"
          class="markstream-virtual-timeline__default-item"
          :class="`markstream-virtual-timeline__default-item--${record.kind || 'item'}`"
        >
          <span
            v-if="record.kind === 'tool-call' && record.item.status"
            class="markstream-virtual-timeline__status"
          >
            {{ record.item.status }}
          </span>
          {{ getRecordText(record) }}
        </div>
      </slot>
    </div>
    <div
      class="markstream-virtual-timeline__spacer"
      :style="{ height: `${visibleWindow.bottomSpacerHeight}px` }"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
.markstream-virtual-timeline {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: auto;
}

.markstream-virtual-timeline__spacer {
  flex: 0 0 auto;
}

.markstream-virtual-timeline__item {
  display: flow-root;
  flex: 0 0 auto;
}

.markstream-virtual-timeline__default-item {
  margin: 8px 0;
  padding: 10px 12px;
  border: 1px solid rgb(148 163 184 / 32%);
  border-radius: 8px;
  background: rgb(248 250 252);
  color: rgb(15 23 42);
  line-height: 1.5;
  white-space: pre-wrap;
}

.markstream-virtual-timeline__default-item--system-divider {
  border: 0;
  background: transparent;
  color: rgb(100 116 139);
  font-size: 12px;
  text-align: center;
}

.markstream-virtual-timeline__default-item--error {
  border-color: rgb(248 113 113 / 45%);
  background: rgb(254 242 242);
  color: rgb(153 27 27);
}

.markstream-virtual-timeline__status {
  display: inline-flex;
  margin-right: 8px;
  color: rgb(71 85 105);
  font-size: 12px;
  text-transform: uppercase;
}
</style>
