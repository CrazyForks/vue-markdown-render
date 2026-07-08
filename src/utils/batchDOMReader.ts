/**
 * Batch DOM read utility to avoid layout thrashing.
 * Collects all DOM read operations and executes them in a single pass.
 * Optimized to minimize RAF calls and SSR-safe.
 */

interface DOMReadTask<T> {
  read: () => T
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

const isClient = typeof window !== 'undefined'

class BatchDOMReader {
  private pending: Array<DOMReadTask<any>> = []
  private rafId: number | null = null
  private isProcessing = false

  read<T>(task: () => T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.push({ read: task, resolve, reject })
      this.schedule()
    })
  }

  readSync<T>(task: () => T): T {
    // In SSR or when no batching is active, execute immediately
    if (!isClient || (this.rafId === null && !this.isProcessing)) {
      return task()
    }

    if (this.isProcessing)
      return task()

    // If batching is active, force immediate flush and execute
    // This ensures readSync truly returns synchronously
    let result: T | undefined
    let thrown: unknown
    let didThrow = false

    // Cancel pending RAF since we're flushing now
    if (this.rafId !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this.rafId)
      }
      else {
        clearTimeout(this.rafId as any)
      }
      this.rafId = null
    }

    // Add task and flush immediately
    this.pending.push({
      read: task,
      resolve: (value: T) => {
        result = value
      },
      reject: (error: unknown) => {
        thrown = error
        didThrow = true
      },
    })

    this.flushImmediate()

    if (didThrow)
      throw thrown

    return result!
  }

  private schedule(): void {
    if (this.rafId !== null || this.isProcessing)
      return

    if (!isClient) {
      // SSR: execute synchronously
      this.flush()
      return
    }

    if (typeof requestAnimationFrame === 'function') {
      this.rafId = requestAnimationFrame(() => {
        this.flush()
      })
    }
    else {
      this.rafId = setTimeout(() => {
        this.flush()
      }, 0) as any
    }
  }

  private flush() {
    if (this.rafId !== null) {
      // Cancel RAF before flushing to avoid double execution
      if (isClient && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this.rafId)
      }
      else if (isClient) {
        clearTimeout(this.rafId as any)
      }
    }

    this.flushImmediate()
  }

  private flushImmediate() {
    if (this.isProcessing)
      return

    this.rafId = null
    this.isProcessing = true

    try {
      const tasks = this.pending.splice(0)

      // Execute all reads first (batched layout phase)
      const outcomes = tasks.map((task) => {
        try {
          return { ok: true as const, value: task.read() }
        }
        catch (error) {
          return { ok: false as const, error }
        }
      })

      // Then resolve all promises (no layout)
      tasks.forEach((task, i) => {
        const outcome = outcomes[i]
        if (outcome.ok)
          task.resolve(outcome.value)
        else
          task.reject(outcome.error)
      })
    }
    finally {
      this.isProcessing = false
      if (this.pending.length > 0)
        this.schedule()
    }
  }

  cancel(reason: unknown = new Error('BatchDOMReader cancelled')) {
    if (this.rafId !== null) {
      if (isClient && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this.rafId)
      }
      else if (isClient) {
        clearTimeout(this.rafId as any)
      }
      this.rafId = null
    }
    const tasks = this.pending.splice(0)
    tasks.forEach(task => task.reject(reason))
    this.isProcessing = false
  }
}

export function createBatchDOMReader() {
  return new BatchDOMReader()
}
