import { readFileSync } from 'node:fs'

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import PreCodeNode from '../src/components/PreCodeNode'

describe('pre code node diff preview', () => {
  it('does not render a terminal newline as an extra ordinary line', async () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'ts',
          code: 'const a = 1\n',
          raw: '```ts\nconst a = 1\n```',
        },
      },
    })

    expect(wrapper.findAll('.markstream-pre__line-number').map(node => node.text())).toEqual(['1'])
    expect(wrapper.get('.markstream-pre__code').element.textContent).toBe('const a = 1')

    await wrapper.setProps({
      node: {
        type: 'code_block',
        language: 'ts',
        code: 'const a = 1\n\n',
        raw: '```ts\nconst a = 1\n\n```',
      },
    })

    expect(wrapper.findAll('.markstream-pre__line-number').map(node => node.text())).toEqual(['1', '2'])
    expect(wrapper.get('.markstream-pre__code').element.textContent).toBe('const a = 1\n')

    await wrapper.setProps({
      node: {
        type: 'code_block',
        language: 'ts',
        code: 'const a = 1\n',
        raw: '```ts\nconst a = 1\n',
        loading: true,
      },
    })

    expect(wrapper.findAll('.markstream-pre__line-number').map(node => node.text())).toEqual(['1', '2'])
    expect(wrapper.get('.markstream-pre__code').element.textContent).toBe('const a = 1\n')

    wrapper.unmount()
  })

  it('does not paint terminal blank diff preview rows as added or removed', () => {
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

  it('allows empty added and removed rows to receive diff fill styles', () => {
    const source = readFileSync(
      'src/components/PreCodeNode/PreCodeNode.vue',
      'utf8',
    )

    expect(source).toContain('.markstream-pre__diff-line--added::before')
    expect(source).toContain('.markstream-pre__diff-line--removed::before')
    expect(source).toContain('.markstream-pre__diff-line--added > .markstream-pre__diff-rail')
    expect(source).toContain('.markstream-pre__diff-line--removed > .markstream-pre__diff-rail')
    expect(source).not.toContain('.markstream-pre__diff-line--added:not(.markstream-pre__diff-line--empty)::before')
    expect(source).not.toContain('.markstream-pre__diff-line--removed:not(.markstream-pre__diff-line--empty)::before')
  })

  it('uses content width for inline diff fallback when wrap is disabled', () => {
    const source = readFileSync(
      'src/components/PreCodeNode/PreCodeNode.vue',
      'utf8',
    )

    expect(source).toContain('pre.markstream-pre--diff-preview.markstream-pre--diff-inline:not(.is-wrap) > .markstream-pre__diff-code')
    expect(source).toContain('grid-template-columns: max-content;')
    expect(source).toContain('width: max-content;')
    expect(source).toContain('white-space: inherit;')
    expect(source).toContain('overflow-wrap: normal;')
    expect(source).toContain('pre.markstream-pre--diff-preview.is-wrap')
    expect(source).toContain('white-space: pre-wrap;')
    expect(source).toContain('overflow-wrap: anywhere;')
  })

  it('uses modified gutter metrics and divider for inline diff fallback', () => {
    const source = readFileSync(
      'src/components/PreCodeNode/PreCodeNode.vue',
      'utf8',
    )

    expect(source).toContain('pre.markstream-pre--diff-preview.markstream-pre--diff-inline {')
    expect(source).toContain('--markstream-pre-diff-gutter-marker-width: var(--stream-monaco-gutter-marker-width, 4px);')
    expect(source).toContain('--stream-monaco-modified-scrollable-left')
    expect(source).toContain('pre.markstream-pre--diff-preview.markstream-pre--diff-inline .markstream-pre__diff-line::after')
    expect(source).toContain('left: var(--markstream-pre-diff-scrollable-left);')
    expect(source).toContain('background: var(--stream-monaco-pane-divider')
    expect(source).toContain('width: var(--markstream-pre-diff-gutter-marker-width, 4px);')
  })

  it('lets side-by-side diff fallback panes scroll horizontally when wrap is disabled', () => {
    const source = readFileSync(
      'src/components/PreCodeNode/PreCodeNode.vue',
      'utf8',
    )

    expect(source).toContain('pre.markstream-pre--diff-preview:not(.is-wrap):not(.markstream-pre--diff-inline) .markstream-pre__diff-pane')
    expect(source).toContain('overflow-x: auto;')
    expect(source).toContain('overflow-y: hidden;')
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

  it('does not show a modified line number for inline removed rows', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffInline: true,
        node: {
          type: 'code_block',
          language: 'json',
          diff: true,
          originalCode: [
            '{',
            '  "type": "module",',
            '  "version": "1.0.1",',
            '  "description": "old",',
            '  "author": "Simon He"',
            '}',
          ].join('\n'),
          updatedCode: [
            '{',
            '  "type": "module",',
            '  "version": "1.0.1",',
            '  "description": "new",',
            '  "author": "Simon He"',
            '}',
          ].join('\n'),
          code: '',
          raw: '',
        },
      },
    })

    const removedNumber = wrapper.get('.markstream-pre__diff-line--removed .markstream-pre__diff-number')
    const addedNumber = wrapper.get('.markstream-pre__diff-line--added .markstream-pre__diff-number')

    expect(removedNumber.text()).toBe('')
    expect(addedNumber.text()).toBe('4')

    wrapper.unmount()
  })

  it('keeps unchanged source rows neutral in inline source diff fallback', () => {
    const originalCode = [
      'export const name = "@archships/dim-agent-sdk"',
      'export {',
      '  createAgent,',
      '} from "./agent"',
      'export {',
      '  createSessionForAgent,',
      '  loadSessionForAgent,',
      '} from "./session"',
      'export {',
      '  createRunEngine,',
      '} from "./run-engine"',
    ].join('\n')
    const updatedCode = [
      'export const name = "@archships/dim-agent-sdk"',
      '// Core SDK entry points.',
      'export {',
      '  createAgent,',
      '} from "./agent"',
      '// Session lifecycle.',
      'export {',
      '  createSessionForAgent,',
      '  loadSessionForAgent,',
      '} from "./session"',
      '// Run engine.',
      'export {',
      '  createRunEngine,',
      '} from "./run-engine"',
    ].join('\n')
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffInline: true,
        node: {
          type: 'code_block',
          language: 'ts',
          diff: true,
          originalCode,
          updatedCode,
          code: updatedCode,
          raw: '',
        },
      },
    })

    expect(wrapper.findAll('.markstream-pre__diff-line--removed')).toHaveLength(0)
    expect(wrapper.findAll('.markstream-pre__diff-line--added')).toHaveLength(3)
    expect(wrapper.findAll('.markstream-pre__diff-content-inner').map(node => node.element.textContent)).toEqual([
      'export const name = "@archships/dim-agent-sdk"',
      '// Core SDK entry points.',
      'export {',
      '  createAgent,',
      '} from "./agent"',
      '// Session lifecycle.',
      'export {',
      '  createSessionForAgent,',
      '  loadSessionForAgent,',
      '} from "./session"',
      '// Run engine.',
      'export {',
      '  createRunEngine,',
      '} from "./run-engine"',
    ])

    wrapper.unmount()
  })

  it('does not treat markdown list items as removed lines when source diff data exists', () => {
    const updatedCode = [
      '# 示例文档',
      '',
      '- 无序项 1',
      '- 无序项 2',
      '  - 子项 A',
      '  - 子项 B',
    ].join('\n')
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffInline: true,
        node: {
          type: 'code_block',
          language: 'md',
          diff: true,
          originalCode: '',
          updatedCode,
          code: updatedCode,
          raw: '',
        },
      },
    })

    expect(wrapper.findAll('.markstream-pre__diff-line--removed')).toHaveLength(0)

    const listRows = wrapper.findAll('.markstream-pre__diff-line').filter(row =>
      row.find('.markstream-pre__diff-content-inner').text().includes('无序项'),
    )
    expect(listRows).toHaveLength(2)
    for (const row of listRows) {
      expect(row.classes()).toContain('markstream-pre__diff-line--added')
    }

    const emptyRows = wrapper.findAll('.markstream-pre__diff-line--empty')
    expect(emptyRows).toHaveLength(1)
    expect(emptyRows[0].classes()).toContain('markstream-pre__diff-line--added')

    wrapper.unmount()
  })
})
