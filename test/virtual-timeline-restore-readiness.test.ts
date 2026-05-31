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

function installRestoreGeometryStub(height = 360, width = 800) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const el = this as HTMLElement
    const root = el.closest?.('[data-testid="markstream-virtual-timeline"]') as HTMLElement | null
    const hidden = el.closest?.('.code-editor-container.is-hidden')
    const isMeasureRoot = el.hasAttribute('data-test-top')
    const ownTop = el.hasAttribute('data-test-top')
      ? Number(el.dataset.testTop ?? '0')
      : Number(el.querySelector<HTMLElement>('[data-test-top]')?.dataset.testTop ?? '0')
    const ownHeight = el.hasAttribute('data-test-height')
      ? Number(el.dataset.testHeight ?? String(height))
      : Number(el.querySelector<HTMLElement>('[data-test-height]')?.dataset.testHeight ?? String(height))
    const top = (isMeasureRoot || el.hasAttribute('data-markstream-item-key'))
      ? ownTop - (root?.scrollTop || 0)
      : 0
    const rectHeight = (isMeasureRoot || el.hasAttribute('data-markstream-item-key')) ? ownHeight : height

    return {
      x: 0,
      y: top,
      top,
      right: hidden ? 0 : width,
      bottom: hidden ? 0 : top + rectHeight,
      left: 0,
      width: hidden ? 0 : width,
      height: hidden ? 0 : rectHeight,
      toJSON: () => ({}),
    } as DOMRect
  })
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
      installRestoreGeometryStub()

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
      await vi.advanceTimersByTimeAsync(1200)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(false)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('keeps polling restore readiness after the first poll window', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      stubTimelineDom()
      installRestoreGeometryStub()

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: [
            { kind: 'assistant-markdown', id: 'm1', content: 'late math', final: true, revision: 1 },
          ],
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

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      // Let the initial 40-frame readiness window expire.
      await vi.advanceTimersByTimeAsync(900)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      // Change DOM readiness without triggering a Vue component update.
      wrapper.get('[data-markstream-math="inline"]').element.removeAttribute('data-markstream-pending')

      // The retry loop should observe the DOM becoming ready and reveal.
      await vi.advanceTimersByTimeAsync(700)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(false)
    }
    finally {
      wrapper?.unmount()
      vi.useRealTimers()
    }
  })

  it('keeps restore loading on first cold thread switch until routed mermaid content is ready', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      stubTimelineDom()
      installRestoreGeometryStub()

      let mermaidReady = false

      const threadA = [
        { kind: 'user-message', id: 'a1', text: 'Thread A' },
      ]

      const threadB = [
        { kind: 'assistant-markdown', id: 'b1', content: '```mermaid\nflowchart TD\nA-->B\n```', final: true, revision: 1 },
      ]

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: threadA,
          threadKey: 'thread-a',
          stickToBottom: 'auto',
        },
        slots: {
          default(props: any) {
            if (props.itemKey === 'b1') {
              return h('div', { ref: props.measureRef }, [
                h('div', { 'class': 'node-slot', 'data-node-index': '0', 'data-node-type': 'code_block' }, [
                  h('div', { class: 'node-content' }, [
                    h('div', {
                      'data-markstream-mermaid': '1',
                      'data-markstream-mode': mermaidReady ? 'preview' : 'pending',
                      'data-markstream-pending': mermaidReady ? undefined : 'true',
                      'class': 'mermaid-block-container',
                    }, [
                      mermaidReady
                        ? h('svg', { width: 100, height: 100 })
                        : h('div', { class: 'mermaid-preview-area' }),
                    ]),
                  ]),
                ]),
              ])
            }

            return h('div', { ref: props.measureRef }, props.item.text ?? '')
          },
          'restore-loading': () => h('div', { 'data-testid': 'restore-loading' }, 'Restoring'),
        },
      })

      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement

      expect(root.classList.contains('is-restoring-thread')).toBe(false)

      await wrapper.setProps({
        items: threadB,
        threadKey: 'thread-b',
      })
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(true)
      expect(wrapper.find('[data-testid="restore-loading"]').exists()).toBe(true)

      await vi.advanceTimersByTimeAsync(900)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      mermaidReady = true
      await wrapper.setProps({ items: [...threadB] })
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

  it('keeps restore loading on a cold thread switch while initial restore is still pending', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      stubTimelineDom()
      installRestoreGeometryStub()

      let mermaidReady = false

      const threadA = [
        { kind: 'assistant-markdown', id: 'a1', content: 'pending math', final: true, revision: 1 },
      ]

      const threadB = [
        { kind: 'assistant-markdown', id: 'b1', content: '```mermaid\nflowchart TD\nA-->B\n```', final: true, revision: 1 },
      ]

      wrapper = mount(MarkstreamVirtualTimeline, {
        attachTo: document.body,
        props: {
          items: threadA,
          threadKey: 'thread-a',
          stickToBottom: 'auto',
          initialThreadState: {
            threadKey: 'thread-a',
            measurementKey: ':800',
            widthBucket: 800,
            outerAnchor: { type: 'bottom', distanceFromBottomPx: 0 },
            itemHeights: { a1: 360 },
            itemSizeSources: { a1: timelineItemSource('thread-a', 'a1', 1) },
            markdownStates: {},
          },
        },
        slots: {
          default(props: any) {
            if (props.itemKey === 'a1') {
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
            }

            return h('div', { ref: props.measureRef, class: 'markstream-vue' }, [
              h('div', { 'class': 'node-slot', 'data-node-index': '0', 'data-node-type': 'code_block' }, [
                h('div', { class: 'node-content' }, [
                  h('div', {
                    'data-markstream-mermaid': '1',
                    'data-markstream-mode': mermaidReady ? 'preview' : 'pending',
                    'data-markstream-pending': mermaidReady ? undefined : 'true',
                    'class': 'mermaid-block-container',
                  }, [
                    mermaidReady
                      ? h('svg', { width: 100, height: 100 })
                      : h('div', { class: 'mermaid-preview-area' }),
                  ]),
                ]),
              ]),
            ])
          },
          'restore-loading': () => h('div', { 'data-testid': 'restore-loading' }, 'Restoring'),
        },
      })

      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      await wrapper.setProps({
        items: threadB,
        threadKey: 'thread-b',
      })
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      await vi.advanceTimersByTimeAsync(900)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      mermaidReady = true
      await wrapper.setProps({ items: [...threadB] })
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

  it('reveals restore loading after max timeout when viewport readiness never arrives', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      stubTimelineDom()
      installRestoreGeometryStub()
      vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

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
            outerAnchor: { type: 'item', itemKey: 'm1', offsetWithinItemPx: 0 },
            itemHeights: { m1: 360 },
            itemSizeSources: { m1: timelineItemSource('thread-a', 'm1', 1) },
            markdownStates: {},
          },
        },
        slots: {
          default(props: any) {
            return h('div', { ref: props.measureRef }, [
              h('div', { 'class': 'node-slot', 'data-node-index': '0', 'data-node-type': 'code_block' }, [
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

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      await vi.advanceTimersByTimeAsync(8500)
      await nextTick()
      await vi.advanceTimersByTimeAsync(1000)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(false)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('restore viewport did not become ready before timeout'))
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

  it('does not reveal restored viewport at settle timer while visible code block is still async-loading', async () => {
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | undefined

    try {
      stubTimelineDom()
      installRestoreGeometryStub()

      let codeReady = false

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
            outerAnchor: { type: 'item', itemKey: 'm1', offsetWithinItemPx: 0 },
            itemHeights: { m1: 360 },
            itemSizeSources: { m1: timelineItemSource('thread-a', 'm1', 1) },
            markdownStates: {},
          },
        },
        slots: {
          default(props: any) {
            return h('div', { ref: props.measureRef }, [
              h('div', { 'class': 'node-slot', 'data-node-index': '0', 'data-node-type': 'code_block' }, [
                h('div', { class: 'node-content' }, [
                  codeReady
                    ? h('div', {
                        'data-markstream-code-block': '1',
                        'data-markstream-enhanced': 'true',
                        'class': 'code-block-container',
                      }, 'ready code block')
                    : h('pre', {
                        'class': 'code-pre-fallback',
                        'data-markstream-code-loading': '1',
                        'style': 'height: 240px; min-height: 240px;',
                      }, 'loading code block'),
                ]),
              ]),
            ])
          },
        },
      })

      await nextTick()

      const root = wrapper.find('[data-testid="markstream-virtual-timeline"]').element as HTMLElement
      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      // This crosses the old 640ms forced reveal window.
      await vi.advanceTimersByTimeAsync(800)
      await nextTick()

      expect(root.classList.contains('is-restoring-thread')).toBe(true)

      codeReady = true
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

  it('reserves async code block loading fallback height from block estimates', async () => {
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
    expect(pre.attributes('style')).toContain('height: 240px')
    expect(pre.attributes('style')).toContain('min-height: 240px')
    expect(pre.attributes('style')).toContain('max-height: 240px')
    expect(pre.attributes('style')).toContain('overflow: auto')

    wrapper.unmount()
  })

  it('uses reduced overscan during restore and restores configured overscan after reveal', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
      const el = this as HTMLElement
      if (el.classList.contains('markstream-virtual-timeline__item'))
        return Number.parseFloat(el.style.minHeight || '0') || 40

      return 40
    })
    installRestoreGeometryStub(100)
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
          return h('div', {
            'ref': props.measureRef,
            'data-test-top': props.index * 40,
            'data-test-height': 40,
          }, props.item.text)
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
