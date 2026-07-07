/**
 * Throttle utility for performance optimization.
 * Ensures a function is called at most once per specified time period.
 */

/**
 * Creates a throttled version of the provided function.
 * The throttled function will invoke the original function at most once per `wait` milliseconds.
 *
 * @param fn - The function to throttle
 * @param wait - The minimum time in milliseconds between invocations
 * @returns A throttled version of the function
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let lastCall = 0
  let timeout: ReturnType<typeof setTimeout> | null = null

  return function throttled(...args: Parameters<T>) {
    const now = Date.now()
    const remaining = wait - (now - lastCall)

    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      lastCall = now
      fn(...args)
    }
    else if (!timeout) {
      timeout = setTimeout(() => {
        lastCall = Date.now()
        timeout = null
        fn(...args)
      }, remaining)
    }
  }
}
