import type { ComputedRef, Ref } from 'vue'
import type { NodeRendererProps } from '../../../types/node-renderer-props'
import { nextTick, watch } from 'vue'

export interface BatchRenderingSchedulerOptions {
  props: Readonly<NodeRendererProps>
  isClient: boolean
  isTestEnv: boolean

  parsedNodesIdentity: ComputedRef<unknown>
  parsedNodeCount: ComputedRef<number>
  desiredRenderedCount: ComputedRef<number>
  datasetKey: ComputedRef<unknown>

  batchingEnabled: ComputedRef<boolean>
  incrementalRenderingActive: ComputedRef<boolean>
  resolvedBatchSize: ComputedRef<number>
  resolvedInitialBatch: ComputedRef<number>

  renderedCount: Ref<number>
  adaptiveBatchSize: Ref<number>
  previousRenderContext: Ref<{
    key: unknown
    total: number
  }>
  previousBatchConfig: Ref<{
    batchSize: number
    initial: number
    delay: number
    enabled: boolean
  }>

  requestFrame: typeof window.requestAnimationFrame | null
  cancelFrame: typeof window.cancelAnimationFrame | null
  hasIdleCallback: boolean

  cleanupNodeVisibility: (maxIndex: number) => void
  onDatasetKeyChanged: (total: number) => void
  onDatasetChanged: () => void
}

export interface BatchRenderingScheduler {
  cleanupBatchScheduler: () => void
}

