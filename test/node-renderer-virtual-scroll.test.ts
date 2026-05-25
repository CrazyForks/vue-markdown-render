import type { MarkstreamNodeLifecycle } from '../src/types/node-renderer-props'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, inject, nextTick, onMounted, ref } from 'vue'
import { removeCustomComponents, setCustomComponents } from '../src/utils/nodeComponents'
import { flushAll } from './setup/flush-all'

function createParagraph(index: number) {
  return {
    type: 'paragraph',
    raw: `Paragraph ${index}`,
    children: [
      {
        type: 'text',
        content: `Paragraph ${index}`,
        raw: `Paragraph ${index}`,
      },
    ],
  } as any
}

function installManualMeasurementPlatform() {
  const frames: FrameRequestCallback[] = []
  const heights = new WeakMap<HTMLElement, number>()
  const resizeCallbacks = new WeakMap<Element, ResizeObserverCallback>()

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('ResizeObserver', class {
    callback: ResizeObserverCallback

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }

    observe(element: Element) {
      resizeCallbacks.set(element, this.callback)
    }

    unobserve() {}
    disconnect() {}
  })

  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
    return heights.get(this) ?? 0
  })

  return {
    heights,
    resizeCallbacks,
    flushFrames() {
      const pending = frames.splice(0)
      for (const callback of pending)
        callback(performance.now())
    },
  }
}

