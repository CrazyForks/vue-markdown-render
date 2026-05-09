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

  it('uses smooth pacing in typewriter mode for post-mount appends and allows opting out', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const content = 'Hello smooth streaming markdown renderer.'

    // Mount with initial content — should render immediately (mounted gate protects)
    const smoothWrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await nextTick()

    // Now append content (simulating a streaming update after mount)
    queuedFrames.length = 0
    await smoothWrapper.setProps({ content })

    // Content should not be fully revealed immediately — it's being paced
    expect(smoothWrapper.text()).not.toContain('Hello smooth')
    expect(queuedFrames.length).toBeGreaterThan(0)

    const baseline = performance.now()
    for (let step = 1; step <= 6 && !smoothWrapper.text().includes('Hello'); step++) {
      queuedFrames.shift()?.(baseline + (step * 40))
      await nextTick()
    }
    expect(smoothWrapper.text().length).toBeGreaterThan(0)

    // smoothStreaming: false should show content immediately
    const rawWrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: true,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await nextTick()
    await rawWrapper.setProps({ content })
    await nextTick()
    expect(rawWrapper.text()).toContain('Hello smooth streaming markdown renderer.')

    smoothWrapper.unmount()
    rawWrapper.unmount()
  })

  it('does not smooth initial static content before mounted appends', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: 'static markdown',
        maxLiveNodes: 0,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await nextTick()
    // Initial content should render immediately, not be paced from blank
    expect(wrapper.text()).toContain('static markdown')
    wrapper.unmount()
  })

  it('smoothStreaming=true force-enables without requiring typewriter', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    // Start with empty content, then append after mount
    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        smoothStreaming: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await nextTick()
    queuedFrames.length = 0

    // Append content — smoothStreaming: true should pace without typewriter
    await wrapper.setProps({ content: 'Force enabled smooth' })
    await nextTick()

    // Content should be paced (not immediately visible) and rAF should be scheduled
    expect(queuedFrames.length).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('smoothStreaming="auto" does not enable without typewriter or maxLiveNodes<=0', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: 'Auto mode test',
        smoothStreaming: 'auto',
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await nextTick()
    // With default maxLiveNodes (320), 'auto' should not enable smooth streaming
    expect(wrapper.text()).toContain('Auto mode test')
    wrapper.unmount()
  })
})
