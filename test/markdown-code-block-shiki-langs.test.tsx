import { mount } from '@vue/test-utils'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { getHighlightRegistrationKey, getRegisterHighlightOptions } from '../src/utils/shikiLanguage'
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

async function waitForRendererCount(count: number) {
  for (let i = 0; i < 10; i++) {
    if (streamMarkdownMock.createShikiStreamRenderer.mock.calls.length >= count)
      return
    await flushAll()
  }
}

async function waitForLastRegisterHighlightLangs(langs: string[]) {
  for (let i = 0; i < 10; i++) {
    const calls = streamMarkdownMock.registerHighlight.mock.calls
    const lastCall = calls[calls.length - 1]?.[0] as { langs?: string[] } | undefined
    if (JSON.stringify(lastCall?.langs) === JSON.stringify(langs))
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

async function waitForReactRendererCount(count: number) {
  for (let i = 0; i < 10; i++) {
    if (streamMarkdownMock.createShikiStreamRenderer.mock.calls.length >= count)
      return
    await flushReact()
  }
}

function createDeferred() {
  let resolve!: () => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<void>((r, j) => {
    resolve = r
    reject = j
  })
  return { promise, reject, resolve }
}

function resetStreamMarkdownMock() {
  streamMarkdownMock.createdRenderers.length = 0
  streamMarkdownMock.createShikiStreamRenderer.mockClear()
  streamMarkdownMock.registerHighlight.mockReset()
  streamMarkdownMock.registerHighlight.mockImplementation(async () => {})
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
  it('normalizes Shiki langs and omits empty lang lists from registration options', () => {
    expect(getRegisterHighlightOptions(undefined, ['ts', 'js', 'ts'])).toEqual({
      langs: ['typescript', 'javascript'],
    })
    expect(getRegisterHighlightOptions(undefined, [])).toEqual({})
  })

  it('uses a stable registration key for reordered normalized langs', () => {
    expect(getHighlightRegistrationKey(['vitesse-light'], ['ts', 'js', 'ts'])).toBe(
      getHighlightRegistrationKey(['vitesse-light'], ['javascript', 'typescript']),
    )
  })

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

  it('uses default Vue highlight options when langs is empty', async () => {
    const { default: MarkdownCodeBlockNode } = await import('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('typescript'),
        langs: [],
      },
    })

    await flushAll()
    await waitForRendererCreated()

    const registerCalls = streamMarkdownMock.registerHighlight.mock.calls
    const rendererCalls = streamMarkdownMock.createShikiStreamRenderer.mock.calls
    const rendererOptions = rendererCalls[rendererCalls.length - 1]?.[1]

    expect(registerCalls[registerCalls.length - 1]?.[0]).toEqual({})
    expect(rendererOptions.langs).toBeUndefined()
    expect(streamMarkdownMock.createdRenderers[0]?.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'typescript',
    )

    wrapper.unmount()
  })

  it('does not re-register Vue highlight when the normalized lang set is reordered', async () => {
    const { default: MarkdownCodeBlockNode } = await import('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('typescript'),
        langs: ['ts', 'js', 'ts'],
      },
    })

    await flushAll()
    await waitForRendererCreated()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(1)
    expect(streamMarkdownMock.registerHighlight).toHaveBeenLastCalledWith(
      expect.objectContaining({ langs: ['typescript', 'javascript'] }),
    )

    await wrapper.setProps({ langs: ['javascript', 'typescript'] })
    await flushAll()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(1)
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('normalizes Vue Shiki aliases without using display aliases', async () => {
    const { default: MarkdownCodeBlockNode } = await import('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('cs'),
        langs: ['cs', 'txt'],
      },
    })

    await flushAll()
    await waitForRendererCreated()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledWith(
      expect.objectContaining({ langs: ['csharp', 'plaintext'] }),
    )
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ langs: ['csharp', 'plaintext'] }),
    )
    expect(streamMarkdownMock.createdRenderers[0]?.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'csharp',
    )
    expect(wrapper.text()).toContain('C#')

    wrapper.unmount()
  })

  it('keeps valid Shiki ids that differ from icon aliases in Vue', async () => {
    const { default: MarkdownCodeBlockNode } = await import('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('bat'),
        langs: ['bat'],
      },
    })

    await flushAll()
    await waitForRendererCreated()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledWith(
      expect.objectContaining({ langs: ['bat'] }),
    )
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ langs: ['bat'] }),
    )
    expect(streamMarkdownMock.createdRenderers[0]?.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'bat',
    )

    wrapper.unmount()
  })

  it('normalizes suffixed fence language before Vue registration and rendering', async () => {
    const { default: MarkdownCodeBlockNode } = await import('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('typescript:example.ts'),
        langs: ['typescript'],
      },
    })

    await flushAll()
    await waitForRendererCreated()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledWith(
      expect.objectContaining({ langs: ['typescript'] }),
    )
    expect(streamMarkdownMock.createdRenderers[0]?.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'typescript',
    )

    wrapper.unmount()
  })

  it('retries Vue registerHighlight when the previous registration failed', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    streamMarkdownMock.registerHighlight.mockRejectedValueOnce(new Error('load failed'))
    const { default: MarkdownCodeBlockNode } = await import('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('typescript'),
        langs: ['typescript'],
      },
    })

    try {
      await flushAll()
      await waitForRendererCreated()

      expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(2)
    }
    finally {
      wrapper.unmount()
      warnSpy.mockRestore()
    }
  })

  it('recreates Vue renderer when langs changes', async () => {
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

    const initialRendererCount = streamMarkdownMock.createdRenderers.length
    const renderer = streamMarkdownMock.createdRenderers[initialRendererCount - 1]
    expect(renderer?.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'typescript',
    )

    renderer.updateCode.mockClear()

    await wrapper.setProps({ langs: ['python'] })
    await flushAll()
    await waitForRendererCount(initialRendererCount + 1)

    expect(streamMarkdownMock.registerHighlight).toHaveBeenLastCalledWith(
      expect.objectContaining({ langs: ['python'] }),
    )
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
    expect(renderer.updateCode).not.toHaveBeenCalled()
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ langs: ['python'] }),
    )
    expect(streamMarkdownMock.createdRenderers[initialRendererCount]?.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'plaintext',
    )

    wrapper.unmount()
  })

  it('recreates Vue renderer when langs is mutated in place', async () => {
    const { default: MarkdownCodeBlockNode } = await import('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const Parent = defineComponent({
      components: { MarkdownCodeBlockNode },
      setup() {
        const langs = ref(['typescript'])
        return {
          langs,
          node: makeNode('typescript'),
        }
      },
      template: '<MarkdownCodeBlockNode :loading="false" :node="node" :langs="langs" />',
    })
    const wrapper = mount(Parent)

    await flushAll()
    await waitForRendererCreated()

    const initialRendererCount = streamMarkdownMock.createdRenderers.length
    const renderer = streamMarkdownMock.createdRenderers[initialRendererCount - 1]

    ;(wrapper.vm.langs as string[]).splice(0, 1, 'python')
    await flushAll()
    await waitForLastRegisterHighlightLangs(['python'])
    await waitForRendererCount(initialRendererCount + 1)

    expect(streamMarkdownMock.registerHighlight).toHaveBeenLastCalledWith(
      expect.objectContaining({ langs: ['python'] }),
    )
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ langs: ['python'] }),
    )

    wrapper.unmount()
  })

  it('does not retry stale failed Vue highlight registrations', async () => {
    const first = createDeferred()
    const second = createDeferred()
    streamMarkdownMock.registerHighlight
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
      .mockImplementation(async () => {
        throw new Error('stale failed registration should not be retried')
      })

    const { default: MarkdownCodeBlockNode } = await import('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('typescript'),
        langs: ['typescript'],
      },
    })

    await flushAll()
    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ langs: ['python'] })
    await flushAll()
    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(2)

    second.resolve()
    await second.promise
    await flushAll()
    await waitForRendererCreated()

    const renderer = streamMarkdownMock.createdRenderers[streamMarkdownMock.createdRenderers.length - 1]
    expect(renderer?.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'plaintext',
    )

    first.reject(new Error('stale failed registration'))
    await first.promise.catch(() => {})
    await flushAll()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(2)
    expect(renderer?.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'plaintext',
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

  it('keeps valid Shiki ids that differ from icon aliases in Vue2', async () => {
    const { default: Vue2MarkdownCodeBlockNode } = await import('../packages/markstream-vue2/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(Vue2MarkdownCodeBlockNode as any, {
      props: {
        loading: false,
        node: makeNode('bat'),
        langs: ['bat'],
      },
    })

    await flushAll()
    await waitForRendererCreated()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledWith(
      expect.objectContaining({ langs: ['bat'] }),
    )
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ langs: ['bat'] }),
    )
    expect(streamMarkdownMock.createdRenderers[0]?.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'bat',
    )

    wrapper.unmount()
  })

  it('retries Vue2 registerHighlight when the previous registration failed', async () => {
    streamMarkdownMock.registerHighlight.mockRejectedValueOnce(new Error('load failed'))
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

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })

  it('keeps React theme order significant for highlight registration', async () => {
    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const node = makeNode('typescript')

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node,
        themes: ['a', 'b'],
        langs: ['typescript'],
      }))
    })

    await flushReact()
    await waitForReactRendererCreated()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenLastCalledWith(
      expect.objectContaining({ themes: ['a', 'b'], langs: ['typescript'] }),
    )
    const initialRendererCount = streamMarkdownMock.createdRenderers.length
    const renderer = streamMarkdownMock.createdRenderers[initialRendererCount - 1]

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node,
        themes: ['b', 'a'],
        langs: ['typescript'],
      }))
    })

    await flushReact()
    await waitForReactRendererCount(initialRendererCount + 1)

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(2)
    expect(streamMarkdownMock.registerHighlight).toHaveBeenLastCalledWith(
      expect.objectContaining({ themes: ['b', 'a'], langs: ['typescript'] }),
    )
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ themes: ['b', 'a'], langs: ['typescript'] }),
    )

    await act(async () => {
      root.unmount()
    })
  })

  it('keeps valid Shiki ids that differ from icon aliases in React', async () => {
    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node: makeNode('bat'),
        langs: ['bat'],
      }))
    })

    await flushReact()
    await waitForReactRendererCreated()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledWith(
      expect.objectContaining({ langs: ['bat'] }),
    )
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ langs: ['bat'] }),
    )
    expect(streamMarkdownMock.createdRenderers[0]?.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'bat',
    )

    await act(async () => {
      root.unmount()
    })
  })

  it('registers default highlight options when React langs is omitted', async () => {
    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node: makeNode('typescript'),
      }))
    })

    await flushReact()
    await waitForReactRendererCreated()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledWith({})
    expect(streamMarkdownMock.createdRenderers[0]?.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'typescript',
    )

    await act(async () => {
      root.unmount()
    })
  })

  it('does not recreate React renderer for content-equivalent inline langs arrays', async () => {
    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node: makeNode('typescript'),
        langs: ['ts'],
      }))
    })

    await flushReact()
    await waitForReactRendererCreated()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(1)
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenCalledTimes(1)

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node: makeNode('typescript'),
        langs: ['typescript'],
      }))
    })

    await flushReact()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(1)
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenCalledTimes(1)

    await act(async () => {
      root.unmount()
    })
  })

  it('normalizes suffixed fence language before React registration and rendering', async () => {
    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node: makeNode('typescript:example.ts'),
        langs: ['typescript'],
      }))
    })

    await flushReact()
    await waitForReactRendererCreated()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledWith(
      expect.objectContaining({ langs: ['typescript'] }),
    )
    expect(streamMarkdownMock.createdRenderers[0]?.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'typescript',
    )

    await act(async () => {
      root.unmount()
    })
  })

  it('ignores stale React highlight registrations', async () => {
    const first = createDeferred()
    const second = createDeferred()
    streamMarkdownMock.registerHighlight
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
      .mockImplementation(async () => {
        throw new Error('stale registration should not be retried')
      })

    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const node = makeNode('typescript')

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node,
        langs: ['typescript'],
      }))
    })
    await flushReact()
    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(1)

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node,
        langs: ['python'],
      }))
    })
    await flushReact()
    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(2)

    await act(async () => {
      second.resolve()
      await second.promise
    })
    await flushReact()
    await waitForReactRendererCreated()

    const initialRendererCount = streamMarkdownMock.createdRenderers.length
    const renderer = streamMarkdownMock.createdRenderers[initialRendererCount - 1]
    expect(renderer?.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'plaintext',
    )
    expect(host.querySelector('.code-fallback-plain')).toBeNull()

    await act(async () => {
      first.resolve()
      await first.promise
    })
    await flushReact()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(2)
    expect(renderer.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'plaintext',
    )
    expect(host.querySelector('.code-fallback-plain')).toBeNull()

    await act(async () => {
      root.unmount()
    })
  })

  it('ignores stale React renderer updates after a slower previous registration', async () => {
    const firstRegistration = createDeferred()
    streamMarkdownMock.registerHighlight
      .mockImplementationOnce(() => firstRegistration.promise)
      .mockImplementation(async () => {})

    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const firstNode = {
      ...makeNode('typescript'),
      code: 'const staleValue = 1',
    }
    const secondNode = {
      ...makeNode('python'),
      code: 'fresh_value = 2',
    }

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node: firstNode,
        langs: ['typescript'],
      }))
    })

    await flushReact()

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node: secondNode,
        langs: ['python'],
      }))
    })

    await act(async () => {
      firstRegistration.resolve()
      await firstRegistration.promise
    })

    await flushReact()
    await waitForReactRendererCreated()

    const lastRenderer = streamMarkdownMock.createdRenderers.at(-1)

    expect(lastRenderer?.updateCode).toHaveBeenLastCalledWith(
      'fresh_value = 2',
      'python',
    )

    await act(async () => {
      root.unmount()
    })
  })

  it('does not retry stale failed React highlight registrations', async () => {
    const first = createDeferred()
    const second = createDeferred()
    streamMarkdownMock.registerHighlight
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
      .mockImplementation(async () => {
        throw new Error('stale failed registration should not be retried')
      })

    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const node = makeNode('typescript')

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node,
        langs: ['typescript'],
      }))
    })
    await flushReact()
    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(1)

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node,
        langs: ['python'],
      }))
    })
    await flushReact()
    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(2)

    await act(async () => {
      second.resolve()
      await second.promise
    })
    await flushReact()
    await waitForReactRendererCreated()

    const renderer = streamMarkdownMock.createdRenderers[streamMarkdownMock.createdRenderers.length - 1]
    expect(renderer?.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'plaintext',
    )

    await act(async () => {
      first.reject(new Error('stale failed registration'))
      await first.promise.catch(() => {})
    })
    await flushReact()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(2)
    expect(renderer?.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'plaintext',
    )

    await act(async () => {
      root.unmount()
    })
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
    expect(streamMarkdownMock.createdRenderers[0]?.updateCode).toHaveBeenCalledTimes(1)

    await act(async () => {
      root.unmount()
    })
  })

  it('recreates React renderer when langs changes', async () => {
    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const node = makeNode('typescript')

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node,
        langs: ['typescript'],
      }))
    })

    await flushReact()
    await waitForReactRendererCreated()

    const initialRendererCount = streamMarkdownMock.createdRenderers.length
    const renderer = streamMarkdownMock.createdRenderers[initialRendererCount - 1]
    expect(renderer?.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'typescript',
    )

    renderer.updateCode.mockClear()

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node,
        langs: ['python'],
      }))
    })

    await flushReact()
    await waitForReactRendererCount(initialRendererCount + 1)

    expect(streamMarkdownMock.registerHighlight).toHaveBeenLastCalledWith(
      expect.objectContaining({ langs: ['python'] }),
    )
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
    expect(renderer.updateCode).not.toHaveBeenCalled()
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ langs: ['python'] }),
    )
    expect(streamMarkdownMock.createdRenderers[initialRendererCount]?.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'plaintext',
    )

    await act(async () => {
      root.unmount()
    })
  })

  it('falls back to plaintext in React when the block language is not included in langs', async () => {
    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node: makeNode('python'),
        langs: ['typescript'],
      }))
    })
    await flushReact()
    await waitForReactRendererCreated()

    expect(streamMarkdownMock.createdRenderers[0]?.updateCode).toHaveBeenCalledTimes(1)
    expect(streamMarkdownMock.createdRenderers[0]?.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'plaintext',
    )

    await act(async () => {
      root.unmount()
    })
  })

  it('retries React registerHighlight when the previous registration failed', async () => {
    streamMarkdownMock.registerHighlight.mockRejectedValueOnce(new Error('load failed'))

    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node: makeNode('typescript'),
        langs: ['typescript'],
      }))
    })

    await flushReact()
    await waitForReactRendererCreated()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(2)
    expect(streamMarkdownMock.createdRenderers[0]?.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'typescript',
    )

    await act(async () => {
      root.unmount()
    })
  })
})
