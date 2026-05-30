import type { MarkstreamVirtualMetrics, MarkstreamVirtualState } from '../src/types/node-renderer-props'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, h, nextTick } from 'vue'
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
    expect(markdownSlot.markdownProps.virtualScroll.enabled).toBe(true)
    expect(markdownSlot.markdownProps.virtualScroll.threadKey).toBe('thread-a')
    expect(markdownSlot.markdownProps.virtualScroll.sessionKey).toBe('thread-a:a1:')
    expect(markdownSlot.markdownProps.fade).toBe(false)

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

  it('shows a non-layout restore loading overlay while restored thread state is settling', async () => {
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

      expect(root.classList.contains('is-restoring-thread')).toBe(false)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('treats visible mermaid pending placeholder as restore-ready code block content', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(360)

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const wrapper = mount(MarkstreamVirtualTimeline, {
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
                  'data-markstream-mode': 'pending',
                }),
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
