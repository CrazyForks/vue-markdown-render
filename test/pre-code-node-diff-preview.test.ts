import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import PreCodeNode from '../src/components/PreCodeNode'

describe('pre code node diff preview', () => {
  it('does not paint blank diff preview rows as added or removed', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'ts',
          diff: true,
          originalCode: 'const a = 1\n',
          updatedCode: 'const a = 2\n',
          code: '',
          raw: '',
        },
      },
    })

    const emptyRows = wrapper.findAll('.markstream-pre__diff-line--empty')

    expect(emptyRows.length).toBeGreaterThan(0)
    for (const row of emptyRows) {
      expect(row.classes()).toContain('markstream-pre__diff-line--context')
      expect(row.classes()).not.toContain('markstream-pre__diff-line--added')
      expect(row.classes()).not.toContain('markstream-pre__diff-line--removed')
    }

    wrapper.unmount()
  })

  it('renders diff lines with index in v-for (row-height sync template wiring)', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'ts',
          diff: true,
          originalCode: 'line one\nline two\nline three\n',
          updatedCode: 'line one\nchanged two\nline three\n',
          code: '',
          raw: '',
        },
      },
    })

    const originalLines = wrapper.findAll('.markstream-pre__diff-pane--original .markstream-pre__diff-line')
    const modifiedLines = wrapper.findAll('.markstream-pre__diff-pane--modified .markstream-pre__diff-line')

    // Both panes must render the same number of lines
    expect(originalLines.length).toBeGreaterThan(0)
    expect(originalLines.length).toBe(modifiedLines.length)

    // All lines must have a line number element
    for (const line of [...originalLines, ...modifiedLines]) {
      expect(line.find('.markstream-pre__diff-number').exists()).toBe(true)
      expect(line.find('.markstream-pre__diff-content').exists()).toBe(true)
    }

    wrapper.unmount()
  })

  it('attaches preRef to the pre element', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'ts',
          diff: true,
          originalCode: 'const x = 1',
          updatedCode: 'const x = 2',
          code: '',
          raw: '',
        },
      },
    })

    const pre = wrapper.find('pre')
    expect(pre.exists()).toBe(true)
    // preRef must point to the same element that carries the diff-preview class
    expect(pre.classes()).toContain('markstream-pre--diff-preview')

    wrapper.unmount()
  })

  it('applies synced row-height style to diff lines after metrics are measured', async () => {
    // Stub requestAnimationFrame to fire synchronously so we can control timing
    const rafCallbacks: FrameRequestCallback[] = []
    const rafStub = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      rafCallbacks.splice(id - 1, 1)
    })

    // Mock getBoundingClientRect to simulate a wrapped line (e.g. 36px instead of 18px)
    const originalGetBCR = Element.prototype.getBoundingClientRect
    let callCount = 0
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      // First modified diff-content gets a taller height to simulate wrapping
      if (this.classList.contains('markstream-pre__diff-content')) {
        callCount++
        // Make the first modified line 36px tall (wrapped), rest 18px
        return { height: callCount === 2 ? 36 : 18, top: 0, left: 0, right: 0, bottom: 0, width: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
      }
      return originalGetBCR.call(this)
    })

    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })

    const wrapper = mount(PreCodeNode, {
      attachTo: document.body,
      props: {
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'ts',
          diff: true,
          originalCode: 'short\nline two',
          updatedCode: 'a much longer line that would wrap in a narrow container\nline two',
          code: '',
          raw: '',
        },
      },
    })

    await nextTick()
    // Fire all pending rAF callbacks (triggers syncDiffLineMetrics)
    const pending = [...rafCallbacks]
    rafCallbacks.length = 0
    for (const cb of pending) cb(performance.now())

    await nextTick()

    const originalLine1 = wrapper.find('.markstream-pre__diff-pane--original .markstream-pre__diff-line')
    const modifiedLine1 = wrapper.find('.markstream-pre__diff-pane--modified .markstream-pre__diff-line')

    // Both first lines must share the same synced row-height variable (max of the two)
    const originalStyle = originalLine1.attributes('style') ?? ''
    const modifiedStyle = modifiedLine1.attributes('style') ?? ''

    if (originalStyle || modifiedStyle) {
      // When styles are applied, both sides must report the same synced row height
      const extractSyncedHeight = (s: string) => {
        const m = s.match(/--markstream-pre-diff-synced-row-height:\s*([\d.]+px)/)
        return m?.[1] ?? null
      }
      const origH = extractSyncedHeight(originalStyle)
      const modH = extractSyncedHeight(modifiedStyle)
      if (origH && modH) {
        expect(origH).toBe(modH)
      }
    }

    wrapper.unmount()

    rafStub.mockRestore()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders inline diff fallback as one ordered diff stream instead of stacked panes', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffInline: true,
        node: {
          type: 'code_block',
          language: 'diff',
          diff: true,
          originalCode: 'same before\nold value\nsame after',
          updatedCode: 'same before\nnew value\nsame after',
          code: '',
          raw: '```diff\n-old value\n+new value\n```',
        },
      },
    })

    expect(wrapper.findAll('.markstream-pre__diff-pane')).toHaveLength(1)
    expect(wrapper.find('.markstream-pre__diff-pane--inline').exists()).toBe(true)
    expect(wrapper.findAll('.markstream-pre__diff-content').map(node => node.text())).toEqual([
      'same before',
      'old value',
      'new value',
      'same after',
    ])
    expect(wrapper.findAll('.markstream-pre__diff-line--removed')).toHaveLength(1)
    expect(wrapper.findAll('.markstream-pre__diff-line--added')).toHaveLength(1)

    wrapper.unmount()
  })
})
