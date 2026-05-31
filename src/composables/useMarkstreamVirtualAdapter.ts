import type { MaybeRefOrGetter } from 'vue'
import type {
  MarkstreamVirtualMetrics,
  MarkstreamVirtualScrollOptions,
  MarkstreamVirtualState,
  NodeRendererProps,
} from '../types/node-renderer-props'
import { getCurrentScope, nextTick, onScopeDispose, reactive, ref, toRaw, toValue } from 'vue'
import {
  getMarkdownItemChromeHeight,
  readElementOuterHeight,
} from '../utils/virtualItemMeasurement'

function shouldAllowMarkdownShrink(metrics: MarkstreamVirtualMetrics) {
  if (metrics.phase === 'final')
    return true

  if (!metrics.stable)
    return false

  return metrics.confidence === 'measured'
    || metrics.confidence === 'final'
}

export type MarkstreamTimelineItemKey = string | number

export interface MarkstreamTimelineItem {
  id: MarkstreamTimelineItemKey
  kind?: string
  content?: string
  final?: boolean
  revision?: MarkstreamTimelineItemKey
  text?: string
  label?: string
  status?: string
  message?: string
  component?: unknown
}

export interface MarkstreamVirtualTimelineProps<T = MarkstreamTimelineItem> {
  items: T[]
  threadKey?: MarkstreamTimelineItemKey

  getKey?: (item: T, index: number) => MarkstreamTimelineItemKey
  getKind?: (item: T, index: number) => string
  getContent?: (item: T, index: number) => string
  getFinal?: (item: T, index: number) => boolean
  getRevision?: (item: T, index: number) => MarkstreamTimelineItemKey | undefined

  estimateItemHeight?: (item: T, index: number) => number

  overscan?: number
  overscanPx?: number
  stickToBottom?: boolean | 'auto'
  measurementKey?: string | number

  /**
   * Initial state for the active thread.
   *
   * Pass this before first render if the host persisted a previous state.
   * This prevents a first-frame jump from estimated scrollTop to restored scrollTop.
   */
  initialThreadState?: MarkstreamThreadVirtualState | null

  /**
   * Default: false.
   */
  markdownFade?: boolean

  /**
   * Default: false. Keep restore loading visible until the viewport is ready.
   */
  restoreMaxLoadingMs?: number | false

  debug?: boolean
}

export interface MarkstreamVisibleRange {
  start: number
  end: number
}

export interface MarkstreamOuterVirtualizerAdapter {
  getScrollElement: () => HTMLElement | null

  getScrollTop: () => number
  setScrollTop: (value: number) => void

  getViewportHeight: () => number
  getTotalHeight: () => number

  getItemOffset: (key: string) => number
  getItemSize: (key: string) => number
  setItemSize: (key: string, size: number) => void

  getVisibleRange: () => MarkstreamVisibleRange

  scrollToOffset: (offset: number) => void
  scrollToIndex: (index: number, align?: 'start' | 'center' | 'end') => void

  measureElement?: (key: string, el: HTMLElement) => void
}

export interface MarkstreamOuterAnchor {
  type: 'item'
  itemKey: string
  offsetWithinItemPx: number
}

export interface MarkstreamBottomAnchor {
  type: 'bottom'
  distanceFromBottomPx: number
}

export type MarkstreamThreadAnchor = MarkstreamOuterAnchor | MarkstreamBottomAnchor

export interface MarkstreamThreadVirtualState {
  threadKey?: string
  measurementKey?: string
  widthBucket?: number
  outerAnchor?: MarkstreamThreadAnchor
  itemHeights: Record<string, number>
  itemSizeSources?: Record<string, {
    sourceKey: string
    measurementKey?: string
    widthBucket?: number
  }>
  markdownStates: Record<string, MarkstreamVirtualState>
}

type MarkstreamItemSizeSource = NonNullable<MarkstreamThreadVirtualState['itemSizeSources']>[string]

