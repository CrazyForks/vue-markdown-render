import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('playground index auto-scroll source guards', () => {
  it('keeps bottom chase leased and restores it when the user scrolls back to bottom', () => {
    const source = readFileSync('playground/src/pages/index.vue', 'utf8')

    expect(source).toContain('let __autoScrollChaseUntil = 0')
    expect(source).toContain('__autoScrollChaseUntil = performance.now() + 240')
    expect(source).toContain('stableFrames >= 3 && performance.now() >= __autoScrollChaseUntil')
    expect(source).toContain('let __lastObservedScrollTop = 0')
    expect(source).toContain('const scrolledUp = currentScrollTop < __lastObservedScrollTop - 2')
    expect(source).not.toContain('distanceFromBottom > 100')

    const scrollHandlerStart = source.indexOf('function handleScrollRootScroll()')
    expect(scrollHandlerStart).toBeGreaterThanOrEqual(0)
    const scrollHandlerEnd = source.indexOf('function handleScrollRootWheel', scrollHandlerStart)
    const scrollHandler = source.slice(scrollHandlerStart, scrollHandlerEnd)

    expect(scrollHandler).toContain('shouldStickToBottom.value = true')
    expect(scrollHandler).toContain('scheduleScrollToBottom()')
    expect(scrollHandler).toContain('shouldStickToBottom.value && !scrolledUp')

    const touchEndStart = source.indexOf('function handleScrollRootTouchEnd()')
    expect(touchEndStart).toBeGreaterThanOrEqual(0)
    const touchEndEnd = source.indexOf('// Streaming updates', touchEndStart)
    const touchEndHandler = source.slice(touchEndStart, touchEndEnd)

    expect(touchEndHandler).toContain('shouldStickToBottom.value = true')
    expect(touchEndHandler).toContain('scheduleScrollToBottom()')

    const overflowLatchStart = source.indexOf('const shouldRemove = __overflowConfirmations >= REQUIRED_OVERFLOW_CONFIRMATIONS')
    expect(overflowLatchStart).toBeGreaterThanOrEqual(0)
    const overflowLatchEnd = source.indexOf('else {', overflowLatchStart)
    const overflowLatch = source.slice(overflowLatchStart, overflowLatchEnd)

    expect(overflowLatch).not.toContain('__roContainer?.disconnect()')
    expect(overflowLatch).not.toContain('__roContent?.disconnect()')
    expect(overflowLatch).toContain('__mo?.disconnect()')
  })
})
