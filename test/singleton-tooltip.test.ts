import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { hideTooltip, showTooltipForAnchor } from '../src/composables/useSingletonTooltip'

describe('singleton tooltip', () => {
  afterEach(() => {
    hideTooltip(true)
    vi.useRealTimers()
  })

  it('does not mount before the delayed show fires', async () => {
    vi.useFakeTimers()
    const anchor = document.createElement('a')
    document.body.appendChild(anchor)

    showTooltipForAnchor(anchor, 'https://example.com')

    await vi.dynamicImportSettled()
    await nextTick()
    expect(document.querySelector('[data-singleton-tooltip="1"]')).toBeNull()

    hideTooltip(true)
    await vi.advanceTimersByTimeAsync(80)
    expect(document.querySelector('[data-singleton-tooltip="1"]')).toBeNull()

    anchor.remove()
  })
})
