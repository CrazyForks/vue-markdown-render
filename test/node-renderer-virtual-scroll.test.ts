import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, inject, nextTick, onMounted, ref, watch } from 'vue'
import { removeCustomComponents, setCustomComponents } from '../src/utils/nodeComponents'
import { MARKSTREAM_NODE_LIFECYCLE_KEY } from '../src/utils/nodeLifecycle'
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

async function captureSeedHeightCache(
  NodeRenderer: any,
  heights: number[] = [400, 400],
) {
  const platform = installManualMeasurementPlatform()
  const wrapper = mount(NodeRenderer, {
    props: {
      nodes: heights.map((_, index) => createParagraph(index + 1)),
      final: true,
      fade: false,
      viewportPriority: false,
      virtualScroll: {
        enabled: true,
        sessionKey: 'seed-cache',
        settleMode: 'manual',
        emitIntervalMs: 0,
      },
    },
  })

  await flushAll()

  const contentEls = getRootNodeContentElements(wrapper.element)
  for (const [index, height] of heights.entries()) {
    const el = contentEls[index]
    if (!el)
      continue

    platform.heights.set(el, height)
    platform.resizeCallbacks.get(el)?.([], {} as ResizeObserver)
  }
  platform.flushFrames()
  await nextTick()
  await (wrapper.vm as any).forceMeasure('manual')

  const heightCache = (wrapper.vm as any).captureVirtualState()?.heightCache ?? []
  wrapper.unmount()
  return heightCache
}

