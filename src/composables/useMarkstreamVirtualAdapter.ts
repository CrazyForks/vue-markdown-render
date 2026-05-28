import type { MaybeRefOrGetter } from 'vue'
import type {
  MarkstreamVirtualMetrics,
  MarkstreamVirtualScrollOptions,
  MarkstreamVirtualState,
  NodeRendererProps,
} from '../types/node-renderer-props'
import { getCurrentScope, nextTick, onScopeDispose, reactive, ref, toValue } from 'vue'

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
  outerAnchor?: MarkstreamThreadAnchor
  itemHeights: Record<string, number>
  markdownStates: Record<string, MarkstreamVirtualState>
}

export interface MarkstreamVirtualMarkdownProps extends Pick<NodeRendererProps, 'content' | 'final' | 'indexKey' | 'nodeVirtual' | 'virtualScroll'> {
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
  const itemHeights = reactive(new Map<string, number>()) as Map<string, number>
  const markdownStates = reactive(new Map<string, MarkstreamVirtualState>()) as Map<string, MarkstreamVirtualState>
  const markdownLogicalHeights = reactive(new Map<string, number>()) as Map<string, number>
  const measuredElements = new Map<string, HTMLElement>()
  const resizeObservers = new Map<string, ResizeObserver>()
  const markdownRestoreItemKey = ref<string | null>(null)
  const markdownRestoreToken = ref(0)

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

  function setItemSize(key: string, size: number) {
    const normalized = normalizeHeight(size)
    if (normalized == null)
      return

    const previous = itemHeights.get(key)
    if (previous != null && Math.abs(previous - normalized) < 0.5)
      return

    const shouldPreserve = shouldPreserveScrollAnchor()
    const anchorBeforeChange = shouldPreserve
      ? captureOuterAnchor()
      : undefined
    const wasPinnedToBottom = shouldPreserve
      && getDistanceFromBottom() <= getBottomThresholdPx()

    itemHeights.set(key, normalized)
    options.virtualizer.setItemSize(key, normalized)

    if (!shouldPreserve)
      return

    if (wasPinnedToBottom) {
      scheduleOuterAnchorRestore({
        type: 'bottom',
        distanceFromBottomPx: 0,
      })
      return
    }

    scheduleOuterAnchorRestore(anchorBeforeChange)
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

  function reconcileItemSize(key: string) {
    const measured = readElementHeight(measuredElements.get(key))
    const markdown = markdownLogicalHeights.get(key) ?? 0
    const next = Math.max(measured, markdown)

    if (next > 0)
      setItemSize(key, next)
  }

  function measureItem(item: T, index: number, el: Element | { $el?: Element | null } | null | undefined) {
    const key = getItemKey(item, index)
    const element = resolveElement(el)
    const previous = measuredElements.get(key)

    if (!element) {
      cleanupMeasuredElement(key)
      reconcileItemSize(key)
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
    const virtualScroll: MarkstreamVirtualScrollOptions = {
      enabled: true,
      sessionKey: getSessionKey(item, index),
      threadKey,
      scrollRoot: () => options.virtualizer.getScrollElement(),
      restoreState: markdownStates.get(itemKey) ?? null,
      restoreAnchor: markdownRestoreItemKey.value === itemKey ? markdownRestoreToken.value : false,
      measurementKey: toValue(options.measurementKey),
      settleMode: 'manual',
      settledToken: final,
      emitIntervalMs: 32,
      heightDiffThresholdPx: 1,
    }

    return {
      content: getMarkstreamTimelineItemContent(item, index, options),
      final,
      nodeVirtual: 'auto',
      indexKey: getSessionKey(item, index),
      virtualScroll,
      onHeightChange(metrics) {
        markdownLogicalHeights.set(itemKey, metrics.totalHeight)
        reconcileItemSize(itemKey)

        void nextTick(() => {
          reconcileItemSize(itemKey)
        })
      },
      onVirtualStateChange(state) {
        markdownStates.set(itemKey, state)
      },
    }
  }

  function exportItemHeights() {
    const heights: Record<string, number> = {}
    const items = getItems()
    for (let index = 0; index < items.length; index++) {
      const item = items[index]!
      const key = getItemKey(item, index)
      const size = itemHeights.get(key) ?? options.virtualizer.getItemSize(key)
      if (Number.isFinite(size) && size > 0)
        heights[key] = size
    }
    return heights
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
    return {
      threadKey: normalizeThreadKey(),
      outerAnchor: captureOuterAnchor(),
      itemHeights: exportItemHeights(),
      markdownStates: exportMarkdownStates(),
    }
  }

  function importItemHeights(heights: Record<string, number>) {
    itemHeights.clear()
    for (const [key, size] of Object.entries(heights)) {
      const normalized = normalizeHeight(size)
      if (normalized == null)
        continue

      itemHeights.set(key, normalized)
      options.virtualizer.setItemSize(key, normalized)
    }
  }

  function importMarkdownStates(states: Record<string, MarkstreamVirtualState>) {
    markdownStates.clear()
    for (const [key, state] of Object.entries(states))
      markdownStates.set(key, state)
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

  function restoreThreadState(state: MarkstreamThreadVirtualState | null | undefined) {
    markdownLogicalHeights.clear()
    importItemHeights(state?.itemHeights ?? {})
    importMarkdownStates(state?.markdownStates ?? {})

    markdownRestoreItemKey.value = state?.outerAnchor?.type === 'item'
      ? state.outerAnchor.itemKey
      : null
    markdownRestoreToken.value += 1

    void nextTick(() => {
      restoreOuterAnchor(state?.outerAnchor)
    })
  }

  function dispose() {
    for (const observer of resizeObservers.values())
      observer.disconnect()
    resizeObservers.clear()
    measuredElements.clear()
    markdownLogicalHeights.clear()
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
    restoreThreadState,
    dispose,
  }
}
