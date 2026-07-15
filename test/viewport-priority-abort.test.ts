import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { waitForVisibilityOrAbort } from '../src/composables/viewportPriority'

describe('viewport priority abort', () => {
  it('releases a deferred render when its request is aborted before visibility', async () => {
    const controller = new AbortController()
    const waitingForVisibility = new Promise<void>(() => {})
    const waiting = waitForVisibilityOrAbort({
      isVisible: ref(false),
      whenVisible: waitingForVisibility,
      destroy: () => {},
    }, controller.signal)

    controller.abort()

    await expect(waiting).resolves.toBeUndefined()
  })
})
