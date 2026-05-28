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

const scrollRoot = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(0)
const layoutWidthBucket = ref(0)
const bottomPinned = ref(true)
const itemSizes = reactive(new Map<string, number>()) as Map<string, number>
const markdownStates = reactive(new Map<string, MarkstreamVirtualState>()) as Map<string, MarkstreamVirtualState>
const markdownLogicalHeights = reactive(new Map<string, number>()) as Map<string, number>
const markdownLogicalHeightSources = new Map<string, MarkdownLogicalHeightSource>()
const measuredElements = new Map<string, HTMLElement>()
const resizeObservers = new Map<string, ResizeObserver>()
const threadStates = new Map<string, MarkstreamThreadVirtualState>()
const restoringThread = ref(false)
const restorePaintReady = ref(true)
const THREAD_RESTORE_SETTLE_DELAYS = [0, 80, 180, 360, 640]
let rootResizeObserver: ResizeObserver | null = null
let threadRestoreSeq = 0
let threadRestoreRaf: number | null = null
let threadRestoreTimers: number[] = []
let activeThreadRestoreSeq = 0
let activeThreadRestoreAnchor: MarkstreamThreadAnchor | undefined
let activeThreadStateSnapshot: MarkstreamThreadVirtualState | null = null

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
    const size = itemSizes.get(key) ?? estimateMarkstreamTimelineItemHeight(item, index, props)

    records.push({
      item,
      index,
      key,
      renderKey: `${renderScopeKey}:${key}`,
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

function getTimelineRenderScopeKey() {
  return normalizedThreadKey.value ?? 'timeline'
}

function getSessionKey(record: TimelineRecord) {
  const revision = getMarkstreamTimelineItemRevision(record.item, record.index, props)
  return [
    normalizedThreadKey.value ?? 'timeline',
    record.key,
    revision == null ? '' : String(revision),
  ].join(':')
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

  if (
    source.measurementKey
    && source.measurementKey !== timelineMeasurementKey.value
  ) {
    return false
  }

  return true
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

function shouldStickToBottom() {
  if (props.stickToBottom === true)
    return true
  if (props.stickToBottom === false)
    return false
  return bottomPinned.value
}

function clearThreadRestoreSchedule() {
  if (threadRestoreRaf != null && typeof cancelAnimationFrame === 'function')
    cancelAnimationFrame(threadRestoreRaf)

  threadRestoreRaf = null

  if (typeof window !== 'undefined') {
    for (const timer of threadRestoreTimers)
      window.clearTimeout(timer)
  }

  threadRestoreTimers = []
}

function getViewportHeight() {
  return Math.max(0, viewportHeight.value || scrollRoot.value?.clientHeight || 0)
}

function getMaxScrollOffset() {
  return Math.max(0, layout.value.totalHeight - getViewportHeight())
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
    layout.value.totalHeight - getViewportHeight() - scrollTop.value,
  )
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

function scrollToOffset(offset: number) {
  applyScrollOffset(offset, {
    writeDom: true,
    remember: true,
  })
}

function scrollToBottom() {
  scrollToOffset(layout.value.totalHeight - getViewportHeight())
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

  applyScrollOffset(layout.value.totalHeight - getViewportHeight(), {
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

  if (restoringThread.value) {
    itemSizes.set(key, next)
    scheduleThreadRestorePass()
    return
  }

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
      setItemSize(record.key, measured)

    return
  }

  const cachedSize = itemSizes.get(record.key) ?? 0
  const markdown = getKnownMarkdownLogicalHeight(record.key)
  const chrome = getMeasuredMarkdownChromeHeight(record.key)

  if (markdown > 0) {
    let next = Math.max(measured, markdown + chrome)

    if ((!options.allowMarkdownShrink || restoringThread.value) && cachedSize > 0)
      next = Math.max(next, cachedSize)

    if (next > 0)
      setItemSize(record.key, next)

    return
  }

  if (cachedSize > 0) {
    if (measured > cachedSize + 1)
      setItemSize(record.key, measured)

    return
  }

  if (measured > 0)
    setItemSize(record.key, measured)
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
  const virtualScroll: MarkstreamVirtualScrollOptions = {
    enabled: true,
    sessionKey: getSessionKey(record),
    threadKey: normalizedThreadKey.value,
    scrollRoot: () => scrollRoot.value,
    restoreState: markdownStates.get(record.key) ?? null,
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
      reconcileRecordSize(record, {
        allowMarkdownShrink: true,
      })

      void nextTick(() => {
        reconcileRecordSize(record, {
          allowMarkdownShrink: true,
        })
      })

      emitHeightChange({ itemKey: record.key, metrics })
    },
    onVirtualStateChange(state: MarkstreamVirtualState) {
      if (state.sessionKey !== getSessionKey(record))
        return

      markdownStates.set(record.key, state)
      seedMarkdownLogicalHeightFromState(record.key, state)
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

function captureThreadStateForKey(threadKey = normalizedThreadKey.value): MarkstreamThreadVirtualState {
  return {
    threadKey,
    outerAnchor: captureOuterAnchor(),
    itemHeights: Object.fromEntries(
      Array.from(itemSizes.entries())
        .filter(([, size]) => Number.isFinite(size) && size > 0),
    ),
    markdownStates: Object.fromEntries(markdownStates.entries()),
  }
}

function captureThreadState(): MarkstreamThreadVirtualState {
  return captureThreadStateForKey(normalizedThreadKey.value)
}

function rememberThreadState(threadKey = normalizedThreadKey.value) {
  if (!threadKey)
    return

  const state = captureThreadStateForKey(threadKey)
  threadStates.set(threadKey, state)
  if (threadKey === normalizedThreadKey.value)
    activeThreadStateSnapshot = state
  emitThreadStateChange(state)
}

function rememberPreviousThreadState(threadKey: string) {
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
    return layout.value.totalHeight
      - getViewportHeight()
      - Math.max(0, anchor.distanceFromBottomPx)
  }

  const record = layout.value.records.find(item => item.key === anchor.itemKey)

  if (!record)
    return null

  return record.offset + Math.max(0, anchor.offsetWithinItemPx)
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

  if (anchor)
    restoreOuterAnchor(anchor, { remember: false })

  updateScrollMetrics({ remember: false })
}

function markRestorePaintReady() {
  restorePaintReady.value = true
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

  applyThreadRestorePass(seq, activeThreadRestoreAnchor)
  restoringThread.value = false
  activeThreadRestoreAnchor = undefined
  activeThreadRestoreSeq = 0
  updateScrollMetrics()
  markRestorePaintReady()
}

function restoreThreadState(state: MarkstreamThreadVirtualState | null | undefined) {
  const restoreSeq = ++threadRestoreSeq
  const anchor = state?.outerAnchor
  const fallbackAnchor: MarkstreamThreadAnchor | undefined = anchor
    ?? (props.stickToBottom !== false
      ? { type: 'bottom', distanceFromBottomPx: 0 }
      : undefined)

  clearThreadRestoreSchedule()

  restorePaintReady.value = false
  restoringThread.value = Boolean(fallbackAnchor)
  activeThreadRestoreSeq = restoreSeq
  activeThreadRestoreAnchor = fallbackAnchor

  cleanupMeasuredElements()

  itemSizes.clear()
  markdownStates.clear()
  markdownLogicalHeights.clear()
  markdownLogicalHeightSources.clear()

  for (const [key, size] of Object.entries(state?.itemHeights ?? {})) {
    if (Number.isFinite(size) && size > 0)
      itemSizes.set(key, Math.ceil(size))
  }

  for (const [key, markdownState] of Object.entries(state?.markdownStates ?? {})) {
    markdownStates.set(key, markdownState)
    seedMarkdownLogicalHeightFromState(key, markdownState)
  }

  if (props.stickToBottom === true) {
    bottomPinned.value = true
  }
  else if (props.stickToBottom === false) {
    bottomPinned.value = false
  }
  else {
    bottomPinned.value = fallbackAnchor?.type === 'bottom'
  }

  const targetOffset = resolveOuterAnchorOffset(fallbackAnchor)

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

  if (!fallbackAnchor) {
    restoringThread.value = false
    activeThreadRestoreAnchor = undefined
    activeThreadRestoreSeq = 0
    updateScrollMetrics({ remember: false })
    markRestorePaintReady()
    return
  }

  void nextTick(() => {
    applyThreadRestorePass(restoreSeq, fallbackAnchor)

    if (typeof requestAnimationFrame === 'function') {
      threadRestoreRaf = requestAnimationFrame(() => {
        threadRestoreRaf = null
        applyThreadRestorePass(restoreSeq, fallbackAnchor)
      })
    }

    if (typeof window !== 'undefined') {
      THREAD_RESTORE_SETTLE_DELAYS.forEach((delay, index) => {
        const timer = window.setTimeout(() => {
          applyThreadRestorePass(restoreSeq, fallbackAnchor)

          if (index === THREAD_RESTORE_SETTLE_DELAYS.length - 1)
            finishThreadRestore(restoreSeq)
        }, delay)

        threadRestoreTimers.push(timer)
      })
    }
    else {
      finishThreadRestore(restoreSeq)
    }
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

    if (oldKey && oldKey !== threadKey)
      rememberPreviousThreadState(oldKey)

    activeThreadKeySnapshot = threadKey

    restoreThreadState(resolveThreadStateForRestore(threadKey))
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

    if (!shouldStickToBottom())
      return

    void nextTick(() => {
      if (!restoringThread.value)
        scrollToBottom()
    })
  },
  { flush: 'post' },
)

onMounted(() => {
  applyInitialScrollPosition()

  if (scrollRoot.value && typeof ResizeObserver !== 'undefined') {
    rootResizeObserver = new ResizeObserver(() => {
      updateScrollMetrics()
    })
    rootResizeObserver.observe(scrollRoot.value)
  }
})

onBeforeUnmount(() => {
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
  getItemSize: (key: string) => itemSizes.get(key),
  getTotalHeight: () => layout.value.totalHeight,
  getVisibleRange: () => ({ start: visibleWindow.value.start, end: visibleWindow.value.end }),
})
</script>

<template>
  <div
    ref="scrollRoot"
    class="markstream-virtual-timeline"
    :class="{ 'is-restoring-thread': !restorePaintReady }"
    data-testid="markstream-virtual-timeline"
    @scroll="updateScrollMetrics()"
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
  </div>
</template>

<style scoped>
.markstream-virtual-timeline {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: auto;
  overflow-anchor: none;
}

.markstream-virtual-timeline.is-restoring-thread {
  visibility: hidden;
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
