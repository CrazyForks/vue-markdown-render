import type { ComputedRef, Ref } from 'vue'

export interface ScrollListenerOptions {
  isClient: boolean
  virtualizationEnabled: ComputedRef<boolean>
  listenerEnabled?: ComputedRef<boolean>
  scrollRootElement: Ref<HTMLElement | null>
  resolveScrollContainer: (node?: HTMLElement | null) => HTMLElement | null
  scheduleFocusSync: (options?: { immediate?: boolean }) => void
  onScroll?: () => void
  getScrollTop?: (root: HTMLElement) => number
}

export interface ScrollListener {
  cleanupScrollListener: () => void
  setupScrollListener: () => void
}

export function useScrollListener(
  options: ScrollListenerOptions,
): ScrollListener {
  const {
    isClient,
    virtualizationEnabled,
    listenerEnabled,
    scrollRootElement,
    resolveScrollContainer,
    scheduleFocusSync,
    onScroll,
  } = options

  let detachScrollHandler: (() => void) | null = null
  let lastObservedScrollTop: number | null = null

  function cleanupScrollListener() {
    if (detachScrollHandler) {
      detachScrollHandler()
      detachScrollHandler = null
    }

    lastObservedScrollTop = null
    scrollRootElement.value = null
  }

  function isListenerEnabled() {
    return listenerEnabled?.value ?? virtualizationEnabled.value
  }

  function setupScrollListener() {
    if (!isClient)
      return

    if (!isListenerEnabled()) {
      cleanupScrollListener()
      return
    }

    const root = resolveScrollContainer()

    if (!root) {
      cleanupScrollListener()
      return
    }

    if (scrollRootElement.value === root && detachScrollHandler)
      return

    cleanupScrollListener()

    lastObservedScrollTop = readObservedScrollTop(root)

    const handler = () => {
      onScroll?.()
      if (virtualizationEnabled.value) {
        const options = resolveFocusSyncScheduleOptions(root)
        if (options)
          scheduleFocusSync(options)
        else
          scheduleFocusSync()
      }
    }

    root.addEventListener('scroll', handler, { passive: true })
    scrollRootElement.value = root

    detachScrollHandler = () => {
      root.removeEventListener('scroll', handler)
    }
  }

  function resolveFocusSyncScheduleOptions(root: HTMLElement) {
    const current = readObservedScrollTop(root)
    const previous = lastObservedScrollTop
    lastObservedScrollTop = current

    const immediateThreshold = Math.max(480, (root.clientHeight || 0) * 0.75)

    if (previous == null) {
      return current > immediateThreshold
        ? { immediate: true }
        : undefined
    }

    const jump = Math.abs(current - previous)

    return jump > immediateThreshold
      ? { immediate: true }
      : undefined
  }

  function readObservedScrollTop(root: HTMLElement) {
    const raw = options.getScrollTop
      ? options.getScrollTop(root)
      : root.scrollTop

    return Math.max(0, Number.isFinite(raw) ? Math.abs(raw) : 0)
  }

  return {
    cleanupScrollListener,
    setupScrollListener,
  }
}
