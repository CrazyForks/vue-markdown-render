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

    await flushAll()
    await nextTick()

    const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
    const expectedScrollTop = (wrapper.vm as any).getTotalHeight() - 300
    const anchor = (wrapper.vm as any).captureThreadState().outerAnchor

    expect(root.scrollTop).toBe(expectedScrollTop)
    expect(anchor?.type).toBe('bottom')

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
})