export interface MarkstreamVirtualMarkdownProps extends Pick<NodeRendererProps, 'content' | 'final' | 'indexKey' | 'nodeVirtual' | 'virtualScroll' | 'fade'> {
  onHeightChange: (metrics: MarkstreamVirtualMetrics) => void
  onVirtualStateChange: (state: MarkstreamVirtualState) => void
}

export interface UseMarkstreamVirtualAdapterOptions<T = MarkstreamTimelineItem> {
  items: MaybeRefOrGetter<readonly T[]>
  threadKey?: MaybeRefOrGetter<MarkstreamTimelineItemKey | undefined>

  getKey?: (item: T, index: number) => MarkstreamTimelineItemKey
  getKind?: (item: T, index: number) => string
  getContent?: (item: T, index: number) => string
  getFinal?: (item: T, index: number) => boolean
  getRevision?: (item: T, index: number) => MarkstreamTimelineItemKey | undefined

  estimateItemHeight?: (item: T, index: number) => number
  measurementKey?: MaybeRefOrGetter<string | number | undefined>

  /**
   * Default: false.
   */
  markdownFade?: boolean

  /**
   * Preserve the outer scroll anchor when markdown logical height or measured
   * item height changes.
   *
   * Set false if the host virtualizer already performs equivalent scroll
   * anchoring.
   *
   * Default: 'auto'
   */
  preserveScrollAnchor?: boolean | 'auto'

  /**
   * Used when preserveScrollAnchor is enabled.
   * Default: 48
   */
  bottomThresholdPx?: number

  virtualizer: MarkstreamOuterVirtualizerAdapter
}

export interface MarkstreamVirtualAdapterController<T = MarkstreamTimelineItem> {
  itemHeights: Map<string, number>
  markdownStates: Map<string, MarkstreamVirtualState>
  getItemKey: (item: T, index: number) => string
  isMarkdownItem: (item: T, index: number) => boolean
  measureItem: (item: T, index: number, el: Element | { $el?: Element | null } | null | undefined) => void
  markdownProps: (item: T, index: number) => MarkstreamVirtualMarkdownProps
  captureThreadState: () => MarkstreamThreadVirtualState
  preloadThreadState: (state: MarkstreamThreadVirtualState | null | undefined) => void
  restoreThreadState: (state: MarkstreamThreadVirtualState | null | undefined) => void
  dispose: () => void
}

export function getMarkstreamTimelineItemKey<T>(
  item: T,
  index: number,
  options: Pick<UseMarkstreamVirtualAdapterOptions<T>, 'getKey'>,
) {
  const rawKey = options.getKey?.(item, index) ?? (item as MarkstreamTimelineItem).id ?? index
  return String(rawKey)
}

export function getMarkstreamTimelineItemKind<T>(
  item: T,
  index: number,
  options: Pick<UseMarkstreamVirtualAdapterOptions<T>, 'getKind'>,
) {
  return options.getKind?.(item, index) ?? String((item as MarkstreamTimelineItem).kind ?? '')
}

export function getMarkstreamTimelineItemContent<T>(
  item: T,
  index: number,
  options: Pick<UseMarkstreamVirtualAdapterOptions<T>, 'getContent'>,
) {
  const value = options.getContent?.(item, index) ?? (item as MarkstreamTimelineItem).content
  return typeof value === 'string' ? value : ''
}

export function getMarkstreamTimelineItemFinal<T>(
  item: T,
  index: number,
  options: Pick<UseMarkstreamVirtualAdapterOptions<T>, 'getFinal'>,
) {
  const value = options.getFinal?.(item, index)
  if (typeof value === 'boolean')
    return value

  const itemFinal = (item as MarkstreamTimelineItem).final
  return typeof itemFinal === 'boolean' ? itemFinal : true
}

