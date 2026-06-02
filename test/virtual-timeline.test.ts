import type { MarkstreamVirtualMetrics, MarkstreamVirtualState } from '../src/types/node-renderer-props'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, effectScope, h, inject, markRaw, nextTick, reactive } from 'vue'
import MarkstreamVirtualTimeline from '../src/components/MarkstreamVirtualTimeline'
import { useMarkstreamVirtualAdapter } from '../src/composables/useMarkstreamVirtualAdapter'
import { flushAll } from './setup/flush-all'

function createMetrics(totalHeight: number, sessionKey = 'thread:a1:'): MarkstreamVirtualMetrics {
  return {
    sessionKey,
    phase: 'measuring',
    nodeCount: 1,
    liveRange: { start: 0, end: 1 },
    renderedCount: 1,
    measuredCount: 1,
    estimatedCount: 0,
    averageNodeHeight: totalHeight,
    topSpacerHeight: 0,
    bottomSpacerHeight: 0,
    visibleDomHeight: totalHeight,
    totalHeight,
    width: 640,
    final: true,
    stable: true,
    confidence: 'measured',
    reason: 'manual',
  }
}

async function flushAnimationFrame() {
  await new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        resolve(undefined)
      })
      return
    }

    setTimeout(resolve, 0)
  })
}

async function flushThreadRestoreSettleWindow() {
  await nextTick()
  await flushAnimationFrame()
  await new Promise(resolve => setTimeout(resolve, 700))
}

async function waitForTimelineRestoreSettled(
  root: HTMLElement,
  options: { timeoutMs?: number } = {},
) {
  const timeoutMs = options.timeoutMs ?? 1200
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    await nextTick()
    await flushAnimationFrame()

    if (!root.classList.contains('is-restoring-thread'))
      return
  }

  expect(root.classList.contains('is-restoring-thread')).toBe(false)
}

function installRequestAnimationFrameStub() {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    return window.setTimeout(() => callback(performance.now()), 16)
  })
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    window.clearTimeout(handle)
  })
}

function itemSourceKey(threadKey: string, itemKey: string, revision?: string | number) {
  return [threadKey, itemKey, revision == null ? '' : String(revision)].join(':')
}

function timelineItemSource(threadKey: string, itemKey: string, revision?: string | number, widthBucket = 800) {
  return {
    sourceKey: itemSourceKey(threadKey, itemKey, revision),
    measurementKey: `:${widthBucket}`,
    widthBucket,
  }
}

function installVirtualTimelineGeometryStub(defaultHeight = 80, width = 800) {
  function readBoxHeight(el: HTMLElement) {
    const height = Number.parseFloat(el.style.height || '')
    if (Number.isFinite(height))
      return height

    const minHeight = Number.parseFloat(el.style.minHeight || '')
    if (Number.isFinite(minHeight))
      return minHeight

    return el.offsetHeight || defaultHeight
  }

  function readItemOffsetTop(item: HTMLElement) {
    let top = 0
    let sibling = item.previousElementSibling as HTMLElement | null

    while (sibling) {
      if (
        sibling.classList.contains('markstream-virtual-timeline__spacer')
        || sibling.classList.contains('markstream-virtual-timeline__item')
      ) {
        top += readBoxHeight(sibling)
      }

      sibling = sibling.previousElementSibling as HTMLElement | null
    }

    return top
  }

  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const el = this as HTMLElement
    const root = el.matches?.('[data-testid="markstream-virtual-timeline"]')
      ? el
      : el.closest?.('[data-testid="markstream-virtual-timeline"]') as HTMLElement | null
    const item = el.hasAttribute('data-markstream-item-key')
      ? el
      : el.closest?.('[data-markstream-item-key]') as HTMLElement | null
    const hidden = el.closest?.('.code-editor-container.is-hidden')
    let top = 0
    let height = root === el ? el.clientHeight || defaultHeight : readBoxHeight(el)

    if (item) {
      top = readItemOffsetTop(item) - (root?.scrollTop || 0)
      height = el === item ? readBoxHeight(item) : readBoxHeight(el)
    }

    return {
      x: 0,
      y: top,
      top,
      right: hidden ? 0 : width,
      bottom: hidden ? 0 : top + height,
      left: 0,
      width: hidden ? 0 : width,
      height: hidden ? 0 : height,
      toJSON: () => ({}),
    } as DOMRect
  })
}

function adapterItemSource(threadKey: string, itemKey: string, revision?: string | number) {
  return {
    sourceKey: itemSourceKey(threadKey, itemKey, revision),
  }
}

