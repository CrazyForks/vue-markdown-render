export interface AutoScrollChaseControllerOptions {
  getRoot: () => HTMLElement
  getShouldStick: () => boolean
  setShouldStick: (value: boolean) => void
  requestFrame?: (callback: FrameRequestCallback) => number
  cancelFrame?: (id: number) => void
  now?: () => number
  chaseDurationMs?: number
  bottomThreshold?: number
}

export function createAutoScrollChaseController(options: AutoScrollChaseControllerOptions) {
  const requestFrame = options.requestFrame ?? requestAnimationFrame
  const cancelFrame = options.cancelFrame ?? cancelAnimationFrame
  const now = options.now ?? (() => performance.now())
  const chaseDurationMs = options.chaseDurationMs ?? 240
  const bottomThreshold = options.bottomThreshold ?? 24

  let rafId: number | null = null
  let continuousScrollMode = false
  let autoScrollChaseUntil = 0
  let lastObservedScrollTop = 0

  function isAtBottom(root = options.getRoot(), threshold = bottomThreshold) {
    return root.scrollHeight - root.scrollTop - root.clientHeight <= threshold
  }

  function scrollToBottom() {
    const root = options.getRoot()
    root.scrollTop = root.scrollHeight
    lastObservedScrollTop = root.scrollTop
  }

  function stopChase() {
    rafId = null
    continuousScrollMode = false
  }

  function schedule() {
    if (!options.getShouldStick())
      return

    autoScrollChaseUntil = now() + chaseDurationMs

    if (continuousScrollMode)
      return

    continuousScrollMode = true
    let stableFrames = 0
    let lastHeight = 0

    const chase = () => {
      if (!options.getShouldStick()) {
        stopChase()
        return
      }

      const root = options.getRoot()
      scrollToBottom()

      const currentHeight = root.scrollHeight
      if (currentHeight === lastHeight) {
        stableFrames++
      }
      else {
        stableFrames = 0
        lastHeight = currentHeight
      }

      if (stableFrames >= 3 && now() >= autoScrollChaseUntil) {
        stopChase()
        return
      }

      if (options.getShouldStick()) {
        rafId = requestFrame(chase)
      }
      else {
        stopChase()
      }
    }

    rafId = requestFrame(chase)
  }

  function handleScroll() {
    const root = options.getRoot()
    const currentScrollTop = root.scrollTop

    if (isAtBottom(root)) {
      lastObservedScrollTop = currentScrollTop
      options.setShouldStick(true)
      schedule()
      return
    }

    const scrolledUp = currentScrollTop < lastObservedScrollTop - 2
    lastObservedScrollTop = currentScrollTop

    if (options.getShouldStick() && !scrolledUp) {
      schedule()
      return
    }

    options.setShouldStick(false)
  }

  function handleWheel(deltaY: number) {
    if (deltaY < 0)
      options.setShouldStick(false)
  }

  function handleTouchMove() {
    options.setShouldStick(false)
  }

  function handleTouchEnd() {
    if (isAtBottom()) {
      options.setShouldStick(true)
      schedule()
    }
  }

  function cancel() {
    if (rafId !== null) {
      cancelFrame(rafId)
      rafId = null
    }
    continuousScrollMode = false
  }

  return {
    cancel,
    handleScroll,
    handleTouchEnd,
    handleTouchMove,
    handleWheel,
    isAtBottom,
    schedule,
    scrollToBottom,
  }
}
