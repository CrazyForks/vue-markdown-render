import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick } from 'vue'
import CodeBlockNode from '../src/components/CodeBlockNode/CodeBlockNode.vue'
import { resetCodeBlockRuntimeReadyForTest } from '../src/components/CodeBlockNode/runtime'
import { provideOffscreenHeavyNodeDeferral, provideViewportPriority } from '../src/composables/viewportPriority'

interface VisibilityObserver {
  emit: () => void
  options: IntersectionObserverInit
}

const observers: VisibilityObserver[] = []

class IntersectionObserverStub {
  private target?: Element

  constructor(
    private callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit = {},
  ) {
    observers.push({
      options,
      emit: () => {
        if (!this.target)
          return
        this.callback([
          {
            target: this.target,
            isIntersecting: true,
            intersectionRatio: 1,
          } as IntersectionObserverEntry,
        ], this as unknown as IntersectionObserver)
      },
    })
  }

  observe(target: Element) {
    this.target = target
  }

  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}

function helpers() {
  return (globalThis as any).__streamMonacoHelpers
}

function installFinalDiffsDom(container: HTMLElement) {
  const surface = document.createElement('diffs-container')
  surface.textContent = 'final diffs surface'
  container.replaceChildren(surface)
}

function resetHelpers() {
  resetCodeBlockRuntimeReadyForTest()
  const runtime = helpers()
  const editorView = {
    getModel: () => ({ getValue: () => '', getLineCount: () => 1 }),
    getOption: () => 14,
    updateOptions: vi.fn(),
    layout: vi.fn(),
    getContentHeight: () => 18,
  }

  runtime.useMonaco.mockReset().mockImplementation(() => runtime)
  runtime.createEditor.mockReset().mockImplementation(async (container: HTMLElement) => {
    installFinalDiffsDom(container)
  })
  runtime.createDiffEditor.mockReset().mockImplementation(async (container: HTMLElement) => {
    installFinalDiffsDom(container)
  })
  runtime.updateCode.mockReset()
  runtime.updateDiff.mockReset()
  runtime.getEditor.mockReset().mockReturnValue(null)
  runtime.getEditorView.mockReset().mockReturnValue(editorView)
  runtime.getDiffEditorView.mockReset().mockReturnValue({
    ...editorView,
    getLineChanges: () => [],
    getOriginalEditor: () => editorView,
    getModifiedEditor: () => editorView,
  })
  runtime.cleanupEditor.mockReset()
  runtime.safeClean.mockReset()
  runtime.refreshDiffPresentation.mockReset()
  runtime.setTheme.mockReset()
}

async function flush() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

function makeNode(code: string, loading: boolean) {
  return {
    type: 'code_block' as const,
    language: 'typescript',
    code,
    raw: `\`\`\`typescript\n${code}\n\`\`\``,
    loading,
  }
}

const DeferredCodeBlockNode = defineComponent({
  inheritAttrs: false,
  setup(_props, { attrs }) {
    provideOffscreenHeavyNodeDeferral(computed(() => true))
    provideViewportPriority(() => null, true)
    return () => h(CodeBlockNode as any, attrs)
  },
})

describe('codeBlockNode final Diffs gate', () => {
  beforeEach(() => {
    observers.length = 0
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
    resetHelpers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps a streaming block in pre even after it becomes visible', async () => {
    const runtime = helpers()
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const first = true', true),
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await flush()
    expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(true)
    expect(wrapper.get('[data-markstream-code-block="1"]').attributes('data-markstream-code-block-state')).toBe('streaming')
    expect(runtime.useMonaco).not.toHaveBeenCalled()
    expect(runtime.createEditor).not.toHaveBeenCalled()
    expect(observers.at(-1)?.options.rootMargin).toBe('0px')

    observers.at(-1)?.emit()
    await flush()
    expect(runtime.useMonaco).not.toHaveBeenCalled()
    expect(runtime.createEditor).not.toHaveBeenCalled()

    await wrapper.setProps({
      node: makeNode('const second = true', true),
      loading: true,
    })
    await flush()
    expect(runtime.createEditor).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('const second = true')
    wrapper.unmount()
  })

  it('waits for both completion and actual visibility before creating one File surface', async () => {
    const runtime = helpers()
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const ready = true', false),
        loading: false,
        stream: true,
        showHeader: false,
      },
    })

    await flush()
    expect(runtime.useMonaco).not.toHaveBeenCalled()
    expect(runtime.createEditor).not.toHaveBeenCalled()

    observers.at(-1)?.emit()
    await vi.waitFor(() => {
      expect(runtime.useMonaco).toHaveBeenCalledTimes(1)
      expect(runtime.createEditor).toHaveBeenCalledTimes(1)
      expect(runtime.useMonaco.mock.calls[0]?.[0]?.stream).toBe(false)
      expect(runtime.useMonaco.mock.calls[0]?.[0]?.disableFileHeader).toBe(true)
      expect(wrapper.find('diffs-container').exists()).toBe(true)
      expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(false)
      expect(wrapper.get('[data-markstream-code-block="1"]').attributes('data-markstream-code-block-state')).toBe('settled')
    })

    await wrapper.setProps({ node: makeNode('const updated = true', false) })
    await flush()
    expect(runtime.createEditor).toHaveBeenCalledTimes(1)
    expect(runtime.updateCode).toHaveBeenCalledWith('const updated = true', 'typescript')
    wrapper.unmount()
  })

  it('applies the active theme after a visible File surface mounts', async () => {
    const runtime = helpers()
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: makeNode('const ready = true', false),
        loading: false,
        stream: true,
        showHeader: false,
        isDark: true,
        darkTheme: 'initial-surface-dark',
        lightTheme: 'initial-surface-light',
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await vi.waitFor(() => {
      expect(runtime.createEditor).toHaveBeenCalledTimes(1)
      expect(runtime.setTheme).toHaveBeenCalledWith('initial-surface-dark')
    })

    runtime.setTheme.mockClear()
    await wrapper.setProps({ isDark: false })
    await vi.waitFor(() => {
      expect(runtime.setTheme).toHaveBeenCalledWith('initial-surface-light')
    })
    expect(runtime.createEditor).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('creates one FileDiff surface only after a visible diff completes', async () => {
    const runtime = helpers()
    const diffNode = {
      type: 'code_block' as const,
      language: 'typescript',
      code: '',
      raw: '```diff\n-const before = 1\n+const after = 2\n```',
      diff: true,
      originalCode: 'const before = 1',
      updatedCode: 'const after = 2',
      loading: true,
    }
    const wrapper = mount(DeferredCodeBlockNode, {
      props: {
        node: diffNode,
        loading: true,
        stream: true,
        showHeader: false,
        monacoOptions: { renderSideBySide: true, diffWordWrap: 'off' },
      },
    })

    await flush()
    observers.at(-1)?.emit()
    await flush()
    expect(runtime.createDiffEditor).not.toHaveBeenCalled()

    await wrapper.setProps({
      node: { ...diffNode, loading: false },
      loading: false,
    })
    await vi.waitFor(() => {
      expect(runtime.createDiffEditor).toHaveBeenCalledTimes(1)
      expect(runtime.useMonaco.mock.calls[0]?.[0]?.stream).toBe(false)
      expect(runtime.useMonaco.mock.calls[0]?.[0]?.wordWrap).toBe('off')
      expect(wrapper.find('diffs-container').exists()).toBe(true)
      expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(false)
      expect(wrapper.get('[data-markstream-code-block="1"]').attributes('data-markstream-code-block-state')).toBe('settled')
    })
    wrapper.unmount()
  })
})
