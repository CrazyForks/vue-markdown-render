import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import CodeBlockNode from '../src/components/CodeBlockNode/CodeBlockNode.vue'
import { resetCodeBlockRuntimeReadyForTest } from '../src/components/CodeBlockNode/runtime'

function getStreamMonacoHelpers() {
  return (globalThis as any).__streamMonacoHelpers
}

function resetHelpers() {
  resetCodeBlockRuntimeReadyForTest()
  const helpers = getStreamMonacoHelpers()
  const makeEditorView = () => ({
    getModel: () => ({ getLineCount: () => 1 }),
    getOption: () => 18,
    updateOptions: vi.fn(),
    layout: vi.fn(),
  })
  helpers.useMonaco.mockReset().mockImplementation(() => helpers)
  helpers.createEditor.mockReset().mockImplementation(async () => {})
  helpers.createDiffEditor.mockReset().mockImplementation(async () => {})
  helpers.updateCode.mockReset()
  helpers.updateDiff.mockReset()
  helpers.getEditor.mockReset().mockImplementation(() => null)
  helpers.getEditorView.mockReset().mockReturnValue(makeEditorView())
  helpers.getDiffEditorView.mockReset().mockReturnValue(makeEditorView())
  helpers.cleanupEditor.mockReset().mockImplementation(() => {})
  helpers.safeClean.mockReset().mockImplementation(() => {})
  helpers.refreshDiffPresentation.mockReset().mockImplementation(() => {})
  helpers.setTheme.mockReset().mockImplementation(async () => {})
}

async function flushPendingMicrotasks() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  await new Promise<void>((resolve) => {
    if (typeof globalThis.requestAnimationFrame === 'function')
      globalThis.requestAnimationFrame(() => resolve())
    else
      setTimeout(resolve, 0)
  })
}

describe('diff CodeBlockNode fallback height stability', () => {
  beforeEach(() => {
    resetHelpers()
  })

  it('provides non-null minHeight for diff fallback even when estimatedContentHeightPx is set', async () => {
    const helpers = getStreamMonacoHelpers()
    // Hold createDiffEditor so Monaco is never "ready" during this test
    helpers.createDiffEditor.mockImplementation(() => new Promise<void>(() => {}))

    const originalCode = 'const a = 1\nconst b = 2\nconst c = 3\n'
    const updatedCode = 'const a = 1\nconst b = 99\nconst c = 3\n'

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: '',
          raw: '',
          diff: true,
          originalCode,
          updatedCode,
        },
        // Simulate virtual scroll passing an estimated height
        estimatedContentHeightPx: 240,
        estimatedHeightPx: 280,
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    const pre = wrapper.find('pre.code-pre-fallback')
    expect(pre.exists()).toBe(true)

    const minHeight = Number.parseFloat((pre.element as HTMLElement).style.minHeight ?? '0')
    // 3 lines * 18px lineHeight = 54px minimum; must not be 0 despite estimatedContentHeightPx
    expect(minHeight).toBeGreaterThan(0)

    wrapper.unmount()
  })

  it('diff fallback minHeight uses line-count, not estimatedContentHeightPx', async () => {
    const helpers = getStreamMonacoHelpers()
    helpers.createDiffEditor.mockImplementation(() => new Promise<void>(() => {}))

    const tenLines = Array.from({ length: 10 }, (_, i) => `const x${i} = ${i}`).join('\n')
    const twoLines = 'const a = 1\nconst b = 2'

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: '',
          raw: '',
          diff: true,
          originalCode: tenLines,
          updatedCode: twoLines,
        },
        // A large estimated height that should NOT override the line-count-based fallback
        estimatedContentHeightPx: 500,
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    const pre = wrapper.find('pre.code-pre-fallback')
    expect(pre.exists()).toBe(true)

    const minHeight = Number.parseFloat((pre.element as HTMLElement).style.minHeight ?? '0')
    // max(10, 2) = 10 lines; minHeight should reflect line count, not 500px estimated
    expect(minHeight).toBeGreaterThan(0)
    expect(minHeight).toBeLessThan(500)

    wrapper.unmount()
  })

  it('diff fallback is visible before Monaco diff editor becomes ready', async () => {
    const helpers = getStreamMonacoHelpers()
    helpers.createDiffEditor.mockImplementation(() => new Promise<void>(() => {}))

    const wrapper = mount(CodeBlockNode, {
      props: {
        node: {
          type: 'code_block',
          language: 'ts',
          code: '',
          raw: '',
          diff: true,
          originalCode: 'const a = 1',
          updatedCode: 'const a = 2',
        },
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flushPendingMicrotasks()

    // Fallback pre must be visible (not hidden) while Monaco hasn't loaded
    const pre = wrapper.find('pre.code-pre-fallback')
    expect(pre.exists()).toBe(true)
    expect(pre.isVisible()).toBe(true)

    wrapper.unmount()
  })
})
