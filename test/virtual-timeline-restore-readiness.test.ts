import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import MarkstreamVirtualTimeline from '../src/components/MarkstreamVirtualTimeline'

async function flushAnimationFrame() {
  await new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve(undefined))
      return
    }

    setTimeout(resolve, 0)
  })
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

function timelineItemSource(threadKey: string, itemKey: string, revision?: string | number, widthBucket = 800) {
  return {
    sourceKey: [threadKey, itemKey, revision == null ? '' : String(revision)].join(':'),
    measurementKey: `:${widthBucket}`,
    widthBucket,
  }
}

function stubTimelineDom(height = 360) {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(height)
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
}

describe('virtual timeline restore visual readiness', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(performance.now()), 16)
    })
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      window.clearTimeout(handle)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not treat pending math content as restore-ready', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      stubTimelineDom()
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

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: [{ kind: 'assistant-markdown', id: 'm1', content: 'math', final: true, revision: 1 }],
          threadKey: 'thread-a',
          stickToBottom: false,
          initialThreadState: {
            threadKey: 'thread-a',
            measurementKey: ':800',
            widthBucket: 800,
            outerAnchor: { type: 'item', itemKey: 'm1', offsetWithinItemPx: 0 },
            itemHeights: { m1: 360 },
            itemSizeSources: { m1: timelineItemSource('thread-a', 'm1', 1) },
            markdownStates: {},
          },
        },
        slots: {
          default(props: any) {
            return h('div', { ref: props.measureRef }, [
              h('div', { 'class': 'node-slot', 'data-node-index': '0', 'data-node-type': 'paragraph' }, [
                h('div', { class: 'node-content' }, [
                  h('span', {
                    'data-markstream-math': 'inline',
                    'data-markstream-mode': 'fallback',
                    'data-markstream-pending': 'true',
                  }, '$x$'),
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

      const pendingMath = wrapper.get('[data-markstream-math="inline"]')
      pendingMath.element.removeAttribute('data-markstream-pending')
      await vi.advanceTimersByTimeAsync(700)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(false)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('treats settled math fallback content as restore-ready', async () => {
    stubTimelineDom()

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items: [{ kind: 'assistant-markdown', id: 'm1', content: 'math', final: true, revision: 1 }],
        threadKey: 'thread-a',
        stickToBottom: false,
        initialThreadState: {
          threadKey: 'thread-a',
          measurementKey: ':800',
          widthBucket: 800,
          outerAnchor: { type: 'item', itemKey: 'm1', offsetWithinItemPx: 0 },
          itemHeights: { m1: 360 },
          itemSizeSources: { m1: timelineItemSource('thread-a', 'm1', 1) },
          markdownStates: {},
        },
      },
      slots: {
        default(props: any) {
          return h('div', { ref: props.measureRef }, [
            h('div', { 'class': 'node-slot', 'data-node-index': '0', 'data-node-type': 'paragraph' }, [
              h('div', { class: 'node-content' }, [
                h('span', {
                  'data-markstream-math': 'inline',
                  'data-markstream-mode': 'fallback',
                }, '$x$'),
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

  it('reserves async code block loading fallback height from estimates', async () => {
    const { CodeBlockNodeLoading } = await import('../src/components/NodeRenderer/asyncComponent')

    const wrapper = mount(CodeBlockNodeLoading as any, {
      attrs: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: 'const x = 1',
          raw: '```ts\nconst x = 1\n```',
          loading: true,
        },
        estimatedHeightPx: 240,
        estimatedContentHeightPx: 123.2,
      },
    })

    const pre = wrapper.get('pre.code-pre-fallback')
    expect(pre.attributes('data-markstream-code-loading')).toBe('1')
    expect(pre.attributes('style')).toContain('min-height: 124px')

    wrapper.unmount()
  })

  it('uses reduced overscan during restore and restores configured overscan after reveal', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40)
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const items = Array.from({ length: 20 }, (_, index) => ({
      kind: 'user-message',
      id: `u${index}`,
      text: `Item ${index}`,
    }))

    const wrapper = mount(MarkstreamVirtualTimeline, {
      attachTo: document.body,
      props: {
        items,
        threadKey: 'thread-a',
        overscan: 10,
        overscanPx: 1000,
        stickToBottom: false,
        initialThreadState: {
          threadKey: 'thread-a',
          measurementKey: ':800',
          widthBucket: 800,
          outerAnchor: { type: 'item', itemKey: 'u10', offsetWithinItemPx: 0 },
          itemHeights: Object.fromEntries(items.map(item => [item.id, 40])),
          itemSizeSources: Object.fromEntries(items.map(item => [item.id, timelineItemSource('thread-a', item.id)])),
          markdownStates: {},
        },
      },
      slots: {
        default(props: any) {
          return h('div', { ref: props.measureRef }, props.item.text)
        },
      },
    })

    await nextTick()

    const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
    expect(root.classList.contains('is-restoring-thread')).toBe(true)
    const restoreItemCount = wrapper.findAll('.markstream-virtual-timeline__item').length
    expect(restoreItemCount).toBeLessThan(items.length)

    await waitForTimelineRestoreSettled(root)
    await nextTick()

    expect(wrapper.findAll('.markstream-virtual-timeline__item').length).toBeGreaterThan(restoreItemCount)

    wrapper.unmount()
  })
})
