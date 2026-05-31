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
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, provide, reactive, ref, watch } from 'vue'
import {
  estimateMarkstreamTimelineItemHeight,
  getMarkstreamTimelineItemContent,
  getMarkstreamTimelineItemFinal,
  getMarkstreamTimelineItemKey,
  getMarkstreamTimelineItemKind,
  getMarkstreamTimelineItemRevision,
  isMarkstreamMarkdownTimelineItem,
} from '../../composables/useMarkstreamVirtualAdapter'
import {
  getMarkdownItemChromeHeight,
  readElementOuterHeight,
} from '../../utils/virtualItemMeasurement'
import MarkdownRender from '../NodeRenderer'

defineOptions({ name: 'MarkstreamVirtualTimeline' })

const props = withDefaults(defineProps<MarkstreamVirtualTimelineProps<any>>(), {
  overscan: 4,
  overscanPx: 1200,
  stickToBottom: 'auto',
  markdownFade: false,
})

const emit = defineEmits<{
  (e: 'height-change', payload: { itemKey: string, metrics: MarkstreamVirtualMetrics }): void
  (e: 'virtual-state-change', payload: { itemKey: string, state: MarkstreamVirtualState }): void
  (e: 'range-change', payload: { start: number, end: number }): void
  (e: 'thread-state-change', payload: MarkstreamThreadVirtualState): void
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

function emitThreadStateChange(payload: MarkstreamThreadVirtualState) {
  emit('thread-state-change', payload)
}
/* eslint-enable vue/custom-event-name-casing */

function shouldAllowMarkdownShrink(metrics: MarkstreamVirtualMetrics) {
  if (metrics.phase === 'final')
    return true

  if (!metrics.stable)
    return false

  return metrics.confidence === 'measured'
    || metrics.confidence === 'final'
}

interface TimelineRecord {
  item: any
  index: number
  key: string
  renderKey: string
  kind: string
  offset: number
  size: number
  markdown: boolean
  component?: unknown
}

interface ReconcileRecordSizeOptions {
  allowMarkdownShrink?: boolean
}

interface MarkdownLogicalHeightSource {
  sessionKey: string
  threadKey?: string
  measurementKey?: string
}

type TimelineItemSizeSource = NonNullable<MarkstreamThreadVirtualState['itemSizeSources']>[string]

const scrollRoot = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(0)
const layoutWidthBucket = ref(0)
const bottomPinned = ref(true)
const exactBottomPinned = ref(true)
const itemSizes = reactive(new Map<string, number>()) as Map<string, number>
const itemSizeSources = new Map<string, TimelineItemSizeSource>()
const restoredItemHeightFloors = new Map<string, number>()
const markdownStates = reactive(new Map<string, MarkstreamVirtualState>()) as Map<string, MarkstreamVirtualState>
const markdownLogicalHeights = reactive(new Map<string, number>()) as Map<string, number>
const markdownLogicalHeightSources = new Map<string, MarkdownLogicalHeightSource>()
const measuredElements = new Map<string, HTMLElement>()
const resizeObservers = new Map<string, ResizeObserver>()
const threadStates = new Map<string, MarkstreamThreadVirtualState>()
const restoringThread = ref(false)
const restorePaintReady = ref(true)
const hostScrollManaged = ref(true)
provide('markstreamHostScrollManaged', hostScrollManaged)
const THREAD_RESTORE_SETTLE_DELAYS = [0, 80, 180, 360, 640]
const THREAD_RESTORE_READY_POLL_FRAMES = 40
const THREAD_RESTORE_MIN_READY_MS = 96
const THREAD_RESTORE_STABLE_FRAMES = 2
const THREAD_RESTORE_READY_RETRY_DELAY_MS = 120
const THREAD_RESTORE_MAX_LOADING_MS = 3000
const THREAD_STATE_REMEMBER_DELAY_MS = 80
const ITEM_SIZE_RECONCILE_DEADBAND_PX = 1
let rootResizeObserver: ResizeObserver | null = null
let threadRestoreSeq = 0
let threadRestoreRaf: number | null = null
let threadRestoreTimers: number[] = []
let threadRestoreReadyRetryTimer: number | null = null
let threadStateRememberTimer: number | null = null
let pendingThreadStateRememberKey: string | undefined
let threadRestoreStartedAt = -1
let activeThreadRestoreSeq = 0
let activeThreadRestoreAnchor: MarkstreamThreadAnchor | undefined
let activeThreadRestoreScrollTop: number | null = null
let activeThreadRestoreRequiresMarkdownMetrics = false
let activeThreadRestoreRequiresColdMarkdownMetrics = false
let activeThreadStateSnapshot: MarkstreamThreadVirtualState | null = null
let threadRestoreReadyWaitSeq = 0
let threadRestoreReadyWarnedSeq = 0
let rootPaddingBlock = { top: 0, bottom: 0 }
let initialThreadRestoreCompleted = false

const normalizedThreadKey = computed(() => props.threadKey == null ? undefined : String(props.threadKey))
let activeThreadKeySnapshot = normalizedThreadKey.value
const timelineMeasurementKey = computed(() => {
  return [
    props.measurementKey == null ? '' : String(props.measurementKey),
    layoutWidthBucket.value,
  ].join(':')
})

const layout = computed(() => {
  const records: TimelineRecord[] = []
  let offset = 0
  const renderScopeKey = getTimelineRenderScopeKey()

  for (let index = 0; index < props.items.length; index++) {
    const item = props.items[index]
    const key = getItemKey(item, index)
    const recordBase = {
      item,
      index,
      key,
      kind: getMarkstreamTimelineItemKind(item, index, props),
      markdown: isMarkstreamMarkdownTimelineItem(item, index, props),
    }
    const size = getCompatibleItemSize(recordBase)
      ?? estimateMarkstreamTimelineItemHeight(item, index, props)

    records.push({
      ...recordBase,
      renderKey: `${renderScopeKey}:${key}`,
      offset,
      size,
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

const effectiveOverscanItems = computed(() => {
  const value = Math.max(0, props.overscan ?? 4)
  return restorePaintReady.value ? value : Math.min(value, 1)
})

const effectiveOverscanPx = computed(() => {
  const value = Math.max(0, props.overscanPx ?? 1200)
  return restorePaintReady.value ? value : Math.min(value, 160)
})

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

  const overscanItems = effectiveOverscanItems.value
  const overscanPx = effectiveOverscanPx.value
  const viewportStart = getLayoutViewportStart()
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

function getTimelineRenderScopeKey() {
  return normalizedThreadKey.value ?? 'timeline'
}

function getSessionKey(
  record: Pick<TimelineRecord, 'item' | 'index' | 'key'>,
  threadKey = normalizedThreadKey.value,
) {
  const revision = getMarkstreamTimelineItemRevision(record.item, record.index, props)
  return [
    threadKey ?? 'timeline',
    record.key,
    revision == null ? '' : String(revision),
  ].join(':')
}

function getItemSizeSourceKey(
  record: Pick<TimelineRecord, 'item' | 'index' | 'key' | 'markdown'>,
  threadKey = normalizedThreadKey.value,
) {
  if (record.markdown)
    return getSessionKey(record, threadKey)

  const revision = getMarkstreamTimelineItemRevision(record.item, record.index, props)
  return [
    threadKey ?? 'timeline',
    record.key,
    revision == null ? '' : String(revision),
  ].join(':')
}

function getItemSizeSource(record: Pick<TimelineRecord, 'item' | 'index' | 'key' | 'markdown'>): TimelineItemSizeSource {
  return {
    sourceKey: getItemSizeSourceKey(record),
    measurementKey: timelineMeasurementKey.value,
    widthBucket: layoutWidthBucket.value,
  }
}

function isSameItemSizeSource(
  a: TimelineItemSizeSource | null | undefined,
  b: TimelineItemSizeSource | null | undefined,
) {
  return (a?.sourceKey ?? '') === (b?.sourceKey ?? '')
    && (a?.measurementKey ?? '') === (b?.measurementKey ?? '')
    && (a?.widthBucket ?? 0) === (b?.widthBucket ?? 0)
}

function isCompatibleItemSizeSource(
  record: Pick<TimelineRecord, 'item' | 'index' | 'key' | 'markdown'> | undefined,
  source: TimelineItemSizeSource | null | undefined,
  threadKey = normalizedThreadKey.value,
) {
  if (!record || !source)
    return false

  if (source.sourceKey !== getItemSizeSourceKey(record, threadKey))
    return false

  if (source.measurementKey !== timelineMeasurementKey.value)
    return false

  if ((source.widthBucket ?? 0) !== layoutWidthBucket.value)
    return false

  return true
}

function getCompatibleItemSize(
  record: Pick<TimelineRecord, 'item' | 'index' | 'key' | 'markdown'>,
  threadKey = normalizedThreadKey.value,
) {
  const size = itemSizes.get(record.key)

  if (!isCompatibleItemSizeSource(record, itemSizeSources.get(record.key), threadKey))
    return null

  return Number.isFinite(size) && size! > 0 ? size! : null
}

function findRecordByKey(key: string) {
  return layout.value.records.find(record => record.key === key)
}

function isCompatibleMarkdownSource(
  record: TimelineRecord | undefined,
  source: MarkdownLogicalHeightSource | null | undefined,
) {
  if (!record || !record.markdown || !source)
    return false

  if (source.sessionKey !== getSessionKey(record))
    return false

  if ((source.threadKey ?? '') !== (normalizedThreadKey.value ?? ''))
    return false

  if (!isCompatibleMarkdownMeasurementKey(source.measurementKey))
    return false

  return true
}

function isCompatibleMarkdownMeasurementKey(measurementKey: string | undefined) {
  const expected = timelineMeasurementKey.value
  const actual = measurementKey ?? ''

  return actual === expected || actual.startsWith(`${expected}\u0000`)
}

function isCompatibleMarkdownState(
  record: TimelineRecord | undefined,
  state: MarkstreamVirtualState | null | undefined,
) {
  return isCompatibleMarkdownSource(record, state)
}

function getLogicalHeightFromMarkdownState(
  key: string,
  state = markdownStates.get(key),
) {
  const record = findRecordByKey(key)

  if (!isCompatibleMarkdownState(record, state))
    return 0

  const height = Number(state?.metrics?.totalHeight)
  return Number.isFinite(height) && height > 0
    ? Math.ceil(height)
    : 0
}

function setMarkdownLogicalHeight(
  key: string,
  height: number,
  source: MarkdownLogicalHeightSource,
) {
  if (!Number.isFinite(height) || height <= 0)
    return

  markdownLogicalHeights.set(key, Math.ceil(height))
  markdownLogicalHeightSources.set(key, source)
}

function seedMarkdownLogicalHeightFromState(
  key: string,
  state = markdownStates.get(key),
) {
  const height = getLogicalHeightFromMarkdownState(key, state)

  if (height > 0)
    setMarkdownLogicalHeight(key, height, state!)

  return height
}

function getKnownMarkdownLogicalHeight(key: string) {
  const record = findRecordByKey(key)
  const source = markdownLogicalHeightSources.get(key)

  if (isCompatibleMarkdownSource(record, source))
    return markdownLogicalHeights.get(key) ?? 0

  return seedMarkdownLogicalHeightFromState(key)
}

function isActiveThreadRestore(seq: number) {
  return seq === threadRestoreSeq
    && activeThreadRestoreSeq === seq
    && !restorePaintReady.value
}

function clearThreadRestoreSchedule() {
  if (threadRestoreRaf != null && typeof cancelAnimationFrame === 'function')
    cancelAnimationFrame(threadRestoreRaf)

  threadRestoreRaf = null

  if (threadRestoreReadyRetryTimer != null && typeof window !== 'undefined')
    window.clearTimeout(threadRestoreReadyRetryTimer)

  threadRestoreReadyRetryTimer = null

  if (typeof window !== 'undefined') {
    for (const timer of threadRestoreTimers)
      window.clearTimeout(timer)
  }

  threadRestoreTimers = []
}

function getViewportHeight() {
  return Math.max(0, viewportHeight.value || scrollRoot.value?.clientHeight || 0)
}

function updateRootPaddingBlock() {
  const root = scrollRoot.value
  if (!root || typeof getComputedStyle !== 'function') {
    rootPaddingBlock = { top: 0, bottom: 0 }
    return
  }

  const style = getComputedStyle(root)
  const top = Number.parseFloat(style.paddingTop) || 0
  const bottom = Number.parseFloat(style.paddingBottom) || 0
  rootPaddingBlock = { top, bottom }
}

function getScrollContentStart() {
  return rootPaddingBlock.top
}

function getLayoutScrollContentHeight() {
  const padding = rootPaddingBlock
  return Math.max(0, layout.value.totalHeight + padding.top + padding.bottom)
}

function getScrollContentHeight() {
  return Math.max(
    getLayoutScrollContentHeight(),
    scrollRoot.value?.scrollHeight ?? 0,
  )
}

function getLayoutViewportStart() {
  return Math.max(0, scrollTop.value - getScrollContentStart())
}

function getRestoreLoadingStyle() {
  return {
    height: `${Math.max(1, getViewportHeight())}px`,
    transform: `translateY(${scrollTop.value}px)`,
  }
}

function getMaxScrollOffset() {
  return Math.max(0, getScrollContentHeight() - getViewportHeight())
}

function clampScrollOffset(offset: number) {
  const numeric = Number(offset)

  if (!Number.isFinite(numeric))
    return 0

  return Math.max(0, Math.min(numeric, getMaxScrollOffset()))
}

function distanceFromBottom() {
  return Math.max(
    0,
    getMaxScrollOffset() - scrollTop.value,
  )
}

function updateBottomPinned() {
  const bottomDistance = distanceFromBottom()
  exactBottomPinned.value = bottomDistance <= 2

  if (props.stickToBottom === true) {
    bottomPinned.value = true
    return
  }
  if (props.stickToBottom === false) {
    bottomPinned.value = false
    return
  }
  bottomPinned.value = bottomDistance <= 48
}

function updateLayoutWidthBucket() {
  const width = scrollRoot.value?.clientWidth ?? 0
  layoutWidthBucket.value = Number.isFinite(width) && width > 0
    ? Math.round(width / 32) * 32
    : 0
}

function updateScrollMetrics(options: { remember?: boolean } = {}) {
  const root = scrollRoot.value

  if (root) {
    scrollTop.value = Math.max(0, root.scrollTop || 0)
    viewportHeight.value = root.clientHeight || 0
  }

  updateLayoutWidthBucket()
  updateBottomPinned()

  if (
    options.remember === true
    || (options.remember !== false && !restoringThread.value)
  ) {
    rememberThreadState()
  }
}

function applyScrollOffset(
  offset: number,
  options: {
    writeDom?: boolean
    remember?: boolean
    updatePinned?: boolean
  } = {},
) {
  const target = clampScrollOffset(offset)
  const root = scrollRoot.value

  scrollTop.value = target

  if (root) {
    viewportHeight.value = root.clientHeight || viewportHeight.value || 0

    if (options.writeDom !== false && Math.abs((root.scrollTop || 0) - target) > 1)
      root.scrollTop = target
  }

  updateLayoutWidthBucket()

  if (options.updatePinned !== false)
    updateBottomPinned()

  if (
    options.remember === true
    || (options.remember !== false && !restoringThread.value)
  ) {
    rememberThreadState()
  }
}

function handleTimelineScroll() {
  if (!restorePaintReady.value) {
    const root = scrollRoot.value
    const target = activeThreadRestoreScrollTop

    if (root && target != null && Math.abs((root.scrollTop || 0) - target) > 1)
      root.scrollTop = target

    applyThreadRestorePass(activeThreadRestoreSeq, activeThreadRestoreAnchor)
    return
  }

  updateScrollMetrics()
}

function scrollToOffset(offset: number) {
  applyScrollOffset(offset, {
    writeDom: true,
    remember: true,
  })
}

function scrollToBottom() {
  scrollToOffset(getMaxScrollOffset())
}

function applyInitialScrollPosition() {
  if (activeThreadRestoreAnchor) {
    applyThreadRestorePass(activeThreadRestoreSeq, activeThreadRestoreAnchor)
    updateScrollMetrics({ remember: false })
    rememberThreadState()
    return
  }

  if (props.stickToBottom === false) {
    updateScrollMetrics({ remember: false })
    rememberThreadState()
    return
  }

  bottomPinned.value = true

  applyScrollOffset(getMaxScrollOffset(), {
    writeDom: true,
    remember: false,
    updatePinned: false,
  })

  updateScrollMetrics({ remember: false })
  rememberThreadState()
}

function scrollToIndex(index: number, align: 'start' | 'center' | 'end' = 'start') {
  const record = layout.value.records[index]
  if (!record)
    return

  let offset = getScrollContentStart() + record.offset
  if (align === 'center')
    offset -= (viewportHeight.value - record.size) / 2
  else if (align === 'end')
    offset -= viewportHeight.value - record.size

  scrollToOffset(offset)
}

function getRestoredItemHeightFloor(key: string, source?: TimelineItemSizeSource) {
  const floor = restoredItemHeightFloors.get(key)
  if (!Number.isFinite(floor) || floor == null || floor <= 0)
    return 0

  const currentSource = itemSizeSources.get(key)

  if (source && currentSource && !isSameItemSizeSource(currentSource, source))
    return 0

  return Math.ceil(floor)
}

function clearRestoredItemHeightFloorIfSourceChanged(
  key: string,
  source?: TimelineItemSizeSource,
) {
  if (!source)
    return

  const currentSource = itemSizeSources.get(key)
  if (currentSource && !isSameItemSizeSource(currentSource, source))
    restoredItemHeightFloors.delete(key)
}

function setItemSize(key: string, size: number, source?: TimelineItemSizeSource) {
  if (!Number.isFinite(size) || size <= 0)
    return

  const previous = itemSizes.get(key)
  const sourceChanged = source && !isSameItemSizeSource(itemSizeSources.get(key), source)

  clearRestoredItemHeightFloorIfSourceChanged(key, source)

  const restoredFloor = sourceChanged
    ? 0
    : getRestoredItemHeightFloor(key, source)

  const next = Math.max(Math.ceil(size), restoredFloor)

  // Monaco / pre fallback / browser font rounding can differ by exactly 1px.
  // Treat that as measurement noise; otherwise an item above the current
  // anchor will restore scrollTop by 1px and visibly shimmer on refresh.
  if (
    previous != null
    && Math.abs(previous - next) <= ITEM_SIZE_RECONCILE_DEADBAND_PX
    && !sourceChanged
  ) {
    return
  }

  if (restoringThread.value) {
    if (source)
      itemSizeSources.set(key, source)
    itemSizes.set(key, next)
    scheduleThreadRestorePass()
    return
  }

  const anchorBeforeChange = captureOuterAnchor()
  const bottomDistanceBeforeChange = distanceFromBottom()
  const restoreAnchor = resolveSizeChangeRestoreAnchor(
    anchorBeforeChange,
    bottomDistanceBeforeChange,
  )

  if (source)
    itemSizeSources.set(key, source)
  itemSizes.set(key, next)
  scheduleThreadStateRemember()
  scheduleScrollReconcileAfterSizeChange(restoreAnchor)
}

function resolveSizeChangeRestoreAnchor(
  anchor: MarkstreamThreadAnchor | undefined,
  bottomDistanceBeforeChange: number,
): MarkstreamThreadAnchor | undefined {
  if (props.stickToBottom === true) {
    return {
      type: 'bottom',
      distanceFromBottomPx: 0,
    }
  }

  if (props.stickToBottom === 'auto' && bottomPinned.value) {
    return {
      type: 'bottom',
      // Important:
      // During streaming, multiple item-size changes can happen before the
      // previous nextTick/RAF scroll reconciliation has applied. In that window
      // layout.totalHeight has already grown but scrollTop has not caught up yet,
      // so bottomDistanceBeforeChange can be large even though the user was
      // exactly pinned to bottom before the batch started.
      //
      // Preserve exact bottom pinning from the last committed scroll metrics.
      // Only preserve a non-zero bottom distance when the user was intentionally
      // near-bottom, but not exactly pinned.
      distanceFromBottomPx: exactBottomPinned.value
        ? 0
        : Math.max(0, bottomDistanceBeforeChange),
    }
  }

  return anchor
}

function scheduleScrollReconcileAfterSizeChange(anchor: MarkstreamThreadAnchor | undefined) {
  const apply = () => {
    if (anchor)
      restoreOuterAnchor(anchor)

    updateScrollMetrics({ remember: false })
  }

  apply()

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

function cleanupMeasuredElement(key: string) {
  resizeObservers.get(key)?.disconnect()
  resizeObservers.delete(key)
  measuredElements.delete(key)
}

function getMeasuredItemHeight(key: string) {
  return readElementOuterHeight(measuredElements.get(key))
}

function getMeasuredMarkdownChromeHeight(key: string) {
  return getMarkdownItemChromeHeight(measuredElements.get(key))
}

function reconcileRecordSize(
  record: TimelineRecord,
  options: ReconcileRecordSizeOptions = {},
) {
  const measured = getMeasuredItemHeight(record.key)

  if (!record.markdown) {
    if (measured > 0)
      setItemSize(record.key, measured, getItemSizeSource(record))

    return
  }

  const cachedSize = getCompatibleItemSize(record) ?? 0
  const markdown = getKnownMarkdownLogicalHeight(record.key)
  const chrome = getMeasuredMarkdownChromeHeight(record.key)

  if (markdown > 0) {
    let next = Math.max(measured, markdown + chrome)

    if ((!options.allowMarkdownShrink || restoringThread.value) && cachedSize > 0)
      next = Math.max(next, cachedSize)

    if (next > 0)
      setItemSize(record.key, next, getItemSizeSource(record))

    return
  }

  if (cachedSize > 0) {
    if (measured > cachedSize + 1)
      setItemSize(record.key, measured, getItemSizeSource(record))

    return
  }

  if (measured > 0)
    setItemSize(record.key, measured, getItemSizeSource(record))
}

function setMeasuredItemElement(record: TimelineRecord, el: Element | { $el?: Element | null } | null | undefined) {
  const element = resolveElement(el)
  const previous = measuredElements.get(record.key)

  if (!element) {
    cleanupMeasuredElement(record.key)
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
  const restoreState = markdownStates.get(record.key)
  const virtualScroll: MarkstreamVirtualScrollOptions = {
    enabled: true,
    sessionKey: getSessionKey(record),
    threadKey: normalizedThreadKey.value,
    scrollRoot: () => scrollRoot.value,
    restoreState: isCompatibleMarkdownState(record, restoreState) ? restoreState! : null,
    restoreAnchor: false,
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
    fade: props.markdownFade === true,
    indexKey: getSessionKey(record),
    virtualScroll,
    onHeightChange(metrics: MarkstreamVirtualMetrics) {
      if (metrics.sessionKey !== getSessionKey(record))
        return

      setMarkdownLogicalHeight(record.key, metrics.totalHeight, {
        sessionKey: metrics.sessionKey,
        threadKey: normalizedThreadKey.value,
        measurementKey: timelineMeasurementKey.value,
      })

      const allowMarkdownShrink = shouldAllowMarkdownShrink(metrics)
      const logicalHeight = Math.ceil(metrics.totalHeight)

      reconcileRecordSize(record, {
        allowMarkdownShrink,
      })

      void nextTick(() => {
        // Avoid applying a stale delayed shrink after a newer metrics event.
        if (getKnownMarkdownLogicalHeight(record.key) !== logicalHeight)
          return

        reconcileRecordSize(record, {
          allowMarkdownShrink,
        })
      })

      emitHeightChange({ itemKey: record.key, metrics })
    },
    onVirtualStateChange(state: MarkstreamVirtualState) {
      if (state.sessionKey !== getSessionKey(record))
        return

      markdownStates.set(record.key, state)
      seedMarkdownLogicalHeightFromState(record.key, state)
      scheduleThreadStateRemember()
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

  const layoutScrollTop = getLayoutViewportStart()

  for (const record of layout.value.records) {
    if (layoutScrollTop >= record.offset && layoutScrollTop < record.offset + record.size) {
      return {
        type: 'item',
        itemKey: record.key,
        offsetWithinItemPx: layoutScrollTop - record.offset,
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

function captureThreadStateForKey(threadKey = normalizedThreadKey.value): MarkstreamThreadVirtualState {
  const itemHeights: Record<string, number> = {}
  const itemSizeSourceSnapshot: NonNullable<MarkstreamThreadVirtualState['itemSizeSources']> = {}

  for (const record of layout.value.records) {
    const size = getCompatibleItemSize(record, threadKey)
    const source = itemSizeSources.get(record.key)
    if (size != null && isCompatibleItemSizeSource(record, source, threadKey)) {
      itemHeights[record.key] = size
      itemSizeSourceSnapshot[record.key] = source!
    }
  }

  return {
    threadKey,
    measurementKey: timelineMeasurementKey.value,
    widthBucket: layoutWidthBucket.value,
    outerAnchor: captureOuterAnchor(),
    itemHeights,
    itemSizeSources: itemSizeSourceSnapshot,
    markdownStates: Object.fromEntries(markdownStates.entries()),
  }
}

function captureThreadState(): MarkstreamThreadVirtualState {
  return captureThreadStateForKey(normalizedThreadKey.value)
}

function rememberThreadState(threadKey = normalizedThreadKey.value) {
  if (!threadKey)
    return undefined

  const state = captureThreadStateForKey(threadKey)
  threadStates.set(threadKey, state)
  if (threadKey === normalizedThreadKey.value)
    activeThreadStateSnapshot = state
  emitThreadStateChange(state)
  return state
}

function clearThreadStateRememberSchedule() {
  if (threadStateRememberTimer != null && typeof window !== 'undefined')
    window.clearTimeout(threadStateRememberTimer)

  threadStateRememberTimer = null
  pendingThreadStateRememberKey = undefined
}

function flushThreadStateRemember() {
  const threadKey = pendingThreadStateRememberKey

  if (threadStateRememberTimer != null && typeof window !== 'undefined')
    window.clearTimeout(threadStateRememberTimer)

  threadStateRememberTimer = null
  pendingThreadStateRememberKey = undefined

  return threadKey ? rememberThreadState(threadKey) : undefined
}

function scheduleThreadStateRemember(threadKey = normalizedThreadKey.value) {
  if (!threadKey)
    return

  pendingThreadStateRememberKey = threadKey

  if (threadStateRememberTimer != null)
    return

  if (typeof window === 'undefined') {
    flushThreadStateRemember()
    return
  }

  threadStateRememberTimer = window.setTimeout(() => {
    threadStateRememberTimer = null
    flushThreadStateRemember()
  }, THREAD_STATE_REMEMBER_DELAY_MS)
}

function rememberPreviousThreadState(threadKey: string) {
  if (flushThreadStateRemember()?.threadKey === threadKey)
    return

  if (activeThreadStateSnapshot?.threadKey === threadKey) {
    threadStates.set(threadKey, activeThreadStateSnapshot)
    emitThreadStateChange(activeThreadStateSnapshot)
    return
  }

  if (!threadStates.has(threadKey))
    rememberThreadState(threadKey)
}

function resolveOuterAnchorOffset(anchor: MarkstreamThreadAnchor | undefined) {
  if (!anchor)
    return null

  if (anchor.type === 'bottom') {
    return (!restorePaintReady.value ? getLayoutScrollContentHeight() : getScrollContentHeight())
      - getViewportHeight()
      - Math.max(0, anchor.distanceFromBottomPx)
  }

  const record = layout.value.records.find(item => item.key === anchor.itemKey)

  if (!record)
    return null

  return getScrollContentStart() + record.offset + Math.max(0, anchor.offsetWithinItemPx)
}

function restoreOuterAnchor(
  anchor: MarkstreamThreadAnchor | undefined,
  options: { remember?: boolean } = {},
) {
  const offset = resolveOuterAnchorOffset(anchor)

  if (offset == null)
    return false

  applyScrollOffset(offset, {
    writeDom: true,
    remember: options.remember === true,
  })

  return true
}

function applyThreadRestorePass(
  seq: number,
  anchor: MarkstreamThreadAnchor | undefined,
) {
  if (seq !== threadRestoreSeq)
    return

  if (anchor) {
    const restored = restoreOuterAnchor(anchor, { remember: false })
    activeThreadRestoreScrollTop = restored ? scrollTop.value : null
  }

  updateScrollMetrics({ remember: false })
}

function isVisibleInRootRect(el: HTMLElement, rootRect: DOMRect) {
  const rect = el.getBoundingClientRect()
  return rect.bottom >= rootRect.top && rect.top <= rootRect.bottom
}

function isElementVisibleInScrollRoot(el: HTMLElement, root: HTMLElement) {
  const rect = el.getBoundingClientRect()
  const rootRect = root.getBoundingClientRect()
  return rect.bottom > rootRect.top && rect.top < rootRect.bottom
}

function hasElementContent(content: HTMLElement) {
  if ((content.textContent ?? '').trim().length > 0)
    return true

  return Boolean(content.querySelector([
    'hr',
    'br',
    'table',
    'blockquote',
    'img',
    'svg',
    'canvas',
    'input',
    'button',
    'select',
    'textarea',
    '[role]',
    '[aria-label]',
    '[data-markstream-math]',
    '[data-markstream-mermaid]',
    '[data-markstream-infographic]',
    '[data-markstream-d2]',
    '[data-markstream-pre="1"]',
  ].join(',')))
}

function isElementVisiblyPainted(el: HTMLElement) {
  if (el.closest('.code-editor-container.is-hidden'))
    return false

  let current: HTMLElement | null = el
  while (current) {
    const style = window.getComputedStyle(current)
    if (
      style.display === 'none'
      || style.visibility === 'hidden'
      || Number.parseFloat(style.opacity || '1') <= 0.01
    ) {
      return false
    }

    current = current.parentElement
  }

  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function hasVisibleMonacoDom(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>('.monaco-editor, .monaco-diff-editor'))
    .some(isElementVisiblyPainted)
}

function hasUsableRestoreFallback(el: HTMLElement | null) {
  if (!el)
    return false

  if (el.classList.contains('is-fading-out'))
    return false

  const style = window.getComputedStyle(el)
  if (style.display === 'none' || Number.parseFloat(style.opacity || '1') <= 0.01)
    return false

  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function hasPendingVisualNode(content: HTMLElement) {
  return Boolean(content.querySelector([
    '[data-markstream-pending="true"]',
    '[data-markstream-mermaid][data-markstream-mode="pending"]',
    '.mermaid-block-container[data-markstream-mode="pending"]',
    '[data-markstream-code-loading="1"]',
  ].join(',')))
}

function hasReadyMathContent(content: HTMLElement) {
  const mathNodes = Array.from(
    content.querySelectorAll<HTMLElement>('[data-markstream-math]'),
  )

  if (!mathNodes.length)
    return true

  return mathNodes.every((node) => {
    const mode = node.dataset.markstreamMode
    const pending = node.dataset.markstreamPending === 'true'

    if (pending || mode === 'loading')
      return false

    return mode === 'katex' || mode === 'fallback'
  })
}

function hasReadyCodeBlockContent(content: HTMLElement) {
  // Async component loading fallback is intentionally visible enough to avoid a
  // blank node, but it is not layout-equivalent to the final CodeBlock shell.
  // Do not use it as an early-reveal signal during thread restore.
  if (content.querySelector('[data-markstream-code-loading="1"]'))
    return false

  const codeBlock = content.querySelector<HTMLElement>('[data-markstream-code-block="1"]')

  if (codeBlock) {
    const enhanced = codeBlock.dataset.markstreamEnhanced === 'true'
    const fallback = codeBlock.querySelector<HTMLElement>('pre.code-pre-fallback')
    const hasFallback = hasUsableRestoreFallback(fallback)

    // Hidden editor alone is not a visible surface. It is only safe when the
    // pre fallback is still usable, Monaco is visibly painted, or the block is enhanced.
    return enhanced || hasFallback || hasVisibleMonacoDom(codeBlock)
  }

  return hasReadyRoutedDiagramContent(content)
}

function hasReadyRoutedDiagramContent(content: HTMLElement) {
  const mermaid = content.querySelector<HTMLElement>('[data-markstream-mermaid], .mermaid-block-container')
  if (mermaid) {
    if (mermaid.dataset.markstreamPending === 'true')
      return false

    const mode = mermaid.dataset.markstreamMode

    if (mode === 'preview') {
      return Boolean(
        mermaid.querySelector('svg')
        || mermaid.querySelector('[data-mermaid-svg-layer="1"] svg'),
      )
    }

    if (mode === 'fallback') {
      return Boolean(
        mermaid.querySelector<HTMLElement>('.mermaid-source-code')
          ?.textContent
          ?.trim(),
      )
    }

    return false
  }

  const infographic = content.querySelector<HTMLElement>('[data-markstream-infographic], .infographic-block-container')
  if (infographic)
    return infographic.dataset.markstreamPending !== 'true'

  const d2 = content.querySelector<HTMLElement>('[data-markstream-d2], .d2-block-container')
  if (d2)
    return d2.dataset.markstreamPending !== 'true'

  return Boolean(content.querySelector('pre[data-markstream-pre="1"]'))
}

function isVisibleNodeSlotReady(slot: HTMLElement) {
  // NodeRenderer is still deferring this node.
  if (slot.querySelector(':scope > .node-placeholder'))
    return false

  const content = slot.querySelector<HTMLElement>(':scope > .node-content')
  if (!content)
    return false

  if (hasPendingVisualNode(content))
    return false

  if (!hasReadyMathContent(content))
    return false

  const nodeType = slot.dataset.nodeType ?? ''

  if (nodeType === 'code_block')
    return hasReadyCodeBlockContent(content)

  // For non-code nodes, the requirement is "not blank": a mounted element is
  // enough, even when it has no text, because <hr>, <br>, <img>, etc. are valid.
  return hasElementContent(content)
}

function hasRenderableMarkdownRecordContent(record: TimelineRecord, el: HTMLElement) {
  if (!record.markdown)
    return true

  const source = getMarkstreamTimelineItemContent(record.item, record.index, props)
  if (!String(source ?? '').trim())
    return true

  if (el.querySelector('[data-node-index]'))
    return true

  const renderer = el.querySelector<HTMLElement>('.markdown-renderer')
  const contentRoot = renderer ?? el

  if (hasPendingVisualNode(contentRoot))
    return false

  if ((contentRoot.textContent ?? '').trim())
    return true

  return Boolean(contentRoot.querySelector([
    'hr',
    'br',
    'table',
    'blockquote',
    'img',
    'svg',
    'canvas',
    'input',
    'button',
    '[role]',
    '[aria-label]',
    '[data-markstream-math]',
    '[data-markstream-mermaid]',
    '[data-markstream-infographic]',
    '[data-markstream-d2]',
    '[data-markstream-pre="1"]',
    '[data-markstream-code-block="1"]',
  ].join(',')))
}

function hasTrustedRestoredItemHeight(record: TimelineRecord) {
  const source = itemSizeSources.get(record.key)
  const compatibleSize = getCompatibleItemSize(record) ?? 0
  const restoredFloor = getRestoredItemHeightFloor(record.key, source)

  return compatibleSize > 0 || restoredFloor > 0
}

function hasReadyMarkdownRestoreMetrics(record: TimelineRecord, el: HTMLElement) {
  if (!record.markdown)
    return true

  if (
    !activeThreadRestoreRequiresMarkdownMetrics
    && !activeThreadRestoreRequiresColdMarkdownMetrics
  ) {
    return true
  }

  if (hasTrustedRestoredItemHeight(record))
    return true

  const source = getMarkstreamTimelineItemContent(record.item, record.index, props)
  if (!String(source ?? '').trim())
    return true

  const renderer = el.querySelector<HTMLElement>('.markdown-renderer')
  if (!renderer)
    return false

  const state = markdownStates.get(record.key)
  if (!isCompatibleMarkdownState(record, state))
    return !activeThreadRestoreRequiresColdMarkdownMetrics

  const metrics = state?.metrics
  const totalHeight = Number(metrics?.totalHeight ?? 0)

  return Number.isFinite(totalHeight)
    && totalHeight > 0
    && (
      metrics?.stable === true
      || metrics?.final === true
      || metrics?.confidence === 'measured'
      || metrics?.confidence === 'final'
      || metrics?.confidence === 'mixed'
    )
}

function isRestoreViewportReady() {
  const root = scrollRoot.value
  if (!root)
    return false

  const anchorOffset = resolveOuterAnchorOffset(activeThreadRestoreAnchor)
  if (
    anchorOffset != null
    && Math.abs((root.scrollTop || 0) - clampScrollOffset(anchorOffset)) > 1
  ) {
    return false
  }

  const visibleItems = Array.from(root.querySelectorAll<HTMLElement>('[data-markstream-item-key]'))
    .filter(el => isElementVisibleInScrollRoot(el, root))

  if (visibleItems.length === 0)
    return true

  for (const el of visibleItems) {
    const key = el.dataset.markstreamItemKey ?? ''
    const record = layout.value.records.find(item => item.key === key)

    if (!record)
      return false

    if (el.offsetHeight + 1 < record.size)
      return false

    if (!hasRenderableMarkdownRecordContent(record, el))
      return false

    if (!hasReadyMarkdownRestoreMetrics(record, el))
      return false
  }

  const rootRect = root.getBoundingClientRect()
  const visiblePendingVisualNode = Array
    .from(root.querySelectorAll<HTMLElement>([
      '[data-markstream-pending="true"]',
      '[data-markstream-mermaid][data-markstream-mode="pending"]',
      '.mermaid-block-container[data-markstream-mode="pending"]',
      '[data-markstream-code-loading="1"]',
    ].join(',')))
    .some(el => isVisibleInRootRect(el, rootRect))

  if (visiblePendingVisualNode)
    return false

  const visibleNodeSlots = Array.from(root.querySelectorAll<HTMLElement>('[data-node-index]'))
    .filter(slot => isVisibleInRootRect(slot, rootRect))

  for (const slot of visibleNodeSlots) {
    if (!isVisibleNodeSlotReady(slot))
      return false
  }

  return true
}

function readRestoreViewportSignature() {
  const root = scrollRoot.value
  if (!root)
    return ''

  const rootRect = root.getBoundingClientRect()
  const itemByKey = new Map(
    Array.from(root.querySelectorAll<HTMLElement>('[data-markstream-item-key]'))
      .map(el => [el.dataset.markstreamItemKey ?? '', el] as const),
  )

  const recordSignature = visibleWindow.value.records
    .map((record) => {
      const item = itemByKey.get(record.key)

      return [
        record.key,
        record.size,
        item?.offsetHeight ?? 0,
        item?.scrollHeight ?? 0,
      ].join(':')
    })
    .join('|')

  const nodeSignature = Array.from(root.querySelectorAll<HTMLElement>('[data-node-index]'))
    .filter(slot => isVisibleInRootRect(slot, rootRect))
    .map((slot) => {
      const rect = slot.getBoundingClientRect()
      const content = slot.querySelector<HTMLElement>(':scope > .node-content')
      const code = content?.querySelector<HTMLElement>('[data-markstream-code-block="1"]')
      const fallback = content?.querySelector<HTMLElement>('pre.code-pre-fallback')
      const editor = content?.querySelector<HTMLElement>('.monaco-editor, .monaco-diff-editor')

      return [
        slot.dataset.nodeIndex ?? '',
        slot.dataset.nodeType ?? '',
        Math.round(rect.height),
        content?.offsetHeight ?? 0,
        content?.scrollHeight ?? 0,
        code?.dataset.markstreamEnhanced ?? '',
        code ? Math.round(code.getBoundingClientRect().height) : 0,
        fallback ? Math.round(fallback.getBoundingClientRect().height) : 0,
        editor ? Math.round(editor.getBoundingClientRect().height) : 0,
      ].join(':')
    })
    .join('|')

  return [
    Math.round(root.scrollTop || 0),
    Math.round(root.scrollHeight || 0),
    Math.round(layout.value.totalHeight || 0),
    recordSignature,
    nodeSignature,
  ].join('\n')
}

function getNowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function hasRestoreLoadingTimedOut() {
  return threadRestoreStartedAt >= 0
    && getNowMs() - threadRestoreStartedAt >= THREAD_RESTORE_MAX_LOADING_MS
}

async function waitRestoreViewportReady(seq: number) {
  const startedAt = getNowMs()
  let stableFrames = 0
  let previousSignature = ''

  for (let i = 0; i < THREAD_RESTORE_READY_POLL_FRAMES; i++) {
    await nextTick()
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve())
        return
      }

      resolve()
    })

    if (!isActiveThreadRestore(seq))
      return false

    applyThreadRestorePass(seq, activeThreadRestoreAnchor)

    const now = getNowMs()
    const ready = isRestoreViewportReady()
    const signature = ready ? readRestoreViewportSignature() : ''

    if (ready && signature === previousSignature && signature) {
      stableFrames += 1

      if (
        stableFrames >= THREAD_RESTORE_STABLE_FRAMES
        && now - startedAt >= THREAD_RESTORE_MIN_READY_MS
      ) {
        return true
      }
    }
    else {
      stableFrames = 0
      previousSignature = signature
    }
  }

  return false
}

function warnRestoreViewportNotReady(seq: number) {
  if (threadRestoreReadyWarnedSeq === seq)
    return

  threadRestoreReadyWarnedSeq = seq

  if (
    props.debug === true
    && typeof import.meta !== 'undefined'
    && import.meta.env?.DEV
    && typeof console !== 'undefined'
  ) {
    console.warn(
      '[markstream-vue] MarkstreamVirtualTimeline restore viewport did not become ready; keeping restore loading visible.',
    )
  }
}

function scheduleRestoreViewportReadyRetry(seq: number) {
  if (!isActiveThreadRestore(seq))
    return

  if (typeof window === 'undefined')
    return

  if (threadRestoreReadyRetryTimer != null)
    window.clearTimeout(threadRestoreReadyRetryTimer)

  threadRestoreReadyRetryTimer = window.setTimeout(() => {
    threadRestoreReadyRetryTimer = null

    if (!isActiveThreadRestore(seq))
      return

    watchRestoreViewportReady(seq)
  }, THREAD_RESTORE_READY_RETRY_DELAY_MS)
}

function watchRestoreViewportReady(seq: number) {
  if (!isActiveThreadRestore(seq) || threadRestoreReadyWaitSeq === seq)
    return

  threadRestoreReadyWaitSeq = seq

  void waitRestoreViewportReady(seq).then((ready) => {
    if (threadRestoreReadyWaitSeq === seq)
      threadRestoreReadyWaitSeq = 0

    if (!isActiveThreadRestore(seq))
      return

    if (!ready) {
      if (hasRestoreLoadingTimedOut()) {
        if (
          props.debug === true
          && typeof import.meta !== 'undefined'
          && import.meta.env?.DEV
          && typeof console !== 'undefined'
        ) {
          console.warn(
            '[markstream-vue] MarkstreamVirtualTimeline restore viewport did not become ready before timeout; revealing the latest restored viewport.',
          )
        }

        finishThreadRestore(seq)
        return
      }

      warnRestoreViewportNotReady(seq)
      scheduleRestoreViewportReadyRetry(seq)
      return
    }

    finishThreadRestore(seq)
  })
}

function markRestorePaintReady() {
  restorePaintReady.value = true
  threadRestoreStartedAt = -1
  threadRestoreReadyWaitSeq = 0
  threadRestoreReadyWarnedSeq = 0
  activeThreadRestoreRequiresMarkdownMetrics = false
  activeThreadRestoreRequiresColdMarkdownMetrics = false

  if (threadRestoreReadyRetryTimer != null && typeof window !== 'undefined')
    window.clearTimeout(threadRestoreReadyRetryTimer)

  threadRestoreReadyRetryTimer = null
}

function markInitialThreadRestoreCompleted() {
  initialThreadRestoreCompleted = true
}

function resolveColdThreadRestoreAnchor(): MarkstreamThreadAnchor | undefined {
  if (props.stickToBottom !== false) {
    return {
      type: 'bottom',
      distanceFromBottomPx: 0,
    }
  }

  const first = layout.value.records[0]
  if (!first)
    return undefined

  return {
    type: 'item',
    itemKey: first.key,
    offsetWithinItemPx: 0,
  }
}

function canImportThreadItemHeights(state: MarkstreamThreadVirtualState | null | undefined) {
  if (!state)
    return false

  return (state.measurementKey ?? '') === timelineMeasurementKey.value
    && (state.widthBucket ?? 0) === layoutWidthBucket.value
}

function getCompatibleStateItemHeightEntries(state: MarkstreamThreadVirtualState | null | undefined) {
  const entries: Array<[string, number, TimelineItemSizeSource]> = []

  if (!canImportThreadItemHeights(state))
    return entries

  for (const [key, size] of Object.entries(state?.itemHeights ?? {})) {
    if (!Number.isFinite(size) || size <= 0)
      continue

    const record = findRecordByKey(key)
    const source = state?.itemSizeSources?.[key]
    if (!isCompatibleItemSizeSource(record, source))
      continue

    entries.push([key, Math.ceil(size), source!])
  }

  return entries
}

function hasCompatibleMarkdownState(state: MarkstreamThreadVirtualState | null | undefined) {
  for (const [key, markdownState] of Object.entries(state?.markdownStates ?? {})) {
    if (isCompatibleMarkdownState(findRecordByKey(key), markdownState))
      return true
  }

  return false
}

function hasRestorableThreadState(state: MarkstreamThreadVirtualState | null | undefined) {
  return Boolean(
    state?.outerAnchor
    || getCompatibleStateItemHeightEntries(state).length > 0
    || hasCompatibleMarkdownState(state),
  )
}

function scheduleThreadRestorePass(
  seq = activeThreadRestoreSeq,
  anchor = activeThreadRestoreAnchor,
) {
  if (!anchor)
    return

  void nextTick(() => {
    applyThreadRestorePass(seq, anchor)

    if (threadRestoreRaf != null)
      return

    if (typeof requestAnimationFrame === 'function') {
      threadRestoreRaf = requestAnimationFrame(() => {
        threadRestoreRaf = null
        applyThreadRestorePass(seq, anchor)
      })
    }
  })
}

function finishThreadRestore(seq: number) {
  if (seq !== threadRestoreSeq)
    return

  clearThreadRestoreSchedule()
  applyThreadRestorePass(seq, activeThreadRestoreAnchor)
  restoringThread.value = false
  threadRestoreStartedAt = -1
  activeThreadRestoreAnchor = undefined
  activeThreadRestoreScrollTop = null
  activeThreadRestoreSeq = 0

  // Restored floors are only a restore-time guard against partial mounted DOM.
  // Once the restored viewport is ready, later stable/final measurements should
  // be allowed to shrink stale persisted heights.
  restoredItemHeightFloors.clear()

  updateScrollMetrics({ remember: false })
  markRestorePaintReady()
  markInitialThreadRestoreCompleted()
}

function restoreThreadState(
  state: MarkstreamThreadVirtualState | null | undefined,
  options: { threadSwitch?: boolean } = {},
) {
  const restoreSeq = ++threadRestoreSeq

  if (state?.widthBucket && layoutWidthBucket.value === 0)
    layoutWidthBucket.value = state.widthBucket

  const anchor = state?.outerAnchor
  const hasRealRestoreState = hasRestorableThreadState(state)
  const shouldRequireMarkdownMetrics = hasCompatibleMarkdownState(state)

  const isInitialThreadRestore = !initialThreadRestoreCompleted && options.threadSwitch !== true
  const shouldGateColdThread = !isInitialThreadRestore && !hasRealRestoreState
  const shouldGateRestore = hasRealRestoreState || shouldGateColdThread

  const fallbackAnchor: MarkstreamThreadAnchor | undefined = anchor
    ?? (shouldGateRestore
      ? resolveColdThreadRestoreAnchor()
      : undefined)

  clearThreadRestoreSchedule()
  threadRestoreReadyWaitSeq = 0
  threadRestoreReadyWarnedSeq = 0

  restorePaintReady.value = !shouldGateRestore
  restoringThread.value = shouldGateRestore && Boolean(fallbackAnchor)
  activeThreadRestoreSeq = restoreSeq
  activeThreadRestoreAnchor = fallbackAnchor
  activeThreadRestoreRequiresMarkdownMetrics = shouldGateRestore && shouldRequireMarkdownMetrics
  activeThreadRestoreRequiresColdMarkdownMetrics = shouldGateRestore && shouldGateColdThread
  threadRestoreStartedAt = restoringThread.value
    ? getNowMs()
    : -1

  cleanupMeasuredElements()

  itemSizes.clear()
  itemSizeSources.clear()
  restoredItemHeightFloors.clear()
  markdownStates.clear()
  markdownLogicalHeights.clear()
  markdownLogicalHeightSources.clear()

  for (const [key, size, source] of getCompatibleStateItemHeightEntries(state)) {
    const next = Math.ceil(size)
    itemSizeSources.set(key, source)
    itemSizes.set(key, next)
    restoredItemHeightFloors.set(key, next)
  }

  for (const [key, markdownState] of Object.entries(state?.markdownStates ?? {})) {
    markdownStates.set(key, markdownState)
    seedMarkdownLogicalHeightFromState(key, markdownState)
  }

  if (props.stickToBottom === true) {
    bottomPinned.value = true
    exactBottomPinned.value = true
  }
  else if (props.stickToBottom === false) {
    bottomPinned.value = false
    exactBottomPinned.value = false
  }
  else {
    bottomPinned.value = fallbackAnchor?.type === 'bottom'
    exactBottomPinned.value = fallbackAnchor?.type === 'bottom'
      && fallbackAnchor.distanceFromBottomPx <= 2
  }

  const targetOffset = resolveOuterAnchorOffset(fallbackAnchor)
  activeThreadRestoreScrollTop = targetOffset == null
    ? null
    : clampScrollOffset(targetOffset)

  if (targetOffset != null) {
    applyScrollOffset(targetOffset, {
      writeDom: true,
      remember: false,
      updatePinned: false,
    })
  }

  activeThreadStateSnapshot = state?.threadKey === normalizedThreadKey.value
    ? state
    : null

  if (!shouldGateRestore) {
    restoringThread.value = false
    activeThreadRestoreAnchor = undefined
    activeThreadRestoreScrollTop = null
    activeThreadRestoreSeq = 0
    updateScrollMetrics({ remember: false })
    markRestorePaintReady()
    markInitialThreadRestoreCompleted()

    if (props.stickToBottom !== false) {
      bottomPinned.value = true
      exactBottomPinned.value = true

      void nextTick(() => {
        if (!restoringThread.value)
          scrollToBottom()
      })
    }

    return
  }

  if (!fallbackAnchor) {
    restoringThread.value = false
    activeThreadRestoreAnchor = undefined
    activeThreadRestoreScrollTop = null
    activeThreadRestoreSeq = 0
    updateScrollMetrics({ remember: false })
    markRestorePaintReady()
    markInitialThreadRestoreCompleted()
    return
  }

  void nextTick(() => {
    applyThreadRestorePass(restoreSeq, fallbackAnchor)

    if (typeof window !== 'undefined') {
      THREAD_RESTORE_SETTLE_DELAYS.forEach((delay) => {
        const timer = window.setTimeout(() => {
          applyThreadRestorePass(restoreSeq, fallbackAnchor)
        }, delay)

        threadRestoreTimers.push(timer)
      })
    }
    else {
      finishThreadRestore(restoreSeq)
      return
    }

    watchRestoreViewportReady(restoreSeq)
  })
}

function cleanupMeasuredElements() {
  for (const observer of resizeObservers.values())
    observer.disconnect()

  resizeObservers.clear()
  measuredElements.clear()
}

function cleanupObservers() {
  clearThreadStateRememberSchedule()
  cleanupMeasuredElements()
  itemSizeSources.clear()
  restoredItemHeightFloors.clear()
  markdownLogicalHeights.clear()
  markdownLogicalHeightSources.clear()
  rootResizeObserver?.disconnect()
  rootResizeObserver = null
}

function getExternalInitialThreadState(threadKey: string | undefined) {
  const initial = props.initialThreadState

  if (!initial)
    return null

  if ((initial.threadKey ?? '') !== (threadKey ?? ''))
    return null

  return initial
}

function resolveThreadStateForRestore(threadKey: string | undefined) {
  const memoryState = threadKey
    ? threadStates.get(threadKey)
    : null

  if (memoryState)
    return memoryState

  return getExternalInitialThreadState(threadKey)
}

watch(
  normalizedThreadKey,
  (threadKey, previousThreadKey) => {
    const oldKey = activeThreadKeySnapshot ?? previousThreadKey
    const threadSwitch = Boolean(oldKey && oldKey !== threadKey)

    if (threadSwitch)
      rememberPreviousThreadState(oldKey)

    activeThreadKeySnapshot = threadKey

    restoreThreadState(resolveThreadStateForRestore(threadKey), { threadSwitch })
  },
  {
    immediate: true,
    flush: 'sync',
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
    if (restoringThread.value)
      return

    if (props.stickToBottom === false)
      return

    if (props.stickToBottom === 'auto' && !exactBottomPinned.value)
      return

    void nextTick(() => {
      if (restoringThread.value)
        return

      if (props.stickToBottom === false)
        return

      // The user (or host API) may have scrolled away after this post-flush
      // watcher queued. Re-check before applying the delayed bottom snap so a
      // stale auto-stick pass cannot override an explicit non-bottom position.
      if (props.stickToBottom === 'auto' && !exactBottomPinned.value)
        return

      scrollToBottom()
    })
  },
  { flush: 'post' },
)

onMounted(() => {
  updateRootPaddingBlock()
  updateLayoutWidthBucket()
  applyInitialScrollPosition()

  if (scrollRoot.value && typeof ResizeObserver !== 'undefined') {
    rootResizeObserver = new ResizeObserver(() => {
      updateRootPaddingBlock()
      updateScrollMetrics()
    })
    rootResizeObserver.observe(scrollRoot.value)
  }
})

onUpdated(() => {
  if (restorePaintReady.value)
    return

  watchRestoreViewportReady(activeThreadRestoreSeq)
})

onBeforeUnmount(() => {
  if (!flushThreadStateRemember())
    rememberThreadState()
  clearThreadRestoreSchedule()
  cleanupObservers()
})

defineExpose({
  captureThreadState,
  restoreThreadState,
  scrollToBottom,
  scrollToIndex,
  scrollToOffset,
  getItemSize: (key: string) => {
    const record = findRecordByKey(key)
    return record ? getCompatibleItemSize(record) ?? undefined : undefined
  },
  getTotalHeight: () => layout.value.totalHeight,
  getVisibleRange: () => ({ start: visibleWindow.value.start, end: visibleWindow.value.end }),
})
</script>

<template>
  <div
    ref="scrollRoot"
    class="markstream-virtual-timeline"
    :class="{ 'is-restoring-thread': !restorePaintReady }"
    data-markstream-virtual-timeline="1"
    data-testid="markstream-virtual-timeline"
    @scroll="handleTimelineScroll"
  >
    <div
      class="markstream-virtual-timeline__spacer"
      :style="{ height: `${visibleWindow.topSpacerHeight}px` }"
      aria-hidden="true"
    />
    <div
      v-for="record in visibleWindow.records"
      :key="record.renderKey"
      class="markstream-virtual-timeline__item"
      :data-markstream-item-key="record.key"
      :data-markstream-item-kind="record.kind"
      :style="{ minHeight: `${record.size}px` }"
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
    <div
      v-if="!restorePaintReady"
      class="markstream-virtual-timeline__restore-loading"
      :style="getRestoreLoadingStyle()"
      aria-live="polite"
      aria-busy="true"
    >
      <slot
        name="restore-loading"
        :thread-key="normalizedThreadKey"
        :visible-records="visibleWindow.records"
      >
        <div class="markstream-virtual-timeline__restore-loading-card">
          <span class="markstream-virtual-timeline__restore-spinner" aria-hidden="true" />
          <span>Loading thread…</span>
        </div>
      </slot>
    </div>
  </div>
</template>

<style scoped>
.markstream-virtual-timeline {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: auto;
  overflow-anchor: none;
}

.markstream-virtual-timeline.is-restoring-thread > .markstream-virtual-timeline__spacer,
.markstream-virtual-timeline.is-restoring-thread > .markstream-virtual-timeline__item {
  visibility: hidden;
}

.markstream-virtual-timeline__restore-loading {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  pointer-events: none;
  overflow: hidden;
  background: color-mix(in srgb, Canvas 88%, transparent);
  contain: strict;
}

.markstream-virtual-timeline__restore-loading-card {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid rgb(148 163 184 / 32%);
  border-radius: 999px;
  background: rgb(255 255 255 / 92%);
  color: rgb(51 65 85);
  font-size: 13px;
  box-shadow: 0 8px 24px rgb(15 23 42 / 8%);
}

.markstream-virtual-timeline__restore-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgb(148 163 184 / 35%);
  border-top-color: rgb(51 65 85);
  border-radius: 999px;
  animation: markstream-timeline-restore-spin 0.8s linear infinite;
}

@keyframes markstream-timeline-restore-spin {
  to {
    transform: rotate(360deg);
  }
}

.markstream-virtual-timeline__spacer {
  flex: 0 0 auto;
  overflow-anchor: none;
}

.markstream-virtual-timeline__item {
  display: flow-root;
  flex: 0 0 auto;
  overflow-anchor: none;
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
