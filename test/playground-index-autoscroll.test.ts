/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest'
import { createAutoScrollChaseController } from '../playground/src/utils/autoScrollChase'

describe('playground auto-scroll chase', () => {
  it('keeps chasing new content, stops when the user scrolls up, and resumes at bottom', () => {
    const root = document.createElement('div')
    let scrollHeight = 1000
    const clientHeight = 100
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

    controller.handleScroll()
    expect(shouldStick).toBe(true)

    runNextFrame()
    expect(root.scrollTop).toBe(1000)

    scrollHeight = 1200
    controller.schedule()
    runNextFrame()
    expect(root.scrollTop).toBe(1200)

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
    expect(root.scrollTop).toBe(1400)
  })
})
