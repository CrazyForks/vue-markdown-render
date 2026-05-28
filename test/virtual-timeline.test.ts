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
})