function getRootNodeContentElements(root: Element) {
  return Array.from(root.children)
    .filter((el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains('node-slot'))
    .map(el => el.querySelector(':scope > .node-content') as HTMLElement | null)
    .filter((el): el is HTMLElement => Boolean(el))
}

function makeDomRect(top: number, height: number, width = 400) {
  return {
    x: 0,
    y: top,
    top,
    bottom: top + height,
    left: 0,
    right: width,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect
}

function installRendererBottomGeometry(
  wrapper: ReturnType<typeof mount>,
  scrollRoot: HTMLElement,
  getRendererHeight: () => number,
) {
  Object.defineProperty(wrapper.element, 'scrollHeight', {
    configurable: true,
    get: getRendererHeight,
  })

  vi.spyOn(scrollRoot, 'getBoundingClientRect').mockImplementation(() => {
    return makeDomRect(0, scrollRoot.clientHeight)
  })

  vi.spyOn(wrapper.element, 'getBoundingClientRect').mockImplementation(() => {
    const height = getRendererHeight()
    return makeDomRect(-scrollRoot.scrollTop, height)
  })
}

describe('node renderer virtual-scroll coordination', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })

  afterEach(() => {
    try {
      removeCustomComponents('virtual-lifecycle-test')
      removeCustomComponents('virtual-prefix-test')
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
          threadKey: 'thread-a',
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
    expect(metrics.threadKey).toBe('thread-a')
    expect(metrics.totalHeight).toBe(120)
    expect(metrics.measuredCount).toBe(2)
    expect(wrapper.emitted('height-change')?.at(-1)?.[0]).toMatchObject({
      sessionKey: 'thread-a:message-1:1',
      threadKey: 'thread-a',
      totalHeight: 120,
    })
    expect(wrapper.emitted('heightChange')).toBeUndefined()
    expect(wrapper.emitted('virtualStateChange')).toBeUndefined()
    expect(wrapper.emitted('anchorChange')).toBeUndefined()

    const state = handle.captureVirtualState()
    expect(state).toMatchObject({
      sessionKey: 'thread-a:message-1:1',
      threadKey: 'thread-a',
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
    expect(wrapper.emitted('render-settled')?.at(-1)?.[0]).toMatchObject({
      totalHeight: 120,
      stable: true,
    })
    expect(wrapper.emitted('renderSettled')).toBeUndefined()
    expect(wrapper.emitted('render-final')?.at(-1)?.[0]).toMatchObject({
      phase: 'final',
      totalHeight: 120,
    })
    expect(wrapper.emitted('renderFinal')).toBeUndefined()
    expect(wrapper.emitted('render-final')?.length ?? 0).toBe(1)

    await handle.forceMeasure('manual')
    platform.flushFrames()
    await nextTick()

    expect(wrapper.emitted('render-final')?.length ?? 0).toBe(1)

    await handle.settle({ frames: 0, timeoutMs: 0, reason: 'manual' })
    expect(wrapper.emitted('render-final')?.length ?? 0).toBe(1)

    wrapper.unmount()
  })

  it('resets metrics state when virtualScroll.enabled toggles', async () => {
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
          sessionKey: 'toggle-session',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const contentEl = getRootNodeContentElements(wrapper.element)[0]!
    platform.heights.set(contentEl, 40)
    platform.resizeCallbacks.get(contentEl)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()
    await (wrapper.vm as any).forceMeasure('manual')

    const emittedBeforeToggle = wrapper.emitted('height-change')?.length ?? 0

    await wrapper.setProps({
      virtualScroll: {
        enabled: false,
        sessionKey: 'toggle-session',
        settleMode: 'manual',
        emitIntervalMs: 0,
      },
    })
    await flushAll()

    await wrapper.setProps({
      virtualScroll: {
        enabled: true,
        sessionKey: 'toggle-session',
        settleMode: 'manual',
        emitIntervalMs: 0,
      },
    })
    await flushAll()
    platform.flushFrames()
    await nextTick()

    expect(wrapper.emitted('height-change')?.length ?? 0).toBeGreaterThan(emittedBeforeToggle)

    wrapper.unmount()
  })

  it('does not block render-settled on unloaded lazy images', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const ImageNode = (await import('../src/components/ImageNode')).default
    const LazyImageNode = defineComponent({
      props: {
        node: { type: Object, required: true },
        indexKey: { type: [String, Number], required: true },
      },
      setup(props) {
        return () => h(ImageNode, {
          'node': props.node as any,
          'lazy': true,
          'index-key': props.indexKey,
        })
      },
    })

    setCustomComponents('virtual-lifecycle-test', {
      image: LazyImageNode as any,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        customId: 'virtual-lifecycle-test',
        nodes: [
          {
            type: 'image',
            src: 'https://example.com/lazy.png',
            alt: 'Lazy',
            title: null,
            raw: '![Lazy](https://example.com/lazy.png)',
          },
        ],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'lazy-image-settled',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const contentEl = getRootNodeContentElements(wrapper.element)[0]!
    platform.heights.set(contentEl, 64)
    platform.resizeCallbacks.get(contentEl)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 90))

    const settled = await (wrapper.vm as any).settle({ frames: 0, timeoutMs: 0, reason: 'manual' })

    expect(settled).toMatchObject({
      phase: 'final',
      stable: true,
      totalHeight: 64,
    })
    expect(wrapper.emitted('render-settled')?.at(-1)?.[0]).toMatchObject({
      sessionKey: 'lazy-image-settled',
      stable: true,
    })

    wrapper.unmount()
  })

  it('does not emit stale final metrics after virtual session changes during settle', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | null = null

    try {
      const NodeRenderer = (await import('../src/components/NodeRenderer')).default

      wrapper = mount(NodeRenderer, {
        props: {
          nodes: [createParagraph(1)],
          final: true,
          fade: false,
          viewportPriority: false,
          virtualScroll: {
            enabled: true,
            sessionKey: 'session-a',
            settleMode: 'manual',
            emitIntervalMs: 0,
          },
        },
      })

      await nextTick()
      await Promise.resolve()
      await Promise.resolve()

      const settlePromise = (wrapper.vm as any).settle({ frames: 0, timeoutMs: 120, reason: 'manual' })

      await wrapper.setProps({
        virtualScroll: {
          enabled: true,
          sessionKey: 'session-b',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      })

      await vi.advanceTimersByTimeAsync(120)
      const metrics = await settlePromise

      expect(metrics).toMatchObject({
        sessionKey: 'session-b',
        stable: false,
      })
      expect(metrics.phase).not.toBe('final')
      expect(wrapper.emitted('render-final')).toBeUndefined()
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('does not emit stale final metrics after measurementKey changes during settle', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | null = null

    try {
      const NodeRenderer = (await import('../src/components/NodeRenderer')).default

      wrapper = mount(NodeRenderer, {
        props: {
          nodes: [createParagraph(1)],
          final: true,
          fade: false,
          viewportPriority: false,
          virtualScroll: {
            enabled: true,
            sessionKey: 'same-session-layout-a',
            measurementKey: 'theme-a',
            settleMode: 'manual',
            emitIntervalMs: 0,
          },
        },
      })

      await nextTick()
      await Promise.resolve()
      await Promise.resolve()

      const settlePromise = (wrapper.vm as any).settle({
        frames: 0,
        timeoutMs: 120,
        reason: 'manual',
      })

      await wrapper.setProps({
        virtualScroll: {
          enabled: true,
          sessionKey: 'same-session-layout-a',
          measurementKey: 'theme-b',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      })

      await vi.advanceTimersByTimeAsync(120)
      const metrics = await settlePromise

      expect(metrics).toMatchObject({
        sessionKey: 'same-session-layout-a',
        stable: false,
      })
      expect(metrics.phase).not.toBe('final')
      expect(wrapper.emitted('render-final')).toBeUndefined()
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
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

  it('invalidates measured heights when node content changes in the same session', async () => {
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
          sessionKey: 'same-session-content-cache',
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

    const changedNode = createParagraph(1)
    changedNode.raw = 'Paragraph 1 updated with more content'
    changedNode.children[0].raw = changedNode.raw
    changedNode.children[0].content = changedNode.raw

    await wrapper.setProps({
      nodes: [changedNode],
    })
    await flushAll()

    expect(handle.getVirtualMetrics().totalHeight).not.toBe(500)

    wrapper.unmount()
  })

  it('resets measured heights when measurementKey changes', async () => {
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
          sessionKey: 'same-session-layout-cache',
          measurementKey: 'theme-a',
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
    expect(handle.getVirtualMetrics().totalHeight).toBe(500)

    platform.heights.set(contentEl, 120)
    await wrapper.setProps({
      virtualScroll: {
        enabled: true,
        sessionKey: 'same-session-layout-cache',
        measurementKey: 'theme-b',
        settleMode: 'manual',
        emitIntervalMs: 0,
      },
    })
    await flushAll()
    platform.flushFrames()
    await nextTick()

    expect(handle.getVirtualMetrics().totalHeight).toBe(120)

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
        const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY)
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
    expect(wrapper.emitted('render-settled')?.at(-1)?.[0]).toMatchObject({
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
        const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY)
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
        const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY)
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

  it('forwards nested fragment reportHeight to the parent virtual renderer', async () => {
    let report: ((height: number) => void) | null = null

    const NestedReporter = defineComponent({
      props: {
        node: { type: Object, required: true },
        indexKey: { type: [String, Number], required: true },
      },
      setup(props) {
        const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY)
        report = (height: number) => {
          lifecycle?.reportHeight(props.indexKey, height)
        }
        return () => h('div', 'nested reporter')
      },
    })
    const HostNode = defineComponent({
      setup(_, { slots }) {
        return () => h('div', slots.default?.())
      },
    })

    setCustomComponents('virtual-lifecycle-test', {
      'x-host': HostNode as any,
      'nested_reporter': NestedReporter as any,
    })

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        customId: 'virtual-lifecycle-test',
        nodes: [
          {
            type: 'html_block',
            tag: 'x-host',
            content: '<nested_reporter></nested_reporter>',
            children: [
              {
                type: 'nested_reporter',
                raw: '<nested_reporter />',
                content: '',
              },
            ],
            raw: '<x-host><nested_reporter /></x-host>',
          },
        ],
        customHtmlTags: ['x-host', 'nested_reporter'],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'nested-fragment-report-height',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    expect(report).toBeTypeOf('function')
    report?.(144)
    await flushAll()

    expect((await (wrapper.vm as any).forceMeasure('manual')).totalHeight).toBe(144)

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
        const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY)
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
    expect(wrapper.emitted('render-final')).toBeUndefined()

    expect(finishAsyncNode).toBeTypeOf('function')
    finishAsyncNode?.(88)
    await new Promise(resolve => setTimeout(resolve, 160))
    await flushAll()

    expect(wrapper.emitted('render-final')?.at(-1)?.[0]).toMatchObject({
      phase: 'final',
      totalHeight: 88,
      stable: true,
    })

    wrapper.unmount()
  })

  it('emits auto final again when settled heights change', async () => {
    let finishAsyncNode: ((height: number) => void) | null = null
    let reportAsyncHeight: ((height: number) => void) | null = null
    const AsyncNode = defineComponent({
      props: {
        node: { type: Object, required: true },
        indexKey: { type: [String, Number], required: true },
      },
      setup(props) {
        const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY)
        onMounted(() => {
          lifecycle?.markPending(props.indexKey)
        })
        reportAsyncHeight = (height: number) => {
          lifecycle?.reportHeight(props.indexKey, height)
        }
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
          sessionKey: 'thread-a:auto-height-change:1',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    finishAsyncNode?.(88)
    await new Promise(resolve => setTimeout(resolve, 160))
    await flushAll()

    const firstFinalCount = wrapper.emitted('render-final')?.length ?? 0
    expect(wrapper.emitted('render-final')?.at(-1)?.[0]).toMatchObject({
      phase: 'final',
      totalHeight: 88,
      stable: true,
    })

    reportAsyncHeight?.(120)
    await new Promise(resolve => setTimeout(resolve, 160))
    await flushAll()

    expect(wrapper.emitted('render-final')?.length).toBeGreaterThan(firstFinalCount)
    expect(wrapper.emitted('render-final')?.at(-1)?.[0]).toMatchObject({
      phase: 'final',
      totalHeight: 120,
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
        const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY)
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
    expect(wrapper.emitted('render-final')).toBeUndefined()

    finishAsyncNode?.(123)
    await new Promise(resolve => setTimeout(resolve, 160))
    await flushAll()

    expect(wrapper.emitted('render-final')?.at(-1)?.[0]).toMatchObject({
      phase: 'final',
      totalHeight: 123,
      stable: true,
    })

    wrapper.unmount()
  })

  it.each([false, ''])('does not emit renderSettled in manual mode before settledToken is provided: %j', async (settledToken) => {
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
          sessionKey: `manual-gated-settled:${String(settledToken)}`,
          settleMode: 'manual',
          settledToken,
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const contentEl = getRootNodeContentElements(wrapper.element)[0]!
    platform.heights.set(contentEl, 40)
    platform.resizeCallbacks.get(contentEl)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()

    await new Promise(resolve => setTimeout(resolve, 700))
    platform.flushFrames()
    await flushAll()

    expect(wrapper.emitted('render-settled')).toBeUndefined()
    expect(wrapper.emitted('render-final')).toBeUndefined()
    expect((wrapper.vm as any).getVirtualMetrics()).toMatchObject({
      stable: false,
      totalHeight: 40,
    })

    wrapper.unmount()
  })

  it('invalidates imperative manual settle confirmation when height changes in the same session', async () => {
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
          sessionKey: 'manual-settle-height-change',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const contentEl = getRootNodeContentElements(wrapper.element)[0]!
    platform.heights.set(contentEl, 40)
    platform.resizeCallbacks.get(contentEl)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()

    const handle = wrapper.vm as any
    expect(await handle.forceMeasure('manual')).toMatchObject({
      totalHeight: 40,
    })

    await new Promise(resolve => setTimeout(resolve, 90))
    platform.flushFrames()
    await nextTick()

    expect(await handle.settle({ frames: 0, timeoutMs: 0, reason: 'manual' })).toMatchObject({
      stable: true,
      totalHeight: 40,
    })

    platform.heights.set(contentEl, 80)
    platform.resizeCallbacks.get(contentEl)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()

    expect(handle.getVirtualMetrics()).toMatchObject({
      stable: false,
      totalHeight: 80,
    })

    wrapper.unmount()
  })

  it('omits height cache from non-final virtualStateChange emissions', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1)],
        final: false,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'streaming-light-state',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const contentEl = getRootNodeContentElements(wrapper.element)[0]!
    platform.heights.set(contentEl, 40)
    platform.resizeCallbacks.get(contentEl)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()
    platform.flushFrames()
    await flushAll()

    const state = wrapper.emitted('virtual-state-change')?.at(-1)?.[0] as any
    expect(state).toMatchObject({
      sessionKey: 'streaming-light-state',
      metrics: {
        totalHeight: 40,
      },
    })
    expect(state.heightCache).toBeUndefined()
    expect(state.contentHash).toBeUndefined()
    const heightCache = (wrapper.vm as any).captureVirtualState()?.heightCache ?? []
    expect(heightCache).toMatchObject([
      {
        index: 0,
        height: 40,
        nodeType: 'paragraph',
      },
    ])
    expect(heightCache[0]?.signature).toBeTruthy()
    expect(heightCache[0]?.signature).not.toContain('Paragraph')

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

      expect(wrapper.emitted('render-final')).toBeUndefined()

      await vi.advanceTimersByTimeAsync(90)
      platform.flushFrames()
      await nextTick()

      const settled = await (wrapper.vm as any).settle({ frames: 0, timeoutMs: 0, reason: 'final' })
      expect(settled).toMatchObject({
        phase: 'final',
        stable: true,
        totalHeight: 40,
      })
      expect(wrapper.emitted('render-final')?.at(-1)?.[0]).toMatchObject({
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

  it('does not import unscoped restore height cache into a scoped thread', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const metrics = {
      sessionKey: 'shared-session',
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
          threadKey: 'thread-a',
          sessionKey: 'shared-session',
          settleMode: 'manual',
          restoreState: {
            sessionKey: 'shared-session',
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

    expect((await (wrapper.vm as any).forceMeasure('manual')).totalHeight).not.toBe(800)

    wrapper.unmount()
  })

  it('does not reuse restore height cache when measurementKey changes', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

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
      width: 400,
      final: true,
      stable: true,
      confidence: 'final',
      reason: 'manual',
    } as const
    const restoreState = {
      sessionKey: 'current-session',
      anchor: { type: 'node', nodeIndex: 0, offsetWithinNodePx: 0 },
      metrics,
      width: 400,
      measurementKey: 'light:16',
      heightCache: [
        { index: 0, height: 400, nodeType: 'paragraph' },
        { index: 1, height: 400, nodeType: 'paragraph' },
      ],
    } as any

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
          restoreState,
          measurementKey: 'dark:16',
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
        restoreState,
        measurementKey: 'light:16',
      },
    })

    await flushAll()

    expect((await handle.forceMeasure('manual')).totalHeight).toBe(800)
    expect(handle.captureVirtualState()?.measurementKey).toBe('light:16')

    wrapper.unmount()
  })

  it('treats prop restoreState as cache-only unless restoreAnchor is provided', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const scrollRoot = document.createElement('div')
    document.body.appendChild(scrollRoot)

    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => 1000,
    })

    scrollRoot.scrollTop = 120

    const metrics = {
      sessionKey: 'cache-only-session',
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
          sessionKey: 'cache-only-session',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          restoreState: {
            sessionKey: 'cache-only-session',
            anchor: { type: 'bottom', distanceFromBottomPx: 0 },
            metrics,
            width: 400,
            heightCache: [
              { index: 0, height: 400, nodeType: 'paragraph' },
              { index: 1, height: 400, nodeType: 'paragraph' },
            ],
          },
        },
      },
    })

    await flushAll()

    expect(scrollRoot.scrollTop).toBe(120)
    expect((await (wrapper.vm as any).forceMeasure('manual')).totalHeight).toBe(800)

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('applies prop restoreState anchor only when restoreAnchor token is provided', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const scrollRoot = document.createElement('div')
    document.body.appendChild(scrollRoot)

    let scrollHeight = 1000

    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })

    scrollRoot.scrollTop = 120

    const restoreState = {
      sessionKey: 'explicit-anchor-session',
      anchor: { type: 'bottom', distanceFromBottomPx: 0 },
      metrics: {
        sessionKey: 'explicit-anchor-session',
        phase: 'final',
        nodeCount: 2,
        liveRange: { start: 0, end: 2 },
        renderedCount: 2,
        measuredCount: 2,
        estimatedCount: 0,
        averageNodeHeight: 100,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
        visibleDomHeight: 200,
        totalHeight: 200,
        width: 400,
        final: true,
        stable: true,
        confidence: 'final',
        reason: 'manual',
      },
      width: 400,
    } as any

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'explicit-anchor-session',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          restoreState,
        },
      },
    })

    await flushAll()

    expect(scrollRoot.scrollTop).toBe(120)
    installRendererBottomGeometry(wrapper, scrollRoot, () => scrollHeight)

    await wrapper.setProps({
      virtualScroll: {
        enabled: true,
        sessionKey: 'explicit-anchor-session',
        scrollRoot: () => scrollRoot,
        settleMode: 'manual',
        restoreAnchor: 'thread-restore-1',
        restoreState,
      },
    })

    await flushAll()
    expect(scrollRoot.scrollTop).toBe(800)

    scrollRoot.scrollTop = 300
    scrollHeight = 1000

    await wrapper.setProps({
      virtualScroll: {
        enabled: true,
        sessionKey: 'explicit-anchor-session',
        scrollRoot: () => scrollRoot,
        settleMode: 'manual',
        restoreAnchor: 'thread-restore-1',
        restoreState,
      },
    })

    await flushAll()
    expect(scrollRoot.scrollTop).toBe(300)

    await wrapper.setProps({
      virtualScroll: {
        enabled: true,
        sessionKey: 'explicit-anchor-session',
        scrollRoot: () => scrollRoot,
        settleMode: 'manual',
        restoreAnchor: 'thread-restore-2',
        restoreState,
      },
    })

    await flushAll()
    expect(scrollRoot.scrollTop).toBe(800)

    wrapper.unmount()
    scrollRoot.remove()
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

  it('does not import restore height cache when saved width is missing', async () => {
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
          sessionKey: 'missing-saved-width',
          settleMode: 'manual',
          restoreState: {
            sessionKey: 'missing-saved-width',
            anchor: { type: 'node', nodeIndex: 0, offsetWithinNodePx: 0 },
            metrics: {
              sessionKey: 'missing-saved-width',
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
              width: 0,
              final: true,
              stable: true,
              confidence: 'final',
              reason: 'manual',
            },
            width: 0,
            heightCache: [
              { index: 0, height: 400 },
              { index: 1, height: 400 },
            ],
          },
        },
      },
    })

    await flushAll()

    expect((await (wrapper.vm as any).forceMeasure('manual')).totalHeight).not.toBe(800)

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

  it('requires standalone height cache compatibility metadata even when restore state is valid', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

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
          heightCacheWidth: 400,
          heightCache: [
            { index: 0, height: 400 },
            { index: 1, height: 400 },
          ],
          restoreState: {
            sessionKey: 'current-session',
            anchor: { type: 'node', nodeIndex: 0, offsetWithinNodePx: 0 },
            metrics,
            width: 400,
          },
        },
      },
    })

    await flushAll()

    expect((await (wrapper.vm as any).forceMeasure('manual')).totalHeight).not.toBe(800)

    wrapper.unmount()
  })

  it('imports standalone height cache when entries carry compatibility metadata', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const seedCache = await captureSeedHeightCache(NodeRenderer)
    expect(seedCache.every((entry: any) => entry.signature && !entry.signature.includes('Paragraph'))).toBe(true)

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
          heightCacheWidth: 400,
          heightCache: seedCache,
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    expect((await handle.forceMeasure('manual')).totalHeight).toBe(800)

    wrapper.unmount()
  })

  it('imports compatible standalone height cache when restore state is for another thread', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const seedCache = await captureSeedHeightCache(NodeRenderer)
    const metrics = {
      sessionKey: 'shared-session',
      threadKey: 'thread-b',
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
          threadKey: 'thread-a',
          sessionKey: 'shared-session',
          settleMode: 'manual',
          heightCacheWidth: 400,
          heightCache: seedCache,
          restoreState: {
            sessionKey: 'shared-session',
            threadKey: 'thread-b',
            anchor: { type: 'node', nodeIndex: 0, offsetWithinNodePx: 0 },
            metrics,
            width: 400,
          },
        },
      },
    })

    await flushAll()

    expect((await (wrapper.vm as any).forceMeasure('manual')).totalHeight).toBe(800)

    wrapper.unmount()
  })

  it('rejects standalone height cache when measured width is missing', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const seedCache = await captureSeedHeightCache(NodeRenderer)
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'standalone-cache-no-width',
          settleMode: 'manual',
          heightCache: seedCache,
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    expect((await handle.forceMeasure('manual')).totalHeight).not.toBe(800)

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
        { index: 0, height: 50, nodeType: 'paragraph' },
        { index: 1, height: 50, nodeType: 'paragraph' },
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

  it('uses virtual sessionKey as the default node index prefix when indexKey is omitted', async () => {
    const seenIndexKeys: string[] = []

    const ProbeNode = defineComponent({
      props: {
        node: { type: Object, required: true },
        indexKey: { type: [String, Number], required: true },
      },
      setup(props) {
        watch(
          () => props.indexKey,
          value => seenIndexKeys.push(String(value)),
          { immediate: true },
        )

        return () => h('div', 'probe')
      },
    })

    setCustomComponents('virtual-prefix-test', {
      probe: ProbeNode as any,
    })

    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const wrapper = mount(NodeRenderer, {
      props: {
        customId: 'virtual-prefix-test',
        nodes: [{ type: 'probe', raw: '<probe />', content: '' }],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'session-a',
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    await wrapper.setProps({
      virtualScroll: {
        enabled: true,
        sessionKey: 'session-b',
        settleMode: 'manual',
        emitIntervalMs: 0,
      },
    })

    await flushAll()

    expect(seenIndexKeys).toContain('virtual-session-a-0')
    expect(seenIndexKeys).toContain('virtual-session-b-0')

    wrapper.unmount()
  })

  it('primes the virtual window before scrollToNode to avoid spacer-only blank frames', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default

    const nodes = Array.from({ length: 20 }, (_, index) => createParagraph(index + 1))
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes,
        final: true,
        fade: false,
        viewportPriority: false,
        maxLiveNodes: 4,
        liveNodeBuffer: 1,
        virtualScroll: {
          enabled: true,
          sessionKey: 'scroll-to-node-prime',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    handle.scrollToNode(18)
    await nextTick()

    const metrics = handle.getVirtualMetrics()
    expect(metrics.liveRange.start).toBeLessThanOrEqual(18)
    expect(metrics.liveRange.end).toBeGreaterThan(18)

    wrapper.unmount()
  })

  it('primes the virtual window before restoring a node anchor', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: Array.from({ length: 20 }, (_, index) => createParagraph(index + 1)),
        final: true,
        fade: false,
        viewportPriority: false,
        maxLiveNodes: 4,
        liveNodeBuffer: 1,
        virtualScroll: {
          enabled: true,
          sessionKey: 'restore-anchor-prime',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    const handle = wrapper.vm as any
    handle.restoreVirtualState({
      sessionKey: 'restore-anchor-prime',
      anchor: { type: 'node', nodeIndex: 17, offsetWithinNodePx: 0 },
      metrics: handle.getVirtualMetrics(),
      width: 400,
    })

    await nextTick()

    const metrics = handle.getVirtualMetrics()
    expect(metrics.liveRange.start).toBeLessThanOrEqual(17)
    expect(metrics.liveRange.end).toBeGreaterThan(17)

    wrapper.unmount()
  })

  it('captures renderer-bottom anchor even when message chrome exists below the renderer', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const scrollRoot = document.createElement('div')
    document.body.appendChild(scrollRoot)

    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => 1000,
    })

    scrollRoot.scrollTop = 800

    vi.spyOn(scrollRoot, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      bottom: 200,
      left: 0,
      right: 400,
      width: 400,
      height: 200,
      toJSON: () => ({}),
    } as DOMRect)

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'renderer-bottom-with-chrome',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 80,
      top: 80,
      bottom: 160,
      left: 0,
      right: 400,
      width: 400,
      height: 80,
      toJSON: () => ({}),
    } as DOMRect)

    const state = (wrapper.vm as any).captureVirtualState()

    expect(state?.anchor).toMatchObject({
      type: 'bottom',
      distanceFromBottomPx: 40,
    })

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('does not capture a bottom anchor for a renderer far above the viewport bottom', async () => {
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const scrollRoot = document.createElement('div')
    document.body.appendChild(scrollRoot)

    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => 1000,
    })

    scrollRoot.scrollTop = 800

    vi.spyOn(scrollRoot, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      bottom: 200,
      left: 0,
      right: 400,
      width: 400,
      height: 200,
      toJSON: () => ({}),
    } as DOMRect)

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2)],
        final: true,
        fade: false,
        viewportPriority: false,
        virtualScroll: {
          enabled: true,
          sessionKey: 'renderer-bottom-overscan',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()

    vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: -420,
      top: -420,
      bottom: -260,
      left: 0,
      right: 400,
      width: 400,
      height: 160,
      toJSON: () => ({}),
    } as DOMRect)

    expect((wrapper.vm as any).captureVirtualState()?.anchor.type).not.toBe('bottom')

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('keeps a restored bottom anchor active after late height changes', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const scrollRoot = document.createElement('div')
    let scrollHeight = 1000

    document.body.appendChild(scrollRoot)
    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2), createParagraph(3)],
        final: true,
        fade: false,
        viewportPriority: false,
        maxLiveNodes: 1,
        virtualScroll: {
          enabled: true,
          sessionKey: 'bottom-anchor-active',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()
    installRendererBottomGeometry(wrapper, scrollRoot, () => scrollHeight)

    const handle = wrapper.vm as any
    handle.restoreVirtualState({
      sessionKey: 'bottom-anchor-active',
      anchor: { type: 'bottom', distanceFromBottomPx: 0 },
      metrics: handle.getVirtualMetrics(),
      width: 0,
    })

    await nextTick()

    expect(scrollRoot.scrollTop).toBe(800)

    for (const el of getRootNodeContentElements(wrapper.element))
      platform.heights.set(el, 100)
    scrollHeight = 1300

    await handle.forceMeasure('manual')
    platform.flushFrames()
    await nextTick()

    expect(scrollRoot.scrollTop).toBe(1100)

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('reconciles a restored bottom anchor when container width changes', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const scrollRoot = document.createElement('div')
    let scrollHeight = 1000

    document.body.appendChild(scrollRoot)
    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2), createParagraph(3)],
        final: true,
        fade: false,
        viewportPriority: false,
        maxLiveNodes: 1,
        virtualScroll: {
          enabled: true,
          sessionKey: 'bottom-anchor-resize',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()
    installRendererBottomGeometry(wrapper, scrollRoot, () => scrollHeight)

    const handle = wrapper.vm as any
    handle.restoreVirtualState({
      sessionKey: 'bottom-anchor-resize',
      anchor: { type: 'bottom', distanceFromBottomPx: 0 },
      metrics: handle.getVirtualMetrics(),
      width: 0,
    })

    await nextTick()

    expect(scrollRoot.scrollTop).toBe(800)

    scrollHeight = 1400
    platform.resizeCallbacks.get(wrapper.element)?.([], {} as ResizeObserver)
    platform.flushFrames()
    await nextTick()

    expect(scrollRoot.scrollTop).toBe(1200)

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('stops restoring a bottom anchor after the user scrolls away', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const scrollRoot = document.createElement('div')
    let scrollHeight = 1000

    document.body.appendChild(scrollRoot)
    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2), createParagraph(3)],
        final: true,
        fade: false,
        viewportPriority: false,
        maxLiveNodes: 1,
        virtualScroll: {
          enabled: true,
          sessionKey: 'bottom-anchor-user-scroll',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()
    installRendererBottomGeometry(wrapper, scrollRoot, () => scrollHeight)

    const handle = wrapper.vm as any
    handle.restoreVirtualState({
      sessionKey: 'bottom-anchor-user-scroll',
      anchor: { type: 'bottom', distanceFromBottomPx: 0 },
      metrics: handle.getVirtualMetrics(),
      width: 0,
    })

    await nextTick()

    expect(scrollRoot.scrollTop).toBe(800)

    scrollRoot.scrollTop = 700
    scrollRoot.dispatchEvent(new Event('scroll'))

    for (const el of getRootNodeContentElements(wrapper.element))
      platform.heights.set(el, 100)
    scrollHeight = 1300

    await handle.forceMeasure('manual')
    platform.flushFrames()
    await nextTick()

    expect(scrollRoot.scrollTop).toBe(700)

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('stops restoring a bottom anchor after the user scrolls away when node virtualization is disabled', async () => {
    const platform = installManualMeasurementPlatform()
    const NodeRenderer = (await import('../src/components/NodeRenderer')).default
    const scrollRoot = document.createElement('div')
    let scrollHeight = 1000

    document.body.appendChild(scrollRoot)
    Object.defineProperty(scrollRoot, 'clientHeight', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(scrollRoot, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [createParagraph(1), createParagraph(2), createParagraph(3)],
        final: true,
        fade: false,
        viewportPriority: false,
        maxLiveNodes: 0,
        virtualScroll: {
          enabled: true,
          sessionKey: 'bottom-anchor-user-scroll-no-node-virtualization',
          scrollRoot: () => scrollRoot,
          settleMode: 'manual',
          emitIntervalMs: 0,
        },
      },
    })

    await flushAll()
    installRendererBottomGeometry(wrapper, scrollRoot, () => scrollHeight)

    const handle = wrapper.vm as any
    handle.restoreVirtualState({
      sessionKey: 'bottom-anchor-user-scroll-no-node-virtualization',
      anchor: { type: 'bottom', distanceFromBottomPx: 0 },
      metrics: handle.getVirtualMetrics(),
      width: 0,
    })

    expect(scrollRoot.scrollTop).toBe(800)

    scrollRoot.scrollTop = 700
    scrollRoot.dispatchEvent(new Event('scroll'))

    for (const el of getRootNodeContentElements(wrapper.element))
      platform.heights.set(el, 100)
    scrollHeight = 1300

    await handle.forceMeasure('manual')
    platform.flushFrames()
    await nextTick()

    expect(scrollRoot.scrollTop).toBe(700)

    wrapper.unmount()
    scrollRoot.remove()
  })

  it('computes scrollRoot-relative offsets from bounding rects', async () => {
    const { useViewportRoot } = await import('../src/components/NodeRenderer/composables/useViewportRoot')
    const containerRef = ref<HTMLElement>()
    const root = document.createElement('div')
    const node = document.createElement('div')
    const rect = (top: number, height = 20) => ({
      x: 0,
      y: top,
      top,
      bottom: top + height,
      left: 0,
      right: 100,
      width: 100,
      height,
      toJSON: () => ({}),
    }) as DOMRect

    root.scrollTop = 300
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(rect(100))
    vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(rect(450))

    const viewport = useViewportRoot(containerRef, { isClient: true })

    expect(viewport.getOffsetTopWithinRoot(node, root)).toBe(650)
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
          [MARKSTREAM_NODE_LIFECYCLE_KEY]: {
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