export function getMarkstreamTimelineItemRevision<T>(
  item: T,
  index: number,
  options: Pick<UseMarkstreamVirtualAdapterOptions<T>, 'getRevision'>,
) {
  return options.getRevision?.(item, index) ?? (item as MarkstreamTimelineItem).revision
}

export function isMarkstreamMarkdownTimelineItem<T>(
  item: T,
  index: number,
  options: Pick<UseMarkstreamVirtualAdapterOptions<T>, 'getKind' | 'getContent'>,
) {
  const kind = getMarkstreamTimelineItemKind(item, index, options)
  if (kind === 'assistant-markdown' || kind === 'markdown')
    return true
  if (kind)
    return false
  return getMarkstreamTimelineItemContent(item, index, options).length > 0
}

export function estimateMarkstreamTimelineItemHeight<T>(
  item: T,
  index: number,
  options: Pick<UseMarkstreamVirtualAdapterOptions<T>, 'estimateItemHeight' | 'getKind' | 'getContent'>,
) {
  const estimated = options.estimateItemHeight?.(item, index)
  if (Number.isFinite(estimated) && estimated! > 0)
    return estimated!

  const kind = getMarkstreamTimelineItemKind(item, index, options)
  if (kind === 'assistant-markdown' || kind === 'markdown')
    return 360
  if (kind === 'system-divider')
    return 44
  if (kind === 'tool-call')
    return 72
  if (kind === 'thinking')
    return 92
  if (kind === 'error')
    return 76
  if (kind === 'user-message')
    return 88
  return getMarkstreamTimelineItemContent(item, index, options).length > 0 ? 360 : 96
}

