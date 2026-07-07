/**
 * Unified Scheduler - Batches multiple RAF/microtask callbacks into single frames
 * Reduces total RAF calls and improves performance by batching operations
 */

type SchedulerCallback = () => void
type SchedulerPriority = 'immediate' | 'high' | 'normal' | 'low' | 'idle'

interface ScheduledTask {
  callback: SchedulerCallback
  priority: SchedulerPriority
  id: number
}

const MAX_RECURSION_DEPTH = 3
const isClient = typeof window !== 'undefined'

class UnifiedScheduler {
  private taskIdCounter = 0
  private pendingTasks: Map<number, ScheduledTask> = new Map()
  private rafId: number | null = null
  private idleId: number | null = null
  private isProcessing = false
  private recursionDepth = 0
  private immediateTasks = new Set<Promise<void>>()

  schedule(callback: SchedulerCallback, priority: SchedulerPriority = 'normal'): number {
    const taskId = ++this.taskIdCounter
    this.pendingTasks.set(taskId, { callback, priority, id: taskId })

    if (priority === 'immediate') {
      // Execute in next microtask, track for cleanup
      const promise = Promise.resolve().then(() => {
        this.immediateTasks.delete(promise)
        this.executeTask(taskId)
      })
      this.immediateTasks.add(promise)
    }
    else if (priority === 'idle') {
      this.scheduleIdle()
    }
    else {
      this.scheduleFrame()
    }

    return taskId
  }

  cancel(taskId: number): void {
    this.pendingTasks.delete(taskId)
  }

  private scheduleFrame(): void {
    if (this.rafId !== null)
      return

    if (!isClient) {
      // SSR: execute synchronously
      this.processFrameTasks()
      return
    }

    if (typeof requestAnimationFrame === 'function') {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null
        this.processFrameTasks()
      })
    }
    else {
      this.rafId = setTimeout(() => {
        this.rafId = null
        this.processFrameTasks()
      }, 16) as any
    }
  }

  private scheduleIdle(): void {
    if (this.idleId !== null)
      return

    if (!isClient) {
      // SSR: execute immediately
      this.processIdleTasks()
      return
    }

    if (typeof requestIdleCallback === 'function') {
      this.idleId = requestIdleCallback(() => {
        this.idleId = null
        this.processIdleTasks()
      }, { timeout: 100 })
    }
    else {
      this.scheduleFrame()
    }
  }

  private executeTask(taskId: number): void {
    const task = this.pendingTasks.get(taskId)
    if (!task)
      return

    // Always remove from pending, even on error
    this.pendingTasks.delete(taskId)

    try {
      task.callback()
    }
    catch (error) {
      console.error('[UnifiedScheduler] Task execution error:', error)
    }
  }

  private processFrameTasks(): void {
    if (this.isProcessing)
      return

    // Prevent infinite recursion
    if (this.recursionDepth >= MAX_RECURSION_DEPTH) {
      console.warn('[UnifiedScheduler] Max recursion depth reached, scheduling next frame')
      this.recursionDepth = 0
      this.scheduleFrame()
      return
    }

    this.isProcessing = true
    this.recursionDepth++

    const tasks = Array.from(this.pendingTasks.values())
      .filter(task => task.priority !== 'idle')
      .sort((a, b) => this.getPriorityWeight(a.priority) - this.getPriorityWeight(b.priority))

    for (const task of tasks) {
      this.executeTask(task.id)
    }

    this.isProcessing = false
    this.recursionDepth--

    // If more tasks were added during processing, schedule another frame with depth check
    if (this.pendingTasks.size > 0 && this.recursionDepth === 0) {
      this.scheduleFrame()
    }
  }

  private processIdleTasks(): void {
    const tasks = Array.from(this.pendingTasks.values())
      .filter(task => task.priority === 'idle')

    for (const task of tasks) {
      this.executeTask(task.id)
    }
  }

  private getPriorityWeight(priority: SchedulerPriority): number {
    switch (priority) {
      case 'immediate': return 0
      case 'high': return 1
      case 'normal': return 2
      case 'low': return 3
      case 'idle': return 4
      default: return 2
    }
  }

  clear(): void {
    if (this.rafId !== null) {
      if (isClient && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this.rafId)
      }
      else if (isClient) {
        clearTimeout(this.rafId as any)
      }
      this.rafId = null
    }

    if (this.idleId !== null) {
      if (isClient && typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(this.idleId)
      }
      this.idleId = null
    }

    this.pendingTasks.clear()
    this.immediateTasks.clear()
    this.recursionDepth = 0
  }
}

// Export singleton instance
let schedulerInstance: UnifiedScheduler | null = null

export function getUnifiedScheduler(): UnifiedScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new UnifiedScheduler()
  }
  return schedulerInstance
}

export function scheduleTask(callback: SchedulerCallback, priority: SchedulerPriority = 'normal'): number {
  return getUnifiedScheduler().schedule(callback, priority)
}

export function cancelScheduledTask(taskId: number): void {
  getUnifiedScheduler().cancel(taskId)
}

export function clearScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.clear()
    schedulerInstance = null
  }
}
