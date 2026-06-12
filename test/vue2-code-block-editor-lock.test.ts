import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import CodeBlockNode from '../packages/markstream-vue2/src/components/CodeBlockNode/CodeBlockNode.vue'

interface StreamMonacoHelpers {
  useMonaco: ReturnType<typeof vi.fn>
  createEditor: ReturnType<typeof vi.fn>
  createDiffEditor: ReturnType<typeof vi.fn>
  updateCode: ReturnType<typeof vi.fn>
  updateDiff: ReturnType<typeof vi.fn>
  getEditor: ReturnType<typeof vi.fn>
  getEditorView: ReturnType<typeof vi.fn>
  getDiffEditorView: ReturnType<typeof vi.fn>
  cleanupEditor: ReturnType<typeof vi.fn>
  safeClean: ReturnType<typeof vi.fn>
  refreshDiffPresentation: ReturnType<typeof vi.fn>
  setTheme: ReturnType<typeof vi.fn>
}

function getStreamMonacoHelpers(): StreamMonacoHelpers {
  return (globalThis as any).__streamMonacoHelpers
}

function resetStreamMonacoHelpers() {
  const helpers = getStreamMonacoHelpers()
  const makeEditorView = () => ({
    getModel: () => ({ getLineCount: () => 1 }),
    getOption: () => 14,
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

function getThemeUpdater(wrapper: any) {
  const vm = wrapper.vm as any
  return vm?.themeUpdate ?? vm?.$?.setupState?.themeUpdate ?? null
}

async function flushPendingMicrotasks() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

async function waitForCreateEditorCalls(expected: number, helpers: StreamMonacoHelpers, timeout = 1000) {
  const start = Date.now()
  while (helpers.createEditor.mock.calls.length < expected) {
    if (Date.now() - start > timeout)
      throw new Error('Timed out waiting for createEditor call')
    await flushPendingMicrotasks()
  }
}

async function waitForCreateDiffEditorCalls(expected: number, helpers: StreamMonacoHelpers, timeout = 1000) {
  const start = Date.now()
  while (helpers.createDiffEditor.mock.calls.length < expected) {
    if (Date.now() - start > timeout)
      throw new Error('Timed out waiting for createDiffEditor call')
    await flushPendingMicrotasks()
  }
}

async function waitForCondition(check: () => boolean, timeout = 1000) {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeout)
      throw new Error('Timed out waiting for condition')
    await flushPendingMicrotasks()
  }
}

describe('markstream-vue2 codeBlockNode theme updates', () => {
  beforeEach(() => {
    resetStreamMonacoHelpers()
  })

  it('updates single-editor themes without recreating the editor when isDark toggles', async () => {
    const helpers = getStreamMonacoHelpers()

    const wrapper = mount(CodeBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'json',
          code: '{"hello":"world"}',
          raw: '```json\n{"hello":"world"}\n```',
        },
        loading: false,
        showHeader: false,
        isDark: false,
        darkTheme: 'vitesse-dark',
        lightTheme: 'vitesse-light',
      },
    })

    await waitForCreateEditorCalls(1, helpers)
    await flushPendingMicrotasks()

    helpers.createEditor.mockClear()
    helpers.cleanupEditor.mockClear()
    helpers.safeClean.mockClear()
    helpers.setTheme.mockClear()

    await wrapper.setProps({ isDark: true })
    await flushPendingMicrotasks()
    if (helpers.setTheme.mock.calls.length === 0) {
      const themeUpdate = getThemeUpdater(wrapper)
      themeUpdate?.()
      await flushPendingMicrotasks()
    }

    expect(helpers.createEditor).not.toHaveBeenCalled()
    expect(helpers.cleanupEditor).not.toHaveBeenCalled()
    expect(helpers.safeClean).not.toHaveBeenCalled()
    expect(helpers.setTheme).toHaveBeenCalledTimes(1)
    expect(helpers.setTheme).toHaveBeenCalledWith('vitesse-dark')

    wrapper.unmount()
  })

  it('passes active themes and syntax languages to stream-monaco legacy', async () => {
    const helpers = getStreamMonacoHelpers()

    const wrapper = mount(CodeBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'tsx',
          code: 'export function TestHarness() {\n  return <section />\n}',
          raw: '```tsx\nexport function TestHarness() {\n  return <section />\n}\n```',
        },
        loading: false,
        showHeader: false,
        isDark: false,
        darkTheme: 'vitesse-dark',
        lightTheme: 'vitesse-light',
      },
    })

    await waitForCreateEditorCalls(1, helpers)

    const options = helpers.useMonaco.mock.calls[0]?.[0]
    expect(options.themes).toEqual(['vitesse-dark', 'vitesse-light'])
    expect(options.languages).toEqual(expect.arrayContaining(['tsx', 'typescript', 'plaintext']))

    wrapper.unmount()
  })

  it('updates diff themes without recreating the diff editor when isDark toggles', async () => {
    const helpers = getStreamMonacoHelpers()

    const wrapper = mount(CodeBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode: 'const a = 1\nconst b = 2\n',
          updatedCode: 'const a = 1\nconst c = 3\n',
          raw: '```diff\n-const b = 2\n+const c = 3\n```',
        },
        loading: false,
        showHeader: false,
        isDark: false,
        darkTheme: 'vitesse-dark',
        lightTheme: 'vitesse-light',
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)
    await flushPendingMicrotasks()

    helpers.createDiffEditor.mockClear()
    helpers.cleanupEditor.mockClear()
    helpers.safeClean.mockClear()
    helpers.refreshDiffPresentation.mockClear()
    helpers.setTheme.mockClear()

    await wrapper.setProps({ isDark: true })
    await flushPendingMicrotasks()
    if (helpers.setTheme.mock.calls.length === 0) {
      const themeUpdate = getThemeUpdater(wrapper)
      themeUpdate?.()
      await flushPendingMicrotasks()
    }

    expect(helpers.createDiffEditor).not.toHaveBeenCalled()
    expect(helpers.cleanupEditor).not.toHaveBeenCalled()
    expect(helpers.safeClean).not.toHaveBeenCalled()
    expect(helpers.setTheme).toHaveBeenCalledTimes(1)
    expect(helpers.setTheme).toHaveBeenCalledWith('vitesse-dark')
    expect(helpers.refreshDiffPresentation).toHaveBeenCalled()

    wrapper.unmount()
  })

  it('normalizes diff unchanged reveal icons to chevrons', async () => {
    const helpers = getStreamMonacoHelpers()

    helpers.createDiffEditor.mockImplementation(async (el: HTMLElement) => {
      el.innerHTML = `
        <div class="stream-monaco-diff-root">
          <div class="stream-monaco-diff-unchanged-bridge">
            <div class="stream-monaco-unchanged-rail">
              <button class="stream-monaco-unchanged-reveal" data-direction="down">
                <span class="codicon codicon-unfold"></span>
              </button>
            </div>
          </div>
        </div>
      `
    })

    const wrapper = mount(CodeBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'diff',
          code: '@@ -1 +1 @@',
          diff: true,
          originalCode: 'const a = 1\nconst b = 2\n',
          updatedCode: 'const a = 1\nconst c = 3\n',
          raw: '```diff\n-const b = 2\n+const c = 3\n```',
        },
        loading: false,
        showHeader: false,
        isDark: false,
        darkTheme: 'vitesse-dark',
        lightTheme: 'vitesse-light',
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)
    await waitForCondition(() => {
      const revealIcon = wrapper.element.querySelector(
        '.stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-reveal .codicon',
      ) as HTMLElement | null
      return revealIcon?.className === 'codicon codicon-chevron-down'
    })

    const revealIcon = wrapper.element.querySelector(
      '.stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-reveal .codicon',
    ) as HTMLElement | null

    expect(revealIcon?.className).toBe('codicon codicon-chevron-down')

    wrapper.unmount()
  })

  it('renders a two-pane diff fallback with Monaco-aligned metrics before the diff editor is ready', async () => {
    const helpers = getStreamMonacoHelpers()
    let resolveCreateDiffEditor: (() => void) | undefined

    helpers.createDiffEditor.mockImplementation(() => new Promise<void>((resolve) => {
      resolveCreateDiffEditor = resolve
    }))

    const wrapper = mount(CodeBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'json:package.json',
          code: '{\n  "name": "markstream-vue",\n  "type": "module",\n  "version": "0.0.54-beta.1"\n}',
          diff: true,
          originalCode: '{\n  "name": "markstream-vue",\n  "type": "module",\n  "version": "0.0.49"\n}',
          updatedCode: '{\n  "name": "markstream-vue",\n  "type": "module",\n  "version": "0.0.54-beta.1"\n}',
          raw: '```diff / json:package.json\n```',
        },
        loading: false,
        showHeader: false,
        isDark: false,
        monacoOptions: {
          fontFamily: 'Menlo',
          fontSize: 13,
          lineHeight: 20,
          padding: { top: 2, bottom: 6 },
          renderSideBySide: true,
          tabSize: 2,
        },
      },
    })

    await waitForCreateDiffEditorCalls(1, helpers)

    const fallback = wrapper.element.querySelector('pre.code-pre-fallback.markstream-pre--diff-preview') as HTMLElement | null
    expect(fallback).not.toBeNull()
    expect(fallback?.dataset.language).toBe('json')
    expect(fallback?.style.fontFamily).toBe('Menlo')
    expect(fallback?.style.fontSize).toBe('13px')
    expect(fallback?.style.lineHeight).toBe('20px')
    expect(fallback?.style.paddingTop).toBe('2px')
    expect(fallback?.style.paddingBottom).toBe('6px')
    expect(fallback?.style.tabSize).toBe('2')

    const panes = wrapper.element.querySelectorAll('.markstream-pre__diff-pane')
    expect(panes).toHaveLength(2)
    const options = helpers.useMonaco.mock.calls[0]?.[0]
    expect(options.languages).toEqual(expect.arrayContaining(['json', 'plaintext']))
    expect(wrapper.element.querySelector('.markstream-pre__diff-pane--original')?.textContent).toContain('"version": "0.0.49"')
    expect(wrapper.element.querySelector('.markstream-pre__diff-pane--modified')?.textContent).toContain('"version": "0.0.54-beta.1"')
    expect(wrapper.element.querySelector('.markstream-pre__diff-pane--original .markstream-pre__diff-line--removed')?.textContent).toContain('"version": "0.0.49"')
    expect(wrapper.element.querySelector('.markstream-pre__diff-pane--modified .markstream-pre__diff-line--added')?.textContent).toContain('"version": "0.0.54-beta.1"')

    resolveCreateDiffEditor?.()
    await flushPendingMicrotasks()

    wrapper.unmount()
  })
})

