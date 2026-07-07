/**
 * Batch DOM read utility to avoid layout thrashing.
 * Collects all DOM read operations and executes them in a single pass.
 */

interface DOMReadTask<T> {
  read: () => T
  resolve: (value: T) => void
}

class BatchDOMReader {
  private pending: Array<DOMReadTask<any>> = []
  private rafScheduled: number | null = null

  read<T>(task: () => T): Promise<T> {
    return new Promise<T>((resolve) => {
      this.pending.push({ read: task, resolve })
      this.schedule()
    })
  }

  readSync<T>(task: () => T): T {
    // For synchronous reads, execute immediately if no RAF pending
    // Otherwise execute in the next batch
    if (this.rafScheduled === null) {
      return task()
    }
    else {
      let result: T | undefined
      this.pending.push({
        read: task,
        resolve: (value: T) => {
          result = value
        },
      })
      this.flush()
      return result!
    }
  }

  private schedule() {
    if (this.rafScheduled !== null)
      return

    this.rafScheduled = requestAnimationFrame(() => {
      this.flush()
    })
  }

  private flush() {
    this.rafScheduled = null
    const tasks = this.pending.splice(0)

    // Execute all reads first (batched layout phase)
    const results = tasks.map(task => task.read())

    // Then resolve all promises (no layout)
    tasks.forEach((task, i) => task.resolve(results[i]))
  }

  cancel() {
    if (this.rafScheduled !== null) {
      cancelAnimationFrame(this.rafScheduled)
      this.rafScheduled = null
    }
    this.pending = []
  }
}

export function createBatchDOMReader() {
  return new BatchDOMReader()
}
