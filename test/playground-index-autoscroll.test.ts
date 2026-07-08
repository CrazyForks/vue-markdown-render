/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest'
import { createAutoScrollChaseController } from '../playground/src/utils/autoScrollChase'

describe('playground auto-scroll chase', () => {
  it('keeps chasing new content, stops when the user scrolls up, and resumes at bottom', () => {
    const root = document.createElement('div')
    let scrollHeight = 1000
    const clientHeight = 100
    let rawScrollTop = 0
    let now = 0
    let shouldStick = true
    const frames: FrameRequestCallback[] = []

    Object.defineProperty(root, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })
    Object.defineProperty(root, 'clientHeight', {
      configurable: true,
      get: () => clientHeight,
    })
    Object.defineProperty(root, 'scrollTop', {
      configurable: true,
      get: () => rawScrollTop,
      set: (value: number) => {
        rawScrollTop = Math.max(0, Math.min(value, scrollHeight - clientHeight))
      },
    })

    root.scrollTop = 900

    const controller = createAutoScrollChaseController({
      getRoot: () => root,
      getShouldStick: () => shouldStick,
      setShouldStick: (value) => {
        shouldStick = value
      },
      requestFrame: (callback) => {
        frames.push(callback)
        return frames.length
      },
      cancelFrame: () => {},
      now: () => now,
    })

    function runNextFrame() {
      const callback = frames.shift()
      expect(callback).toBeTruthy()
      callback?.(now)
    }

    function expectAtBottom() {
      expect(scrollHeight - root.scrollTop - clientHeight).toBeLessThanOrEqual(24)
    }

    controller.handleScroll()
    expect(shouldStick).toBe(true)

    runNextFrame()
    expectAtBottom()

    scrollHeight = 1200
    controller.schedule()
    runNextFrame()
    expectAtBottom()

    root.scrollTop = 900
    controller.handleScroll()
    expect(shouldStick).toBe(false)

    scrollHeight = 1400
    controller.schedule()
    runNextFrame()
    expect(root.scrollTop).toBe(900)

    root.scrollTop = 1300
    controller.handleScroll()
    expect(shouldStick).toBe(true)

    now = 1
    runNextFrame()
    expectAtBottom()
  })

  it('cancels a pending chase frame during cleanup', () => {
    const root = document.createElement('div')
    Object.defineProperty(root, 'scrollHeight', {
      configurable: true,
      get: () => 1000,
    })
    Object.defineProperty(root, 'clientHeight', {
      configurable: true,
      get: () => 100,
    })
    root.scrollTop = 900

    const cancelFrame = vi.fn()
    const controller = createAutoScrollChaseController({
      getRoot: () => root,
      getShouldStick: () => true,
      setShouldStick: () => {},
      requestFrame: () => 42,
      cancelFrame,
      now: () => 0,
    })

    controller.schedule()
    controller.cancel()

    expect(cancelFrame).toHaveBeenCalledWith(42)
  })
})
