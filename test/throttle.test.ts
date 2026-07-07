import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { throttle } from '../src/utils/throttle'

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('runs the first call immediately', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled('first')

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenLastCalledWith('first')
  })

  it('uses the latest args for the trailing call', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled('first')

    vi.advanceTimersByTime(10)
    throttled('second')

    vi.advanceTimersByTime(10)
    throttled('third')

    vi.advanceTimersByTime(80)

    expect(fn.mock.calls).toEqual([
      ['first'],
      ['third'],
    ])
  })

  it('cancels a pending trailing call when a later call can run immediately', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled('first')

    vi.setSystemTime(1010)
    throttled('trailing')

    vi.setSystemTime(1110)
    throttled('outside')
    vi.runOnlyPendingTimers()

    expect(fn.mock.calls).toEqual([
      ['first'],
      ['outside'],
    ])
  })
})