describe('markstream-vue2 codeBlockNode plain text theme fallback', () => {
  beforeEach(() => {
    resetStreamMonacoHelpers()
  })

  it('keeps dark plain text blocks on the fallback dark surface when Monaco reports light colors', async () => {
    const helpers = getStreamMonacoHelpers()

    helpers.createEditor.mockImplementation(async (el: HTMLElement) => {
      const editor = document.createElement('div')
      editor.className = 'monaco-editor'
      editor.style.backgroundColor = 'rgb(255, 255, 255)'
      editor.style.color = 'rgb(17, 24, 39)'

      const background = document.createElement('div')
      background.className = 'monaco-editor-background'
      background.style.backgroundColor = 'rgb(255, 255, 255)'

      const lines = document.createElement('div')
      lines.className = 'view-lines'
      lines.style.color = 'rgb(17, 24, 39)'

      editor.append(background, lines)
      el.appendChild(editor)
    })

    const wrapper = mount(CodeBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'plaintext',
          code: 'packages/',
          raw: '```text\npackages/\n```',
        },
        loading: false,
        isDark: true,
        darkTheme: 'vitesse-dark',
        lightTheme: 'vitesse-light',
      },
    })

    await waitForCreateEditorCalls(1, helpers)
    await flushPendingMicrotasks()

    const container = wrapper.get('.code-block-container').element as HTMLElement
    expect(container.classList.contains('is-dark')).toBe(true)
    expect(container.classList.contains('is-plain-text')).toBe(true)
    expect(container.style.getPropertyValue('--vscode-editor-background')).toBe('')
    expect(container.style.getPropertyValue('--vscode-editor-foreground')).toBe('')

    wrapper.unmount()
  })
})
