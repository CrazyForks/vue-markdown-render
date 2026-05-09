import type { SmoothMarkdownStreamOptions } from '../src/composables/useSmoothMarkdownStream'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { useSmoothMarkdownStream } from '../src/composables/useSmoothMarkdownStream'

function hasUnpairedSurrogate(input: string) {
  for (let index = 0; index < input.length; index++) {
    const code = input.charCodeAt(index)
    const isHigh = code >= 0xD800 && code <= 0xDBFF
    const isLow = code >= 0xDC00 && code <= 0xDFFF
    if (isHigh) {
      const next = input.charCodeAt(index + 1)
      if (!(next >= 0xDC00 && next <= 0xDFFF))
        return true
      index += 1
      continue
    }
    if (isLow)
      return true
  }
  return false
}

function mountStream(options: SmoothMarkdownStreamOptions = {}) {
  return mount(defineComponent({
    setup() {
      return useSmoothMarkdownStream(options)
    },
    template: '<div />',
  }))
}

describe('useSmoothMarkdownStream', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('does not reveal a large chunk all at once', async () => {
    vi.useFakeTimers()
    const wrapper = mountStream()

    ;(wrapper.vm as any).enqueue('a'.repeat(1800))

    expect((wrapper.vm as any).visible.length).toBeLessThan((wrapper.vm as any).source.length)

    await vi.advanceTimersByTimeAsync(400)

    expect((wrapper.vm as any).visible.length).toBeLessThan((wrapper.vm as any).source.length)
    wrapper.unmount()
  })

  it('accelerates output when backlog is larger', async () => {
    vi.useFakeTimers()
    const fastWrapper = mountStream({
      minCharsPerSecond: 30,
      maxCharsPerSecond: 2000,
      targetLatencyMs: 900,
      catchUpLatencyMs: 260,
      catchUpThreshold: 500,
      maxCharsPerCommit: 120,
    })
    const slowWrapper = mountStream({
      minCharsPerSecond: 30,
      maxCharsPerSecond: 2000,
      targetLatencyMs: 900,
      catchUpLatencyMs: 260,
      catchUpThreshold: 500,
      maxCharsPerCommit: 120,
    })

    ;(fastWrapper.vm as any).enqueue('x'.repeat(2400))
    ;(slowWrapper.vm as any).enqueue('x'.repeat(320))

    await vi.advanceTimersByTimeAsync(700)

    expect((fastWrapper.vm as any).visible.length).toBeGreaterThan((slowWrapper.vm as any).visible.length)
    fastWrapper.unmount()
    slowWrapper.unmount()
  })

  it('sets final only after visible catches up', async () => {
    vi.useFakeTimers()
    const wrapper = mountStream()

    ;(wrapper.vm as any).enqueue('x'.repeat(1400))
    ;(wrapper.vm as any).finish()

    expect((wrapper.vm as any).done).toBe(true)
    expect((wrapper.vm as any).final).toBe(false)

    ;(wrapper.vm as any).flush()

    expect((wrapper.vm as any).final).toBe(true)
    wrapper.unmount()
  })

  it('keeps surrogate pairs intact while streaming emoji text', async () => {
    vi.useFakeTimers()
    const wrapper = mountStream({ maxCharsPerCommit: 1, maxCommitFps: 60, startDelayMs: 0 })
    const emojiText = '👨‍👩‍👧‍👦 hello 👋🌍'

    ;(wrapper.vm as any).enqueue(emojiText)
    await vi.advanceTimersByTimeAsync(600)

    expect(hasUnpairedSurrogate((wrapper.vm as any).visible)).toBe(false)
    wrapper.unmount()
  })

  it('reset clears state and keeps pending at zero', async () => {
    vi.useFakeTimers()
    const wrapper = mountStream()

    ;(wrapper.vm as any).enqueue('x'.repeat(1000))
    await vi.advanceTimersByTimeAsync(120)
    ;(wrapper.vm as any).reset()
    await vi.advanceTimersByTimeAsync(200)

    expect((wrapper.vm as any).source).toBe('')
    expect((wrapper.vm as any).visible).toBe('')
    expect((wrapper.vm as any).pendingChars).toBe(0)
    wrapper.unmount()
  })

  it('reopens the stream when enqueue is called after finish', async () => {
    const wrapper = mountStream()

    ;(wrapper.vm as any).enqueue('hello')
    ;(wrapper.vm as any).finish({ flush: true })
    expect((wrapper.vm as any).final).toBe(true)

    ;(wrapper.vm as any).enqueue(' world')
    expect((wrapper.vm as any).done).toBe(false)
    expect((wrapper.vm as any).final).toBe(false)
    wrapper.unmount()
  })

  it('normalizes extreme option values', () => {
    const wrapper = mountStream({
      maxCharsPerCommit: 0,
      maxCommitFps: 0,
      minCharsPerSecond: 0,
      maxCharsPerSecond: -10,
    })

    // Should not throw and should still function
    ;(wrapper.vm as any).enqueue('test')
    ;(wrapper.vm as any).flush()
    expect((wrapper.vm as any).visible).toBe('test')
    wrapper.unmount()
  })
})
