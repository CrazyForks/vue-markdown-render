import { readFileSync } from 'node:fs'

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import PreCodeNode from '../src/components/PreCodeNode'

describe('pre code node diff preview', () => {
  it('styles async code block loading fallback as a code surface', () => {
    const source = readFileSync('src/components/PreCodeNode/PreCodeNode.vue', 'utf8')
    const selector = '.markstream-vue pre.code-pre-fallback[data-markstream-code-loading=\'1\']'
    const start = source.indexOf(selector)
    expect(start).toBeGreaterThanOrEqual(0)
    const end = source.indexOf('}', start)
    const rule = source.slice(start, end)

    expect(rule).toContain('background: var(--code-bg)')
    expect(rule).toContain('color: var(--code-fg)')
    expect(rule).toContain('border: 1px solid var(--code-border)')
    expect(rule).toContain('font-family: var(')
  })

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

  it('does not pin streaming pre height to the reserved estimate', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        loading: true,
        showLineNumbers: true,
        reservedHeightPx: 240,
        node: {
          type: 'code_block',
          language: 'json',
          code: '{\n  "name": "marks"',
          raw: '```json\n{\n  "name": "marks"',
        },
      },
    })

    const pre = wrapper.get('pre').element

    expect(pre.style.height).toBe('')
    expect(pre.style.minHeight).toBe('')
    expect(pre.style.maxHeight).toBe('240px')
    expect(wrapper.findAll('.markstream-pre__line-number').map(node => node.text())).toEqual(['1', '2'])
    expect(wrapper.get('pre').attributes('aria-busy')).toBe('true')

    wrapper.unmount()
  })

  it('keeps reserved pre height fixed after loading', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        loading: false,
        showLineNumbers: true,
        reservedHeightPx: 120,
        node: {
          type: 'code_block',
          language: 'ts',
          code: 'const value = 1',
          raw: '```ts\nconst value = 1\n```',
        },
      },
    })

    const pre = wrapper.get('pre').element

    expect(pre.style.height).toBe('120px')
    expect(pre.style.minHeight).toBe('120px')
    expect(pre.style.maxHeight).toBe('120px')
    expect(wrapper.get('pre').attributes('aria-busy')).toBe('false')

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

    expect(emptyRows).toHaveLength(0)

    wrapper.unmount()
  })

  it('matches side-by-side Monaco unchanged-region folding before handoff', () => {
    const originalLines = [
      'import { computed, ref } from \'vue\'',
      '',
      'const count = ref(1)',
      'const label = computed(() => `old:' + '$' + '{count.value}`)',
      ...Array.from({ length: 20 }, (_, index) => `const stable${index} = ${index}`),
      'console.log(label.value)',
    ]
    const modifiedLines = [...originalLines]
    modifiedLines[2] = 'const count = ref(2)'
    modifiedLines[3] = 'const label = computed(() => `new:' + '$' + '{count.value}`)'
    modifiedLines[24] = 'console.info(label.value)'

    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffHideUnchangedRegions: {
          enabled: true,
          contextLineCount: 2,
          minimumLineCount: 4,
          revealLineCount: 5,
        },
        node: {
          type: 'code_block',
          language: 'diff typescript',
          diff: true,
          originalCode: originalLines.join('\n'),
          updatedCode: modifiedLines.join('\n'),
          code: '',
          raw: '',
        },
      },
    })

    const originalRows = wrapper.findAll('.markstream-pre__diff-pane--original .markstream-pre__diff-line')
    const modifiedRows = wrapper.findAll('.markstream-pre__diff-pane--modified .markstream-pre__diff-line')
    const numbers = originalRows.map(row => row.find('.markstream-pre__diff-number').text())

    expect(wrapper.get('pre').classes()).toContain('markstream-pre--diff-collapsed')
    expect(originalRows).toHaveLength(10)
    expect(modifiedRows).toHaveLength(10)
    expect(numbers).toEqual(['1', '2', '3', '4', '5', '6', '', '23', '24', '25'])
    expect(wrapper.findAll('.markstream-pre__diff-line--collapsed')).toHaveLength(2)
    expect(wrapper.get('.markstream-pre__diff-pane--original .markstream-pre__diff-line--collapsed').text()).toContain('Unmodified lines')

    wrapper.unmount()
  })

  it('applies unchanged-region folding to inline diff fallback rows', () => {
    const originalLines = [
      'const before = 1',
      ...Array.from({ length: 12 }, (_, index) => `const stable${index} = ${index}`),
      'const after = 1',
    ]
    const modifiedLines = [...originalLines]
    modifiedLines[0] = 'const before = 2'
    modifiedLines[13] = 'const after = 2'

    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffInline: true,
        diffHideUnchangedRegions: {
          enabled: true,
          contextLineCount: 2,
          minimumLineCount: 4,
        },
        node: {
          type: 'code_block',
          language: 'diff typescript',
          diff: true,
          originalCode: originalLines.join('\n'),
          updatedCode: modifiedLines.join('\n'),
          code: '',
          raw: '',
        },
      },
    })

    expect(wrapper.get('pre').classes()).toContain('markstream-pre--diff-collapsed')
    expect(wrapper.findAll('.markstream-pre__diff-pane--inline .markstream-pre__diff-line--collapsed')).toHaveLength(1)

    wrapper.unmount()
  })

  it('preserves exact common prefix and suffix rows when a diff exceeds the LCS limit', () => {
    const middleLength = 1230
    const originalLines = [
      'const sharedPrefix = true',
      ...Array.from({ length: middleLength }, (_, index) => `const old${index} = ${index}`),
      'const sharedSuffix = true',
    ]
    const modifiedLines = [
      'const sharedPrefix = true',
      ...Array.from({ length: middleLength }, (_, index) => `const next${index} = ${index}`),
      'const sharedSuffix = true',
    ]

    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'diff typescript',
          diff: true,
          originalCode: originalLines.join('\n'),
          updatedCode: modifiedLines.join('\n'),
          code: '',
          raw: '',
        },
      },
    })

    const originalRows = wrapper.findAll('.markstream-pre__diff-pane--original .markstream-pre__diff-line')
    expect(originalRows[0].classes()).toContain('markstream-pre__diff-line--context')
    expect(originalRows.at(-1)?.classes()).toContain('markstream-pre__diff-line--context')

    wrapper.unmount()
  })

  it('shows original line numbers on removed inline diff fallback rows', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffInline: true,
        node: {
          type: 'code_block',
          language: 'diff',
          diff: true,
          code: [
            '@@ -26,1 +25,1 @@',
            '- lineDecorationsWidth: 0,',
            '+ lineDecorationsWidth: 4,',
          ].join('\n'),
          raw: '',
        },
      },
    })

    const rows = wrapper.findAll('.markstream-pre__diff-pane--inline .markstream-pre__diff-line')
    const removed = rows.find(row => row.classes().includes('markstream-pre__diff-line--removed'))
    const added = rows.find(row => row.classes().includes('markstream-pre__diff-line--added'))

    expect(removed?.find('.markstream-pre__diff-number').text()).toBe('26')
    expect(added?.find('.markstream-pre__diff-number').text()).toBe('25')

    wrapper.unmount()
  })

  it('keeps repeated braces and blank lines anchored before inserted inline source rows', () => {
    const originalCode = [
      '  };',
      '}',
      '',
      'function splitUnifiedDiff(patch: string): { original: string; updated: string } {',
      '  const original: string[] = [];',
      '  const updated: string[] = [];',
      '  }',
      '',
      '  for (const raw of lines) {',
    ].join('\n')
    const updatedCode = [
      '  };',
      '}',
      '',
      'function isNewFileDiff(file: FileChange): boolean {',
      '  const { original, updated } = splitUnifiedDiff(file.content ?? "");',
      '  return original.length === 0 && updated.length > 0;',
      '}',
      '',
      'function splitUnifiedDiff(patch: string): { original: string; updated: string } {',
      '  const original: string[] = [];',
      '  const updated: string[] = [];',
      '  }',
      '',
      '  for (const raw of lines) {',
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
          code: '',
          raw: '',
        },
      },
    })

    const rows = wrapper.findAll('.markstream-pre__diff-pane--inline .markstream-pre__diff-line')
    const rowSummary = rows.map(row => ({
      number: row.find('.markstream-pre__diff-number').text(),
      text: row.find('.markstream-pre__diff-content-inner').text(),
      classes: row.classes(),
    }))

    expect(rowSummary.slice(0, 9).map(row => row.number)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
    expect(rowSummary[1].classes).toContain('markstream-pre__diff-line--context')
    expect(rowSummary[2].classes).toContain('markstream-pre__diff-line--context')
    for (const row of rowSummary.slice(3, 8))
      expect(row.classes).toContain('markstream-pre__diff-line--added')
    expect(rowSummary[8]).toMatchObject({
      number: '9',
      text: 'function splitUnifiedDiff(patch: string): { original: string; updated: string } {',
    })
    expect(rowSummary[8].classes).toContain('markstream-pre__diff-line--context')

    wrapper.unmount()
  })

  it('allows empty added and removed rows to receive diff fill styles', () => {
    const source = readFileSync(
      'src/components/PreCodeNode/PreCodeNode.vue',
      'utf8',
    )

    expect(source).toContain('.markstream-pre__diff-line--added::before')
    expect(source).toContain('.markstream-pre__diff-line--removed::before')
    expect(source).toContain('.markstream-pre__diff-line::after')
    expect(source).toContain('.markstream-pre__diff-line--added::after')
    expect(source).toContain('.markstream-pre__diff-line--removed::after')
    expect(source).toContain('.markstream-pre__diff-line--added > .markstream-pre__diff-rail')
    expect(source).toContain('.markstream-pre__diff-line--removed > .markstream-pre__diff-rail')
    expect(source).toContain('.markstream-pre__diff-line--added > .markstream-pre__diff-number')
    expect(source).toContain('.markstream-pre__diff-line--removed > .markstream-pre__diff-number')
    expect(source).toContain('background: var(--stream-monaco-added-line-fill, var(--markstream-diff-added-line-fill, transparent));')
    expect(source).toContain('background: var(--stream-monaco-removed-line-fill, var(--markstream-diff-removed-line-fill, transparent));')
    expect(source).toContain('--markstream-pre-diff-line-number-bg: var(')
    expect(source).toContain('--markstream-pre-diff-line-number-border: var(')
    expect(source).toContain('var(--markstream-diff-gutter-guide, hsl(var(--ms-border, 214 32% 91%) / 0.72))')
    expect(source).toContain('background: var(--markstream-pre-diff-line-number-bg);')
    expect(source).toContain('box-shadow: inset -1px 0 var(--markstream-pre-diff-line-number-border);')
    expect(source).toContain('--markstream-pre-diff-content-height')
    expect(source).toContain('color: var(--stream-monaco-added-fg, var(--markstream-diff-added-fg, var(--code-line-number)));')
    expect(source).toContain('color: var(--stream-monaco-removed-fg, var(--markstream-diff-removed-fg, var(--code-line-number)));')
    expect(source).not.toMatch(/\.markstream-pre__diff-line--added\s*\{\s*color:/)
    expect(source).not.toMatch(/\.markstream-pre__diff-line--removed\s*\{\s*color:/)
    expect(source).not.toContain('.markstream-pre__diff-line--added:not(.markstream-pre__diff-line--empty)::before')
    expect(source).not.toContain('.markstream-pre__diff-line--removed:not(.markstream-pre__diff-line--empty)::before')
  })

  it('keeps inline diff fallback full width when wrap is disabled', () => {
    const source = readFileSync(
      'src/components/PreCodeNode/PreCodeNode.vue',
      'utf8',
    )

    expect(source).toContain('pre.markstream-pre--diff-preview.markstream-pre--diff-inline:not(.is-wrap) > .markstream-pre__diff-code')
    expect(source).toContain('grid-template-columns: minmax(100%, max-content);')
    expect(source).toContain('width: 100%;')
    expect(source).toContain('min-width: max-content;')
    expect(source).toContain('white-space: inherit;')
    expect(source).toContain('overflow-wrap: normal;')
    expect(source).toContain('pre.markstream-pre--diff-preview.is-wrap')
    expect(source).toContain('white-space: pre-wrap;')
    expect(source).toContain('overflow-wrap: anywhere;')
  })

  it('keeps diff fallback rows and content at least pane width', () => {
    const source = readFileSync(
      'src/components/PreCodeNode/PreCodeNode.vue',
      'utf8',
    )

    expect(source).toContain('.markstream-pre__diff-line {\n  position: relative;\n  display: block;\n  box-sizing: border-box;\n  width: 100%;\n  min-width: 100%;')
    expect(source).toContain('.markstream-pre__diff-content {\n  position: relative;\n  z-index: 1;\n  display: block;\n  width: max-content;\n  min-width: 100%;')
    expect(source).toContain('.markstream-pre--diff-preview.is-wrap .markstream-pre__diff-content {\n  width: auto;\n  min-width: 0;')
  })

  it('uses modified gutter metrics without an extra gap for inline diff fallback', () => {
    const source = readFileSync(
      'src/components/PreCodeNode/PreCodeNode.vue',
      'utf8',
    )

    expect(source).toContain('pre.markstream-pre--diff-preview.markstream-pre--diff-inline {')
    expect(source).toContain('--markstream-pre-diff-gutter-marker-width: var(--stream-monaco-gutter-marker-width, 4px);')
    expect(source).toContain('--markstream-pre-diff-code-gap: var(--stream-monaco-diff-code-gap, 7.8px);')
    expect(source).toContain('--markstream-pre-diff-code-padding: var(--stream-monaco-diff-code-padding, 0px);')
    expect(source).toContain('--markstream-diff-added-gutter: linear-gradient(')
    expect(source).toContain('--markstream-diff-removed-gutter: linear-gradient(')
    expect(source).toContain('--markstream-pre-diff-line-number-padding-left: var(--stream-monaco-line-number-padding-left, 15.6px);')
    expect(source).toContain('--markstream-pre-diff-line-number-padding-right: var(--stream-monaco-line-number-padding-right, 7.8px);')
    expect(source).toContain('--markstream-pre-diff-line-number-bg: var(')
    expect(source).toContain('--markstream-pre-diff-line-number-border: var(')
    expect(source).toContain('var(--markstream-diff-gutter-guide, hsl(var(--ms-border, 214 32% 91%) / 0.72))')
    expect(source).toContain('--markstream-pre-diff-line-number-box-width: calc(')
    expect(source).toContain('--markstream-pre-diff-code-fill-left: calc(')
    expect(source).toContain('--markstream-pre-diff-code-left: calc(')
    expect(source).toContain('var(--markstream-pre-diff-line-number-left)')
    expect(source).toContain('+ var(--markstream-pre-diff-line-number-box-width)')
    expect(source).toContain('+ var(--markstream-pre-diff-line-number-gap-to-code)')
    expect(source).not.toContain('--markstream-pre-diff-scrollable-left')
    expect(source).not.toContain('left: var(--markstream-pre-diff-scrollable-left);')
    expect(source).toContain('padding-left: var(--markstream-pre-diff-code-left);')
    expect(source).toContain('left: var(--markstream-pre-diff-code-fill-left);')
    expect(source).toContain('padding-left: var(--markstream-pre-diff-line-number-padding-left, 15.6px);')
    expect(source).toContain('padding-right: var(--markstream-pre-diff-line-number-padding-right, 7.8px);')
    expect(source).toContain('box-shadow: inset -1px 0 var(--markstream-pre-diff-line-number-border);')
    expect(source).toContain('width: var(--markstream-pre-diff-gutter-marker-width, 4px);')
  })

  it('keeps diff fallback line fills square', () => {
    const source = readFileSync(
      'src/components/PreCodeNode/PreCodeNode.vue',
      'utf8',
    )

    expect(source).toContain('.markstream-pre__diff-line::before')
    expect(source).toContain('border-radius: 0;')
    expect(source).toContain('.markstream-pre__diff-line--added::before')
    expect(source).toContain('.markstream-pre__diff-line--removed::before')
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

  it('aligns side-by-side source changes with Monaco spacer rows before handoff', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'ts',
          diff: true,
          originalCode: ['same', 'old one', 'old two', 'old three', 'tail'].join('\n'),
          updatedCode: ['same', 'new one', 'tail'].join('\n'),
          code: '',
          raw: '',
        },
      },
    })

    const summarize = (selector: string) => wrapper.findAll(selector).map(row => ({
      number: row.find('.markstream-pre__diff-number').text(),
      text: row.find('.markstream-pre__diff-content-inner').text(),
      classes: row.classes(),
    }))
    const originalRows = summarize('.markstream-pre__diff-pane--original .markstream-pre__diff-line')
    const modifiedRows = summarize('.markstream-pre__diff-pane--modified .markstream-pre__diff-line')

    expect(originalRows.map(row => row.number)).toEqual(['1', '2', '3', '4', '5'])
    expect(modifiedRows.map(row => row.number)).toEqual(['1', '2', '', '', '3'])
    expect(originalRows[1].classes).toContain('markstream-pre__diff-line--removed')
    expect(modifiedRows[1].classes).toContain('markstream-pre__diff-line--added')
    expect(modifiedRows[2].classes).toContain('markstream-pre__diff-line--spacer')
    expect(modifiedRows[3].classes).toContain('markstream-pre__diff-line--spacer')
    expect(originalRows[4].text).toBe('tail')
    expect(modifiedRows[4].text).toBe('tail')

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
    expect(wrapper.findAll('.markstream-pre__diff-content').map(node => node.element.textContent)).toEqual([
      'same before',
      'old value',
      'new value',
      'same after',
    ])
    expect(wrapper.findAll('.markstream-pre__diff-line--removed')).toHaveLength(1)
    expect(wrapper.findAll('.markstream-pre__diff-line--added')).toHaveLength(1)

    wrapper.unmount()
  })

  it('normalizes inline patch indentation to match source diff rows', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffInline: true,
        node: {
          type: 'code_block',
          language: 'diff',
          diff: true,
          code: [
            '{',
            '  "type": "module",',
            '- "version": "0.0.49",',
            '+ "version": "0.0.54-beta.1",',
          ].join('\n'),
          raw: '```diff json:package.json',
        },
      },
    })

    expect(wrapper.findAll('.markstream-pre__diff-content').map(node => node.element.textContent)).toEqual([
      '{',
      '  "type": "module",',
      '  "version": "0.0.49",',
      '  "version": "0.0.54-beta.1",',
    ])

    wrapper.unmount()
  })

  it('does not add an extra space to already-indented inline patch rows', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffInline: true,
        node: {
          type: 'code_block',
          language: 'diff',
          diff: true,
          code: [
            '{',
            '  "type": "module",',
            '-  "version": "0.0.49",',
            '+  "version": "0.0.54-beta.1",',
          ].join('\n'),
          raw: '```diff json:package.json',
        },
      },
    })

    expect(wrapper.findAll('.markstream-pre__diff-content').map(node => node.element.textContent)).toEqual([
      '{',
      '  "type": "module",',
      '  "version": "0.0.49",',
      '  "version": "0.0.54-beta.1",',
    ])

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

    expect(removedNumber.text()).toBe('4')
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
