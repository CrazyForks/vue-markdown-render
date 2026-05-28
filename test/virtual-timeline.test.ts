import type { MarkstreamVirtualMetrics, MarkstreamVirtualState } from '../src/types/node-renderer-props'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

describe('virtual timeline API', () => {
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
      outerAnchor: {
        type: 'item',
        itemKey: 'a1',
        offsetWithinItemPx: 40,
      },
      itemHeights: {
        a1: 1060,
        u1: 80,
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