export function useMarkstreamVirtualAdapter<T = MarkstreamTimelineItem>(
  options: UseMarkstreamVirtualAdapterOptions<T>,
): MarkstreamVirtualAdapterController<T> {
  interface ReconcileItemSizeOptions {
    allowMarkdownShrink?: boolean
  }

  interface MarkdownLogicalHeightSource {
    sessionKey: string
    threadKey?: string
    measurementKey?: string
  }

  const itemHeights = reactive(new Map<string, number>()) as Map<string, number>
  const itemSizeSources = new Map<string, MarkstreamItemSizeSource>()
  const markdownStates = reactive(new Map<string, MarkstreamVirtualState>()) as Map<string, MarkstreamVirtualState>
  const markdownLogicalHeights = reactive(new Map<string, number>()) as Map<string, number>
  const markdownLogicalHeightSources = new Map<string, MarkdownLogicalHeightSource>()
  const markdownPropsCache = new Map<string, MarkstreamVirtualMarkdownProps>()
  const measuredElements = new Map<string, HTMLElement>()
  const resizeObservers = new Map<string, ResizeObserver>()
  const restoringThread = ref(false)
  const THREAD_RESTORE_SETTLE_DELAYS = [0, 80, 180, 360, 640]
  let restoreThreadSeq = 0
  let restoreThreadRaf: number | null = null
  let restoreThreadTimers: number[] = []
  let activeRestoreSeq = 0
  let activeRestoreAnchor: MarkstreamThreadAnchor | undefined

  function getItems() {
    return [...toValue(options.items)]
  }

  function normalizeThreadKey() {
    const key = toValue(options.threadKey)
    return key == null ? undefined : String(key)
  }

  function getItemKey(item: T, index: number) {
    return getMarkstreamTimelineItemKey(item, index, options)
  }

  function isMarkdownItem(item: T, index: number) {
    return isMarkstreamMarkdownTimelineItem(item, index, options)
  }

  function getSessionKey(item: T, index: number) {
    const itemKey = getItemKey(item, index)
    const threadKey = normalizeThreadKey()
    const revision = getMarkstreamTimelineItemRevision(item, index, options)
    return [threadKey ?? 'timeline', itemKey, revision == null ? '' : String(revision)].join(':')
  }

  function normalizeMeasurementKey() {
    const measurementKey = toValue(options.measurementKey)
    return measurementKey == null ? undefined : String(measurementKey)
  }

  function getItemSizeSourceKey(item: T, index: number) {
    if (isMarkdownItem(item, index))
      return getSessionKey(item, index)

    const itemKey = getItemKey(item, index)
    const threadKey = normalizeThreadKey()
    const revision = getMarkstreamTimelineItemRevision(item, index, options)
    return [threadKey ?? 'timeline', itemKey, revision == null ? '' : String(revision)].join(':')
  }

  function getItemSizeSource(item: T, index: number): MarkstreamItemSizeSource {
    const measurementKey = normalizeMeasurementKey()
    return {
      sourceKey: getItemSizeSourceKey(item, index),
      ...(measurementKey == null ? {} : { measurementKey }),
    }
  }

  function findCurrentItemByKey(key: string) {
    const items = getItems()

    for (let index = 0; index < items.length; index++) {
      const item = items[index]!
      if (getItemKey(item, index) === key)
        return { item, index }
    }

    return null
  }

  function isCompatibleItemSizeSource(
    key: string,
    source: MarkstreamItemSizeSource | null | undefined,
  ) {
    const match = findCurrentItemByKey(key)
    if (!match || !source)
      return false

    if (source.sourceKey !== getItemSizeSourceKey(match.item, match.index))
      return false

    if ((source.measurementKey ?? '') !== (normalizeMeasurementKey() ?? ''))
      return false

    return true
  }

  function isSameItemSizeSource(
    a: MarkstreamItemSizeSource | null | undefined,
    b: MarkstreamItemSizeSource | null | undefined,
  ) {
    return (a?.sourceKey ?? '') === (b?.sourceKey ?? '')
      && (a?.measurementKey ?? '') === (b?.measurementKey ?? '')
      && (a?.widthBucket ?? 0) === (b?.widthBucket ?? 0)
  }

  function getCurrentItemSizeSource(key: string) {
    const match = findCurrentItemByKey(key)
    return match ? getItemSizeSource(match.item, match.index) : undefined
  }

  function getCompatibleItemSize(key: string) {
    if (!isCompatibleItemSizeSource(key, itemSizeSources.get(key)))
      return 0

    const size = itemHeights.get(key)
    return Number.isFinite(size) && size! > 0 ? size! : 0
  }

  function isCompatibleMarkdownSource(
    key: string,
    source: MarkdownLogicalHeightSource | null | undefined,
  ) {
    const match = findCurrentItemByKey(key)
    if (!match || !source)
      return false

    if (!isMarkdownItem(match.item, match.index))
      return false

    if (source.sessionKey !== getSessionKey(match.item, match.index))
      return false

    if ((source.threadKey ?? '') !== (normalizeThreadKey() ?? ''))
      return false

    if (!isCompatibleMarkdownMeasurementKey(source.measurementKey))
      return false

    return true
  }

  function isCompatibleMarkdownMeasurementKey(measurementKey: string | undefined) {
    const expected = normalizeMeasurementKey() ?? ''
    const actual = measurementKey ?? ''

    return actual === expected || actual.startsWith(`${expected}\u0000`)
  }

  function isCurrentMarkdownKey(key: string) {
    const match = findCurrentItemByKey(key)
    return match ? isMarkdownItem(match.item, match.index) : false
  }

  function isCompatibleMarkdownState(
    key: string,
    state: MarkstreamVirtualState | null | undefined,
  ) {
    return isCompatibleMarkdownSource(key, state)
  }

  function getLogicalHeightFromMarkdownState(
    key: string,
    state = markdownStates.get(key),
  ) {
    if (!isCompatibleMarkdownState(key, state))
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
    seedOptions: { trustImportedState?: boolean } = {},
  ) {
    const height = seedOptions.trustImportedState
      ? Number(state?.metrics?.totalHeight)
      : getLogicalHeightFromMarkdownState(key, state)

    if (!Number.isFinite(height) || height <= 0 || !state)
      return 0

    setMarkdownLogicalHeight(key, Math.ceil(height), state)
    return Math.ceil(height)
  }

  function getKnownMarkdownLogicalHeight(key: string) {
    const source = markdownLogicalHeightSources.get(key)

    if (isCompatibleMarkdownSource(key, source))
      return markdownLogicalHeights.get(key) ?? 0

    return seedMarkdownLogicalHeightFromState(key)
  }

  function normalizeHeight(size: number) {
    return Number.isFinite(size) && size > 0 ? size : null
  }

  function getBottomThresholdPx() {
    const value = Number(options.bottomThresholdPx ?? 48)
    return Number.isFinite(value) ? Math.max(0, value) : 48
  }

  function getDistanceFromBottom() {
    return Math.max(
      0,
      options.virtualizer.getTotalHeight()
      - options.virtualizer.getViewportHeight()
      - options.virtualizer.getScrollTop(),
    )
  }

  function shouldPreserveScrollAnchor() {
    return options.preserveScrollAnchor !== false
  }

  function scheduleOuterAnchorRestore(anchor: MarkstreamThreadAnchor | undefined) {
    if (!anchor)
      return

    void nextTick(() => {
      restoreOuterAnchor(anchor)

      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          restoreOuterAnchor(anchor)
        })
      }
    })
  }

  function clearRestoreThreadSchedule() {
    if (restoreThreadRaf != null && typeof cancelAnimationFrame === 'function')
      cancelAnimationFrame(restoreThreadRaf)

    restoreThreadRaf = null

    if (typeof window !== 'undefined') {
      for (const timer of restoreThreadTimers)
        window.clearTimeout(timer)
    }

    restoreThreadTimers = []
  }

  function setItemSize(
    key: string,
    size: number,
    source = getCurrentItemSizeSource(key),
  ) {
    const normalized = normalizeHeight(size)
    if (normalized == null)
      return

    const previous = itemHeights.get(key)
    const sourceChanged = source && !isSameItemSizeSource(itemSizeSources.get(key), source)
    if (previous != null && Math.abs(previous - normalized) < 0.5 && !sourceChanged)
      return

    if (restoringThread.value) {
      itemHeights.set(key, normalized)
      if (source)
        itemSizeSources.set(key, source)
      options.virtualizer.setItemSize(key, normalized)
      scheduleActiveRestorePass()
      return
    }

    const shouldPreserve = shouldPreserveScrollAnchor()
    const anchorBeforeChange = shouldPreserve
      ? captureOuterAnchor()
      : undefined
    const distanceBeforeChange = getDistanceFromBottom()
    const wasExactlyPinnedToBottom = shouldPreserve
      && distanceBeforeChange <= 2
    const wasNearBottom = shouldPreserve
      && distanceBeforeChange <= getBottomThresholdPx()

    itemHeights.set(key, normalized)
    if (source)
      itemSizeSources.set(key, source)
    options.virtualizer.setItemSize(key, normalized)

    if (!shouldPreserve)
      return

    if (wasExactlyPinnedToBottom) {
      scheduleOuterAnchorRestore({
        type: 'bottom',
        distanceFromBottomPx: 0,
      })
      return
    }

    if (wasNearBottom) {
      scheduleOuterAnchorRestore({
        type: 'bottom',
        distanceFromBottomPx: distanceBeforeChange,
      })
      return
    }

    scheduleOuterAnchorRestore(anchorBeforeChange)
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

  function reconcileItemSize(
    key: string,
    reconcileOptions: ReconcileItemSizeOptions = {},
  ) {
    const measured = getMeasuredItemHeight(key)
    const cached = getCompatibleItemSize(key)

    if (!isCurrentMarkdownKey(key)) {
      if (measured > 0)
        setItemSize(key, measured)

      return
    }

    const markdown = getKnownMarkdownLogicalHeight(key)
    const chrome = getMeasuredMarkdownChromeHeight(key)

    if (markdown > 0) {
      let next = Math.max(measured, markdown + chrome)

      if ((!reconcileOptions.allowMarkdownShrink || restoringThread.value) && cached > 0)
        next = Math.max(next, cached)

      if (next > 0)
        setItemSize(key, next)

      return
    }

    if (cached > 0) {
      if (measured > cached + 1)
        setItemSize(key, measured)

      return
    }

    if (measured > 0)
      setItemSize(key, measured)
  }

  function measureItem(item: T, index: number, el: Element | { $el?: Element | null } | null | undefined) {
    const key = getItemKey(item, index)
    const element = resolveElement(el)
    const previous = measuredElements.get(key)

    if (!element) {
      cleanupMeasuredElement(key)
      return
    }

    if (previous === element) {
      reconcileItemSize(key)
      return
    }

    cleanupMeasuredElement(key)

    measuredElements.set(key, element)
    options.virtualizer.measureElement?.(key, element)
    reconcileItemSize(key)

    if (typeof ResizeObserver === 'undefined')
      return

    const observer = new ResizeObserver(() => {
      options.virtualizer.measureElement?.(key, element)
      reconcileItemSize(key)
    })
    observer.observe(element)
    resizeObservers.set(key, observer)
  }

  function markdownProps(item: T, index: number): MarkstreamVirtualMarkdownProps {
    const itemKey = getItemKey(item, index)
    const final = getMarkstreamTimelineItemFinal(item, index, options)
    const threadKey = normalizeThreadKey()
    const content = getMarkstreamTimelineItemContent(item, index, options)
    const sessionKey = getSessionKey(item, index)
    const measurementKey = toValue(options.measurementKey)
    const cacheKey = [
      itemKey,
      sessionKey,
      final ? 'final' : 'live',
      measurementKey == null ? '' : String(measurementKey),
    ].join(':')
    const restoreState = toRaw(markdownStates).get(itemKey)
    const cached = markdownPropsCache.get(cacheKey)

    if (cached && cached.content === content) {
      if (cached.virtualScroll)
        cached.virtualScroll.restoreState = isCompatibleMarkdownState(itemKey, restoreState) ? restoreState! : null

      return cached
    }

    const virtualScroll: MarkstreamVirtualScrollOptions = {
      enabled: true,
      sessionKey,
      threadKey,
      scrollRoot: () => options.virtualizer.getScrollElement(),
      restoreState: isCompatibleMarkdownState(itemKey, restoreState) ? restoreState! : null,
      restoreAnchor: false,
      measurementKey,
      settleMode: 'manual',
      settledToken: final,
      emitIntervalMs: 32,
      heightDiffThresholdPx: 1,
    }

    const props: MarkstreamVirtualMarkdownProps = {
      content,
      final,
      nodeVirtual: 'auto',
      fade: options.markdownFade === true,
      indexKey: sessionKey,
      virtualScroll,
      onHeightChange(metrics) {
        if (metrics.sessionKey !== getSessionKey(item, index))
          return

        setMarkdownLogicalHeight(itemKey, metrics.totalHeight, {
          sessionKey: metrics.sessionKey,
          threadKey,
          measurementKey: normalizeMeasurementKey(),
        })

        const allowMarkdownShrink = shouldAllowMarkdownShrink(metrics)
        const logicalHeight = Math.ceil(metrics.totalHeight)

        reconcileItemSize(itemKey, {
          allowMarkdownShrink,
        })

        void nextTick(() => {
          if (getKnownMarkdownLogicalHeight(itemKey) !== logicalHeight)
            return

          reconcileItemSize(itemKey, {
            allowMarkdownShrink,
          })
        })
      },
      onVirtualStateChange(state) {
        if (state.sessionKey !== getSessionKey(item, index))
          return

        markdownStates.set(itemKey, state)
        virtualScroll.restoreState = state
        seedMarkdownLogicalHeightFromState(itemKey, state)
      },
    }

    markdownPropsCache.set(cacheKey, props)
    return props
  }

  function exportItemHeights() {
    const heights: Record<string, number> = {}
    const items = getItems()
    for (let index = 0; index < items.length; index++) {
      const item = items[index]!
      const key = getItemKey(item, index)
      const size = getCompatibleItemSize(key)
      if (Number.isFinite(size) && size > 0)
        heights[key] = size
    }
    return heights
  }

  function exportItemSizeSources() {
    const sources: NonNullable<MarkstreamThreadVirtualState['itemSizeSources']> = {}
    const items = getItems()
    for (let index = 0; index < items.length; index++) {
      const item = items[index]!
      const key = getItemKey(item, index)
      const source = itemSizeSources.get(key)
      if (isCompatibleItemSizeSource(key, source))
        sources[key] = source!
    }
    return sources
  }

  function exportMarkdownStates() {
    const states: Record<string, MarkstreamVirtualState> = {}
    for (const [key, state] of markdownStates)
      states[key] = state
    return states
  }

  function captureOuterAnchor(): MarkstreamThreadAnchor | undefined {
    const scrollTop = options.virtualizer.getScrollTop()
    const viewportHeight = options.virtualizer.getViewportHeight()
    const totalHeight = options.virtualizer.getTotalHeight()
    const distanceFromBottom = totalHeight - viewportHeight - scrollTop

    if (distanceFromBottom <= 2) {
      return {
        type: 'bottom',
        distanceFromBottomPx: Math.max(0, distanceFromBottom),
      }
    }

    const items = getItems()
    for (let index = 0; index < items.length; index++) {
      const item = items[index]!
      const key = getItemKey(item, index)
      const offset = options.virtualizer.getItemOffset(key)
      const size = options.virtualizer.getItemSize(key)
      if (scrollTop >= offset && scrollTop < offset + size) {
        return {
          type: 'item',
          itemKey: key,
          offsetWithinItemPx: scrollTop - offset,
        }
      }
    }

    const range = options.virtualizer.getVisibleRange()
    const item = items[range.start]
    if (!item)
      return undefined

    const key = getItemKey(item, range.start)
    return {
      type: 'item',
      itemKey: key,
      offsetWithinItemPx: 0,
    }
  }

  function captureThreadState(): MarkstreamThreadVirtualState {
    const measurementKey = normalizeMeasurementKey()
    return {
      threadKey: normalizeThreadKey(),
      ...(measurementKey == null ? {} : { measurementKey }),
      outerAnchor: captureOuterAnchor(),
      itemHeights: exportItemHeights(),
      itemSizeSources: exportItemSizeSources(),
      markdownStates: exportMarkdownStates(),
    }
  }

  function canImportItemHeights(state: MarkstreamThreadVirtualState) {
    return (state.measurementKey ?? '') === (normalizeMeasurementKey() ?? '')
  }

  function importItemHeights(state: MarkstreamThreadVirtualState) {
    itemHeights.clear()
    itemSizeSources.clear()

    if (!canImportItemHeights(state))
      return

    for (const [key, size] of Object.entries(state.itemHeights ?? {})) {
      const normalized = normalizeHeight(size)
      const source = state.itemSizeSources?.[key]
      if (normalized == null)
        continue

      if (!isCompatibleItemSizeSource(key, source))
        continue

      itemHeights.set(key, normalized)
      itemSizeSources.set(key, source!)
      options.virtualizer.setItemSize(key, normalized)
    }
  }

  function importMarkdownStates(states: Record<string, MarkstreamVirtualState>) {
    markdownStates.clear()
    markdownLogicalHeights.clear()
    markdownLogicalHeightSources.clear()

    for (const [key, state] of Object.entries(states)) {
      markdownStates.set(key, state)
      seedMarkdownLogicalHeightFromState(key, state, {
        trustImportedState: true,
      })
    }
  }

  function preloadThreadState(state: MarkstreamThreadVirtualState | null | undefined) {
    if (!state) {
      itemHeights.clear()
      itemSizeSources.clear()
      markdownStates.clear()
      markdownLogicalHeights.clear()
      markdownLogicalHeightSources.clear()
      return
    }

    importItemHeights(state)
    importMarkdownStates(state.markdownStates ?? {})
  }

  function restoreOuterAnchor(anchor: MarkstreamThreadAnchor | undefined) {
    if (!anchor)
      return

    if (anchor.type === 'bottom') {
      const offset = Math.max(
        0,
        options.virtualizer.getTotalHeight()
        - options.virtualizer.getViewportHeight()
        - anchor.distanceFromBottomPx,
      )
      options.virtualizer.scrollToOffset(offset)
      return
    }

    const offset = Math.max(
      0,
      options.virtualizer.getItemOffset(anchor.itemKey) + anchor.offsetWithinItemPx,
    )
    options.virtualizer.scrollToOffset(offset)
  }

  function applyRestorePass(
    seq: number,
    anchor: MarkstreamThreadAnchor | undefined,
  ) {
    if (seq !== restoreThreadSeq)
      return

    restoreOuterAnchor(anchor)
  }

  function scheduleActiveRestorePass() {
    const anchor = activeRestoreAnchor
    const seq = activeRestoreSeq

    if (!anchor)
      return

    void nextTick(() => {
      applyRestorePass(seq, anchor)

      if (restoreThreadRaf != null)
        return

      if (typeof requestAnimationFrame === 'function') {
        restoreThreadRaf = requestAnimationFrame(() => {
          restoreThreadRaf = null
          applyRestorePass(seq, anchor)
        })
      }
    })
  }

  function finishRestoreThread(seq: number) {
    if (seq !== restoreThreadSeq)
      return

    applyRestorePass(seq, activeRestoreAnchor)
    restoringThread.value = false
    activeRestoreAnchor = undefined
    activeRestoreSeq = 0
  }

  function restoreThreadState(state: MarkstreamThreadVirtualState | null | undefined) {
    const seq = ++restoreThreadSeq
    const anchor = state?.outerAnchor

    clearRestoreThreadSchedule()

    restoringThread.value = Boolean(anchor)
    activeRestoreSeq = seq
    activeRestoreAnchor = anchor

    preloadThreadState(state)

    if (!anchor) {
      restoringThread.value = false
      activeRestoreAnchor = undefined
      activeRestoreSeq = 0
      return
    }

    applyRestorePass(seq, anchor)

    void nextTick(() => {
      applyRestorePass(seq, anchor)

      if (typeof requestAnimationFrame === 'function') {
        restoreThreadRaf = requestAnimationFrame(() => {
          restoreThreadRaf = null
          applyRestorePass(seq, anchor)
        })
      }

      if (typeof window !== 'undefined') {
        THREAD_RESTORE_SETTLE_DELAYS.forEach((delay, index) => {
          const timer = window.setTimeout(() => {
            applyRestorePass(seq, anchor)

            if (index === THREAD_RESTORE_SETTLE_DELAYS.length - 1)
              finishRestoreThread(seq)
          }, delay)

          restoreThreadTimers.push(timer)
        })
      }
      else {
        finishRestoreThread(seq)
      }
    })
  }

  function dispose() {
    clearRestoreThreadSchedule()

    for (const observer of resizeObservers.values())
      observer.disconnect()
    resizeObservers.clear()
    measuredElements.clear()
    itemSizeSources.clear()
    markdownLogicalHeights.clear()
    markdownLogicalHeightSources.clear()
    markdownPropsCache.clear()
  }

  if (getCurrentScope())
    onScopeDispose(dispose)

  return {
    itemHeights,
    markdownStates,
    getItemKey,
    isMarkdownItem,
    measureItem,
    markdownProps,
    captureThreadState,
    preloadThreadState,
    restoreThreadState,
    dispose,
  }
}
