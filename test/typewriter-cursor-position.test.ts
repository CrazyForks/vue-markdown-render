/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NodeRenderer from '../src/components/NodeRenderer'
import { flushAll } from './setup/flush-all'

function rect(partial: Partial<DOMRect>): DOMRect {
  return {
    x: partial.x ?? partial.left ?? 0,
    y: partial.y ?? partial.top ?? 0,
    width: partial.width ?? 0,
    height: partial.height ?? 0,
    top: partial.top ?? 0,
    right: partial.right ?? 0,
    bottom: partial.bottom ?? 0,
    left: partial.left ?? 0,
    toJSON: () => ({}),
  }
}

async function runNextFrame(queuedFrames: FrameRequestCallback[], now: number) {
  const frame = queuedFrames.shift()
  expect(frame).toBeDefined()
  frame?.(now)
  await flushAll()
}

describe('typewriter cursor position', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('repositions while smooth visible content catches up after the source stops growing', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)
    const createTreeWalkerSpy = vi.spyOn(document, 'createTreeWalker')

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const element = this as HTMLElement
      if (element.classList.contains('markdown-renderer'))
        return rect({ left: 20, top: 10 })
      return rect({})
    })

    const originalCreateRange = document.createRange.bind(document)
    vi.spyOn(document, 'createRange').mockImplementation(() => {
      const range = originalCreateRange()
      let rangeNode: Node | null = null
      let endOffset = 0

      range.setStart = vi.fn((node: Node) => {
        rangeNode = node
      })
      range.setEnd = vi.fn((_node: Node, offset: number) => {
        rangeNode = _node
        endOffset = offset
      })
      range.getClientRects = vi.fn(() => {
        let previousLength = 0
        let sibling = rangeNode?.parentElement?.previousSibling ?? null
        while (sibling) {
          previousLength += sibling.textContent?.length ?? 0
          sibling = sibling.previousSibling
        }

        return [
          rect({ right: (previousLength + endOffset) * 10, top: 60, bottom: 80, height: 20 }),
        ] as unknown as DOMRectList
      })

      return range
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: true,
        smoothStreaming: true,
        smoothStreamingOptions: {
          startDelayMs: 0,
          minCharsPerSecond: 1000,
          maxCharsPerSecond: 1000,
          maxCommitFps: 60,
          maxCharsPerCommit: 4,
        },
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()
    queuedFrames.length = 0

    await wrapper.setProps({
      content: 'abcdefghij',
    })
    await flushAll()

    const baseline = performance.now()
    await runNextFrame(queuedFrames, baseline + 50)
    await runNextFrame(queuedFrames, baseline + 66)

    const cursor = wrapper.get('.typewriter-cursor').element as HTMLElement
    const firstVisibleLength = wrapper.get('.text-node').text().length
    expect(firstVisibleLength).toBeGreaterThan(0)
    expect(cursor.style.transform).toBe(`translate(${Math.max(0, firstVisibleLength * 10 - 20)}px, 50px)`)
    expect(cursor.style.visibility).toBe('visible')

    await runNextFrame(queuedFrames, baseline + 100)
    await runNextFrame(queuedFrames, baseline + 116)

    const secondVisibleLength = wrapper.get('.text-node').text().length
    expect(secondVisibleLength).toBeGreaterThan(firstVisibleLength)
    expect(cursor.style.transform).toBe(`translate(${Math.max(0, secondVisibleLength * 10 - 20)}px, 50px)`)
    expect(createTreeWalkerSpy).toHaveBeenCalled()
    expect(createTreeWalkerSpy.mock.calls.every(([root]) => {
      return root instanceof HTMLElement && root.matches('.node-slot[data-node-index]')
    })).toBe(true)

    wrapper.unmount()
  })

  it('cancels pending cursor RAF when cursor is hidden before the frame runs', async () => {
    const queuedFrameIds: number[] = []
    const cancelAnimationFrameSpy = vi.fn((id: number) => {
      const index = queuedFrameIds.indexOf(id)
      if (index >= 0)
        queuedFrameIds.splice(index, 1)
    })
    let nextFrameId = 1

    vi.stubGlobal('requestAnimationFrame', (() => {
      const id = nextFrameId++
      queuedFrameIds.push(id)
      return id
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameSpy as typeof cancelAnimationFrame)

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: true,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()

    await wrapper.setProps({ content: 'hello world' })
    await flushAll()

    expect(queuedFrameIds).toHaveLength(1)
    const cursorFrameId = queuedFrameIds[0]

    await wrapper.setProps({ final: true })
    await flushAll()

    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(cursorFrameId)
    expect(queuedFrameIds).toHaveLength(0)

    wrapper.unmount()
  })
})
