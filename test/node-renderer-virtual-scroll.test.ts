import type { MarkstreamNodeLifecycle } from '../src/types/node-renderer-props'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, inject, nextTick, onMounted } from 'vue'
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

describe('node renderer virtual-scroll coordination', () => {
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

    const contentEls = wrapper.findAll('.node-slot .node-content').map(item => item.element as HTMLElement)
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
})
