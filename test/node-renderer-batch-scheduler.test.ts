/**
 * @vitest-environment jsdom
 */

import type { NodeRendererProps } from '../src/types/node-renderer-props'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, nextTick, reactive, ref } from 'vue'
import { useBatchRenderingScheduler } from '../src/components/NodeRenderer/composables/useBatchRenderingScheduler'

type SchedulerProps = Pick<
  NodeRendererProps,
  'indexKey' | 'renderBatchDelay' | 'renderBatchIdleTimeoutMs' | 'renderBatchBudgetMs'
>

function makeNodes(count: number) {
  return Array.from({ length: count }, (_, index) => ({ index }))
}

const cleanupFns: Array<() => void> = []

function createHarness(options: {
  total?: number
  initialBatch?: number
  batchSize?: number
  delay?: number
  desiredCount?: number
  incremental?: boolean
  requestFrame?: typeof window.requestAnimationFrame | null
  cancelFrame?: typeof window.cancelAnimationFrame | null
  hasIdleCallback?: boolean
} = {}) {
  const props = reactive<SchedulerProps>({
    indexKey: 'message-1',
    renderBatchDelay: options.delay ?? 10,
    renderBatchIdleTimeoutMs: 120,
    renderBatchBudgetMs: 6,
  })

  const parsedNodes = ref(makeNodes(options.total ?? 8))
  const parsedNodesIdentity = computed(() => parsedNodes.value)
  const parsedNodeCount = computed(() => parsedNodes.value.length)
  const desiredCount = ref<number | null>(options.desiredCount ?? null)
  const desiredRenderedCount = computed(() => desiredCount.value ?? parsedNodeCount.value)
  const datasetKey = computed(() => props.indexKey)

  const batchingEnabled = computed(() => true)
  const incremental = ref(options.incremental ?? true)
  const incrementalRenderingActive = computed(() => incremental.value)

  const resolvedBatchSize = computed(() => options.batchSize ?? 2)
  const resolvedInitialBatch = computed(() => options.initialBatch ?? 2)

  const renderedCount = ref(0)
  const adaptiveBatchSize = ref(Math.max(1, resolvedBatchSize.value || 1))

  const previousRenderContext = ref<{
    key: unknown
    total: number
  }>({
    key: props.indexKey,
    total: 0,
  })

  const previousBatchConfig = ref({
    batchSize: resolvedBatchSize.value,
    initial: resolvedInitialBatch.value,
    delay: props.renderBatchDelay ?? 16,
    enabled: incrementalRenderingActive.value,
  })

  const cleanupNodeVisibility = vi.fn()
  const onDatasetKeyChanged = vi.fn()
  const onDatasetChanged = vi.fn()

  const scope = effectScope()
  let scheduler: ReturnType<typeof useBatchRenderingScheduler> | undefined

  scope.run(() => {
    scheduler = useBatchRenderingScheduler({
      props: props as Readonly<NodeRendererProps>,
      isClient: true,
      isTestEnv: false,

      parsedNodesIdentity,
      parsedNodeCount,
      desiredRenderedCount,
      datasetKey,

      batchingEnabled,
      incrementalRenderingActive,
      resolvedBatchSize,
      resolvedInitialBatch,

      renderedCount,
      adaptiveBatchSize,
      previousRenderContext,
      previousBatchConfig,

      requestFrame: options.requestFrame ?? null,
      cancelFrame: options.cancelFrame ?? null,
      hasIdleCallback: options.hasIdleCallback ?? false,

      cleanupNodeVisibility,
      onDatasetKeyChanged,
      onDatasetChanged,
    })
  })

  cleanupFns.push(() => {
    scheduler?.cleanupBatchScheduler()
    scope.stop()
  })

  return {
    props,
    parsedNodes,
    desiredCount,
    incremental,
    renderedCount,
    adaptiveBatchSize,
    cleanupNodeVisibility,
    onDatasetKeyChanged,
    onDatasetChanged,
    cleanupBatchScheduler: () => scheduler?.cleanupBatchScheduler(),
  }
}