export function useBatchRenderingScheduler(
  options: BatchRenderingSchedulerOptions,
): BatchRenderingScheduler {
  const {
    props,
    isClient,
    isTestEnv,
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
    requestFrame,
    cancelFrame,
    hasIdleCallback,
    cleanupNodeVisibility,
    onDatasetKeyChanged,
    onDatasetChanged,
  } = options

  let batchRaf: number | null = null
  let batchTimeout: number | null = null
  let batchPending = false
  let pendingIncrement: number | null = null
  let batchIdle: number | null = null
  let commitMeasurementGeneration = 0
  let commitMeasurementPending = false
  let followupBatchRequested = false
  const commitMeasurementRafs = new Set<number>()
  const commitMeasurementTimeouts = new Set<number>()

  function cleanupBatchScheduler() {
    if (!isClient)
      return
    if (batchRaf != null) {
      cancelFrame?.(batchRaf)
      batchRaf = null
    }
    if (batchTimeout != null) {
      window.clearTimeout(batchTimeout)
      batchTimeout = null
    }
    if (batchIdle != null && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(batchIdle)
      batchIdle = null
    }
    commitMeasurementGeneration += 1
    for (const raf of commitMeasurementRafs)
      cancelFrame?.(raf)
    commitMeasurementRafs.clear()
    for (const timeout of commitMeasurementTimeouts)
      window.clearTimeout(timeout)
    commitMeasurementTimeouts.clear()
    batchPending = false
    pendingIncrement = null
    commitMeasurementPending = false
    followupBatchRequested = false
  }

  function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now()
  }

  function finishCommitMeasurement(measuredCost: number) {
    adjustAdaptiveBatchSize(measuredCost)
    commitMeasurementPending = false

    const shouldContinue = followupBatchRequested || renderedCount.value < desiredRenderedCount.value
    followupBatchRequested = false

    if (shouldContinue)
      queueNextBatchNow()
  }

  function measureBatchPostFlushCost(start: number, syncElapsed: number) {
    if (!isClient) {
      finishCommitMeasurement(syncElapsed)
      return
    }

    commitMeasurementPending = true
    const generation = ++commitMeasurementGeneration
    void nextTick().then(() => {
      if (generation !== commitMeasurementGeneration)
        return

      const afterFlush = now()
      const measuredCost = Math.max(syncElapsed, afterFlush - start)

      const finish = () => {
        if (generation !== commitMeasurementGeneration)
          return
        finishCommitMeasurement(measuredCost)
      }

      // Keep a frame boundary before the next batch without charging RAF wait time as commit cost.
      if (requestFrame) {
        let finished = false
        let timeout: number | null = null

        const finishOnce = () => {
          if (finished)
            return
          finished = true
          finish()
        }

        const raf = requestFrame(() => {
          commitMeasurementRafs.delete(raf)
          if (timeout != null) {
            window.clearTimeout(timeout)
            commitMeasurementTimeouts.delete(timeout)
            timeout = null
          }
          finishOnce()
        })
        commitMeasurementRafs.add(raf)

        timeout = window.setTimeout(() => {
          if (timeout != null)
            commitMeasurementTimeouts.delete(timeout)
          timeout = null
          cancelFrame?.(raf)
          commitMeasurementRafs.delete(raf)
          finishOnce()
        }, Math.max(32, props.renderBatchIdleTimeoutMs ?? 120))
        commitMeasurementTimeouts.add(timeout)
        return
      }

      const timeout = window.setTimeout(() => {
        commitMeasurementTimeouts.delete(timeout)
        finish()
      }, 0)
      commitMeasurementTimeouts.add(timeout)
    })
  }

  function scheduleBatch(increment: number, opts: { immediate?: boolean } = {}) {
    if (!incrementalRenderingActive.value)
      return
    const target = desiredRenderedCount.value
    if (renderedCount.value >= target)
      return

    const amount = Math.max(1, increment)
    const run = () => {
      const runStart = now()
      let syncElapsed = 0
      batchRaf = null
      batchTimeout = null
      batchIdle = null
      batchPending = false
      const applied = pendingIncrement != null ? pendingIncrement : amount
      pendingIncrement = null

      const start = now()
      renderedCount.value = Math.min(target, renderedCount.value + applied)
      cleanupNodeVisibility(renderedCount.value)
      syncElapsed = now() - start

      measureBatchPostFlushCost(runStart, syncElapsed)
    }

    if (!isClient || opts.immediate) {
      run()
      return
    }

    const delay = Math.max(0, props.renderBatchDelay ?? 16)
    pendingIncrement = pendingIncrement != null ? Math.max(pendingIncrement, amount) : amount
    if (batchPending)
      return
    batchPending = true

    if (!isTestEnv && hasIdleCallback && window.requestIdleCallback) {
      const timeout = Math.max(0, props.renderBatchIdleTimeoutMs ?? 120)
      batchIdle = window.requestIdleCallback(() => run(), { timeout })
      return
    }

    if (!requestFrame || isTestEnv) {
      batchTimeout = window.setTimeout(() => run(), delay)
      return
    }
    batchRaf = requestFrame(() => {
      if (delay === 0) {
        run()
        return
      }
      batchTimeout = window.setTimeout(() => run(), delay)
    })
  }

  function requestNextBatch(
    increment?: number,
    opts: { immediate?: boolean } = {},
  ) {
    if (commitMeasurementPending) {
      // Use the post-feedback adaptive size instead of the stale requested increment.
      followupBatchRequested = true
      return
    }

    if (increment != null) {
      scheduleBatch(increment, opts)
      return
    }

    queueNextBatchNow()
  }

  function queueNextBatchNow() {
    if (!incrementalRenderingActive.value)
      return
    const dynamicSize = batchingEnabled.value
      ? Math.max(1, Math.round(adaptiveBatchSize.value))
      : Math.max(1, resolvedBatchSize.value)
    scheduleBatch(dynamicSize)
  }

  function adjustAdaptiveBatchSize(elapsed: number) {
    if (!incrementalRenderingActive.value)
      return
    const budget = Math.max(2, props.renderBatchBudgetMs ?? 6)
    const maxSize = Math.max(1, resolvedBatchSize.value || 1)
    const minSize = Math.max(1, Math.floor(maxSize / 4))
    if (elapsed > budget * 1.5) {
      adaptiveBatchSize.value = Math.max(minSize, Math.floor(adaptiveBatchSize.value * 0.8))
    }
    else if (elapsed < budget * 0.6 && adaptiveBatchSize.value < maxSize) {
      adaptiveBatchSize.value = Math.min(maxSize, Math.ceil(adaptiveBatchSize.value * 1.2))
    }
  }

  watch(
    [
      parsedNodesIdentity,
      parsedNodeCount,
      datasetKey,
      incrementalRenderingActive,
      resolvedBatchSize,
      resolvedInitialBatch,
      () => props.renderBatchDelay,
    ],
    () => {
      const total = parsedNodeCount.value
      const prevCtx = previousRenderContext.value
      const currentDatasetKey = datasetKey.value
      const datasetKeyChanged = !Object.is(currentDatasetKey, prevCtx.key)
      const lengthChanged = total !== prevCtx.total
      const datasetChanged = datasetKeyChanged || lengthChanged
      previousRenderContext.value = { key: currentDatasetKey, total }

      const prevBatch = previousBatchConfig.value
      const currentDelay = props.renderBatchDelay ?? 16
      const batchConfigChanged
        = prevBatch.batchSize !== resolvedBatchSize.value
          || prevBatch.initial !== resolvedInitialBatch.value
          || prevBatch.delay !== currentDelay
          || prevBatch.enabled !== incrementalRenderingActive.value

      previousBatchConfig.value = {
        batchSize: resolvedBatchSize.value,
        initial: resolvedInitialBatch.value,
        delay: currentDelay,
        enabled: incrementalRenderingActive.value,
      }

      if (datasetKeyChanged)
        onDatasetKeyChanged(total)
      if (datasetChanged || batchConfigChanged || !incrementalRenderingActive.value)
        cleanupBatchScheduler()
      if (datasetChanged || batchConfigChanged)
        adaptiveBatchSize.value = Math.max(1, resolvedBatchSize.value || 1)
      if (datasetChanged)
        onDatasetChanged()

      const targetCount = desiredRenderedCount.value

      if (!total) {
        renderedCount.value = 0
        cleanupNodeVisibility(0)
        return
      }

      if (!incrementalRenderingActive.value) {
        renderedCount.value = targetCount
        cleanupNodeVisibility(renderedCount.value)
        return
      }

      const shouldResetRenderedCount = datasetKeyChanged || prevCtx.total === 0

      if (shouldResetRenderedCount || batchConfigChanged)
        renderedCount.value = Math.min(targetCount, resolvedInitialBatch.value)
      else
        renderedCount.value = Math.min(renderedCount.value, targetCount)

      const baseInitial = Math.max(1, resolvedInitialBatch.value || resolvedBatchSize.value || total)
      if (renderedCount.value < targetCount)
        requestNextBatch(baseInitial, { immediate: !isClient })
      else
        cleanupNodeVisibility(renderedCount.value)
    },
    { immediate: true },
  )

  watch(
    desiredRenderedCount,
    (target, prev) => {
      if (!incrementalRenderingActive.value)
        return
      if (typeof prev === 'number' && target <= prev)
        return
      if (target > renderedCount.value)
        requestNextBatch()
    },
  )

  return {
    cleanupBatchScheduler,
  }
}
