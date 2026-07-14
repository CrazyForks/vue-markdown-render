import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import CodeBlockNode from '../src/components/CodeBlockNode/CodeBlockNode.vue'
import { resetCodeBlockRuntimeReadyForTest } from '../src/components/CodeBlockNode/runtime'
import MarkdownCodeBlockNode from '../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue'

function helpers() {
  return (globalThis as any).__streamMonacoHelpers
}

async function flush() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

function node(code: string, loading: boolean) {
  return {
    type: 'code_block' as const,
    language: 'typescript',
    code,
    raw: `\`\`\`typescript\n${code}\n\`\`\``,
    loading,
  }
}

describe('markdownCodeBlockNode Diffs adapter', () => {
  beforeEach(() => {
    resetCodeBlockRuntimeReadyForTest()
    const runtime = helpers()
    runtime.useMonaco.mockReset().mockImplementation(() => runtime)
    runtime.createEditor.mockReset().mockImplementation(async (container: HTMLElement) => {
      container.replaceChildren(document.createElement('diffs-container'))
    })
    runtime.createDiffEditor.mockReset()
    runtime.updateCode.mockReset()
    runtime.getEditor.mockReset().mockReturnValue(null)
    runtime.getEditorView.mockReset().mockReturnValue({
      getModel: () => ({ getValue: () => '', getLineCount: () => 1 }),
      getOption: () => 14,
      updateOptions: vi.fn(),
      layout: vi.fn(),
      getContentHeight: () => 18,
    })
    runtime.cleanupEditor.mockReset()
    runtime.safeClean.mockReset()
    runtime.setTheme.mockReset()
  })

  it('uses the shared pre to final Diffs lifecycle', async () => {
    const runtime = helpers()
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        node: node('const streaming = true', true),
        loading: true,
        stream: true,
        showHeader: false,
      },
    })

    await flush()
    expect(wrapper.find('pre.code-pre-fallback').exists()).toBe(true)
    expect(runtime.createEditor).not.toHaveBeenCalled()

    await wrapper.setProps({
      node: node('const finished = true', false),
      loading: false,
    })
    await vi.waitFor(() => {
      expect(runtime.createEditor).toHaveBeenCalledTimes(1)
      expect(wrapper.find('diffs-container').exists()).toBe(true)
    })
    wrapper.unmount()
  })

  it('forwards shell props and adapts the preview payload', async () => {
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        node: { ...node('<main />', false), language: 'html' },
        loading: false,
        showHeader: false,
        showTooltips: false,
      },
    })

    const codeBlock = wrapper.getComponent(CodeBlockNode)
    expect(codeBlock.props('showHeader')).toBe(false)
    expect(codeBlock.props('showTooltips')).toBe(false)

    codeBlock.vm.$emit('previewCode', {
      artifactType: 'text/html',
      artifactTitle: 'HTML Preview',
    })
    await nextTick()
    expect(wrapper.emitted('previewCode')?.[0]).toEqual([{
      type: 'text/html',
      content: '<main />',
      title: 'HTML Preview',
    }])
    wrapper.unmount()
  })
})
