import { mount } from '@vue/test-utils'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { getHighlightRegistrationKey, getRegisterHighlightOptions, getShikiRendererOptions, registerHighlightOnce } from '../packages/markstream-core/src'
import { removeCustomComponents as removeVue2CustomComponents, setCustomComponents as setVue2CustomComponents } from '../packages/markstream-vue2/src/utils/nodeComponents'
import { flushAll } from './setup/flush-all'

const streamMarkdownMock = vi.hoisted(() => {
  const createdRenderers: any[] = []
  const loadedLangs = new Set<string>()
  const defaultLanguages = ['typescript', 'javascript', 'python', 'objective-c', 'objective-cpp', 'plaintext']
  const loadLangs = (opts?: { langs?: string[] }) => {
    const langs = opts?.langs?.length ? opts.langs : defaultLanguages
    for (const lang of langs)
      loadedLangs.add(lang)
  }
  const registerHighlight = vi.fn(async (opts?: { langs?: string[] }) => {
    loadLangs(opts)
  })
  const createShikiStreamRenderer = vi.fn((el: HTMLElement) => {
    const renderer = {
      updateCode: vi.fn(async (code: string, lang?: string) => {
        if (lang && lang !== 'plaintext' && !loadedLangs.has(lang))
          throw new Error(`Language not loaded: ${lang}`)

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
    defaultLanguages,
    loadedLangs,
    loadLangs,
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

function makeNode(language = 'typescript', code = 'const value = 1') {
  return {
    type: 'code_block' as const,
    language,
    code,
    raw: `\`\`\`${language}\n${code}\n\`\`\``,
  }
}

const vue2CustomId = 'vue2-shiki-langs-forwarding'
const Vue2CodeBlockProbe = defineComponent({
  name: 'Vue2CodeBlockProbe',
  props: {
    node: { type: Object, required: true },
    langs: Array,
  },
  setup(props) {
    return () => h('div', {
      'class': 'vue2-code-block-probe',
      'data-language': String((props.node as any)?.language ?? ''),
      'data-langs': JSON.stringify(props.langs ?? null),
    })
  },
})

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

async function waitForRendererUpdateCall(renderer: any, count: number) {
  for (let i = 0; i < 10; i++) {
    if (renderer?.updateCode.mock.calls.length >= count)
      return
    await flushAll()
  }
  throw new Error(`Timed out waiting for renderer update call ${count}`)
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
  streamMarkdownMock.loadedLangs.clear()
  streamMarkdownMock.createShikiStreamRenderer.mockClear()
  streamMarkdownMock.registerHighlight.mockReset()
  streamMarkdownMock.registerHighlight.mockImplementation(async (opts?: { langs?: string[] }) => {
    streamMarkdownMock.loadLangs(opts)
  })
}

beforeEach(() => {
  vi.resetModules()
  resetStreamMarkdownMock()
})

afterEach(() => {
  resetStreamMarkdownMock()
  removeVue2CustomComponents(vue2CustomId)
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

  it('filters non-string Shiki themes from registration options', async () => {
    const themes = ['vitesse-light', { name: 'custom-theme' }, ' vitesse-dark ', '', 'vitesse-light'] as any[]
    const expected = {
      themes: ['vitesse-light', 'vitesse-dark'],
    }

    expect(getRegisterHighlightOptions(themes)).toEqual(expected)
    expect(getShikiRendererOptions(themes)).toEqual(expected)
    expect(getHighlightRegistrationKey(themes)).toBe(
      getHighlightRegistrationKey(['vitesse-light', 'vitesse-dark']),
    )

    expect(getRegisterHighlightOptions(themes)).toEqual(expected)
    expect(getShikiRendererOptions(themes)).toEqual(expected)
  })

  it('normalizes common shell Shiki aliases', () => {
    expect(getRegisterHighlightOptions(undefined, ['sh', 'bash', 'zsh'])).toEqual({
      langs: ['shellscript'],
    })
    expect(getRegisterHighlightOptions(undefined, ['ps', 'ps1', 'pwsh'])).toEqual({
      langs: ['powershell'],
    })
  })

  it('uses a stable registration key for reordered normalized langs', () => {
    expect(getHighlightRegistrationKey(['vitesse-light'], ['ts', 'js', 'ts'])).toBe(
      getHighlightRegistrationKey(['vitesse-light'], ['javascript', 'typescript']),
    )
  })

  it('scopes highlight registration tasks by registerHighlight function instance', async () => {
    const firstRegisterHighlight = vi.fn()
    const secondRegisterHighlight = vi.fn()
    const opts = { langs: ['typescript'] }

    await registerHighlightOnce(firstRegisterHighlight, opts)
    await registerHighlightOnce(firstRegisterHighlight, opts)
    await registerHighlightOnce(secondRegisterHighlight, opts)

    expect(firstRegisterHighlight).toHaveBeenCalledTimes(1)
    expect(secondRegisterHighlight).toHaveBeenCalledTimes(1)
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

  it('passes normalized Vue Shiki themes to renderer', async () => {
    const { default: MarkdownCodeBlockNode } = await import('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('typescript'),
        themes: [' vitesse-light ', { name: 'custom-theme' }, 'vitesse-light'] as any,
        langs: ['typescript'],
      },
    })

    await flushAll()
    await waitForRendererCreated()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenLastCalledWith({
      themes: ['vitesse-light'],
      langs: ['typescript'],
    })
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        themes: ['vitesse-light'],
        langs: ['typescript'],
      }),
    )

    wrapper.unmount()
  })

  it('omits Vue langs options when langs is empty', async () => {
    const { default: MarkdownCodeBlockNode } = await import('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('ruby', 'puts 1'),
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
    expect(streamMarkdownMock.createdRenderers[0]?.updateCode).toHaveBeenNthCalledWith(
      1,
      'puts 1',
      'ruby',
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

  it('deduplicates Vue highlight registration across matching code block instances', async () => {
    const { default: MarkdownCodeBlockNode } = await import('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const first = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('typescript'),
        langs: ['typescript'],
      },
    })

    await flushAll()
    await waitForRendererCreated()

    const second = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('typescript', 'const other = 2'),
        langs: ['typescript'],
      },
    })

    await flushAll()
    await waitForRendererCount(2)

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(1)

    first.unmount()
    second.unmount()
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

  it('matches bash fences when only sh is configured', async () => {
    const { default: MarkdownCodeBlockNode } = await import('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('bash', 'echo hi'),
        langs: ['sh'],
      },
    })

    await flushAll()
    await waitForRendererCreated()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledWith(
      expect.objectContaining({ langs: ['shellscript'] }),
    )
    expect(streamMarkdownMock.createdRenderers[0]?.updateCode).toHaveBeenLastCalledWith(
      'echo hi',
      'shellscript',
    )

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

  it('clears Vue language guard when langs changes to empty', async () => {
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

    await wrapper.setProps({
      node: makeNode('ruby', 'puts 1'),
      langs: [],
    })
    await flushAll()
    await waitForRendererCount(initialRendererCount + 1)

    expect(streamMarkdownMock.registerHighlight).toHaveBeenLastCalledWith({})
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      expect.not.objectContaining({ langs: expect.any(Array) }),
    )
    expect(streamMarkdownMock.createdRenderers[initialRendererCount]?.updateCode).toHaveBeenNthCalledWith(
      1,
      'puts 1',
      'ruby',
    )

    wrapper.unmount()
  })

  it('clears stale Vue renderer when re-registration for new langs fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
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

      const initialRendererCount = streamMarkdownMock.createdRenderers.length
      const oldRenderer = streamMarkdownMock.createdRenderers[initialRendererCount - 1]
      streamMarkdownMock.registerHighlight.mockRejectedValue(new Error('load failed'))

      await wrapper.setProps({ langs: ['python'] })
      await flushAll()

      expect(oldRenderer.dispose).toHaveBeenCalledTimes(1)
      expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenCalledTimes(initialRendererCount)
      expect((wrapper.find('.code-block-render').element as HTMLElement).textContent).toBe('')
      expect(wrapper.find('.code-fallback-plain').text()).toContain('const value = 1')
    }
    finally {
      wrapper.unmount()
      warnSpy.mockRestore()
    }
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

  it('keeps Vue fallback when an older renderer update resolves after newer code', async () => {
    const firstUpdate = createDeferred()
    const secondUpdate = createDeferred()
    streamMarkdownMock.createShikiStreamRenderer.mockImplementationOnce((el: HTMLElement) => {
      const renderer = {
        updateCode: vi.fn((code: string, lang?: string) => {
          const write = () => {
            el.textContent = `${lang ?? ''}:${code}`
          }
          if (code === 'const stale = 1')
            return firstUpdate.promise.then(write)
          if (code === 'const fresh = 2')
            return secondUpdate.promise.then(write)
          write()
        }),
        setTheme: vi.fn(async () => {}),
        dispose: vi.fn(),
      }
      streamMarkdownMock.createdRenderers.push(renderer)
      return renderer
    })

    const { default: MarkdownCodeBlockNode } = await import('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('typescript', 'const stale = 1'),
        langs: ['typescript'],
      },
    })

    await flushAll()
    await waitForRendererCreated()
    const renderer = streamMarkdownMock.createdRenderers[0]
    await waitForRendererUpdateCall(renderer, 1)

    await wrapper.setProps({
      node: makeNode('typescript', 'const fresh = 2'),
    })
    await flushAll()
    await waitForRendererUpdateCall(renderer, 2)

    firstUpdate.resolve()
    await firstUpdate.promise
    await flushAll()

    expect(wrapper.find('.code-fallback-plain').text()).toContain('const fresh = 2')

    secondUpdate.resolve()
    await secondUpdate.promise
    await flushAll()
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

  it('deduplicates Vue2 highlight registration across matching code block instances', async () => {
    const { default: Vue2MarkdownCodeBlockNode } = await import('../packages/markstream-vue2/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const first = mount(Vue2MarkdownCodeBlockNode as any, {
      props: {
        loading: false,
        node: makeNode('typescript'),
        langs: ['typescript'],
      },
    })

    await flushAll()
    await waitForRendererCreated()

    const second = mount(Vue2MarkdownCodeBlockNode as any, {
      props: {
        loading: false,
        node: makeNode('typescript', 'const other = 2'),
        langs: ['typescript'],
      },
    })

    await flushAll()
    await waitForRendererCount(2)

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(1)

    first.unmount()
    second.unmount()
  })

  it('passes normalized Vue2 Shiki themes to renderer', async () => {
    const { default: Vue2MarkdownCodeBlockNode } = await import('../packages/markstream-vue2/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(Vue2MarkdownCodeBlockNode as any, {
      props: {
        loading: false,
        node: makeNode('typescript'),
        themes: [' vitesse-light ', { name: 'custom-theme' }, 'vitesse-light'] as any,
        langs: ['typescript'],
      },
    })

    await flushAll()
    await waitForRendererCreated()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenLastCalledWith({
      themes: ['vitesse-light'],
      langs: ['typescript'],
    })
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        themes: ['vitesse-light'],
        langs: ['typescript'],
      }),
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

  it('does not keep a default Vue2 language guard when langs is empty', async () => {
    const { default: Vue2MarkdownCodeBlockNode } = await import('../packages/markstream-vue2/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(Vue2MarkdownCodeBlockNode as any, {
      props: {
        loading: false,
        node: makeNode('ruby', 'puts 1'),
        langs: [],
      },
    })

    await flushAll()
    await waitForRendererCreated()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenLastCalledWith({})
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      expect.not.objectContaining({ langs: expect.any(Array) }),
    )
    expect(streamMarkdownMock.createdRenderers[0]?.updateCode).toHaveBeenNthCalledWith(
      1,
      'puts 1',
      'ruby',
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

  it('forwards Vue2 MarkdownRenderCompat top-level langs and codeBlockProps through render props', async () => {
    const { default: MarkdownRenderCompat } = await import('../packages/markstream-vue2/src/components/MarkdownRenderCompat.vue')
    const h = (component: any, data: any) => ({ component, data })
    const vnode = (MarkdownRenderCompat as any).render.call({
      legacyVue26: false,
      forwardedProps: {
        customId: vue2CustomId,
        nodes: [makeNode('typescript')],
        langs: ['typescript'],
        codeBlockProps: {
          langs: ['python'],
        },
      },
      $attrs: {},
    }, h)

    expect(vnode.data.props.langs).toEqual(['typescript'])
    expect(vnode.data.props.codeBlockProps).toEqual({ langs: ['python'] })
  })

  it('forwards Vue2 LegacyNodesRenderer top-level langs and lets codeBlockProps override them', async () => {
    setVue2CustomComponents(vue2CustomId, { code_block: Vue2CodeBlockProbe as any })
    const { default: LegacyNodesRenderer } = await import('../packages/markstream-vue2/src/components/NodeRenderer/LegacyNodesRenderer.vue')
    const topLevelWrapper = mount(LegacyNodesRenderer as any, {
      props: {
        customId: vue2CustomId,
        nodes: [makeNode('typescript')],
        langs: ['typescript'],
      },
    })

    await flushAll()
    expect(topLevelWrapper.get('.vue2-code-block-probe').attributes('data-langs')).toBe('["typescript"]')
    topLevelWrapper.unmount()

    const overrideWrapper = mount(LegacyNodesRenderer as any, {
      props: {
        customId: vue2CustomId,
        nodes: [makeNode('typescript')],
        langs: ['typescript'],
        codeBlockProps: {
          langs: ['python'],
        },
      },
    })

    await flushAll()
    expect(overrideWrapper.get('.vue2-code-block-probe').attributes('data-langs')).toBe('["python"]')
    overrideWrapper.unmount()
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

  it('filters non-string themes before React highlight registration', async () => {
    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node: makeNode('typescript'),
        themes: ['a', { name: 'custom-theme' }, ' b ', 'a'] as any,
        langs: ['typescript'],
      }))
    })

    await flushReact()
    await waitForReactRendererCreated()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenLastCalledWith(
      expect.objectContaining({ themes: ['a', 'b'], langs: ['typescript'] }),
    )
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ themes: ['a', 'b'], langs: ['typescript'] }),
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

  it('omits React langs options when langs is omitted', async () => {
    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node: makeNode('ruby', 'puts 1'),
      }))
    })

    await flushReact()
    await waitForReactRendererCreated()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledWith({})
    expect(streamMarkdownMock.createdRenderers[0]?.updateCode).toHaveBeenNthCalledWith(
      1,
      'puts 1',
      'ruby',
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

  it('deduplicates React highlight registration across matching code block instances', async () => {
    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(React.Fragment, null, [
        React.createElement(ReactMarkdownCodeBlockNode, {
          key: 'first',
          loading: false,
          node: makeNode('typescript'),
          langs: ['typescript'],
        }),
        React.createElement(ReactMarkdownCodeBlockNode, {
          key: 'second',
          loading: false,
          node: makeNode('typescript', 'const other = 2'),
          langs: ['typescript'],
        }),
      ]))
    })

    await flushReact()
    await waitForReactRendererCount(2)

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(1)

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
      .mockImplementation(async (opts?: { langs?: string[] }) => {
        streamMarkdownMock.loadLangs(opts)
      })

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

  it('clears React language guard when langs changes to empty', async () => {
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

    const initialRendererCount = streamMarkdownMock.createdRenderers.length

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node: makeNode('ruby', 'puts 1'),
        langs: [],
      }))
    })

    await flushReact()
    await waitForReactRendererCount(initialRendererCount + 1)

    expect(streamMarkdownMock.registerHighlight).toHaveBeenLastCalledWith({})
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      expect.not.objectContaining({ langs: expect.any(Array) }),
    )
    expect(streamMarkdownMock.createdRenderers[initialRendererCount]?.updateCode).toHaveBeenNthCalledWith(
      1,
      'puts 1',
      'ruby',
    )

    await act(async () => {
      root.unmount()
    })
  })

  it('clears stale React renderer when re-registration for new langs fails', async () => {
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
    const oldRenderer = streamMarkdownMock.createdRenderers[initialRendererCount - 1]
    streamMarkdownMock.registerHighlight.mockRejectedValue(new Error('load failed'))

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node,
        langs: ['python'],
      }))
    })

    await flushReact()

    expect(oldRenderer.dispose).toHaveBeenCalledTimes(1)
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenCalledTimes(initialRendererCount)
    expect(host.querySelector('.code-block-render')?.textContent).toBe('')
    expect(host.querySelector('.code-fallback-plain')?.textContent).toContain('const value = 1')

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

  it('waits for in-flight React stream-markdown import before rendering the latest code', async () => {
    const importGate = createDeferred()
    const gatedStreamMarkdownFactory = async () => {
      await importGate.promise
      return {
        createShikiStreamRenderer: streamMarkdownMock.createShikiStreamRenderer,
        defaultLanguages: streamMarkdownMock.defaultLanguages,
        registerHighlight: streamMarkdownMock.registerHighlight,
      }
    }

    vi.doMock('stream-markdown', gatedStreamMarkdownFactory)
    vi.doMock('../packages/markstream-react/node_modules/stream-markdown', gatedStreamMarkdownFactory)

    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node: makeNode('typescript', 'const stale = 1'),
        langs: ['typescript'],
      }))
    })
    await flushReact()

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node: makeNode('typescript', 'const fresh = 2'),
        langs: ['typescript'],
      }))
    })
    await flushReact()

    expect(streamMarkdownMock.createShikiStreamRenderer).not.toHaveBeenCalled()

    await act(async () => {
      importGate.resolve()
      await importGate.promise
    })
    await flushReact()
    await waitForReactRendererCreated()

    expect(streamMarkdownMock.createdRenderers.at(-1)?.updateCode).toHaveBeenLastCalledWith(
      'const fresh = 2',
      'typescript',
    )

    await act(async () => {
      root.unmount()
    })
  })

  it('retries React stream-markdown import after a failed dynamic import', async () => {
    let importAttempts = 0
    const retryStreamMarkdownFactory = async () => {
      importAttempts += 1
      if (importAttempts === 1)
        throw new Error('chunk load failed')

      return {
        createShikiStreamRenderer: streamMarkdownMock.createShikiStreamRenderer,
        defaultLanguages: streamMarkdownMock.defaultLanguages,
        registerHighlight: streamMarkdownMock.registerHighlight,
      }
    }

    vi.doMock('stream-markdown', retryStreamMarkdownFactory)
    vi.doMock('../packages/markstream-react/node_modules/stream-markdown', retryStreamMarkdownFactory)

    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node: makeNode('typescript', 'const stale = 1'),
        langs: ['typescript'],
      }))
    })
    await flushReact()

    expect(streamMarkdownMock.createShikiStreamRenderer).not.toHaveBeenCalled()

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node: makeNode('typescript', 'const fresh = 2'),
        langs: ['typescript'],
      }))
    })
    await flushReact()
    await waitForReactRendererCreated()

    expect(importAttempts).toBeGreaterThanOrEqual(2)
    expect(streamMarkdownMock.createdRenderers.at(-1)?.updateCode).toHaveBeenLastCalledWith(
      'const fresh = 2',
      'typescript',
    )

    await act(async () => {
      root.unmount()
    })
  })
})
