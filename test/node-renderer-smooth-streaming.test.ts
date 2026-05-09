/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import NodeRenderer from '../src/components/NodeRenderer'

describe('node renderer smooth streaming', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses smooth pacing by default in typewriter mode and allows opting out', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const content = 'Hello smooth streaming markdown renderer.'

    const smoothWrapper = mount(NodeRenderer, {
      props: {
        content,
        typewriter: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await nextTick()
    expect(smoothWrapper.text()).not.toContain('Hello smooth')
    expect(queuedFrames.length).toBeGreaterThan(0)

    const baseline = performance.now()
    for (let step = 1; step <= 6 && smoothWrapper.text().length === 0; step++) {
      queuedFrames.shift()?.(baseline + (step * 40))
      await nextTick()
    }
    expect(smoothWrapper.text().length).toBeGreaterThan(0)

    const rawWrapper = mount(NodeRenderer, {
      props: {
        content,
        typewriter: true,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await nextTick()
    expect(rawWrapper.text()).toContain('Hello smooth streaming markdown renderer.')

    smoothWrapper.unmount()
    rawWrapper.unmount()
  })
})