describe('virtual timeline API', () => {
  beforeEach(() => {
    installRequestAnimationFrameStub()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders a mixed timeline and provides markdown virtual props to the slot', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(480)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(48)
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const slotProps: any[] = []
    const items = [
      { kind: 'system-divider', id: 'd1', text: 'Today' },
      { kind: 'user-message', id: 'u1', text: 'Analyze this' },
      { kind: 'tool-call', id: 'tool1', status: 'running', label: 'Reading PR' },
      { kind: 'assistant-markdown', id: 'a1', content: '# Result', final: true },
      { kind: 'error', id: 'e1', message: 'Retried' },
    ]

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items,
        threadKey: 'thread-a',
        overscan: 10,
        stickToBottom: false,
      },
      slots: {
        default(props: any) {
          slotProps.push(props)
          if (props.kind === 'assistant-markdown') {
            return h('div', {
              'data-testid': 'markdown-slot',
              'data-session-key': props.markdownProps.virtualScroll.sessionKey,
            }, props.markdownProps.content)
          }

          return h('div', {
            'ref': props.measureRef,
            'data-kind': props.kind,
          }, props.item.text ?? props.item.label ?? props.item.message)
        },
      },
    })

    await flushAll()
    await nextTick()

    expect(wrapper.text()).toContain('Analyze this')
    expect(wrapper.text()).toContain('Reading PR')
    expect(wrapper.text()).toContain('# Result')

    const markdownSlot = slotProps.find(props => props.kind === 'assistant-markdown')
    expect(markdownSlot.markdownProps.nodeVirtual).toBe('auto')
    expect(markdownSlot.markdownProps.mode).toBe('docs')
    expect(markdownSlot.markdownProps.codeRenderer).toBe('monaco')
    expect(markdownSlot.markdownProps.virtualScroll.enabled).toBe(true)
    expect(markdownSlot.markdownProps.virtualScroll.threadKey).toBe('thread-a')
    expect(markdownSlot.markdownProps.virtualScroll.sessionKey).toBe('thread-a:a1:')
    expect(markdownSlot.markdownProps.fade).toBe(false)

    wrapper.unmount()
  })

  it('defaults timeline chat mode markdown code renderer to pre', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(480)
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const slotProps: any[] = []
    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items: [
          {
            kind: 'assistant-markdown',
            id: 'a1',
            content: '```ts\nconsole.log(1)\n```',
            final: true,
          },
        ],
        threadKey: 'thread-chat',
        markdownMode: 'chat',
        overscan: 10,
        stickToBottom: false,
      },
      slots: {
        default(props: any) {
          slotProps.push(props)
          return h('div', { ref: props.measureRef }, props.markdownProps.content)
        },
      },
    })

    await flushAll()
    await nextTick()

    const markdownSlot = slotProps.find(props => props.kind === 'assistant-markdown')
    expect(markdownSlot.markdownProps.mode).toBe('chat')
    expect(markdownSlot.markdownProps.codeRenderer).toBe('pre')

    wrapper.unmount()
  })

  it('allows timeline chat mode to opt back into monaco code renderer', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(480)
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const slotProps: any[] = []
    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items: [
          {
            kind: 'assistant-markdown',
            id: 'a1',
            content: '```ts\nconsole.log(1)\n```',
            final: true,
          },
        ],
        threadKey: 'thread-chat-rich',
        markdownMode: 'chat',
        markdownCodeRenderer: 'monaco',
        overscan: 10,
        stickToBottom: false,
      },
      slots: {
        default(props: any) {
          slotProps.push(props)
          return h('div', { ref: props.measureRef }, props.markdownProps.content)
        },
      },
    })

    await flushAll()
    await nextTick()

    const markdownSlot = slotProps.find(props => props.kind === 'assistant-markdown')
    expect(markdownSlot.markdownProps.mode).toBe('chat')
    expect(markdownSlot.markdownProps.codeRenderer).toBe('monaco')

    wrapper.unmount()
  })

  it('keeps delayed markdown metrics tied to the original timeline record after reorder', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const state = reactive({
      items: [
        { id: 'a', kind: 'assistant-markdown', content: 'A', revision: 1, final: false },
        { id: 'b', kind: 'assistant-markdown', content: 'B', revision: 2, final: false },
      ],
    })
    const slotProps: any[] = []

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items: state.items,
        threadKey: 'thread-reorder',
        stickToBottom: false,
        overscan: 10,
        estimateItemHeight: () => 100,
      },
      slots: {
        default(props: any) {
          slotProps.push(props)
          return h('div', { ref: props.measureRef }, props.markdownProps.content)
        },
      },
    })

    await flushAll()
    await nextTick()

    const originalA = slotProps.find(props => props.itemKey === 'a')
    expect(originalA.markdownProps.virtualScroll.sessionKey).toBe('thread-reorder:a:1')

    state.items.reverse()
    await nextTick()
    await flushAll()

    originalA.markdownProps.onHeightChange(
      createMetrics(240, originalA.markdownProps.virtualScroll.sessionKey),
    )

    expect(wrapper.emitted('height-change')?.at(-1)?.[0]).toMatchObject({
      itemKey: 'a',
      metrics: {
        sessionKey: 'thread-reorder:a:1',
      },
    })

    wrapper.unmount()
  })

  it('passes renderer-scoped markdown restore state through timeline slot props', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(480)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200)
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const items = [
      { kind: 'assistant-markdown', id: 'a1', content: '# Restored', final: true, revision: 1 },
    ]
    const state: MarkstreamVirtualState = {
      sessionKey: 'thread-a:a1:1',
      threadKey: 'thread-a',
      metrics: createMetrics(180, 'thread-a:a1:1'),
      width: 640,
      measurementKey: ':800\u0000light\u0000code-rich',
    }
    let restoreState: MarkstreamVirtualState | null | undefined

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items,
        threadKey: 'thread-a',
        stickToBottom: false,
        initialThreadState: {
          threadKey: 'thread-a',
          measurementKey: ':800',
          widthBucket: 800,
          outerAnchor: {
            type: 'item',
            itemKey: 'a1',
            offsetWithinItemPx: 0,
          },
          itemHeights: { a1: 200 },
          itemSizeSources: {
            a1: timelineItemSource('thread-a', 'a1', 1),
          },
          markdownStates: { a1: state },
        },
      },
      slots: {
        default(props: any) {
          restoreState = props.markdownProps.virtualScroll.restoreState

          return h('div', { ref: props.measureRef }, props.markdownProps.content)
        },
      },
    })

    await nextTick()

    expect(restoreState?.measurementKey).toBe(':800\u0000light\u0000code-rich')
    expect(restoreState?.sessionKey).toBe('thread-a:a1:1')

    wrapper.unmount()
  })

  it('uses layoutRevision instead of scanning items for stable content updates', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(480)
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const getKind = vi.fn((item: any) => item.kind)
    const slotContents: string[] = []
    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items: [
          { kind: 'assistant-markdown', id: 'a1', content: '# A', final: false },
        ],
        threadKey: 'thread-a',
        layoutRevision: 1,
        getKind,
        overscan: 10,
        stickToBottom: false,
      },
      slots: {
        default(props: any) {
          slotContents.push(props.markdownProps.content)
          return h('div', { ref: props.measureRef }, props.markdownProps.content)
        },
      },
    })

    await flushAll()
    await nextTick()

    const callsAfterInitialLayout = getKind.mock.calls.length

    await wrapper.setProps({
      items: [
        { kind: 'assistant-markdown', id: 'a1', content: '# B', final: false },
      ],
      layoutRevision: 1,
    })
    await flushAll()
    await nextTick()

    expect(getKind).toHaveBeenCalledTimes(callsAfterInitialLayout)
    expect(slotContents.at(-1)).toBe('# B')

    await wrapper.setProps({ layoutRevision: 2 })
    await flushAll()
    await nextTick()

    expect(getKind.mock.calls.length).toBeGreaterThan(callsAfterInitialLayout)

    wrapper.unmount()
  })

  it('does not rebuild timeline layout when only markdown final changes', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const state = reactive({
      items: [
        { kind: 'assistant-markdown', id: 'a1', content: '# A', final: false },
        { kind: 'user-message', id: 'u1', text: 'B' },
      ],
    })
    const estimateItemHeight = vi.fn(() => 100)
    const Host = defineComponent({
      setup() {
        return () => h(MarkstreamVirtualTimeline, {
          items: state.items,
          threadKey: 'thread-final',
          overscan: 10,
          stickToBottom: false,
          estimateItemHeight,
        }, {
          default(props: any) {
            return h('div', { ref: props.measureRef }, props.markdownProps?.content ?? props.item.text)
          },
        })
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    await flushAll()
    await nextTick()

    const callsAfterInitialLayout = estimateItemHeight.mock.calls.length

    state.items[0].final = true
    await nextTick()
    await flushAll()

    expect(estimateItemHeight).toHaveBeenCalledTimes(callsAfterInitialLayout)

    wrapper.unmount()
  })

  it('provides host scroll managed context to timeline children', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const observed: boolean[] = []

    const Probe = markRaw({
      name: 'HostManagedProbe',
      setup() {
        const hostScrollManaged = inject<{ value: boolean } | null>('markstreamHostScrollManaged', null)
        observed.push(hostScrollManaged?.value === true)
        return () => h('div', { 'data-testid': 'host-managed-probe' }, 'probe')
      },
    })

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items: [
          { kind: 'custom', id: 'probe', component: Probe },
        ],
        threadKey: 'thread-a',
        stickToBottom: false,
      },
    })

    await nextTick()

    expect(observed).toContain(true)
    expect(wrapper.find('[data-testid="host-managed-probe"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('allows opting markdown fade back in for virtual timelines and adapters', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(480)
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const items = [
      { kind: 'assistant-markdown', id: 'a1', content: '# Fade', final: true },
    ]
    const slotProps: any[] = []

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items,
        threadKey: 'thread-a',
        markdownFade: true,
      },
      slots: {
        default(props: any) {
          slotProps.push(props)
          return h('div', { ref: props.measureRef }, props.markdownProps.content)
        },
      },
    })

    await nextTick()

    expect(slotProps.at(-1).markdownProps.fade).toBe(true)

    wrapper.unmount()

    const root = document.createElement('div')
    const adapter = {
      getScrollElement: () => root,
      getScrollTop: () => 0,
      setScrollTop: vi.fn(),
      getViewportHeight: () => 400,
      getTotalHeight: () => 360,
      getItemOffset: () => 0,
      getItemSize: () => 360,
      setItemSize: vi.fn(),
      getVisibleRange: () => ({ start: 0, end: 1 }),
      scrollToOffset: vi.fn(),
      scrollToIndex: vi.fn(),
    }

    const scope = effectScope()
    const controller = scope.run(() => useMarkstreamVirtualAdapter({
      items,
      threadKey: 'thread-a',
      markdownFade: true,
      virtualizer: adapter,
    }))!

    expect(controller.markdownProps(items[0], 0).fade).toBe(true)

    scope.stop()
  })

  it('does not reuse timeline row DOM across threads with identical item keys', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const threadA = [
      { kind: 'user-message', id: '1', text: 'Thread A user' },
      { kind: 'assistant-markdown', id: '2', content: '# Thread A markdown', final: true },
    ]
    const threadB = [
      { kind: 'user-message', id: '1', text: 'Thread B user' },
      { kind: 'assistant-markdown', id: '2', content: '# Thread B markdown', final: true },
    ]

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items: threadA,
        threadKey: 'thread-a',
        overscan: 10,
        stickToBottom: false,
      },
      slots: {
        default(props: any) {
          const text = props.item.text ?? props.markdownProps?.content ?? ''
          return h('div', {
            'ref': props.measureRef,
            'data-thread-row': text,
          }, text)
        },
      },
    })

    await flushAll()
    await nextTick()

    expect(wrapper.text()).toContain('Thread A user')
    expect(wrapper.text()).toContain('Thread A markdown')

    const firstThreadRows = wrapper
      .findAll('.markstream-virtual-timeline__item')
      .map(row => row.element)

    await wrapper.setProps({
      items: threadB,
      threadKey: 'thread-b',
    })

    await nextTick()
    await flushAnimationFrame()

    const secondThreadRows = wrapper
      .findAll('.markstream-virtual-timeline__item')
      .map(row => row.element)

    expect(wrapper.text()).toContain('Thread B user')
    expect(wrapper.text()).toContain('Thread B markdown')
    expect(wrapper.text()).not.toContain('Thread A user')
    expect(wrapper.text()).not.toContain('Thread A markdown')
    expect(secondThreadRows[0]).not.toBe(firstThreadRows[0])
    expect(secondThreadRows[1]).not.toBe(firstThreadRows[1])

    wrapper.unmount()
  })

  it('connects markdown logical height and non-markdown measurements to an outer adapter', () => {
    const items = [
      { kind: 'user-message', id: 'u1', text: 'hello' },
      { kind: 'assistant-markdown', id: 'a1', content: '# Hello', final: true },
    ]
    const sizes = new Map<string, number>()
    const root = document.createElement('div')
    const adapter = {
      getScrollElement: () => root,
      getScrollTop: () => 0,
      setScrollTop: vi.fn(),
      getViewportHeight: () => 400,
      getTotalHeight: () => 0,
      getItemOffset: () => 0,
      getItemSize: (key: string) => sizes.get(key) ?? 0,
      setItemSize: (key: string, size: number) => {
        sizes.set(key, size)
      },
      getVisibleRange: () => ({ start: 0, end: 2 }),
      scrollToOffset: vi.fn(),
      scrollToIndex: vi.fn(),
    }

    const scope = effectScope()
    const controller = scope.run(() => useMarkstreamVirtualAdapter({
      items,
      threadKey: 'thread-a',
      virtualizer: adapter,
    }))!

    const userEl = document.createElement('div')
    Object.defineProperty(userEl, 'offsetHeight', {
      configurable: true,
      value: 56,
    })

    controller.measureItem(items[0], 0, userEl)
    expect(sizes.get('u1')).toBe(56)

    const markdownProps = controller.markdownProps(items[1], 1)
    markdownProps.onHeightChange(createMetrics(640, markdownProps.virtualScroll!.sessionKey!))
    expect(sizes.get('a1')).toBe(640)

    const state: MarkstreamVirtualState = {
      sessionKey: markdownProps.virtualScroll!.sessionKey!,
      metrics: createMetrics(640, markdownProps.virtualScroll!.sessionKey!),
      width: 640,
    }
    markdownProps.onVirtualStateChange(state)
    expect(controller.markdownStates.get('a1')).toStrictEqual(state)

    scope.stop()
  })

  it('passes markdown mode and code renderer through useMarkstreamVirtualAdapter', () => {
    const item = {
      kind: 'assistant-markdown',
      id: 'a1',
      content: '```ts\nconsole.log(1)\n```',
      final: true,
    }
    const root = document.createElement('div')
    const adapter = {
      getScrollElement: () => root,
      getScrollTop: () => 0,
      setScrollTop: vi.fn(),
      getViewportHeight: () => 480,
      getTotalHeight: () => 0,
      getItemOffset: () => 0,
      getItemSize: () => 100,
      setItemSize: vi.fn(),
      getVisibleRange: () => ({ start: 0, end: 1 }),
      scrollToOffset: vi.fn(),
      scrollToIndex: vi.fn(),
    }

    const scope = effectScope()
    const controller = scope.run(() => useMarkstreamVirtualAdapter({
      items: [item],
      threadKey: 'thread-a',
      markdownMode: 'chat',
      markdownCodeRenderer: 'pre',
      virtualizer: adapter,
    }))!

    const props = controller.markdownProps(item, 0)

    expect(props.mode).toBe('chat')
    expect(props.codeRenderer).toBe('pre')

    scope.stop()
  })

  it('defaults adapter chat mode markdown code renderer to pre', () => {
    const item = {
      kind: 'assistant-markdown',
      id: 'a1',
      content: '```ts\nconsole.log(1)\n```',
      final: true,
    }
    const root = document.createElement('div')
    const adapter = {
      getScrollElement: () => root,
      getScrollTop: () => 0,
      setScrollTop: vi.fn(),
      getViewportHeight: () => 480,
      getTotalHeight: () => 0,
      getItemOffset: () => 0,
      getItemSize: () => 100,
      setItemSize: vi.fn(),
      getVisibleRange: () => ({ start: 0, end: 1 }),
      scrollToOffset: vi.fn(),
      scrollToIndex: vi.fn(),
    }

    const scope = effectScope()
    const controller = scope.run(() => useMarkstreamVirtualAdapter({
      items: [item],
      threadKey: 'thread-a',
      markdownMode: 'chat',
      virtualizer: adapter,
    }))!

    const props = controller.markdownProps(item, 0)

    expect(props.mode).toBe('chat')
    expect(props.codeRenderer).toBe('pre')

    scope.stop()
  })

  it('passes renderer-scoped markdown restore state through adapter props', () => {
    const items = [
      { kind: 'assistant-markdown', id: 'a1', content: '# Hello', final: true },
    ]
    const root = document.createElement('div')
    const adapter = {
      getScrollElement: () => root,
      getScrollTop: () => 0,
      setScrollTop: vi.fn(),
      getViewportHeight: () => 400,
      getTotalHeight: () => 0,
      getItemOffset: () => 0,
      getItemSize: () => 0,
      setItemSize: vi.fn(),
      getVisibleRange: () => ({ start: 0, end: 1 }),
      scrollToOffset: vi.fn(),
      scrollToIndex: vi.fn(),
    }

    const scope = effectScope()
    const controller = scope.run(() => useMarkstreamVirtualAdapter({
      items,
      threadKey: 'thread-a',
      measurementKey: ':800',
      virtualizer: adapter,
    }))!

    const markdownProps = controller.markdownProps(items[0], 0)
    const state: MarkstreamVirtualState = {
      sessionKey: markdownProps.virtualScroll!.sessionKey!,
      threadKey: 'thread-a',
      metrics: createMetrics(640, markdownProps.virtualScroll!.sessionKey!),
      width: 640,
      measurementKey: ':800\u0000light\u0000code-rich',
    }

    markdownProps.onVirtualStateChange(state)

    expect(controller.markdownProps(items[0], 0).virtualScroll!.restoreState).toBe(state)

    scope.stop()
  })

  it('includes measured item vertical margins in timeline item height', () => {
    const items = [
      { kind: 'user-message', id: 'u1', text: 'hello' },
    ]
    const sizes = new Map<string, number>()
    const root = document.createElement('div')
    const adapter = {
      getScrollElement: () => root,
      getScrollTop: () => 0,
      setScrollTop: vi.fn(),
      getViewportHeight: () => 400,
      getTotalHeight: () => sizes.get('u1') ?? 0,
      getItemOffset: () => 0,
      getItemSize: (key: string) => sizes.get(key) ?? 0,
      setItemSize: (key: string, size: number) => {
        sizes.set(key, size)
      },
      getVisibleRange: () => ({ start: 0, end: 1 }),
      scrollToOffset: vi.fn(),
      scrollToIndex: vi.fn(),
    }

    const scope = effectScope()
    const controller = scope.run(() => useMarkstreamVirtualAdapter({
      items,
      threadKey: 'thread-a',
      virtualizer: adapter,
    }))!

    const el = document.createElement('article')
    el.style.marginTop = '10px'
    el.style.marginBottom = '12px'
    Object.defineProperty(el, 'offsetHeight', {
      configurable: true,
      value: 100,
    })
    Object.defineProperty(el, 'scrollHeight', {
      configurable: true,
      value: 100,
    })

    controller.measureItem(items[0], 0, el)

    expect(sizes.get('u1')).toBe(122)

    scope.stop()
  })

  it('adds wrapper chrome to markdown logical height when logical height is larger than mounted DOM', () => {
    const items = [
      { kind: 'assistant-markdown', id: 'a1', content: '# Hello', final: true },
    ]
    const sizes = new Map<string, number>()
    const root = document.createElement('div')
    const adapter = {
      getScrollElement: () => root,
      getScrollTop: () => 0,
      setScrollTop: vi.fn(),
      getViewportHeight: () => 400,
      getTotalHeight: () => sizes.get('a1') ?? 0,
      getItemOffset: () => 0,
      getItemSize: (key: string) => sizes.get(key) ?? 0,
      setItemSize: (key: string, size: number) => {
        sizes.set(key, size)
      },
      getVisibleRange: () => ({ start: 0, end: 1 }),
      scrollToOffset: vi.fn(),
      scrollToIndex: vi.fn(),
      measureElement: vi.fn(),
    }

    const scope = effectScope()
    const controller = scope.run(() => useMarkstreamVirtualAdapter({
      items,
      threadKey: 'thread-a',
      virtualizer: adapter,
    }))!

    const wrapperEl = document.createElement('article')
    wrapperEl.style.marginTop = '10px'
    wrapperEl.style.marginBottom = '10px'

    const rendererEl = document.createElement('div')
    rendererEl.className = 'markstream-vue markdown-renderer'
    wrapperEl.appendChild(rendererEl)

    Object.defineProperty(wrapperEl, 'offsetHeight', {
      configurable: true,
      value: 140,
    })
    Object.defineProperty(wrapperEl, 'scrollHeight', {
      configurable: true,
      value: 140,
    })
    Object.defineProperty(rendererEl, 'offsetHeight', {
      configurable: true,
      value: 100,
    })
    Object.defineProperty(rendererEl, 'scrollHeight', {
      configurable: true,
      value: 100,
    })

    controller.measureItem(items[0], 0, wrapperEl)

    const markdownProps = controller.markdownProps(items[0], 0)
    markdownProps.onHeightChange(
      createMetrics(1000, markdownProps.virtualScroll!.sessionKey!),
    )

    expect(sizes.get('a1')).toBe(1060)

    scope.stop()
  })

  it('does not under-report markdown item height when the measured wrapper includes chrome', () => {
    const items = [
      { kind: 'assistant-markdown', id: 'a1', content: '# Hello', final: true },
    ]
    const sizes = new Map<string, number>()
    const root = document.createElement('div')
    const adapter = {
      getScrollElement: () => root,
      getScrollTop: () => 0,
      setScrollTop: vi.fn(),
      getViewportHeight: () => 400,
      getTotalHeight: () => sizes.get('a1') ?? 0,
      getItemOffset: () => 0,
      getItemSize: (key: string) => sizes.get(key) ?? 0,
      setItemSize: (key: string, size: number) => {
        sizes.set(key, size)
      },
      getVisibleRange: () => ({ start: 0, end: 1 }),
      scrollToOffset: vi.fn(),
      scrollToIndex: vi.fn(),
      measureElement: vi.fn(),
    }

    const scope = effectScope()
    const controller = scope.run(() => useMarkstreamVirtualAdapter({
      items,
      threadKey: 'thread-a',
      virtualizer: adapter,
    }))!

    const wrapperEl = document.createElement('article')
    Object.defineProperty(wrapperEl, 'offsetHeight', {
      configurable: true,
      value: 720,
    })
    Object.defineProperty(wrapperEl, 'scrollHeight', {
      configurable: true,
      value: 720,
    })

    controller.measureItem(items[0], 0, wrapperEl)

    const markdownProps = controller.markdownProps(items[0], 0)
    markdownProps.onHeightChange(
      createMetrics(640, markdownProps.virtualScroll!.sessionKey!),
    )

    expect(sizes.get('a1')).toBe(720)

    scope.stop()
  })

  it('keeps markdown item height as max(wrapper height, markdown logical height)', () => {
    const items = [
      { kind: 'assistant-markdown', id: 'a1', content: '# Hello', final: true },
    ]
    const sizes = new Map<string, number>()
    const root = document.createElement('div')
    let wrapperHeight = 500
    const adapter = {
      getScrollElement: () => root,
      getScrollTop: () => 0,
      setScrollTop: vi.fn(),
      getViewportHeight: () => 400,
      getTotalHeight: () => sizes.get('a1') ?? 0,
      getItemOffset: () => 0,
      getItemSize: (key: string) => sizes.get(key) ?? 0,
      setItemSize: (key: string, size: number) => {
        sizes.set(key, size)
      },
      getVisibleRange: () => ({ start: 0, end: 1 }),
      scrollToOffset: vi.fn(),
      scrollToIndex: vi.fn(),
      measureElement: vi.fn(),
    }

    const scope = effectScope()
    const controller = scope.run(() => useMarkstreamVirtualAdapter({
      items,
      threadKey: 'thread-a',
      virtualizer: adapter,
    }))!

    const wrapperEl = document.createElement('article')
    Object.defineProperty(wrapperEl, 'offsetHeight', {
      configurable: true,
      get: () => wrapperHeight,
    })
    Object.defineProperty(wrapperEl, 'scrollHeight', {
      configurable: true,
      get: () => wrapperHeight,
    })

    controller.measureItem(items[0], 0, wrapperEl)

    const markdownProps = controller.markdownProps(items[0], 0)
    markdownProps.onHeightChange(
      createMetrics(640, markdownProps.virtualScroll!.sessionKey!),
    )

    expect(sizes.get('a1')).toBe(640)

    wrapperHeight = 720
    controller.measureItem(items[0], 0, wrapperEl)
    markdownProps.onHeightChange(
      createMetrics(640, markdownProps.virtualScroll!.sessionKey!),
    )

    expect(sizes.get('a1')).toBe(720)

    scope.stop()
  })

  it('does not shrink restored markdown item height to partial mounted DOM during thread restore', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    let measuredHeight = 120
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
      const el = this as HTMLElement
      if (el.dataset.kind === 'assistant-markdown')
        return measuredHeight
      return 48
    })
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function () {
      const el = this as HTMLElement
      if (el.dataset.kind === 'assistant-markdown')
        return measuredHeight
      return 48
    })

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const items = [
      { kind: 'assistant-markdown', id: 'a1', content: '# A', final: true, revision: 1 },
      { kind: 'user-message', id: 'u1', text: 'anchor' },
    ]

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items,
        threadKey: 'thread-a',
        overscan: 10,
        stickToBottom: false,
      },
      slots: {
        default(props: any) {
          return h('div', {
            'ref': props.measureRef,
            'data-kind': props.kind,
          }, props.markdownProps?.content ?? props.item.text ?? '')
        },
      },
    })

    await flushAll()
    await nextTick()

    ;(wrapper.vm as any).restoreThreadState({
      threadKey: 'thread-a',
      measurementKey: ':800',
      widthBucket: 800,
      outerAnchor: {
        type: 'item',
        itemKey: 'a1',
        offsetWithinItemPx: 40,
      },
      itemHeights: {
        a1: 1060,
        u1: 80,
      },
      itemSizeSources: {
        a1: timelineItemSource('thread-a', 'a1', 1),
        u1: timelineItemSource('thread-a', 'u1'),
      },
      markdownStates: {
        a1: {
          sessionKey: 'thread-a:a1:1',
          threadKey: 'thread-a',
          metrics: createMetrics(1000, 'thread-a:a1:1'),
          width: 800,
          measurementKey: ':800',
        } as MarkstreamVirtualState,
      },
    })
    await nextTick()

    expect((wrapper.vm as any).getItemSize('a1')).toBe(1060)

    measuredHeight = 140
    await nextTick()

    expect((wrapper.vm as any).getItemSize('a1')).toBe(1060)

    wrapper.unmount()
  })

  it('releases restored timeline item height floor after restore reveal', async () => {
    vi.useFakeTimers()

    let wrapper: any

    try {
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

      let measuredHeight = 120
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
        const el = this as HTMLElement
        if (el.classList.contains('markstream-virtual-timeline__item'))
          return Number.parseFloat(el.style.minHeight || '') || 48
        if (el.dataset.kind === 'assistant-markdown')
          return measuredHeight
        return 48
      })
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function () {
        const el = this as HTMLElement
        if (el.dataset.kind === 'assistant-markdown')
          return measuredHeight
        return 48
      })
      installVirtualTimelineGeometryStub()

      vi.stubGlobal('ResizeObserver', class {
        observe() {}
        unobserve() {}
        disconnect() {}
      })

      const items = [
        { kind: 'assistant-markdown', id: 'a1', content: '# A', final: true, revision: 1 },
        { kind: 'user-message', id: 'u1', text: 'anchor' },
      ]

      const slotProps: any[] = []
      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items,
          threadKey: 'thread-a',
          overscan: 10,
          stickToBottom: false,
        },
        slots: {
          default(props: any) {
            slotProps.push(props)
            return h('div', {
              'ref': props.measureRef,
              'data-kind': props.kind,
            }, props.markdownProps?.content ?? props.item.text ?? '')
          },
        },
      })

      await nextTick()

      ;(wrapper.vm as any).restoreThreadState({
        threadKey: 'thread-a',
        measurementKey: ':800',
        widthBucket: 800,
        outerAnchor: {
          type: 'item',
          itemKey: 'a1',
          offsetWithinItemPx: 40,
        },
        itemHeights: {
          a1: 1060,
          u1: 80,
        },
        itemSizeSources: {
          a1: timelineItemSource('thread-a', 'a1', 1),
          u1: timelineItemSource('thread-a', 'u1'),
        },
        markdownStates: {
          a1: {
            sessionKey: 'thread-a:a1:1',
            threadKey: 'thread-a',
            metrics: createMetrics(1000, 'thread-a:a1:1'),
            width: 800,
            measurementKey: ':800',
          } as MarkstreamVirtualState,
        },
      })

      await nextTick()

      expect((wrapper.vm as any).getItemSize('a1')).toBe(1060)

      await vi.advanceTimersByTimeAsync(700)
      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(false)
      expect((wrapper.vm as any).getItemSize('a1')).toBe(1060)

      measuredHeight = 140

      const markdownProps = slotProps.find(props => props.kind === 'assistant-markdown').markdownProps
      markdownProps.onHeightChange(createMetrics(140, 'thread-a:a1:1'))

      await nextTick()
      await vi.advanceTimersByTimeAsync(20)
      await nextTick()

      expect((wrapper.vm as any).getItemSize('a1')).toBe(140)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('reveals restored viewport with restored item height even when markdown metrics are mixed', async () => {
    vi.useFakeTimers()

    let wrapper: any

    try {
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
        const el = this as HTMLElement
        if (el.classList.contains('markstream-virtual-timeline__item'))
          return 1200
        return 1200
      })
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function () {
        const el = this as HTMLElement
        if (el.classList.contains('markstream-virtual-timeline__item'))
          return 1200
        return 1200
      })
      installVirtualTimelineGeometryStub(1200)

      vi.stubGlobal('ResizeObserver', class {
        observe() {}
        unobserve() {}
        disconnect() {}
      })

      const items = [
        { kind: 'assistant-markdown', id: 'm1', content: '# Large', final: true, revision: 1 },
      ]

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items,
          threadKey: 'thread-a',
          stickToBottom: false,
          initialThreadState: {
            threadKey: 'thread-a',
            measurementKey: ':800',
            widthBucket: 800,
            outerAnchor: {
              type: 'item',
              itemKey: 'm1',
              offsetWithinItemPx: 120,
            },
            itemHeights: {
              m1: 1200,
            },
            itemSizeSources: {
              m1: timelineItemSource('thread-a', 'm1', 1),
            },
            markdownStates: {
              m1: {
                sessionKey: 'thread-a:m1:1',
                threadKey: 'thread-a',
                measurementKey: ':800',
                width: 800,
                metrics: {
                  ...createMetrics(1000, 'thread-a:m1:1'),
                  final: false,
                  stable: false,
                  confidence: 'mixed',
                  nodeCount: 100,
                  measuredCount: 8,
                  estimatedCount: 92,
                },
              } as MarkstreamVirtualState,
            },
          },
        },
        slots: {
          default(props: any) {
            return h('div', { ref: props.measureRef }, [
              h('div', { class: 'markdown-renderer' }, props.markdownProps?.content ?? ''),
            ])
          },
          'restore-loading': () => h('div', { 'data-testid': 'restore-loading' }, 'Restoring'),
        },
      })

      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      await vi.advanceTimersByTimeAsync(500)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(false)
      expect(wrapper.find('[data-testid="restore-loading"]').exists()).toBe(false)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('does not shrink markdown item height from unstable intermediate metrics', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const slotProps: any[] = []

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items: [
          { kind: 'assistant-markdown', id: 'm1', content: '# Large', final: false, revision: 1 },
        ],
        threadKey: 'thread-a',
        overscan: 10,
        stickToBottom: false,
      },
      slots: {
        default(props: any) {
          slotProps.push(props)
          return h('div', { ref: props.measureRef }, props.markdownProps?.content ?? '')
        },
      },
    })

    await nextTick()

    const markdown = slotProps.find(props => props.kind === 'assistant-markdown')
    expect(markdown).toBeTruthy()

    const sessionKey = markdown.markdownProps.virtualScroll.sessionKey

    markdown.markdownProps.onHeightChange({
      ...createMetrics(1000, sessionKey),
      phase: 'measuring',
      stable: true,
      confidence: 'measured',
    })

    await nextTick()
    expect((wrapper.vm as any).getItemSize('m1')).toBe(1000)

    markdown.markdownProps.onHeightChange({
      ...createMetrics(640, sessionKey),
      phase: 'measuring',
      final: false,
      stable: false,
      confidence: 'mixed',
      measuredCount: 1,
      estimatedCount: 2,
    })

    await nextTick()
    await flushAnimationFrame()

    expect((wrapper.vm as any).getItemSize('m1')).toBe(1000)

    wrapper.unmount()
  })

  it('adapter does not shrink markdown item height from unstable intermediate metrics', async () => {
    const items = [
      { kind: 'assistant-markdown', id: 'm1', content: '# Large', final: false, revision: 1 },
    ]

    const sizes = new Map<string, number>()
    const root = document.createElement('div')

    const adapter = {
      getScrollElement: () => root,
      getScrollTop: () => 0,
      setScrollTop: vi.fn(),
      getViewportHeight: () => 300,
      getTotalHeight: () => sizes.get('m1') ?? 0,
      getItemOffset: () => 0,
      getItemSize: (key: string) => sizes.get(key) ?? 0,
      setItemSize: (key: string, size: number) => {
        sizes.set(key, size)
      },
      getVisibleRange: () => ({ start: 0, end: 1 }),
      scrollToOffset: vi.fn(),
      scrollToIndex: vi.fn(),
    }

    const scope = effectScope()

    const controller = scope.run(() => useMarkstreamVirtualAdapter({
      items,
      threadKey: 'thread-a',
      getRevision: item => item.revision,
      virtualizer: adapter,
    }))!

    const markdownProps = controller.markdownProps(items[0], 0)
    const sessionKey = markdownProps.virtualScroll!.sessionKey!

    markdownProps.onHeightChange({
      ...createMetrics(1000, sessionKey),
      phase: 'measuring',
      stable: true,
      confidence: 'measured',
    })

    expect(sizes.get('m1')).toBe(1000)

    markdownProps.onHeightChange({
      ...createMetrics(640, sessionKey),
      phase: 'measuring',
      final: false,
      stable: false,
      confidence: 'mixed',
      measuredCount: 1,
      estimatedCount: 2,
    })

    await nextTick()
    await flushAnimationFrame()

    expect(sizes.get('m1')).toBe(1000)

    scope.stop()
  })

  it('adapter does not shrink restored markdown height to partial DOM before markdown metrics arrive', () => {
    const items = [
      { kind: 'assistant-markdown', id: 'a1', content: '# A', final: true, revision: 1 },
    ]

    const sizes = new Map<string, number>()
    const root = document.createElement('div')

    const adapterHost = {
      getScrollElement: () => root,
      getScrollTop: () => 40,
      setScrollTop: vi.fn(),
      getViewportHeight: () => 300,
      getTotalHeight: () => sizes.get('a1') ?? 0,
      getItemOffset: () => 0,
      getItemSize: (key: string) => sizes.get(key) ?? 0,
      setItemSize: (key: string, size: number) => {
        sizes.set(key, size)
      },
      getVisibleRange: () => ({ start: 0, end: 1 }),
      scrollToOffset: vi.fn(),
      scrollToIndex: vi.fn(),
    }

    const scope = effectScope()
    const controller = scope.run(() => useMarkstreamVirtualAdapter({
      items,
      threadKey: 'thread-a',
      getRevision: item => item.revision,
      virtualizer: adapterHost,
    }))!

    controller.restoreThreadState({
      threadKey: 'thread-a',
      outerAnchor: {
        type: 'item',
        itemKey: 'a1',
        offsetWithinItemPx: 40,
      },
      itemHeights: {
        a1: 1060,
      },
      itemSizeSources: {
        a1: adapterItemSource('thread-a', 'a1', 1),
      },
      markdownStates: {
        a1: {
          sessionKey: 'thread-a:a1:1',
          threadKey: 'thread-a',
          metrics: createMetrics(1000, 'thread-a:a1:1'),
          width: 800,
        } as MarkstreamVirtualState,
      },
    })

    const el = document.createElement('article')
    Object.defineProperty(el, 'offsetHeight', {
      configurable: true,
      value: 120,
    })
    Object.defineProperty(el, 'scrollHeight', {
      configurable: true,
      value: 120,
    })

    controller.measureItem(items[0], 0, el)

    expect(sizes.get('a1')).toBe(1060)

    scope.stop()
  })

  it('starts pinned to bottom by default in auto stick mode', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const items = Array.from({ length: 5 }, (_, index) => ({
      kind: 'user-message',
      id: `u${index}`,
      text: `Message ${index}`,
    }))

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items,
        threadKey: 'thread-a',
      },
    })

    const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
    const expectedScrollTop = (wrapper.vm as any).getTotalHeight() - 300

    expect(root.scrollTop).toBe(expectedScrollTop)

    await flushAll()
    await nextTick()

    const anchor = (wrapper.vm as any).captureThreadState().outerAnchor

    expect(root.scrollTop).toBe(expectedScrollTop)
    expect(anchor?.type).toBe('bottom')

    wrapper.unmount()
  })

  it('captures the next item when scrollTop is exactly on an item boundary', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items: [
          { id: 'a', kind: 'user-message', text: 'A' },
          { id: 'b', kind: 'user-message', text: 'B' },
          { id: 'c', kind: 'user-message', text: 'C' },
        ],
        threadKey: 'thread-boundary',
        stickToBottom: false,
        overscan: 0,
        overscanPx: 0,
        estimateItemHeight: () => 100,
      },
    })

    await flushAll()

    const root = wrapper.get('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
    root.scrollTop = 100
    root.dispatchEvent(new Event('scroll'))
    await nextTick()

    expect((wrapper.vm as any).captureThreadState().outerAnchor).toEqual({
      type: 'item',
      itemKey: 'b',
      offsetWithinItemPx: 0,
    })

    wrapper.unmount()
  })

  it('keeps exact bottom pinning across consecutive markdown height growth before reconcile', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const items = [
      { kind: 'assistant-markdown', id: 'm1', content: '# Streaming', final: false, revision: 1 },
    ]

    let markdownProps: any

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items,
        threadKey: 'thread-a',
        stickToBottom: 'auto',
        overscan: 10,
      },
      slots: {
        default(props: any) {
          if (props.kind === 'assistant-markdown')
            markdownProps = props.markdownProps

          return h('div', { ref: props.measureRef }, props.markdownProps?.content ?? '')
        },
      },
    })

    await nextTick()
    await flushAnimationFrame()

    const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
    const sessionKey = markdownProps.virtualScroll.sessionKey

    // Simulate multiple streaming height reports before the previous
    // nextTick/RAF scroll reconcile has had a chance to apply.
    markdownProps.onHeightChange(createMetrics(600, sessionKey))
    markdownProps.onHeightChange(createMetrics(1000, sessionKey))

    await nextTick()
    await flushAnimationFrame()
    await nextTick()

    expect((wrapper.vm as any).getTotalHeight()).toBe(1000)
    expect(root.scrollTop).toBe(700)

    wrapper.unmount()
  })

  it('coalesces thread state emits during markdown streaming updates', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(80)

      vi.stubGlobal('ResizeObserver', class {
        observe() {}
        unobserve() {}
        disconnect() {}
      })

      const onThreadStateChange = vi.fn()
      let markdownProps: any

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: [
            { kind: 'assistant-markdown', id: 'a1', content: '# Streaming', final: false, revision: 1 },
          ],
          threadKey: 'thread-a',
          stickToBottom: false,
          overscan: 10,
          onThreadStateChange,
        },
        slots: {
          default(props: any) {
            if (props.kind === 'assistant-markdown')
              markdownProps = props.markdownProps

            return h('div', { ref: props.measureRef }, props.markdownProps?.content ?? '')
          },
        },
      })

      await nextTick()
      await vi.advanceTimersByTimeAsync(100)
      await nextTick()
      onThreadStateChange.mockClear()

      const sessionKey = markdownProps.virtualScroll.sessionKey

      markdownProps.onHeightChange(createMetrics(600, sessionKey))
      markdownProps.onHeightChange(createMetrics(700, sessionKey))
      markdownProps.onVirtualStateChange({
        sessionKey,
        threadKey: 'thread-a',
        metrics: createMetrics(700, sessionKey),
        width: 800,
        measurementKey: ':800',
      } as MarkstreamVirtualState)

      expect(onThreadStateChange).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(79)
      expect(onThreadStateChange).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)

      expect(onThreadStateChange).toHaveBeenCalledTimes(1)
      const state = onThreadStateChange.mock.calls[0]![0] as any
      expect(state.threadKey).toBe('thread-a')
      expect(state.itemHeights.a1).toBe(700)
      expect(state.markdownStates.a1.metrics.totalHeight).toBe(700)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('flushes pending thread state before switching threads', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(80)

      vi.stubGlobal('ResizeObserver', class {
        observe() {}
        unobserve() {}
        disconnect() {}
      })

      const onThreadStateChange = vi.fn()
      let markdownProps: any

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: [
            { kind: 'assistant-markdown', id: 'a1', content: '# A', final: false, revision: 1 },
          ],
          threadKey: 'thread-a',
          stickToBottom: false,
          overscan: 10,
          onThreadStateChange,
        },
        slots: {
          default(props: any) {
            if (props.kind === 'assistant-markdown')
              markdownProps = props.markdownProps

            return h('div', { ref: props.measureRef }, props.markdownProps?.content ?? '')
          },
        },
      })

      await nextTick()
      await vi.advanceTimersByTimeAsync(100)
      await nextTick()
      onThreadStateChange.mockClear()

      const sessionKey = markdownProps.virtualScroll.sessionKey
      markdownProps.onHeightChange(createMetrics(420, sessionKey))
      markdownProps.onVirtualStateChange({
        sessionKey,
        threadKey: 'thread-a',
        metrics: createMetrics(420, sessionKey),
        width: 800,
        measurementKey: ':800',
      } as MarkstreamVirtualState)

      expect(onThreadStateChange).not.toHaveBeenCalled()

      await wrapper.setProps({ threadKey: 'thread-b' })

      expect(onThreadStateChange).toHaveBeenCalledTimes(1)
      const state = onThreadStateChange.mock.calls[0]![0] as any
      expect(state.threadKey).toBe('thread-a')
      expect(state.itemHeights.a1).toBe(420)
      expect(state.markdownStates.a1.metrics.totalHeight).toBe(420)

      await vi.advanceTimersByTimeAsync(100)
      const previousThreadEmits = onThreadStateChange.mock.calls
        .filter(call => (call[0] as any).threadKey === 'thread-a')
      expect(previousThreadEmits).toHaveLength(1)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('does not hide the first mount when there is no restored thread state', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items: [
          { kind: 'user-message', id: 'u1', text: 'Hello' },
          { kind: 'assistant-markdown', id: 'm1', content: '# First', final: true },
        ],
        threadKey: 'thread-a',
      },
      slots: {
        default(props: any) {
          return h('div', { ref: props.measureRef }, props.item.text ?? props.markdownProps?.content ?? '')
        },
      },
    })
    const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement

    expect(root.classList.contains('is-restoring-thread')).toBe(false)

    await nextTick()

    expect(root.classList.contains('is-restoring-thread')).toBe(false)

    wrapper.unmount()
  })

  it('does not reveal a cold markdown thread before visible markdown metrics arrive', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
        const el = this as HTMLElement
        return Number.parseFloat(el.style.minHeight || '') || 360
      })
      installVirtualTimelineGeometryStub(360)

      vi.stubGlobal('ResizeObserver', class {
        observe() {}
        unobserve() {}
        disconnect() {}
      })

      const threadA = [
        { kind: 'user-message', id: 'a-u1', text: 'Thread A' },
      ]
      const threadB = [
        {
          kind: 'assistant-markdown',
          id: 'b-md',
          content: '# Cold thread\n\nMarkdown content',
          final: true,
          revision: 1,
        },
      ]

      let latestMarkdownProps: any

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: threadA,
          threadKey: 'thread-a',
          stickToBottom: false,
          overscan: 10,
        },
        slots: {
          default(props: any) {
            if (props.kind === 'assistant-markdown') {
              latestMarkdownProps = props.markdownProps

              return h('div', {
                ref: props.measureRef,
                class: 'markdown-renderer',
              }, [
                h('div', {
                  'class': 'node-slot',
                  'data-node-index': '0',
                  'data-node-type': 'heading',
                }, [
                  h('div', { class: 'node-content' }, [
                    h('h1', props.markdownProps.content),
                  ]),
                ]),
              ])
            }

            return h('div', { ref: props.measureRef }, props.item.text)
          },
        },
      })

      await nextTick()
      await vi.advanceTimersByTimeAsync(100)
      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(false)

      await wrapper.setProps({
        items: threadB,
        threadKey: 'thread-b',
      })
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      await vi.advanceTimersByTimeAsync(900)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      const sessionKey = latestMarkdownProps.virtualScroll.sessionKey
      const metrics = createMetrics(720, sessionKey)

      latestMarkdownProps.onHeightChange(metrics)
      latestMarkdownProps.onVirtualStateChange({
        sessionKey,
        threadKey: 'thread-b',
        metrics,
        width: 800,
        measurementKey: ':800',
      } as MarkstreamVirtualState)

      await vi.advanceTimersByTimeAsync(700)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(false)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('shows a non-layout restore loading overlay while restored thread state is settling', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
      const el = this as HTMLElement
      return Number.parseFloat(el.style.minHeight || '') || 80
    })
    installVirtualTimelineGeometryStub()

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const items = [
      { kind: 'user-message', id: 'u1', text: 'Top' },
      { kind: 'assistant-markdown', id: 'm1', content: '# Large', final: true, revision: 1 },
      { kind: 'user-message', id: 'u2', text: 'Bottom' },
    ]

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items,
        threadKey: 'thread-a',
        stickToBottom: false,
        initialThreadState: {
          threadKey: 'thread-a',
          measurementKey: ':800',
          widthBucket: 800,
          outerAnchor: {
            type: 'item',
            itemKey: 'm1',
            offsetWithinItemPx: 120,
          },
          itemHeights: {
            u1: 80,
            m1: 1200,
            u2: 80,
          },
          itemSizeSources: {
            u1: timelineItemSource('thread-a', 'u1'),
            m1: timelineItemSource('thread-a', 'm1', 1),
            u2: timelineItemSource('thread-a', 'u2'),
          },
          markdownStates: {},
        },
      },
      slots: {
        default(props: any) {
          return h('div', { ref: props.measureRef }, props.item.text ?? props.markdownProps?.content ?? '')
        },
        'restore-loading': () => h('div', { 'data-testid': 'restore-loading' }, 'Restoring'),
      },
    })

    const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement

    await nextTick()

    expect(root.classList.contains('is-restoring-thread')).toBe(true)
    expect(wrapper.find('.markstream-virtual-timeline__restore-loading').exists()).toBe(true)
    expect(wrapper.find('[data-testid="restore-loading"]').exists()).toBe(true)

    await flushThreadRestoreSettleWindow()
    await nextTick()

    expect(root.classList.contains('is-restoring-thread')).toBe(false)
    expect(wrapper.find('[data-testid="restore-loading"]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('treats mounted non-text nodes as ready during thread restore', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
      const el = this as HTMLElement
      if (el.classList.contains('markstream-virtual-timeline__item'))
        return 360
      return 24
    })
    installVirtualTimelineGeometryStub(360)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items: [
          { kind: 'assistant-markdown', id: 'm1', content: '---', final: true, revision: 1 },
        ],
        threadKey: 'thread-a',
        stickToBottom: false,
        initialThreadState: {
          threadKey: 'thread-a',
          measurementKey: ':800',
          widthBucket: 800,
          outerAnchor: {
            type: 'item',
            itemKey: 'm1',
            offsetWithinItemPx: 0,
          },
          itemHeights: {
            m1: 360,
          },
          itemSizeSources: {
            m1: timelineItemSource('thread-a', 'm1', 1),
          },
          markdownStates: {},
        },
      },
      slots: {
        default(props: any) {
          return h('div', { ref: props.measureRef }, [
            h('div', {
              'class': 'node-slot',
              'data-node-index': '0',
              'data-node-type': 'thematic_break',
            }, [
              h('div', { class: 'node-content' }, [
                h('hr', { class: 'hr-node' }),
              ]),
            ]),
          ])
        },
      },
    })

    const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
    expect(root.classList.contains('is-restoring-thread')).toBe(true)

    await waitForTimelineRestoreSettled(root)

    wrapper.unmount()
  })

  it('treats visible control-only node content as restore-ready', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(360)
    installVirtualTimelineGeometryStub(360)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items: [
          { kind: 'assistant-markdown', id: 'm1', content: '- [ ] task', final: true, revision: 1 },
        ],
        threadKey: 'thread-a',
        stickToBottom: false,
        initialThreadState: {
          threadKey: 'thread-a',
          measurementKey: ':800',
          widthBucket: 800,
          outerAnchor: {
            type: 'item',
            itemKey: 'm1',
            offsetWithinItemPx: 0,
          },
          itemHeights: { m1: 360 },
          itemSizeSources: {
            m1: timelineItemSource('thread-a', 'm1', 1),
          },
          markdownStates: {},
        },
      },
      slots: {
        default(props: any) {
          return h('div', { ref: props.measureRef }, [
            h('div', {
              'class': 'node-slot',
              'data-node-index': '0',
              'data-node-type': 'checkbox_input',
            }, [
              h('div', { class: 'node-content' }, [
                h('input', { 'type': 'checkbox', 'aria-label': 'task' }),
              ]),
            ]),
          ])
        },
      },
    })

    const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
    expect(root.classList.contains('is-restoring-thread')).toBe(true)

    await waitForTimelineRestoreSettled(root)

    expect(root.classList.contains('is-restoring-thread')).toBe(false)

    wrapper.unmount()
  })

  it('does not reveal a non-empty markdown record before its node slots mount', async () => {
    vi.useFakeTimers()

    let wrapper: any

    try {
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(360)
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        top: 0,
        right: 800,
        bottom: 360,
        left: 0,
        width: 800,
        height: 360,
        toJSON: () => ({}),
      } as DOMRect)

      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        return window.setTimeout(() => callback(performance.now()), 16)
      })
      vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
        window.clearTimeout(handle)
      })

      vi.stubGlobal('ResizeObserver', class {
        observe() {}
        unobserve() {}
        disconnect() {}
      })

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: [
            { kind: 'assistant-markdown', id: 'm1', content: '# Not mounted yet', final: true, revision: 1 },
          ],
          threadKey: 'thread-a',
          stickToBottom: false,
          initialThreadState: {
            threadKey: 'thread-a',
            measurementKey: ':800',
            widthBucket: 800,
            outerAnchor: {
              type: 'item',
              itemKey: 'm1',
              offsetWithinItemPx: 0,
            },
            itemHeights: { m1: 360 },
            itemSizeSources: {
              m1: timelineItemSource('thread-a', 'm1', 1),
            },
            markdownStates: {},
          },
        },
        slots: {
          default(props: any) {
            return h('div', {
              ref: props.measureRef,
              class: 'markdown-renderer',
            })
          },
        },
      })

      await nextTick()
      await vi.advanceTimersByTimeAsync(900)
      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(true)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('does not reveal restore loading when a visible code block shell is not ready', async () => {
    vi.useFakeTimers()

    let wrapper: any

    try {
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(360)
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        const el = this as HTMLElement
        const hidden = el.closest?.('.code-editor-container.is-hidden')
        return {
          x: 0,
          y: 0,
          top: 0,
          right: 800,
          bottom: hidden ? 0 : 360,
          left: 0,
          width: hidden ? 0 : 800,
          height: hidden ? 0 : 360,
          toJSON: () => ({}),
        } as DOMRect
      })

      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        return window.setTimeout(() => callback(performance.now()), 16)
      })
      vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
        window.clearTimeout(handle)
      })

      vi.stubGlobal('ResizeObserver', class {
        observe() {}
        unobserve() {}
        disconnect() {}
      })

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: [
            { kind: 'assistant-markdown', id: 'm1', content: 'code', final: true, revision: 1 },
          ],
          threadKey: 'thread-a',
          stickToBottom: false,
          initialThreadState: {
            threadKey: 'thread-a',
            measurementKey: ':800',
            widthBucket: 800,
            outerAnchor: {
              type: 'item',
              itemKey: 'm1',
              offsetWithinItemPx: 0,
            },
            itemHeights: { m1: 360 },
            itemSizeSources: {
              m1: timelineItemSource('thread-a', 'm1', 1),
            },
            markdownStates: {},
          },
        },
        slots: {
          default(props: any) {
            return h('div', {
              'ref': props.measureRef,
              'data-markstream-item-key': props.itemKey,
            }, [
              h('div', {
                'class': 'node-slot',
                'data-node-index': '0',
                'data-node-type': 'code_block',
              }, [
                h('div', { class: 'node-content' }, [
                  h('div', {
                    'data-markstream-code-block': '1',
                    'data-markstream-enhanced': 'false',
                  }, [
                    h('div', { class: 'code-editor-container is-hidden' }, [
                      h('div', { class: 'monaco-editor' }),
                    ]),
                  ]),
                ]),
              ]),
            ])
          },
        },
      })

      await nextTick()
      await vi.advanceTimersByTimeAsync(100)
      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      await vi.advanceTimersByTimeAsync(700)
      await nextTick()

      // Without a ready fallback or visible Monaco surface, restore loading stays visible.
      expect(root.classList.contains('is-restoring-thread')).toBe(true)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('does not treat a fading code fallback as restore-ready before Monaco is visible', async () => {
    vi.useFakeTimers()

    let wrapper: any

    try {
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(360)
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        const el = this as HTMLElement
        const hidden = el.closest?.('.code-editor-container.is-hidden')
        return {
          x: 0,
          y: 0,
          top: 0,
          right: 800,
          bottom: hidden ? 0 : 360,
          left: 0,
          width: hidden ? 0 : 800,
          height: hidden ? 0 : 360,
          toJSON: () => ({}),
        } as DOMRect
      })

      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        return window.setTimeout(() => callback(performance.now()), 16)
      })
      vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
        window.clearTimeout(handle)
      })

      vi.stubGlobal('ResizeObserver', class {
        observe() {}
        unobserve() {}
        disconnect() {}
      })

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: [
            { kind: 'assistant-markdown', id: 'm1', content: 'code', final: true, revision: 1 },
          ],
          threadKey: 'thread-a',
          stickToBottom: false,
          initialThreadState: {
            threadKey: 'thread-a',
            measurementKey: ':800',
            widthBucket: 800,
            outerAnchor: {
              type: 'item',
              itemKey: 'm1',
              offsetWithinItemPx: 0,
            },
            itemHeights: { m1: 360 },
            itemSizeSources: {
              m1: timelineItemSource('thread-a', 'm1', 1),
            },
            markdownStates: {},
          },
        },
        slots: {
          default(props: any) {
            return h('div', {
              ref: props.measureRef,
            }, [
              h('div', {
                'class': 'node-slot',
                'data-node-index': '0',
                'data-node-type': 'code_block',
              }, [
                h('div', { class: 'node-content' }, [
                  h('div', {
                    'data-markstream-code-block': '1',
                    'data-markstream-enhanced': 'false',
                  }, [
                    h('div', { class: 'code-editor-container is-hidden' }, [
                      h('div', { class: 'monaco-editor' }),
                    ]),
                    h('pre', { class: 'code-pre-fallback is-fading-out' }, 'fallback'),
                  ]),
                ]),
              ]),
            ])
          },
        },
      })

      await nextTick()
      await vi.advanceTimersByTimeAsync(100)
      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      await vi.advanceTimersByTimeAsync(700)
      await nextTick()

      // Without a ready fallback or visible Monaco surface, restore loading stays visible.
      expect(root.classList.contains('is-restoring-thread')).toBe(true)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('does not treat async code block loading fallback as restore-ready content', async () => {
    vi.useFakeTimers()

    let wrapper: any

    try {
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(360)
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        top: 0,
        right: 800,
        bottom: 360,
        left: 0,
        width: 800,
        height: 360,
        toJSON: () => ({}),
      } as DOMRect)

      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        return window.setTimeout(() => callback(performance.now()), 16)
      })
      vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
        window.clearTimeout(handle)
      })

      vi.stubGlobal('ResizeObserver', class {
        observe() {}
        unobserve() {}
        disconnect() {}
      })

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: [
            { kind: 'assistant-markdown', id: 'm1', content: 'code', final: true, revision: 1 },
          ],
          threadKey: 'thread-a',
          stickToBottom: false,
          initialThreadState: {
            threadKey: 'thread-a',
            measurementKey: ':800',
            widthBucket: 800,
            outerAnchor: {
              type: 'item',
              itemKey: 'm1',
              offsetWithinItemPx: 0,
            },
            itemHeights: { m1: 360 },
            itemSizeSources: {
              m1: timelineItemSource('thread-a', 'm1', 1),
            },
            markdownStates: {},
          },
        },
        slots: {
          default(props: any) {
            return h('div', { ref: props.measureRef }, [
              h('div', {
                'class': 'node-slot',
                'data-node-index': '0',
                'data-node-type': 'code_block',
              }, [
                h('div', { class: 'node-content' }, [
                  h('pre', {
                    'class': 'code-pre-fallback',
                    'data-markstream-pre': '1',
                    'data-markstream-code-loading': '1',
                  }, 'loading fallback'),
                ]),
              ]),
            ])
          },
        },
      })

      await nextTick()
      await vi.advanceTimersByTimeAsync(100)
      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      await vi.advanceTimersByTimeAsync(700)
      await nextTick()

      // Without a ready fallback or visible Monaco surface, restore loading stays visible.
      expect(root.classList.contains('is-restoring-thread')).toBe(true)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('does not treat visible mermaid pending placeholder as restore-ready code block content', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(360)
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        top: 0,
        right: 800,
        bottom: 360,
        left: 0,
        width: 800,
        height: 360,
        toJSON: () => ({}),
      } as DOMRect)

      vi.stubGlobal('ResizeObserver', class {
        observe() {}
        unobserve() {}
        disconnect() {}
      })

      let mermaidReady = false

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: [
            { kind: 'assistant-markdown', id: 'm1', content: 'mermaid', final: true, revision: 1 },
          ],
          threadKey: 'thread-a',
          stickToBottom: false,
          initialThreadState: {
            threadKey: 'thread-a',
            measurementKey: ':800',
            widthBucket: 800,
            outerAnchor: {
              type: 'item',
              itemKey: 'm1',
              offsetWithinItemPx: 0,
            },
            itemHeights: { m1: 360 },
            itemSizeSources: {
              m1: timelineItemSource('thread-a', 'm1', 1),
            },
            markdownStates: {},
          },
        },
        slots: {
          default(props: any) {
            return h('div', { ref: props.measureRef }, [
              h('div', {
                'class': 'node-slot',
                'data-node-index': '0',
                'data-node-type': 'code_block',
              }, [
                h('div', { class: 'node-content' }, [
                  h('div', {
                    'data-markstream-mermaid': '1',
                    'data-markstream-mode': mermaidReady ? 'preview' : 'pending',
                  }, mermaidReady
                    ? [h('svg', { width: 100, height: 100 })]
                    : [h('div', { class: 'mermaid-preview-area' })]),
                ]),
              ]),
            ])
          },
        },
      })

      await nextTick()
      await vi.advanceTimersByTimeAsync(900)
      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      mermaidReady = true
      await wrapper.setProps({ items: [...wrapper.props('items')] })
      await nextTick()
      await vi.advanceTimersByTimeAsync(700)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(false)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('preloads initial thread state before first visible render', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const items = [
      { kind: 'user-message', id: 'u1', text: 'Top' },
      { kind: 'assistant-markdown', id: 'm1', content: '# Large', final: true, revision: 1 },
      { kind: 'user-message', id: 'u2', text: 'Bottom' },
    ]

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items,
        threadKey: 'thread-a',
        stickToBottom: 'auto',
        initialThreadState: {
          threadKey: 'thread-a',
          measurementKey: ':800',
          widthBucket: 800,
          outerAnchor: {
            type: 'item',
            itemKey: 'm1',
            offsetWithinItemPx: 240,
          },
          itemHeights: {
            u1: 80,
            m1: 1200,
            u2: 80,
          },
          itemSizeSources: {
            u1: timelineItemSource('thread-a', 'u1'),
            m1: timelineItemSource('thread-a', 'm1', 1),
            u2: timelineItemSource('thread-a', 'u2'),
          },
          markdownStates: {},
        },
      },
      slots: {
        default(props: any) {
          return h('div', { ref: props.measureRef }, props.item.text ?? props.markdownProps?.content ?? '')
        },
      },
    })

    const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement

    expect((wrapper.vm as any).getItemSize('m1')).toBe(1200)
    expect(root.scrollTop).toBe(80 + 240)

    await nextTick()

    expect((wrapper.vm as any).getItemSize('m1')).toBe(1200)
    expect(root.scrollTop).toBe(80 + 240)

    wrapper.unmount()
  })

  it('drops restored item height when the same item key has a different revision', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items: [
          { kind: 'user-message', id: 'u1', text: 'Top' },
          { kind: 'assistant-markdown', id: 'm1', content: '# Short', final: true, revision: 2 },
          { kind: 'user-message', id: 'u2', text: 'Bottom' },
        ],
        threadKey: 'thread-a',
        stickToBottom: false,
        initialThreadState: {
          threadKey: 'thread-a',
          measurementKey: ':800',
          widthBucket: 800,
          itemHeights: {
            m1: 10000,
          },
          itemSizeSources: {
            m1: timelineItemSource('thread-a', 'm1', 1),
          },
          markdownStates: {},
        },
      },
      slots: {
        default(props: any) {
          return h('div', { ref: props.measureRef }, props.item.text ?? props.markdownProps?.content ?? '')
        },
      },
    })

    await nextTick()

    expect((wrapper.vm as any).getItemSize('m1')).toBeUndefined()
    expect((wrapper.vm as any).getTotalHeight()).toBeLessThan(10000)

    wrapper.unmount()
  })

  it('drops restored item heights when the width bucket changes', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(480)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items: [
          { kind: 'assistant-markdown', id: 'm1', content: '# Width changed', final: true, revision: 1 },
        ],
        threadKey: 'thread-a',
        stickToBottom: false,
        initialThreadState: {
          threadKey: 'thread-a',
          measurementKey: ':800',
          widthBucket: 800,
          itemHeights: {
            m1: 1200,
          },
          itemSizeSources: {
            m1: timelineItemSource('thread-a', 'm1', 1, 800),
          },
          markdownStates: {},
        },
      },
      slots: {
        default(props: any) {
          return h('div', { ref: props.measureRef }, props.markdownProps?.content ?? '')
        },
      },
    })

    await nextTick()

    expect((wrapper.vm as any).getItemSize('m1')).toBeUndefined()
    expect((wrapper.vm as any).getTotalHeight()).toBe(360)

    wrapper.unmount()
  })

  it('uses external initial state as a per-thread fallback after thread changes', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const threadAItems = [
      { kind: 'user-message', id: 'a-u1', text: 'A top' },
      { kind: 'assistant-markdown', id: 'a-m1', content: '# A large', final: true, revision: 1 },
      { kind: 'user-message', id: 'a-u2', text: 'A bottom' },
    ]
    const threadBItems = [
      { kind: 'user-message', id: 'b-u1', text: 'B top' },
      { kind: 'assistant-markdown', id: 'b-m1', content: '# B large', final: true, revision: 1 },
      { kind: 'user-message', id: 'b-u2', text: 'B bottom' },
    ]

    const threadAState = {
      threadKey: 'thread-a',
      measurementKey: ':800',
      widthBucket: 800,
      outerAnchor: {
        type: 'item' as const,
        itemKey: 'a-m1',
        offsetWithinItemPx: 240,
      },
      itemHeights: {
        'a-u1': 80,
        'a-m1': 1200,
        'a-u2': 80,
      },
      itemSizeSources: {
        'a-u1': timelineItemSource('thread-a', 'a-u1'),
        'a-m1': timelineItemSource('thread-a', 'a-m1', 1),
        'a-u2': timelineItemSource('thread-a', 'a-u2'),
      },
      markdownStates: {},
    }
    const threadBState = {
      threadKey: 'thread-b',
      measurementKey: ':800',
      widthBucket: 800,
      outerAnchor: {
        type: 'item' as const,
        itemKey: 'b-m1',
        offsetWithinItemPx: 120,
      },
      itemHeights: {
        'b-u1': 60,
        'b-m1': 900,
        'b-u2': 60,
      },
      itemSizeSources: {
        'b-u1': timelineItemSource('thread-b', 'b-u1'),
        'b-m1': timelineItemSource('thread-b', 'b-m1', 1),
        'b-u2': timelineItemSource('thread-b', 'b-u2'),
      },
      markdownStates: {},
    }

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items: threadAItems,
        threadKey: 'thread-a',
        stickToBottom: 'auto',
        initialThreadState: threadAState,
      },
      slots: {
        default(props: any) {
          return h('div', { ref: props.measureRef }, props.item.text ?? props.markdownProps?.content ?? '')
        },
      },
    })

    const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement

    expect(root.scrollTop).toBe(80 + 240)

    await wrapper.setProps({ initialThreadState: threadBState })
    await wrapper.setProps({
      items: threadBItems,
      threadKey: 'thread-b',
    })

    expect((wrapper.vm as any).getItemSize('b-m1')).toBe(900)
    expect(root.scrollTop).toBe(60 + 120)

    await wrapper.setProps({
      initialThreadState: {
        ...threadAState,
        outerAnchor: {
          type: 'item' as const,
          itemKey: 'a-u2',
          offsetWithinItemPx: 0,
        },
        itemHeights: {
          'a-u1': 10,
          'a-m1': 10,
          'a-u2': 10,
        },
        itemSizeSources: {
          'a-u1': timelineItemSource('thread-a', 'a-u1'),
          'a-m1': timelineItemSource('thread-a', 'a-m1', 1),
          'a-u2': timelineItemSource('thread-a', 'a-u2'),
        },
      },
    })
    await wrapper.setProps({
      items: threadAItems,
      threadKey: 'thread-a',
    })

    expect((wrapper.vm as any).getItemSize('a-m1')).toBe(1200)
    expect(root.scrollTop).toBe(80 + 240)

    wrapper.unmount()
  })

  it('ignores one-pixel timeline item size drift', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    let measuredHeight = 100
    const resizeCallbacks = new WeakMap<Element, ResizeObserverCallback>()

    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
      const el = this as HTMLElement
      if (el.dataset.timelineDeadbandItem === 'a1')
        return measuredHeight
      return 0
    })
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function () {
      const el = this as HTMLElement
      if (el.dataset.timelineDeadbandItem === 'a1')
        return measuredHeight
      return 0
    })
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

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items: [
          { kind: 'user-message', id: 'a1', text: 'stable code block' },
          { kind: 'user-message', id: 'u1', text: 'anchor item below' },
        ],
        threadKey: 'thread-a',
        overscan: 10,
        stickToBottom: false,
        estimateItemHeight: (item: any) => item.id === 'a1' ? 100 : 500,
      },
      slots: {
        default(props: any) {
          if (props.itemKey === 'a1') {
            return h('div', {
              'ref': props.measureRef,
              'data-timeline-deadband-item': props.itemKey,
            }, props.item.text)
          }

          return h('div', props.item.text)
        },
      },
    })

    await flushAll()
    await nextTick()

    const item = wrapper.find('[data-timeline-deadband-item="a1"]').element
    resizeCallbacks.get(item)?.([], {} as ResizeObserver)
    await nextTick()

    expect((wrapper.vm as any).getItemSize('a1')).toBe(100)

    measuredHeight = 101
    resizeCallbacks.get(item)?.([], {} as ResizeObserver)
    await nextTick()
    await flushAnimationFrame()

    expect((wrapper.vm as any).getItemSize('a1')).toBe(100)
    expect((wrapper.vm as any).getTotalHeight()).toBe(600)

    wrapper.unmount()
  })

  it('updates measured item height without re-estimating the full timeline', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    let firstItemHeight = 50
    const resizeCallbacks = new WeakMap<Element, ResizeObserverCallback>()

    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
      const el = this as HTMLElement
      if (el.dataset.timelineFenwickItem === 'item-0')
        return firstItemHeight
      if (el.dataset.timelineFenwickItem)
        return 50
      return 0
    })
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function () {
      const el = this as HTMLElement
      if (el.dataset.timelineFenwickItem === 'item-0')
        return firstItemHeight
      if (el.dataset.timelineFenwickItem)
        return 50
      return 0
    })
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

    const estimateItemHeight = vi.fn(() => 50)
    const items = Array.from({ length: 40 }, (_, index) => ({
      kind: 'user-message',
      id: `item-${index}`,
      text: `Item ${index}`,
    }))

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items,
        threadKey: 'thread-a',
        stickToBottom: false,
        estimateItemHeight,
      },
      slots: {
        default(props: any) {
          return h('div', {
            'ref': props.measureRef,
            'data-timeline-fenwick-item': props.item.id,
          }, props.item.text)
        },
      },
    })

    await flushAll()
    await nextTick()

    expect((wrapper.vm as any).getTotalHeight()).toBe(40 * 50)
    estimateItemHeight.mockClear()

    const firstItem = wrapper.get('[data-timeline-fenwick-item="item-0"]').element
    firstItemHeight = 120
    resizeCallbacks.get(firstItem)?.([], {} as ResizeObserver)
    await nextTick()
    await flushAnimationFrame()

    expect((wrapper.vm as any).getTotalHeight()).toBe((40 * 50) + 70)
    expect(estimateItemHeight).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('rebuilds layout when cheap non-markdown content signature changes without revision', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const state = reactive<{ items: any[] }>({
      items: [
        { kind: 'user-message', id: 'a1', text: 'Short' },
        { kind: 'user-message', id: 'u1', text: 'Anchor' },
      ],
    })
    const estimateItemHeight = vi.fn((item: any) => item.id === 'a1' && item.text.length > 20 ? 180 : 60)
    const Host = defineComponent({
      setup() {
        return () => h(MarkstreamVirtualTimeline, {
          items: state.items,
          threadKey: 'thread-a',
          overscan: 10,
          stickToBottom: false,
          estimateItemHeight,
        }, {
          default(props: any) {
            return h('div', { ref: props.measureRef }, props.item.text)
          },
        })
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })

    await flushAll()
    await nextTick()

    const timeline = wrapper.getComponent(MarkstreamVirtualTimeline)
    const timelineApi = (timeline.vm as any).$?.exposed
    expect(timelineApi.getTotalHeight()).toBe(120)

    estimateItemHeight.mockClear()
    state.items[0].text = 'This text is long enough to change the estimated height'
    await nextTick()
    await flushAll()

    expect(timelineApi.getTotalHeight()).toBe(240)
    expect(estimateItemHeight).toHaveBeenCalled()

    wrapper.unmount()
  })

  it('rebuilds layout when same-length non-markdown content changes in the middle', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const state = reactive<{ items: any[] }>({
      items: [
        {
          kind: 'user-message',
          id: 'a1',
          text: `${'x'.repeat(80)} ${'y'.repeat(80)}`,
        },
        { kind: 'user-message', id: 'u1', text: 'Anchor' },
      ],
    })
    const estimateItemHeight = vi.fn((item: any) => {
      return String(item.text).includes('\n') ? 180 : 60
    })
    const Host = defineComponent({
      setup() {
        return () => h(MarkstreamVirtualTimeline, {
          items: state.items,
          threadKey: 'same-length-middle-change',
          overscan: 10,
          stickToBottom: false,
          estimateItemHeight,
        }, {
          default(props: any) {
            return h('div', { ref: props.measureRef }, props.item.text)
          },
        })
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })

    await flushAll()
    await nextTick()

    const timeline = wrapper.getComponent(MarkstreamVirtualTimeline)
    const timelineApi = (timeline.vm as any).$?.exposed
    expect(timelineApi.getTotalHeight()).toBe(120)

    estimateItemHeight.mockClear()
    state.items[0].text = `${'x'.repeat(80)}\n${'y'.repeat(80)}`
    await nextTick()
    await flushAll()

    expect(timelineApi.getTotalHeight()).toBe(240)
    expect(estimateItemHeight).toHaveBeenCalled()

    wrapper.unmount()
  })

  it('rebuilds timeline layout when estimateItemHeight output changes without explicit layoutRevision', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const state = reactive({
      estimated: 120,
    })
    const Host = defineComponent({
      setup() {
        return () => h(MarkstreamVirtualTimeline, {
          items: [
            { kind: 'system-divider', id: 'd1', text: 'Today' },
          ],
          threadKey: 'estimate-change',
          stickToBottom: false,
          overscan: 10,
          estimateItemHeight: () => state.estimated,
        }, {
          default(props: any) {
            return h('div', props.item.text)
          },
        })
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    await flushAll()
    await nextTick()

    const timeline = wrapper.getComponent(MarkstreamVirtualTimeline)
    const timelineApi = (timeline.vm as any).$?.exposed
    expect(timelineApi.getTotalHeight()).toBe(120)

    state.estimated = 220
    await nextTick()
    await flushAll()

    expect(timelineApi.getTotalHeight()).toBe(220)

    wrapper.unmount()
  })

  it('rebuilds layout when the estimate item height function changes', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const items = [
      { kind: 'user-message', id: 'a1', text: 'Same text' },
      { kind: 'user-message', id: 'u1', text: 'Anchor' },
    ]
    const state = reactive<{ estimateItemHeight: (item: any) => number }>({
      estimateItemHeight: () => 60,
    })
    const Host = defineComponent({
      setup() {
        return () => h(MarkstreamVirtualTimeline, {
          items,
          threadKey: 'thread-a',
          overscan: 10,
          stickToBottom: false,
          estimateItemHeight: state.estimateItemHeight,
        }, {
          default(props: any) {
            return h('div', props.item.text)
          },
        })
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })

    await flushAll()
    await nextTick()

    const timeline = wrapper.getComponent(MarkstreamVirtualTimeline)
    const timelineApi = (timeline.vm as any).$?.exposed
    expect(timelineApi.getTotalHeight()).toBe(120)

    state.estimateItemHeight = (item: any) => item.id === 'a1' ? 180 : 60
    await nextTick()
    await flushAll()

    expect(timelineApi.getTotalHeight()).toBe(240)

    wrapper.unmount()
  })

  it('preserves the outer anchor when an item above the viewport changes height', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const slotProps: any[] = []
    const items = [
      { kind: 'assistant-markdown', id: 'a1', content: '# First', final: true },
      { kind: 'user-message', id: 'u1', text: 'Middle anchor item' },
      { kind: 'assistant-markdown', id: 'a2', content: '# Second', final: true },
    ]

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items,
        threadKey: 'thread-a',
        overscan: 10,
        stickToBottom: false,
      },
      slots: {
        default(props: any) {
          slotProps.push(props)

          return h('div', {
            'ref': props.measureRef,
            'data-kind': props.kind,
          }, props.markdownProps?.content ?? props.item.text ?? '')
        },
      },
    })

    await flushAll()
    await nextTick()

    const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement

    ;(wrapper.vm as any).scrollToOffset(380)
    await nextTick()

    const before = (wrapper.vm as any).captureThreadState().outerAnchor
    expect(before?.type).toBe('item')

    const firstMarkdown = slotProps.find(props => props.itemKey === 'a1')
    expect(firstMarkdown).toBeTruthy()

    firstMarkdown.markdownProps.onHeightChange(
      createMetrics(900, firstMarkdown.markdownProps.virtualScroll.sessionKey),
    )

    await nextTick()
    await flushAnimationFrame()

    const after = (wrapper.vm as any).captureThreadState().outerAnchor

    expect(root.scrollTop).toBeGreaterThan(380)
    expect(after?.type).toBe(before?.type)
    expect(wrapper.emitted('height-change')).toBeTruthy()
    expect(wrapper.emitted('heightChange')).toBeUndefined()

    if (before?.type === 'item' && after?.type === 'item') {
      expect(after.itemKey).toBe(before.itemKey)
      expect(Math.abs(after.offsetWithinItemPx - before.offsetWithinItemPx)).toBeLessThanOrEqual(2)
    }

    wrapper.unmount()
  })

  it('adapter preserves the outer anchor when a markdown item above the viewport changes height', async () => {
    const items = [
      { kind: 'assistant-markdown', id: 'a1', content: '# First', final: true },
      { kind: 'user-message', id: 'u1', text: 'Middle anchor item' },
      { kind: 'assistant-markdown', id: 'a2', content: '# Second', final: true },
    ]

    const sizes = new Map<string, number>([
      ['a1', 360],
      ['u1', 88],
      ['a2', 360],
    ])

    let scrollTop = 380

    function offsetOf(key: string) {
      let offset = 0

      for (const item of items) {
        if (item.id === key)
          return offset

        offset += sizes.get(item.id) ?? 0
      }

      return 0
    }

    const root = document.createElement('div')
    const adapter = {
      getScrollElement: () => root,
      getScrollTop: () => scrollTop,
      setScrollTop: (value: number) => {
        scrollTop = value
      },
      getViewportHeight: () => 300,
      getTotalHeight: () => Array.from(sizes.values()).reduce((a, b) => a + b, 0),
      getItemOffset: (key: string) => offsetOf(key),
      getItemSize: (key: string) => sizes.get(key) ?? 0,
      setItemSize: (key: string, size: number) => {
        sizes.set(key, size)
      },
      getVisibleRange: () => ({ start: 0, end: 3 }),
      scrollToOffset: (offset: number) => {
        scrollTop = offset
      },
      scrollToIndex: vi.fn(),
    }

    const scope = effectScope()
    const controller = scope.run(() => useMarkstreamVirtualAdapter({
      items,
      threadKey: 'thread-a',
      virtualizer: adapter,
    }))!

    const before = controller.captureThreadState().outerAnchor
    expect(before?.type).toBe('item')

    const markdownProps = controller.markdownProps(items[0], 0)
    markdownProps.onHeightChange(
      createMetrics(900, markdownProps.virtualScroll!.sessionKey!),
    )

    await nextTick()
    await flushAnimationFrame()

    const after = controller.captureThreadState().outerAnchor

    expect(scrollTop).toBeGreaterThan(380)
    expect(after?.type).toBe(before?.type)

    if (before?.type === 'item' && after?.type === 'item') {
      expect(after.itemKey).toBe(before.itemKey)
      expect(Math.abs(after.offsetWithinItemPx - before.offsetWithinItemPx)).toBeLessThanOrEqual(2)
    }

    scope.stop()
  })

  it('keeps near-bottom distance when a timeline item changes height in auto stick mode', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const slotProps: any[] = []
    const items = [
      { kind: 'assistant-markdown', id: 'a1', content: '# First', final: true },
      { kind: 'user-message', id: 'u1', text: 'Middle item' },
      { kind: 'assistant-markdown', id: 'a2', content: '# Second', final: true },
    ]

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items,
        threadKey: 'thread-a',
        overscan: 10,
        stickToBottom: 'auto',
      },
      slots: {
        default(props: any) {
          slotProps.push(props)
          return h('div', {
            'ref': props.measureRef,
            'data-kind': props.kind,
          }, props.markdownProps?.content ?? props.item.text ?? '')
        },
      },
    })

    await flushAll()
    await nextTick()

    const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement

    ;(wrapper.vm as any).scrollToOffset((wrapper.vm as any).getTotalHeight() - 300 - 20)
    await nextTick()

    const firstMarkdown = slotProps.find(props => props.itemKey === 'a1')
    firstMarkdown.markdownProps.onHeightChange(
      createMetrics(900, firstMarkdown.markdownProps.virtualScroll.sessionKey),
    )

    await nextTick()
    await flushAnimationFrame()

    const distanceFromBottom = (wrapper.vm as any).getTotalHeight() - 300 - root.scrollTop
    expect(Math.abs(distanceFromBottom - 20)).toBeLessThanOrEqual(2)

    wrapper.unmount()
  })

  it('adapter keeps near-bottom distance when markdown height changes', async () => {
    const items = [
      { kind: 'assistant-markdown', id: 'a1', content: '# First', final: true },
      { kind: 'user-message', id: 'u1', text: 'Middle item' },
      { kind: 'assistant-markdown', id: 'a2', content: '# Second', final: true },
    ]
    const sizes = new Map<string, number>([
      ['a1', 360],
      ['u1', 88],
      ['a2', 360],
    ])
    let scrollTop = 488

    function totalHeight() {
      return Array.from(sizes.values()).reduce((sum, size) => sum + size, 0)
    }

    const root = document.createElement('div')
    const adapter = {
      getScrollElement: () => root,
      getScrollTop: () => scrollTop,
      setScrollTop: (value: number) => {
        scrollTop = value
      },
      getViewportHeight: () => 300,
      getTotalHeight: totalHeight,
      getItemOffset: (key: string) => {
        let offset = 0
        for (const item of items) {
          if (item.id === key)
            return offset
          offset += sizes.get(item.id) ?? 0
        }
        return 0
      },
      getItemSize: (key: string) => sizes.get(key) ?? 0,
      setItemSize: (key: string, size: number) => {
        sizes.set(key, size)
      },
      getVisibleRange: () => ({ start: 0, end: 3 }),
      scrollToOffset: (offset: number) => {
        scrollTop = offset
      },
      scrollToIndex: vi.fn(),
    }

    const scope = effectScope()
    const controller = scope.run(() => useMarkstreamVirtualAdapter({
      items,
      threadKey: 'thread-a',
      virtualizer: adapter,
    }))!

    const markdownProps = controller.markdownProps(items[0], 0)
    markdownProps.onHeightChange(
      createMetrics(900, markdownProps.virtualScroll!.sessionKey!),
    )

    await nextTick()
    await flushAnimationFrame()

    expect(Math.abs(totalHeight() - 300 - scrollTop - 20)).toBeLessThanOrEqual(2)

    scope.stop()
  })

  it('suppresses markdown fade while restoring a thread', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const threadA = [
      { kind: 'assistant-markdown', id: 'a-md', content: '# A', final: true },
    ]
    const threadB = [
      { kind: 'assistant-markdown', id: 'b-md', content: '# B', final: true },
    ]
    const slotProps: any[] = []

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items: threadA,
        threadKey: 'thread-a',
        overscan: 10,
      },
      slots: {
        default(props: any) {
          slotProps.push(props)
          return h('div', { ref: props.measureRef }, props.markdownProps?.content ?? '')
        },
      },
    })

    await flushAll()
    await nextTick()

    await wrapper.setProps({
      items: threadB,
      threadKey: 'thread-b',
    })
    await nextTick()

    const latestMarkdown = [...slotProps].reverse().find(props => props.kind === 'assistant-markdown')

    expect(latestMarkdown).toBeTruthy()
    expect(latestMarkdown.markdownProps.fade).toBe(false)

    wrapper.unmount()
  })

  it('adapter suppresses markdown fade while restoring a thread', () => {
    const items = [
      { kind: 'assistant-markdown', id: 'a1', content: '# A', final: true },
    ]
    const sizes = new Map<string, number>([['a1', 360]])
    const root = document.createElement('div')
    const adapter = {
      getScrollElement: () => root,
      getScrollTop: () => 0,
      setScrollTop: vi.fn(),
      getViewportHeight: () => 300,
      getTotalHeight: () => 360,
      getItemOffset: () => 0,
      getItemSize: (key: string) => sizes.get(key) ?? 0,
      setItemSize: (key: string, size: number) => {
        sizes.set(key, size)
      },
      getVisibleRange: () => ({ start: 0, end: 1 }),
      scrollToOffset: vi.fn(),
      scrollToIndex: vi.fn(),
    }

    const scope = effectScope()
    const controller = scope.run(() => useMarkstreamVirtualAdapter({
      items,
      threadKey: 'thread-a',
      virtualizer: adapter,
    }))!

    controller.restoreThreadState({
      threadKey: 'thread-a',
      outerAnchor: {
        type: 'item',
        itemKey: 'a1',
        offsetWithinItemPx: 0,
      },
      itemHeights: {
        a1: 360,
      },
      markdownStates: {},
    })

    expect(controller.markdownProps(items[0], 0).fade).toBe(false)

    scope.stop()
  })

  it('restores per-thread scroll positions without auto-bottom overriding item anchors', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const makeThread = (prefix: string) => [
      { kind: 'system-divider', id: `${prefix}-d`, text: prefix },
      { kind: 'user-message', id: `${prefix}-u1`, text: `${prefix} user 1` },
      { kind: 'assistant-markdown', id: `${prefix}-m1`, content: '# long\n\ncontent', final: true },
      { kind: 'user-message', id: `${prefix}-u2`, text: `${prefix} user 2` },
      { kind: 'assistant-markdown', id: `${prefix}-m2`, content: '# long\n\ncontent 2', final: true },
    ]

    const threadA = makeThread('a')
    const threadB = makeThread('b')

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items: threadA,
        threadKey: 'thread-a',
        overscan: 10,
        stickToBottom: 'auto',
        estimateItemHeight(item: any) {
          if (item.kind === 'assistant-markdown')
            return 640
          if (item.kind === 'system-divider')
            return 44
          return 120
        },
      },
      slots: {
        default(props: any) {
          return h('div', {
            'ref': props.measureRef,
            'data-kind': props.kind,
          }, props.markdownProps?.content ?? props.item.text ?? '')
        },
      },
    })

    await flushAll()
    await nextTick()

    const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement

    ;(wrapper.vm as any).scrollToOffset(260)
    await nextTick()

    expect(root.scrollTop).toBe(260)

    await wrapper.setProps({
      items: threadB,
      threadKey: 'thread-b',
    })
    await flushThreadRestoreSettleWindow()

    ;(wrapper.vm as any).scrollToOffset(520)
    await nextTick()

    expect(root.scrollTop).toBe(520)

    await wrapper.setProps({
      items: threadA,
      threadKey: 'thread-a',
    })
    await nextTick()
    await flushAnimationFrame()

    expect(root.scrollTop).toBe(260)

    await wrapper.setProps({
      items: threadB,
      threadKey: 'thread-b',
    })
    await nextTick()
    await flushAnimationFrame()

    expect(root.scrollTop).toBe(520)

    wrapper.unmount()
  })
})