describe('useBatchRenderingScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    for (const cleanup of cleanupFns.splice(0))
      cleanup()

    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('advances renderedCount in configured batches', async () => {
    const h = createHarness({
      total: 8,
      initialBatch: 2,
      batchSize: 2,
      delay: 10,
    })

    expect(h.renderedCount.value).toBe(2)

    vi.advanceTimersByTime(10)
    await nextTick()
    expect(h.renderedCount.value).toBe(4)

    vi.advanceTimersByTime(10)
    await nextTick()
    expect(h.renderedCount.value).toBe(6)

    vi.advanceTimersByTime(10)
    await nextTick()
    expect(h.renderedCount.value).toBe(8)

    expect(h.cleanupNodeVisibility).toHaveBeenLastCalledWith(8)
  })

  it('does not adjust adaptive batch size from RAF wait time', async () => {
    let currentTime = 0
    vi.spyOn(performance, 'now').mockImplementation(() => currentTime)
    const requestFrame = ((callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(currentTime), 0)
    }) as typeof window.requestAnimationFrame
    const cancelFrame = ((handle: number) => {
      window.clearTimeout(handle)
    }) as typeof window.cancelAnimationFrame

    const h = createHarness({
      total: 16,
      initialBatch: 8,
      batchSize: 8,
      delay: 10,
      requestFrame,
      cancelFrame,
    })

    expect(h.renderedCount.value).toBe(8)

    vi.advanceTimersByTime(10)
    currentTime = 1
    await nextTick()

    expect(h.renderedCount.value).toBe(16)
    expect(h.adaptiveBatchSize.value).toBe(8)

    currentTime = 20
    vi.advanceTimersByTime(0)

    expect(h.adaptiveBatchSize.value).toBe(8)
  })

  it('adjusts adaptive batch size from post-flush commit cost', async () => {
    let currentTime = 0
    vi.spyOn(performance, 'now').mockImplementation(() => currentTime)
    const requestFrame = ((callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(currentTime), 0)
    }) as typeof window.requestAnimationFrame
    const cancelFrame = ((handle: number) => {
      window.clearTimeout(handle)
    }) as typeof window.cancelAnimationFrame

    const h = createHarness({
      total: 16,
      initialBatch: 8,
      batchSize: 8,
      delay: 10,
      requestFrame,
      cancelFrame,
    })

    expect(h.renderedCount.value).toBe(8)

    vi.advanceTimersByTime(10)
    // With new threshold (budget * 1.5 = 6 * 1.5 = 9), elapsed must be > 9ms to trigger shrink
    currentTime = 10
    await nextTick()

    expect(h.renderedCount.value).toBe(16)
    expect(h.adaptiveBatchSize.value).toBe(8)

    vi.advanceTimersByTime(0)

    // With new shrink factor 0.8: floor(8 * 0.8) = 6
    expect(h.adaptiveBatchSize.value).toBe(6)
  })

  it('uses timeout fallback when RAF boundary does not fire', async () => {
    let currentTime = 0
    vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

    let frameHandle = 0
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frameHandle += 1
      if (frameHandle === 1)
        window.setTimeout(() => callback(currentTime), 0)
      return frameHandle
    }) as unknown as typeof window.requestAnimationFrame
    const cancelFrame = vi.fn() as unknown as typeof window.cancelAnimationFrame

    const h = createHarness({
      total: 16,
      initialBatch: 8,
      batchSize: 8,
      delay: 10,
      requestFrame,
      cancelFrame,
    })

    expect(h.renderedCount.value).toBe(8)

    vi.advanceTimersByTime(10)
    currentTime = 10
    await nextTick()

    expect(h.renderedCount.value).toBe(16)
    expect(h.adaptiveBatchSize.value).toBe(8)

    vi.advanceTimersByTime(119)
    expect(h.adaptiveBatchSize.value).toBe(8)

    vi.advanceTimersByTime(1)

    expect(h.adaptiveBatchSize.value).toBe(6)
    expect(cancelFrame).toHaveBeenCalledWith(2)
  })

  it('does not apply multiple idle batches before commit feedback', async () => {
    let currentTime = 0
    vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

    const frames: FrameRequestCallback[] = []
    const requestFrame = ((callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    }) as typeof window.requestAnimationFrame
    const cancelFrame = vi.fn() as unknown as typeof window.cancelAnimationFrame

    const idleCallbacks: IdleRequestCallback[] = []
    const requestIdleCallback = vi.fn((callback: IdleRequestCallback) => {
      idleCallbacks.push(callback)
      return idleCallbacks.length
    }) as unknown as typeof window.requestIdleCallback

    vi.stubGlobal('requestIdleCallback', requestIdleCallback)
    vi.stubGlobal('cancelIdleCallback', vi.fn())

    const h = createHarness({
      total: 64,
      initialBatch: 8,
      batchSize: 8,
      delay: 10,
      requestFrame,
      cancelFrame,
      hasIdleCallback: true,
    })

    expect(h.renderedCount.value).toBe(8)
    expect(idleCallbacks).toHaveLength(1)

    idleCallbacks.shift()?.({
      didTimeout: false,
      timeRemaining: () => 50,
    } as IdleDeadline)

    expect(h.renderedCount.value).toBe(16)
    expect(idleCallbacks).toHaveLength(0)

    currentTime = 10
    await nextTick()

    expect(h.adaptiveBatchSize.value).toBe(8)
    expect(frames).toHaveLength(1)

    frames.shift()?.(currentTime)

    expect(h.adaptiveBatchSize.value).toBe(6)
    expect(idleCallbacks).toHaveLength(1)

    idleCallbacks.shift()?.({
      didTimeout: false,
      timeRemaining: () => 50,
    } as IdleDeadline)

    expect(h.renderedCount.value).toBe(22)
  })

  it('delays desired-count follow-up until commit feedback updates adaptive size', async () => {
    let currentTime = 0
    vi.spyOn(performance, 'now').mockImplementation(() => currentTime)
    const requestFrame = ((callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(currentTime), 0)
    }) as typeof window.requestAnimationFrame
    const cancelFrame = ((handle: number) => {
      window.clearTimeout(handle)
    }) as typeof window.cancelAnimationFrame

    const h = createHarness({
      total: 24,
      desiredCount: 16,
      initialBatch: 8,
      batchSize: 8,
      delay: 10,
      requestFrame,
      cancelFrame,
    })

    expect(h.renderedCount.value).toBe(8)

    vi.advanceTimersByTime(10)
    expect(h.renderedCount.value).toBe(16)

    h.desiredCount.value = 24
    currentTime = 10
    await nextTick()

    expect(h.adaptiveBatchSize.value).toBe(8)

    vi.advanceTimersByTime(0)

    expect(h.adaptiveBatchSize.value).toBe(6)

    vi.runOnlyPendingTimers()
    vi.advanceTimersByTime(10)
    await nextTick()

    expect(h.renderedCount.value).toBe(22)
  })

  it('delays same-length parsed node identity follow-up until commit feedback updates adaptive size', async () => {
    let currentTime = 0
    vi.spyOn(performance, 'now').mockImplementation(() => currentTime)
    const requestFrame = ((callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(currentTime), 0)
    }) as typeof window.requestAnimationFrame
    const cancelFrame = ((handle: number) => {
      window.clearTimeout(handle)
    }) as typeof window.cancelAnimationFrame

    const h = createHarness({
      total: 24,
      initialBatch: 8,
      batchSize: 8,
      delay: 10,
      requestFrame,
      cancelFrame,
    })

    expect(h.renderedCount.value).toBe(8)

    vi.advanceTimersByTime(10)
    expect(h.renderedCount.value).toBe(16)

    h.parsedNodes.value = makeNodes(24)
    currentTime = 10
    await nextTick()

    expect(h.adaptiveBatchSize.value).toBe(8)

    vi.advanceTimersByTime(0)

    expect(h.adaptiveBatchSize.value).toBe(6)

    vi.runOnlyPendingTimers()
    vi.advanceTimersByTime(10)
    await nextTick()

    expect(h.renderedCount.value).toBe(22)
  })

  it('does not schedule follow-up after cleanup cancels commit measurement', async () => {
    let currentTime = 0
    vi.spyOn(performance, 'now').mockImplementation(() => currentTime)
    const requestFrame = ((callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(currentTime), 0)
    }) as typeof window.requestAnimationFrame
    const cancelFrame = ((handle: number) => {
      window.clearTimeout(handle)
    }) as typeof window.cancelAnimationFrame

    const h = createHarness({
      total: 24,
      desiredCount: 16,
      initialBatch: 8,
      batchSize: 8,
      delay: 10,
      requestFrame,
      cancelFrame,
    })

    vi.advanceTimersByTime(10)
    expect(h.renderedCount.value).toBe(16)

    h.desiredCount.value = 24
    currentTime = 10
    await nextTick()
    h.cleanupBatchScheduler()

    vi.advanceTimersByTime(0)
    vi.advanceTimersByTime(10)

    expect(h.adaptiveBatchSize.value).toBe(8)
    expect(h.renderedCount.value).toBe(16)
  })

  it('continues scheduling when desired rendered count grows', async () => {
    const h = createHarness({
      total: 4,
      initialBatch: 2,
      batchSize: 2,
      delay: 10,
    })

    expect(h.renderedCount.value).toBe(2)

    vi.advanceTimersByTime(10)
    await nextTick()
    expect(h.renderedCount.value).toBe(4)

    h.parsedNodes.value = makeNodes(7)
    await nextTick()

    vi.advanceTimersByTime(10)
    await nextTick()
    expect(h.renderedCount.value).toBe(6)

    vi.advanceTimersByTime(10)
    await nextTick()
    expect(h.renderedCount.value).toBe(7)

    expect(h.cleanupNodeVisibility).toHaveBeenLastCalledWith(7)
  })

  it('resets batch state when the dataset key changes', async () => {
    const h = createHarness({
      total: 8,
      initialBatch: 2,
      batchSize: 2,
      delay: 10,
    })

    vi.advanceTimersByTime(10)
    await nextTick()
    expect(h.renderedCount.value).toBe(4)

    h.props.indexKey = 'message-2'
    await nextTick()

    expect(h.onDatasetKeyChanged).toHaveBeenCalledWith(8)
    expect(h.onDatasetChanged).toHaveBeenCalled()
    expect(h.renderedCount.value).toBe(2)

    vi.advanceTimersByTime(10)
    await nextTick()
    expect(h.renderedCount.value).toBe(4)
  })

  it('renders everything immediately when incremental rendering is disabled', async () => {
    const h = createHarness({
      total: 6,
      incremental: false,
    })

    await nextTick()

    expect(h.renderedCount.value).toBe(6)
    expect(h.cleanupNodeVisibility).toHaveBeenLastCalledWith(6)
  })

  it('resets batch state when an explicit dataset key changes with stable indexKey and length', async () => {
    const props = reactive<SchedulerProps>({
      indexKey: 'stable-message-key',
      renderBatchDelay: 10,
      renderBatchIdleTimeoutMs: 120,
      renderBatchBudgetMs: 6,
    })
    const parsedNodes = ref(makeNodes(8))
    const datasetKeySource = ref<unknown>('thread-a:message-1:rev-1')
    const renderedCount = ref(0)
    const cleanupNodeVisibility = vi.fn()
    const onDatasetKeyChanged = vi.fn()
    const onDatasetChanged = vi.fn()
    const scope = effectScope()
    let scheduler: ReturnType<typeof useBatchRenderingScheduler> | undefined

    scope.run(() => {
      scheduler = useBatchRenderingScheduler({
        props: props as Readonly<NodeRendererProps>,
        isClient: true,
        isTestEnv: false,
        parsedNodesIdentity: computed(() => parsedNodes.value),
        parsedNodeCount: computed(() => parsedNodes.value.length),
        desiredRenderedCount: computed(() => parsedNodes.value.length),
        datasetKey: computed(() => datasetKeySource.value),
        batchingEnabled: computed(() => true),
        incrementalRenderingActive: computed(() => true),
        resolvedBatchSize: computed(() => 2),
        resolvedInitialBatch: computed(() => 2),
        renderedCount,
        adaptiveBatchSize: ref(2),
        previousRenderContext: ref({
          key: datasetKeySource.value,
          total: 0,
        }),
        previousBatchConfig: ref({
          batchSize: 2,
          initial: 2,
          delay: 10,
          enabled: true,
        }),
        requestFrame: null,
        cancelFrame: null,
        hasIdleCallback: false,
        cleanupNodeVisibility,
        onDatasetKeyChanged,
        onDatasetChanged,
      })
    })

    cleanupFns.push(() => {
      scheduler?.cleanupBatchScheduler()
      scope.stop()
    })

    vi.advanceTimersByTime(10)
    await nextTick()
    expect(renderedCount.value).toBe(4)

    datasetKeySource.value = 'thread-b:message-1:rev-1'
    await nextTick()

    expect(props.indexKey).toBe('stable-message-key')
    expect(onDatasetKeyChanged).toHaveBeenCalledWith(8)
    expect(onDatasetChanged).toHaveBeenCalled()
    expect(renderedCount.value).toBe(2)
  })
})
