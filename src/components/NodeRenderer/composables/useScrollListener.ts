import type { ComputedRef, Ref } from 'vue'

export interface ScrollListenerOptions {
  isClient: boolean
  virtualizationEnabled: ComputedRef<boolean>
  listenerEnabled?: ComputedRef<boolean>
  scrollRootElement: Ref<HTMLElement | null>
  resolveScrollContainer: (node?: HTMLElement | null) => HTMLElement | null
  scheduleFocusSync: (options?: { immediate?: boolean }) => void
  onScroll?: () => void
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

  function cleanupScrollListener() {
    if (detachScrollHandler) {
      detachScrollHandler()
      detachScrollHandler = null
    }

    scrollRootElement.value = null
  }

  function isListenerEnabled() {
    return listenerEnabled?.value ?? virtualizationEnabled.value
  }

  function setupScrollListener() {
    if (!isClient || !isListenerEnabled())
      return

    const root = resolveScrollContainer()

    if (!root || scrollRootElement.value === root)
      return

    cleanupScrollListener()

    const handler = () => {
      onScroll?.()
      if (virtualizationEnabled.value)
        scheduleFocusSync()
    }

    root.addEventListener('scroll', handler, { passive: true })
    scrollRootElement.value = root

    detachScrollHandler = () => {
      root.removeEventListener('scroll', handler)
    }
  }

  return {
    cleanupScrollListener,
    setupScrollListener,
  }
}
