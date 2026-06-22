import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import MarkdownCodeBlockNode from '../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue'

const streamMarkdownMock = vi.hoisted(() => ({
  createShikiStreamRenderer: vi.fn(),
  registerHighlight: vi.fn(),
}))

vi.mock('stream-markdown', () => ({
  createShikiStreamRenderer: streamMarkdownMock.createShikiStreamRenderer,
  registerHighlight: streamMarkdownMock.registerHighlight,
}))

function makeNode(code: string) {
  return {
    type: 'code_block' as const,
    language: 'js',
    code,
    raw: `\`\`\`js\n${code}\n\`\`\``,
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

async function flushRenderer() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('markdownCodeBlockNode Shiki stale render handling', () => {
  beforeEach(() => {
    streamMarkdownMock.registerHighlight.mockReset().mockImplementation(async (options?: { themes?: string[] }) => {
      if (options?.themes?.includes('bad-theme'))
        throw new Error('registration failed')
    })
    streamMarkdownMock.createShikiStreamRenderer.mockReset().mockImplementation((el: HTMLElement) => ({
      updateCode: vi.fn(async (code: string, lang?: string) => {
        el.innerHTML = `<pre class="shiki"><code data-lang="${lang ?? ''}">${escapeHtml(code)}</code></pre>`
      }),
      setTheme: vi.fn(),
      dispose: vi.fn(),
    }))
  })

  it('keeps the current fallback when Shiki reconfiguration fails after code changes', async () => {
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('const oldValue = 1'),
        themes: ['vitesse-light'],
      },
    })

    await vi.waitFor(() => {
      expect(wrapper.get('[data-markstream-code-block="1"]').attributes('data-markstream-enhancement-state')).toBe('ready')
    })
    expect(wrapper.get('.code-block-render').text()).toContain('const oldValue = 1')

    await wrapper.setProps({
      node: makeNode('const newValue = 2'),
      themes: ['bad-theme'],
    })
    await flushRenderer()

    await vi.waitFor(() => {
      expect(wrapper.get('[data-markstream-code-block="1"]').attributes('data-markstream-enhancement-state')).toBe('fallback')
    })
    expect(wrapper.get('.code-fallback-plain code').text()).toBe('const newValue = 2')
    expect(wrapper.get('.code-block-render').text()).toContain('const oldValue = 1')

    wrapper.unmount()
  })
})
