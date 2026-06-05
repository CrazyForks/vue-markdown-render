import { mount } from '@vue/test-utils'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushAll } from './setup/flush-all'

const streamMarkdownMock = vi.hoisted(() => {
  const createdRenderers: any[] = []
  const registerHighlight = vi.fn(async () => {})
  const createShikiStreamRenderer = vi.fn((el: HTMLElement) => {
    const renderer = {
      updateCode: vi.fn(async (code: string, lang?: string) => {
        el.textContent = `${lang ?? ''}:${code}`
      }),
      setTheme: vi.fn(async () => {}),
      dispose: vi.fn(),
    }
    createdRenderers.push(renderer)
    return renderer
  })

  return {
    createdRenderers,
    createShikiStreamRenderer,
    defaultLanguages: ['typescript', 'objective-c', 'objective-cpp', 'plaintext'],
    registerHighlight,
  }
})

vi.mock('stream-markdown', () => ({
  createShikiStreamRenderer: streamMarkdownMock.createShikiStreamRenderer,
  defaultLanguages: streamMarkdownMock.defaultLanguages,
  registerHighlight: streamMarkdownMock.registerHighlight,
}))
vi.mock('../packages/markstream-vue2/node_modules/stream-markdown', () => ({
  createShikiStreamRenderer: streamMarkdownMock.createShikiStreamRenderer,
  defaultLanguages: streamMarkdownMock.defaultLanguages,
  registerHighlight: streamMarkdownMock.registerHighlight,
}))
vi.mock('../packages/markstream-react/node_modules/stream-markdown', () => ({
  createShikiStreamRenderer: streamMarkdownMock.createShikiStreamRenderer,
  defaultLanguages: streamMarkdownMock.defaultLanguages,
  registerHighlight: streamMarkdownMock.registerHighlight,
}))

function makeNode(language = 'typescript') {
  const code = 'const value = 1'
  return {
    type: 'code_block' as const,
    language,
    code,
    raw: `\`\`\`${language}\n${code}\n\`\`\``,
  }
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await new Promise(r => setTimeout(r, 0))
  })
}

async function waitForRendererCreated() {
  for (let i = 0; i < 10; i++) {
    if (streamMarkdownMock.createShikiStreamRenderer.mock.calls.length > 0)
      return
    await flushAll()
  }
}

async function waitForReactRendererCreated() {
  for (let i = 0; i < 10; i++) {
    if (streamMarkdownMock.createShikiStreamRenderer.mock.calls.length > 0)
      return
    await flushReact()
  }
}

function resetStreamMarkdownMock() {
  streamMarkdownMock.createdRenderers.length = 0
  streamMarkdownMock.createShikiStreamRenderer.mockClear()
  streamMarkdownMock.registerHighlight.mockClear()
}

beforeEach(() => {
  vi.resetModules()
  resetStreamMarkdownMock()
})

afterEach(() => {
  resetStreamMarkdownMock()
  document.body.innerHTML = ''
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

describe('markdown code block Shiki langs', () => {
  it('passes langs to Vue registerHighlight and renderer', async () => {
    const { default: MarkdownCodeBlockNode } = await import('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('typescript'),
        langs: ['typescript'],
      },
    })

    await flushAll()
    await waitForRendererCreated()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledWith(
      expect.objectContaining({ langs: ['typescript'] }),
    )
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ langs: ['typescript'] }),
    )

    wrapper.unmount()
  })

  it('passes langs to Vue2 registerHighlight and renderer', async () => {
    const { default: Vue2MarkdownCodeBlockNode } = await import('../packages/markstream-vue2/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(Vue2MarkdownCodeBlockNode as any, {
      props: {
        loading: false,
        node: makeNode('typescript'),
        langs: ['typescript'],
      },
    })

    await flushAll()
    await waitForRendererCreated()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledWith(
      expect.objectContaining({ langs: ['typescript'] }),
    )
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ langs: ['typescript'] }),
    )

    wrapper.unmount()
  })

  it('keeps Objective-C Shiki ids in React registration and rendering', async () => {
    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node: makeNode('objective-c'),
        langs: ['objective-c', 'objective-cpp'],
      }))
    })
    await flushReact()
    await waitForReactRendererCreated()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledWith(
      expect.objectContaining({ langs: ['objective-c', 'objective-cpp'] }),
    )
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ langs: ['objective-c', 'objective-cpp'] }),
    )
    expect(streamMarkdownMock.createdRenderers[0]?.updateCode).toHaveBeenCalledWith(
      'const value = 1',
      'objective-c',
    )

    await act(async () => {
      root.unmount()
    })
  })
})