function getRootNodeContentElements(root: Element) {
  return Array.from(root.children)
    .filter((el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains('node-slot'))
    .map(el => el.querySelector(':scope > .node-content') as HTMLElement | null)
    .filter((el): el is HTMLElement => Boolean(el))
}

describe('node renderer virtual-scroll coordination', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })

  afterEach(() => {
    try {
      removeCustomComponents('virtual-lifecycle-test')
    }
    catch {}
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('exposes logical height metrics and settled events for outer virtualizers', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'thread-a:message-1:1',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const contentEls = getRootNodeContentElements(wrapper.element)
    platform.heights.set(contentEls[0]!, 40)
    platform.heights.set(contentEls[1]!, 80)

    for (const el of contentEls)
      platform.resizeCallbacks.get(el)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()

    const handle = wrapper.vm as any
    const metrics = await handle.forceMeasure('manual')

    expect(metrics.sessionKey).toBe('thread-a:message-1:1')
    expect(metrics.totalHeight).toBe(120)
    expect(metrics.measuredCount).toBe(2)
    expect(wrapper.emitted('heightChange')?.at(-1)?.[0]).toMatchObject({
      sessionKey: 'thread-a:message-1:1',
      totalHeight: 120,
    })

    const state = handle.captureVirtualState()
    expect(state).toMatchObject({
      sessionKey: 'thread-a:message-1:1',
      heightCache: [
        { index: 0, height: 40 },
        { index: 1, height: 80 },
      ],
    })

    await new Promise(resolve => setTimeout(resolve, 90))
    platform.flushFrames()
    await nextTick()

    const settled = await handle.settle({ frames: 0, timeoutMs: 0, reason: 'manual' })
    expect(settled.phase).toBe('final')
    expect(settled.stable).toBe(true)
    expect(wrapper.emitted('renderSettled')?.at(-1)?.[0]).toMatchObject({
      totalHeight: 120,
      stable: true,
    })
    expect(wrapper.emitted('renderFinal')?.at(-1)?.[0]).toMatchObject({
      phase: 'final',
      totalHeight: 120,
    })

    wrapper.unmount()
  })

  it('resets measured heights when virtual session changes', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'thread-a:message-1:1',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const contentEl = getRootNodeContentElements(wrapper.element)[0]!
    platform.heights.set(contentEl, 500)
    platform.resizeCallbacks.get(contentEl)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()

    const handle = wrapper.vm as any
    expect((await handle.forceMeasure('manual')).totalHeight).toBe(500)

    await wrapper.setProps({
      virtualScroll: {
        enabled: true,
        sessionKey: 'thread-b:message-2:1',
        settleMode: 'manual',
        emitIntervalMs: 0,
      },
    })

    await flushAll()

    expect(handle.getVirtualMetrics().totalHeight).not.toBe(500)

    platform.heights.set(contentEl, 120)
    platform.resizeCallbacks.get(contentEl)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()

    expect((await handle.forceMeasure('manual')).totalHeight).toBe(120)

    wrapper.unmount()
  })

  it('keeps virtual metrics unsettled until an async custom node reports settled', async () => {
    let finishAsyncNode: ((height: number) => void) | null = null
    const AsyncNode = defineComponent({
      props: {
        node: { type: Object, required: true },
        indexKey: { type: [String, Number], required: true },
      },
      setup(props) {
        const lifecycle = inject<MarkstreamNodeLifecycle>('markstreamNodeLifecycle')
        onMounted(() => {
          lifecycle?.markPending(props.indexKey)
        })
        finishAsyncNode = (height: number) => {
          lifecycle?.reportHeight(props.indexKey, height)
          lifecycle?.markSettled(props.indexKey)
        }
        return () => h('div', { class: 'async-custom-node' }, 'async custom node')
      },
    })

    setCustomComponents('virtual-lifecycle-test', {
      async_node: AsyncNode as any,
    })

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        customId: 'virtual-lifecycle-test',
        nodes: [
          {
            type: 'async_node',
            raw: '<async-node />',
            content: '',
          },
        ],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'thread-a:custom-node:1',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    expect(handle.getVirtualMetrics().stable).toBe(false)

    expect(finishAsyncNode).toBeTypeOf('function')
    finishAsyncNode?.(96)
    await new Promise(resolve => setTimeout(resolve, 90))
    await nextTick()

    const metrics = await handle.settle({ frames: 0, timeoutMs: 0, reason: 'manual' })
    expect(metrics.totalHeight).toBe(96)
    expect(metrics.stable).toBe(true)
    expect(wrapper.emitted('renderSettled')?.at(-1)?.[0]).toMatchObject({
      totalHeight: 96,
      stable: true,
    })

    wrapper.unmount()
  })

  it('keeps virtual metrics unsettled until overlapping async work for the same node settles', async () => {
    let settleOnce: (() => void) | null = null
    let settleAgain: (() => void) | null = null
    const AsyncNode = defineComponent({
      props: {
        node: { type: Object, required: true },
        indexKey: { type: [String, Number], required: true },
      },
      setup(props) {
        const lifecycle = inject<MarkstreamNodeLifecycle>('markstreamNodeLifecycle')
        onMounted(() => {
          lifecycle?.markPending(props.indexKey)
          lifecycle?.markPending(props.indexKey)
        })
        settleOnce = () => {
          lifecycle?.markSettled(props.indexKey)
        }
        settleAgain = () => {
          lifecycle?.markSettled(props.indexKey)
        }
        return () => h('div', 'overlapping async')
      },
    })

    setCustomComponents('virtual-lifecycle-test', {
      async_node: AsyncNode as any,
    })

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        customId: 'virtual-lifecycle-test',
        nodes: [{ type: 'async_node', raw: '<async-node />', content: '' }],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'thread-a:overlapping-async-node:1',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    expect(handle.getVirtualMetrics().stable).toBe(false)

    settleOnce?.()
    await flushAll()
    expect((await handle.settle({ frames: 0, timeoutMs: 0, reason: 'manual' })).stable).toBe(false)

    settleAgain?.()
    await new Promise(resolve => setTimeout(resolve, 90))
    await flushAll()
    expect((await handle.settle({ frames: 0, timeoutMs: 0, reason: 'manual' })).stable).toBe(true)

    wrapper.unmount()
  })

  it('forwards nested fragment async lifecycle to the parent virtual renderer', async () => {
    let finish: (() => void) | null = null

    const NestedAsyncNode = defineComponent({
      props: {
        node: { type: Object, required: true },
        indexKey: { type: [String, Number], required: true },
      },
      setup(props) {
        const lifecycle = inject<MarkstreamNodeLifecycle>('markstreamNodeLifecycle')
        onMounted(() => {
          lifecycle?.markPending(props.indexKey)
        })
        finish = () => {
          lifecycle?.markSettled(props.indexKey)
        }
        return () => h('div', 'nested async')
      },
    })

    setCustomComponents('virtual-lifecycle-test', {
      nested_async: NestedAsyncNode as any,
    })

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        customId: 'virtual-lifecycle-test',
        nodes: [
          {
            type: 'html_block',
            tag: 'x-host',
            content: '<nested_async></nested_async>',
            children: [
              {
                type: 'nested_async',
                raw: '<nested_async />',
                content: '',
              },
            ],
            raw: '<x-host><nested_async /></x-host>',
          },
        ],
        customHtmlTags: ['x-host', 'nested_async'],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'nested-fragment-lifecycle',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    expect(handle.getVirtualMetrics().stable).toBe(false)

    finish?.()
    await new Promise(resolve => setTimeout(resolve, 90))
    await flushAll()

    expect((await handle.settle({ frames: 0, timeoutMs: 0 })).stable).toBe(true)

    wrapper.unmount()
  })

  it('emits auto final after pending async nodes settle', async () => {
    let finishAsyncNode: ((height: number) => void) | null = null
    const AsyncNode = defineComponent({
      props: {
        node: { type: Object, required: true },
        indexKey: { type: [String, Number], required: true },
      },
      setup(props) {
        const lifecycle = inject<MarkstreamNodeLifecycle>('markstreamNodeLifecycle')
        onMounted(() => {
          lifecycle?.markPending(props.indexKey)
        })
        finishAsyncNode = (height: number) => {
          lifecycle?.reportHeight(props.indexKey, height)
          lifecycle?.markSettled(props.indexKey)
        }
        return () => h('div', { class: 'async-custom-node' }, 'async custom node')
      },
    })

    setCustomComponents('virtual-lifecycle-test', {
      async_node: AsyncNode as any,
    })

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        customId: 'virtual-lifecycle-test',
        nodes: [
          {
            type: 'async_node',
            raw: '<async-node />',
            content: '',
          },
        ],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'thread-a:auto-custom-node:1',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()
    expect(wrapper.emitted('renderFinal')).toBeUndefined()

    expect(finishAsyncNode).toBeTypeOf('function')
    finishAsyncNode?.(88)
    await new Promise(resolve => setTimeout(resolve, 160))
    await flushAll()

    expect(wrapper.emitted('renderFinal')?.at(-1)?.[0]).toMatchObject({
      phase: 'final',
      totalHeight: 88,
      stable: true,
    })

    wrapper.unmount()
  })

  it('manual settledToken retries final after async nodes settle', async () => {
    let finishAsyncNode: ((height: number) => void) | null = null

    const AsyncNode = defineComponent({
      props: {
        node: { type: Object, required: true },
        indexKey: { type: [String, Number], required: true },
      },
      setup(props) {
        const lifecycle = inject<MarkstreamNodeLifecycle>('markstreamNodeLifecycle')
        onMounted(() => {
          lifecycle?.markPending(props.indexKey)
        })
        finishAsyncNode = (height: number) => {
          lifecycle?.reportHeight(props.indexKey, height)
          lifecycle?.markSettled(props.indexKey)
        }
        return () => h('div', { class: 'async-custom-node' }, 'async custom node')
      },
    })

    setCustomComponents('virtual-lifecycle-test', {
      async_node: AsyncNode as any,
    })

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        customId: 'virtual-lifecycle-test',
        nodes: [{ type: 'async_node', raw: '<async-node />', content: '' }],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'thread-a:manual-custom-node:1',
          settleMode: 'manual',
          settledToken: true,
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()
    expect(wrapper.emitted('renderFinal')).toBeUndefined()

    finishAsyncNode?.(123)
    await new Promise(resolve => setTimeout(resolve, 160))
    await flushAll()

    expect(wrapper.emitted('renderFinal')?.at(-1)?.[0]).toMatchObject({
      phase: 'final',
      totalHeight: 123,
      stable: true,
    })

    wrapper.unmount()
  })

  it('does not emit final before deferred height settling timers finish', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | null = null

    try {
      const platform = installManualMeasurementPlatform()
      const NodeRenderer = (await import('../src/components/NodeRenderer')).default

      wrapper = mount(NodeRenderer, {
        props: {
          nodes: [createParagraph(1)],
          final: true,
          fade: false,
          viewportPriority: false,
          virtualScroll: {
            enabled: true,
            sessionKey: 'thread-a:deferred-final:1',
            emitIntervalMs: 0,
          },
        },
      })

      await nextTick()
      await Promise.resolve()
      await Promise.resolve()

      const contentEl = getRootNodeContentElements(wrapper.element)[0]!
      platform.heights.set(contentEl, 40)
      platform.resizeCallbacks.get(contentEl)?.([], {} as ResizeObserver)
      platform.flushFrames()
      await nextTick()

      expect(wrapper.emitted('renderFinal')).toBeUndefined()

      await vi.advanceTimersByTimeAsync(90)
      platform.flushFrames()
      await nextTick()

      const settled = await (wrapper.vm as any).settle({ frames: 0, timeoutMs: 0, reason: 'final' })
      expect(settled).toMatchObject({
        phase: 'final',
        stable: true,
        totalHeight: 40,
      })
      expect(wrapper.emitted('renderFinal')?.at(-1)?.[0]).toMatchObject({
        phase: 'final',
        stable: true,
        totalHeight: 40,
      })
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('does not import restore height cache for stale sessions or mismatched widths', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const metrics = {
      sessionKey: 'stale-session',
      phase: 'final',
      nodeCount: 2,
      liveRange: { start: 0, end: 2 },
      renderedCount: 2,
      measuredCount: 2,
      estimatedCount: 0,
      averageNodeHeight: 400,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      visibleDomHeight: 800,
      totalHeight: 800,
      width: 400,
      final: true,
      stable: true,
      confidence: 'final',
      reason: 'manual',
    } as const

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'current-session',
          settleMode: 'manual',
          restoreState: {
            sessionKey: 'stale-session',
            anchor: { type: 'node', nodeIndex: 0, offsetWithinNodePx: 0 },
            metrics,
            width: 400,
            heightCache: [
              { index: 0, height: 400 },
              { index: 1, height: 400 },
            ],
          },
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    expect((await handle.forceMeasure('manual')).totalHeight).not.toBe(800)

    await wrapper.setProps({
      virtualScroll: {
        enabled: true,
        sessionKey: 'current-session',
        settleMode: 'manual',
        restoreState: {
          sessionKey: 'current-session',
          anchor: { type: 'node', nodeIndex: 0, offsetWithinNodePx: 0 },
          metrics: { ...metrics, sessionKey: 'current-session', width: 800 },
          width: 800,
          heightCache: [
            { index: 0, height: 400 },
            { index: 1, height: 400 },
          ],
        },
      },
    })
    await flushAll()

    expect((await handle.forceMeasure('manual')).totalHeight).not.toBe(800)

    wrapper.unmount()
  })

  it('does not import restore height cache before current width is known', async () => {
    let width = 0
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const metrics = {
      sessionKey: 'current-session',
      phase: 'final',
      nodeCount: 2,
      liveRange: { start: 0, end: 2 },
      renderedCount: 2,
      measuredCount: 2,
      estimatedCount: 0,
      averageNodeHeight: 400,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      visibleDomHeight: 800,
      totalHeight: 800,
      width: 800,
      final: true,
      stable: true,
      confidence: 'final',
      reason: 'manual',
    } as const

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'current-session',
          settleMode: 'manual',
          restoreState: {
            sessionKey: 'current-session',
            anchor: { type: 'node', nodeIndex: 0, offsetWithinNodePx: 0 },
            metrics,
            width: 800,
            heightCache: [
              { index: 0, height: 400 },
              { index: 1, height: 400 },
            ],
          },
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    expect((await handle.forceMeasure('manual')).totalHeight).not.toBe(800)

    width = 400
    window.dispatchEvent(new Event('resize'))
    await flushAll()

    expect((await handle.forceMeasure('manual')).totalHeight).not.toBe(800)

    wrapper.unmount()
  })

  it('does not import standalone height cache without restore state', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'current-session',
          settleMode: 'manual',
          heightCache: [
            { index: 0, height: 400 },
            { index: 1, height: 400 },
          ],
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    expect((await handle.forceMeasure('manual')).totalHeight).not.toBe(800)

    wrapper.unmount()
  })

  it('imports standalone height cache when entries carry compatibility metadata', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'current-session',
          settleMode: 'manual',
          heightCache: [
            {
              index: 0,
              height: 400,
              nodeType: 'paragraph',
              signature: 'paragraph\u0000\u00000\u0000Paragraph 1',
            },
            {
              index: 1,
              height: 400,
              nodeType: 'paragraph',
              signature: 'paragraph\u0000\u00000\u0000Paragraph 2',
            },
          ],
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    expect((await handle.forceMeasure('manual')).totalHeight).toBe(800)

    wrapper.unmount()
  })

  it('rejects height cache entries whose node signature no longer matches', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'same-session',
          settleMode: 'manual',
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    const state = {
      sessionKey: 'same-session',
      anchor: { type: 'node', nodeIndex: 0, offsetWithinNodePx: 0 },
      metrics: {
        ...handle.getVirtualMetrics(),
        sessionKey: 'same-session',
        width: 400,
        totalHeight: 800,
      },
      width: 400,
      contentHash: 'stale-content',
      heightCache: [
        {
          index: 0,
          height: 400,
          nodeType: 'paragraph',
          signature: 'stale-signature',
        },
        {
          index: 1,
          height: 400,
          nodeType: 'paragraph',
          signature: 'stale-signature',
        },
      ],
    }

    await wrapper.setProps({
      nodes: [
        {
          type: 'paragraph',
          raw: 'Different paragraph',
          children: [{ type: 'text', content: 'Different paragraph', raw: 'Different paragraph' }],
        },
        createParagraph(2),
      ],
      virtualScroll: {
        enabled: true,
        sessionKey: 'same-session',
        settleMode: 'manual',
        restoreState: state,
      },
    })

    await flushAll()

    expect((await handle.forceMeasure('manual')).totalHeight).not.toBe(800)

    wrapper.unmount()
  })

  it('retries imperative restoreVirtualState after parsed nodes become available', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const state = {
      sessionKey: 'thread-a:late-restore:1',
      anchor: { type: 'node', nodeIndex: 1, offsetWithinNodePx: 10 },
      metrics: {
        sessionKey: 'thread-a:late-restore:1',
        phase: 'final',
        nodeCount: 2,
        liveRange: { start: 0, end: 2 },
        renderedCount: 2,
        measuredCount: 2,
        estimatedCount: 0,
        averageNodeHeight: 50,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
        visibleDomHeight: 100,
        totalHeight: 100,
        width: 400,
        final: true,
        stable: true,
        confidence: 'final',
        reason: 'manual',
      },
      width: 400,
      heightCache: [
        { index: 0, height: 50 },
        { index: 1, height: 50 },
      ],
    } as any

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'thread-a:late-restore:1',
          settleMode: 'manual',
        },
      },
    })

    const handle = wrapper.vm as any
    handle.restoreVirtualState(state)

    await wrapper.setProps({
      nodes: [createParagraph(1), createParagraph(2)],
    })

    await flushAll()

    expect(handle.getVirtualMetrics().totalHeight).toBe(100)

    wrapper.unmount()
  })

  it('accepts a Vue ref as virtualScroll.scrollRoot', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const scrollRoot = ref<HTMLElement | null>(null)

    const Host = defineComponent({
      setup() {
        return () => h('div', { ref: scrollRoot }, [
          h(NodeRenderer, {
            nodes: [createParagraph(1), createParagraph(2)],
            final: true,
            fade: false,
            viewportPriority: false,
            maxLiveNodes: 1,
            virtualScroll: {
              enabled: true,
              sessionKey: 'thread-a:ref-root:1',
              scrollRoot,
              settleMode: 'manual',
              emitIntervalMs: 0,
            },
          }),
        ])
      },
    })

    const wrapper = mount(Host)
    await flushAll()

    expect(scrollRoot.value).toBeInstanceOf(HTMLElement)
    expect(wrapper.find('.markstream-vue').exists()).toBe(true)

    wrapper.unmount()
  })

  it('settles the original lifecycle key when indexKey changes while image is pending', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(72)

    const markPending = vi.fn()
    const reportHeight = vi.fn()
    const markSettled = vi.fn()
    const indexKey = ref('markdown-renderer-0')
    const ImageNode = (await import('../src/components/ImageNode')).default
    const node = {
      type: 'image',
      src: 'https://example.com/hero.png',
      alt: 'Hero',
      title: 'Hero',
      raw: '![Hero](https://example.com/hero.png)',
    } as any

    const Host = defineComponent({
      setup() {
        return () => h(ImageNode, {
          node,
          'index-key': indexKey.value,
        })
      },
    })

    const wrapper = mount(Host, {
      global: {
        provide: {
          markstreamNodeLifecycle: {
            markPending,
            reportHeight,
            markSettled,
          },
        },
      },
    })

    await flushAll()

    expect(markPending).toHaveBeenCalledWith('markdown-renderer-0')

    indexKey.value = 'markdown-renderer-1'
    await nextTick()

    await wrapper.get('img').trigger('load')
    await flushAll()

    expect(markSettled).toHaveBeenCalledWith('markdown-renderer-0')

    wrapper.unmount()
  })
})
