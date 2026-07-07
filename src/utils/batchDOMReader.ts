/**
 * Batch DOM read utility to avoid layout thrashing.
 * Collects all DOM read operations and executes them in a single pass.
 * Optimized to minimize RAF calls and SSR-safe.
 */

interface DOMReadTask<T> {
  read: () => T
  resolve: (value: T) => void
}

const isClient = typeof window !== 'undefined'

class BatchDOMReader {
  private pending: Array<DOMReadTask<any>> = []
  private rafId: number | null = null
  private isProcessing = false

  read<T>(task: () => T): Promise<T> {
    return new Promise<T>((resolve) => {
      this.pending.push({ read: task, resolve })
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
    })

    this.flushImmediate()

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
      const results = tasks.map(task => task.read())

      // Then resolve all promises (no layout)
      tasks.forEach((task, i) => task.resolve(results[i]))
    }
    finally {
      this.isProcessing = false
      if (this.pending.length > 0)
        this.schedule()
    }
  }

  cancel() {
    if (this.rafId !== null) {
      if (isClient && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this.rafId)
      }
      else if (isClient) {
        clearTimeout(this.rafId as any)
      }
      this.rafId = null
    }
    this.pending = []
    this.isProcessing = false
  }
}

export function createBatchDOMReader() {
  return new BatchDOMReader()
}
