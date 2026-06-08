import type { RegisterHighlightOptions } from '../packages/markstream-core/src'
import { mount } from '@vue/test-utils'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import {
  getHighlightRegistrationKey,
  getRegisterHighlightOptions,
  getRuntimeShikiRegistrationConfig,
  getShikiRendererOptions,
  registerHighlightOnce,
} from '../packages/markstream-core/src'
import {
  removeCustomComponents as removeReactCustomComponents,
  setCustomComponents as setReactCustomComponents,
} from '../packages/markstream-react/src/customComponents'
import { removeCustomComponents as removeVue2CustomComponents, setCustomComponents as setVue2CustomComponents } from '../packages/markstream-vue2/src/utils/nodeComponents'
import { removeCustomComponents, setCustomComponents } from '../src/utils/nodeComponents'
import { flushAll } from './setup/flush-all'

const streamMarkdownMock = vi.hoisted(() => {
  const createdRenderers: any[] = []
  const loadedLangs = new Set<string>()
  let omitRegisterHighlight = false
  const defaultLanguages = ['typescript', 'javascript', 'python', 'objective-c', 'objective-cpp', 'plaintext']
  const loadLangs = (opts?: { langs?: readonly string[] }) => {
    const langs = opts?.langs?.length ? opts.langs : defaultLanguages
    for (const lang of langs)
      loadedLangs.add(lang)
  }
  const registerHighlight = vi.fn(async (opts?: { langs?: readonly string[] }) => {
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
    get omitRegisterHighlight() {
      return omitRegisterHighlight
    },
    set omitRegisterHighlight(value: boolean) {
      omitRegisterHighlight = value
    },
    registerHighlight,
  }
})

vi.mock('stream-markdown', () => ({
  createShikiStreamRenderer: streamMarkdownMock.createShikiStreamRenderer,
  defaultLanguages: streamMarkdownMock.defaultLanguages,
  get registerHighlight() {
    return streamMarkdownMock.omitRegisterHighlight ? undefined : streamMarkdownMock.registerHighlight
  },
}))
vi.mock('../packages/markstream-vue2/node_modules/stream-markdown', () => ({
  createShikiStreamRenderer: streamMarkdownMock.createShikiStreamRenderer,
  defaultLanguages: streamMarkdownMock.defaultLanguages,
  get registerHighlight() {
    return streamMarkdownMock.omitRegisterHighlight ? undefined : streamMarkdownMock.registerHighlight
  },
}))
vi.mock('../packages/markstream-react/node_modules/stream-markdown', () => ({
  createShikiStreamRenderer: streamMarkdownMock.createShikiStreamRenderer,
  defaultLanguages: streamMarkdownMock.defaultLanguages,
  get registerHighlight() {
    return streamMarkdownMock.omitRegisterHighlight ? undefined : streamMarkdownMock.registerHighlight
  },
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
const vueCustomId = 'vue-shiki-langs-forwarding'
const reactCustomId = 'react-shiki-langs-forwarding'
function ReactCodeBlockProbe(props: { node: any, langs?: readonly string[] }) {
  return React.createElement('div', {
    'className': 'react-code-block-probe',
    'data-language': String(props.node?.language ?? ''),
    'data-langs': JSON.stringify(props.langs ?? null),
  })
}
const VueCodeBlockProbe = defineComponent({
  name: 'VueCodeBlockProbe',
  props: {
    node: { type: Object, required: true },
    langs: Array,
  },
  setup(props) {
    return () => h('div', {
      'class': 'vue-code-block-probe',
      'data-language': String((props.node as any)?.language ?? ''),
      'data-langs': JSON.stringify(props.langs ?? null),
    })
  },
})
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

const ASYNC_WAIT_ATTEMPTS = process.platform === 'win32' ? 50 : 20

async function waitUntil(
  predicate: () => boolean,
  message: () => string,
  flush: () => Promise<void> = flushAll,
) {
  for (let i = 0; i < ASYNC_WAIT_ATTEMPTS; i++) {
    if (predicate())
      return

    await flush()

    if (predicate())
      return
  }

  throw new Error(message())
}

async function waitForRendererCreated() {
  await waitUntil(
    () => streamMarkdownMock.createShikiStreamRenderer.mock.calls.length > 0,
    () =>
      `Timed out waiting for renderer creation; calls=${
        streamMarkdownMock.createShikiStreamRenderer.mock.calls.length
      }`,
  )
}

async function waitForRendererCount(count: number) {
  await waitUntil(
    () => streamMarkdownMock.createShikiStreamRenderer.mock.calls.length >= count,
    () =>
      `Timed out waiting for renderer count ${count}; calls=${
        streamMarkdownMock.createShikiStreamRenderer.mock.calls.length
      }`,
  )
}

async function waitForRendererUpdateCall(renderer: any, count: number) {
  await waitUntil(
    () => renderer?.updateCode.mock.calls.length >= count,
    () =>
      `Timed out waiting for renderer update call ${count}; calls=${
        renderer?.updateCode.mock.calls.length ?? 0
      }`,
  )
}

async function waitForLastRegisterHighlightLangs(langs: string[]) {
  await waitUntil(
    () => {
      const calls = streamMarkdownMock.registerHighlight.mock.calls
      const lastCall = calls[calls.length - 1]?.[0] as { langs?: readonly string[] } | undefined
      return JSON.stringify(lastCall?.langs) === JSON.stringify(langs)
    },
    () => {
      const calls = streamMarkdownMock.registerHighlight.mock.calls
      const lastCall = calls[calls.length - 1]?.[0]
      return `Timed out waiting for registerHighlight langs ${JSON.stringify(langs)}; last=${JSON.stringify(lastCall)}`
    },
  )
}

function countRegisterHighlightCallsForLang(lang: string) {
  return streamMarkdownMock.registerHighlight.mock.calls.filter(([opts]) => {
    const registerOptions = opts as { langs?: readonly string[] } | undefined
    return registerOptions?.langs?.includes(lang)
  }).length
}

async function waitForReactRendererCreated() {
  await waitUntil(
    () => streamMarkdownMock.createShikiStreamRenderer.mock.calls.length > 0,
    () =>
      `Timed out waiting for React renderer creation; calls=${
        streamMarkdownMock.createShikiStreamRenderer.mock.calls.length
      }`,
    flushReact,
  )
}

async function waitForReactRendererCount(count: number) {
  await waitUntil(
    () => streamMarkdownMock.createShikiStreamRenderer.mock.calls.length >= count,
    () =>
      `Timed out waiting for React renderer count ${count}; calls=${
        streamMarkdownMock.createShikiStreamRenderer.mock.calls.length
      }`,
    flushReact,
  )
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
  streamMarkdownMock.omitRegisterHighlight = false
  streamMarkdownMock.createShikiStreamRenderer.mockClear()
  streamMarkdownMock.registerHighlight.mockReset()
  streamMarkdownMock.registerHighlight.mockImplementation(async (opts?: { langs?: readonly string[] }) => {
    streamMarkdownMock.loadLangs(opts)
  })
}

beforeEach(() => {
  vi.resetModules()
  resetStreamMarkdownMock()
})

afterEach(() => {
  resetStreamMarkdownMock()
  removeReactCustomComponents(reactCustomId)
  removeCustomComponents(vueCustomId)
  removeVue2CustomComponents(vue2CustomId)
  document.body.innerHTML = ''
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

describe('markdown code block Shiki langs', () => {
  it('normalizes Shiki langs and omits empty lang lists from registration options', () => {
    expect(getRegisterHighlightOptions(undefined, ['ts', 'js', 'ts'])).toEqual({
      langs: ['javascript', 'typescript'],
    })
    expect(getRegisterHighlightOptions(undefined, [])).toEqual({})
  })

  it('filters non-string Shiki langs from registration options', () => {
    const langs = ['ts', 123, null, undefined, { id: 'python' }, ' py ', '', 'ts'] as any[]

    expect(getRegisterHighlightOptions(undefined, langs)).toEqual({
      langs: ['python', 'typescript'],
    })
    expect(getHighlightRegistrationKey(undefined, langs)).toBe(
      getHighlightRegistrationKey(undefined, ['python', 'typescript']),
    )
  })

  it('normalizes direct registerHighlightOnce options before registering or caching', async () => {
    const registerHighlight = vi.fn(async () => {})

    await registerHighlightOnce(registerHighlight, {
      langs: ['ts', 'js', 'ts'],
    })

    expect(registerHighlight).toHaveBeenCalledTimes(1)
    expect(registerHighlight).toHaveBeenLastCalledWith({
      langs: ['javascript', 'typescript'],
    })

    await registerHighlightOnce(registerHighlight, {
      langs: ['typescript', 'javascript'],
    })

    expect(registerHighlight).toHaveBeenCalledTimes(1)
  })

  it('dedupes Shiki themes without reordering caller priority', () => {
    const themes = ['vitesse-light', { name: 'custom-theme' }, ' vitesse-dark ', '', 'vitesse-light'] as any[]
    const expected = {
      themes: ['vitesse-light', 'vitesse-dark'],
    }

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

  it('normalizes golang to the Shiki go id', () => {
    expect(getRegisterHighlightOptions(undefined, ['golang', 'go'])).toEqual({
      langs: ['go'],
    })
    expect(getHighlightRegistrationKey(undefined, ['golang'])).toBe(
      getHighlightRegistrationKey(undefined, ['go']),
    )
  })

  it('uses a stable registration key for reordered normalized langs', () => {
    expect(getHighlightRegistrationKey(['vitesse-light'], ['ts', 'js', 'ts'])).toBe(
      getHighlightRegistrationKey(['vitesse-light'], ['javascript', 'typescript']),
    )
  })

  it('builds runtime Shiki config for registerHighlight and renderer capabilities', () => {
    expect(
      getRuntimeShikiRegistrationConfig(['vitesse-light'], ['ts'], {
        hasRegisterHighlight: true,
        hasCreateRenderer: true,
      }),
    ).toEqual({
      key: getHighlightRegistrationKey(['vitesse-light'], ['typescript']),
      registerOptions: {
        themes: ['vitesse-light'],
        langs: ['typescript'],
      },
      rendererOptions: {
        themes: ['vitesse-light'],
        langs: ['typescript'],
      },
      ignoredLangs: false,
    })

    expect(
      getRuntimeShikiRegistrationConfig(['vitesse-light'], ['ts'], {
        hasRegisterHighlight: false,
        hasCreateRenderer: true,
      }),
    ).toEqual({
      key: getHighlightRegistrationKey(['vitesse-light'], undefined),
      registerOptions: {
        themes: ['vitesse-light'],
      },
      rendererOptions: {
        themes: ['vitesse-light'],
      },
      ignoredLangs: true,
    })

    expect(
      getRuntimeShikiRegistrationConfig(undefined, ['ts'], {
        hasRegisterHighlight: false,
        hasCreateRenderer: false,
      }),
    ).toMatchObject({
      registerOptions: {
        langs: ['typescript'],
      },
      rendererOptions: {
        langs: ['typescript'],
      },
      ignoredLangs: false,
    })
  })

  it('keeps Shiki theme order in the registration key', () => {
    expect(
      getHighlightRegistrationKey(['vitesse-light', 'vitesse-dark'], ['ts', 'js']),
    ).not.toBe(
      getHighlightRegistrationKey(['vitesse-dark', 'vitesse-light'], ['js', 'ts']),
    )
  })

  it('treats Shiki theme registration as set-based while renderer keys keep caller priority', async () => {
    const calls: RegisterHighlightOptions[] = []
    const registerHighlight = vi.fn(async (opts?: RegisterHighlightOptions) => {
      calls.push(opts ?? {})
    })

    await registerHighlightOnce(registerHighlight, getRegisterHighlightOptions(['vitesse-light', 'vitesse-dark']))
    await registerHighlightOnce(registerHighlight, getRegisterHighlightOptions(['vitesse-dark', 'vitesse-light']))

    expect(calls).toEqual([
      { themes: ['vitesse-light', 'vitesse-dark'] },
    ])
    expect(getHighlightRegistrationKey(['vitesse-light', 'vitesse-dark'])).not.toBe(
      getHighlightRegistrationKey(['vitesse-dark', 'vitesse-light']),
    )
  })

  it('does not forget cumulative registrations after default Shiki registration', async () => {
    const calls: RegisterHighlightOptions[] = []
    const registerHighlight = vi.fn(async (opts?: RegisterHighlightOptions) => {
      calls.push(opts ?? {})
    })

    await registerHighlightOnce(registerHighlight, getRegisterHighlightOptions(undefined, ['ts']))
    await registerHighlightOnce(registerHighlight, {})
    await registerHighlightOnce(registerHighlight, getRegisterHighlightOptions(undefined, ['typescript']))

    expect(calls).toEqual([
      { langs: ['typescript'] },
      {},
    ])
  })

  it('treats default language registration as covering later scoped lang registrations', async () => {
    const calls: RegisterHighlightOptions[] = []
    const registerHighlight = vi.fn(async (opts?: RegisterHighlightOptions) => {
      calls.push(opts ?? {})
    })

    await registerHighlightOnce(registerHighlight, {})
    await registerHighlightOnce(registerHighlight, { langs: ['ts'] })
    await registerHighlightOnce(registerHighlight, { langs: ['javascript', 'typescript'] })

    expect(calls).toEqual([{}])
  })

  it('still registers a new theme after default language registration', async () => {
    const calls: RegisterHighlightOptions[] = []
    const registerHighlight = vi.fn(async (opts?: RegisterHighlightOptions) => {
      calls.push(opts ?? {})
    })

    await registerHighlightOnce(registerHighlight, {})
    await registerHighlightOnce(registerHighlight, {
      themes: ['vitesse-dark'],
      langs: ['ts'],
    })

    expect(calls).toEqual([
      {},
      { themes: ['vitesse-dark'] },
    ])
  })

  it('coalesces concurrent highlight registration calls for the same key', async () => {
    const deferred = createDeferred()
    const registerHighlight = vi.fn(() => deferred.promise)
    const opts = { langs: ['typescript'] }
    const key = getHighlightRegistrationKey(undefined, opts.langs)

    const first = registerHighlightOnce(registerHighlight, opts, key)
    const second = registerHighlightOnce(registerHighlight, opts, key)

    await Promise.resolve()
    await Promise.resolve()
    expect(registerHighlight).toHaveBeenCalledTimes(1)

    deferred.resolve()
    await Promise.all([first, second])

    await registerHighlightOnce(registerHighlight, opts, key)
    expect(registerHighlight).toHaveBeenCalledTimes(1)
  })

  it('serializes different highlight registration keys for the same registerHighlight function', async () => {
    const first = createDeferred()
    const events: string[] = []
    const registerHighlight = vi.fn((opts?: { langs?: readonly string[] }) => {
      const langs = opts?.langs?.join(',') ?? 'none'
      events.push(`start:${langs}`)

      if (langs === 'typescript') {
        return first.promise.then(() => {
          events.push('end:typescript')
        })
      }

      events.push(`end:${langs}`)
    })

    const p1 = registerHighlightOnce(registerHighlight, { langs: ['typescript'] }, 'ts')
    const p2 = registerHighlightOnce(registerHighlight, { langs: ['python'] }, 'py')

    await Promise.resolve()
    await Promise.resolve()
    expect(events).toEqual(['start:typescript'])

    first.resolve()
    await Promise.all([p1, p2])

    expect(events).toEqual([
      'start:typescript',
      'end:typescript',
      'start:typescript,python',
      'end:typescript,python',
    ])
  })

  it('serializes scoped and default highlight registrations without losing default coverage', async () => {
    const first = createDeferred()
    const calls: RegisterHighlightOptions[] = []

    const registerHighlight = vi.fn((opts?: RegisterHighlightOptions) => {
      calls.push(opts ?? {})

      if (opts?.langs?.includes('typescript'))
        return first.promise

      return Promise.resolve()
    })

    const scoped = registerHighlightOnce(registerHighlight, {
      langs: ['typescript'],
    })
    const defaults = registerHighlightOnce(registerHighlight, {})

    await Promise.resolve()
    await Promise.resolve()

    expect(calls).toEqual([
      { langs: ['typescript'] },
    ])

    first.resolve()
    await Promise.all([scoped, defaults])

    expect(calls).toEqual([
      { langs: ['typescript'] },
      {},
    ])

    await registerHighlightOnce(registerHighlight, { langs: ['python'] })

    expect(calls).toEqual([
      { langs: ['typescript'] },
      {},
    ])
  })

  it('registers cumulative Shiki langs without repeating covered subsets', async () => {
    const calls: Array<{ langs?: readonly string[] }> = []
    const registerHighlight = vi.fn(async (opts?: { langs?: readonly string[] }) => {
      calls.push(opts ?? {})
    })

    await registerHighlightOnce(
      registerHighlight,
      getRegisterHighlightOptions(undefined, ['ts']),
    )
    await registerHighlightOnce(
      registerHighlight,
      getRegisterHighlightOptions(undefined, ['ts', 'vue']),
    )
    await registerHighlightOnce(
      registerHighlight,
      getRegisterHighlightOptions(undefined, ['ts']),
    )

    expect(calls).toEqual([
      { langs: ['typescript'] },
      { langs: ['typescript', 'vue'] },
    ])
  })

  it('retries failed highlight registration and caches later success', async () => {
    const registerHighlight = vi
      .fn()
      .mockRejectedValueOnce(new Error('first registration failed'))
      .mockResolvedValue(undefined)
    const opts = { langs: ['typescript'] }
    const key = getHighlightRegistrationKey(undefined, opts.langs)

    await expect(registerHighlightOnce(registerHighlight, opts, key)).rejects.toThrow(
      'first registration failed',
    )
    await expect(registerHighlightOnce(registerHighlight, opts, key)).resolves.toBe('ready')
    await expect(registerHighlightOnce(registerHighlight, opts, key)).resolves.toBe('ready')

    expect(registerHighlight).toHaveBeenCalledTimes(2)
    expect(registerHighlight).toHaveBeenNthCalledWith(1, opts)
    expect(registerHighlight).toHaveBeenNthCalledWith(2, opts)
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

  it('lets codeBlockProps.langs override top-level langs in Vue Shiki mode', async () => {
    const { default: NodeRenderer } = await import('../src/components/NodeRenderer')
    const wrapper = mount(NodeRenderer, {
      props: {
        content: '```ts\nconst value = 1\n```',
        final: true,
        codeRenderer: 'shiki',
        langs: ['python'],
        codeBlockProps: {
          langs: ['typescript'],
        },
      },
    })

    await flushAll()
    await waitForLastRegisterHighlightLangs(['typescript'])

    wrapper.unmount()
  })

  it('omits Vue runtime langs when stream-markdown lacks registerHighlight', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    streamMarkdownMock.omitRegisterHighlight = true
    streamMarkdownMock.loadedLangs.add('typescript')

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

      expect(streamMarkdownMock.registerHighlight).not.toHaveBeenCalled()
      expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenLastCalledWith(
        expect.any(HTMLElement),
        expect.not.objectContaining({ langs: expect.any(Array) }),
      )
      expect(warnSpy.mock.calls.some(([message]) => String(message).includes('`langs` requires stream-markdown'))).toBe(true)
    }
    finally {
      wrapper.unmount()
      warnSpy.mockRestore()
    }
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
      expect.objectContaining({ langs: ['javascript', 'typescript'] }),
    )

    await wrapper.setProps({ langs: ['javascript', 'typescript'] })
    await flushAll()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(1)
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('reuses Vue highlight registration for later matching code block instances', async () => {
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

  it('matches golang fences when only go is configured', async () => {
    const { default: MarkdownCodeBlockNode } = await import('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('golang', 'fmt.Println("hi")'),
        langs: ['go'],
      },
    })

    await flushAll()
    await waitForRendererCreated()

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledWith(
      expect.objectContaining({ langs: ['go'] }),
    )
    expect(streamMarkdownMock.createdRenderers[0]?.updateCode).toHaveBeenLastCalledWith(
      'fmt.Println("hi")',
      'go',
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
      expect.objectContaining({ langs: ['typescript', 'python'] }),
    )
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
    expect(renderer.updateCode).not.toHaveBeenCalled()
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ langs: ['python'] }),
    )
    expect(streamMarkdownMock.createdRenderers[initialRendererCount]?.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'typescript',
    )

    wrapper.unmount()
  })

  it('clears Vue Shiki renderer DOM when code becomes empty', async () => {
    const { default: MarkdownCodeBlockNode } = await import('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('typescript', 'const value = 1'),
        langs: ['typescript'],
      },
    })

    await flushAll()
    await waitForRendererCreated()

    expect(wrapper.find('.code-block-render').text()).toContain('const value = 1')

    await wrapper.setProps({
      node: makeNode('typescript', ''),
    })
    await flushAll()

    expect(wrapper.find('.code-block-render').text()).toBe('')
    expect(wrapper.find('.code-fallback-plain').exists()).toBe(false)

    wrapper.unmount()
  })

  it('keeps Vue fallback visible while langs re-registration is pending', async () => {
    const initialLang = 'vue-pending-initial'
    const nextLang = 'vue-pending-next'
    const pendingRegistration = createDeferred()
    streamMarkdownMock.registerHighlight
      .mockImplementationOnce(async (opts?: { langs?: readonly string[] }) => {
        streamMarkdownMock.loadLangs(opts)
      })
      .mockImplementationOnce(() => pendingRegistration.promise.then(() => {
        streamMarkdownMock.loadLangs({ langs: [nextLang] })
      }))

    const { default: MarkdownCodeBlockNode } = await import('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode(initialLang, 'const value = 1'),
        langs: [initialLang],
      },
    })

    await flushAll()
    await waitForRendererCreated()

    const initialRendererCount = streamMarkdownMock.createdRenderers.length

    await wrapper.setProps({ langs: [nextLang] })
    await flushAll()

    expect(wrapper.find('.code-block-render').text()).toContain('const value = 1')
    expect(wrapper.find('.code-fallback-plain').text()).toContain('const value = 1')

    pendingRegistration.resolve()
    await pendingRegistration.promise
    await flushAll()
    await waitForRendererCount(initialRendererCount + 1)

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

  it('keeps previous Vue renderer when re-registration for new langs fails', async () => {
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

      expect(oldRenderer.dispose).not.toHaveBeenCalled()
      expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenCalledTimes(initialRendererCount)
      expect((wrapper.find('.code-block-render').element as HTMLElement).textContent).toContain('const value = 1')
      expect(wrapper.find('.code-fallback-plain').exists()).toBe(false)
    }
    finally {
      wrapper.unmount()
      warnSpy.mockRestore()
    }
  })

  it('retries Vue Shiki registration without langs when configured langs fail', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const invalidLang = 'vue-invalid-configured-lang'
    const theme = 'vue-invalid-lang-fallback-theme'
    streamMarkdownMock.registerHighlight.mockImplementation(async (opts?: { langs?: readonly string[] }) => {
      if (opts?.langs?.includes(invalidLang))
        throw new Error('invalid language')
      streamMarkdownMock.loadLangs(opts)
    })

    const { default: MarkdownCodeBlockNode } = await import('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('typescript'),
        themes: [theme],
        langs: ['typescript', invalidLang],
      },
    })

    try {
      await flushAll()
      await waitForRendererCreated()

      expect(streamMarkdownMock.registerHighlight).toHaveBeenLastCalledWith({
        themes: [theme],
      })
      expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenLastCalledWith(
        expect.any(HTMLElement),
        expect.not.objectContaining({ langs: expect.any(Array) }),
      )
      expect(streamMarkdownMock.createdRenderers.at(-1)?.updateCode).toHaveBeenLastCalledWith(
        'const value = 1',
        'typescript',
      )

      const invalidLangCallsAfterFallback = countRegisterHighlightCallsForLang(invalidLang)
      const renderer = streamMarkdownMock.createdRenderers.at(-1)
      const updateCount = renderer?.updateCode.mock.calls.length ?? 0

      await wrapper.setProps({
        node: makeNode('typescript', 'const value = 2'),
      })
      await flushAll()
      await waitForRendererUpdateCall(renderer, updateCount + 1)

      expect(countRegisterHighlightCallsForLang(invalidLang)).toBe(invalidLangCallsAfterFallback)
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
    await waitForLastRegisterHighlightLangs(['typescript', 'python'])
    await waitForRendererCount(initialRendererCount + 1)

    expect(streamMarkdownMock.registerHighlight).toHaveBeenLastCalledWith(
      expect.objectContaining({ langs: ['typescript', 'python'] }),
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
    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(1)

    first.reject(new Error('stale failed registration'))
    await first.promise.catch(() => {})
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

  it('keeps Vue fallback over stale renderer DOM until the next async Shiki write lands', async () => {
    const pendingWrites: Array<() => void> = []
    streamMarkdownMock.createShikiStreamRenderer.mockImplementationOnce((el: HTMLElement) => {
      const renderer = {
        updateCode: vi.fn((code: string, lang?: string) => {
          pendingWrites.push(() => {
            el.textContent = `${lang ?? ''}:${code}`
          })
          return Promise.resolve()
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
        node: makeNode('typescript', 'const oldValue = 1'),
        langs: ['typescript'],
      },
    })

    await flushAll()
    await waitForRendererCreated()
    const renderer = streamMarkdownMock.createdRenderers[0]
    await waitForRendererUpdateCall(renderer, 1)

    pendingWrites.shift()?.()
    await flushAll()

    expect(wrapper.find('.code-block-render').text()).toBe('typescript:const oldValue = 1')
    expect(wrapper.find('.code-fallback-plain').exists()).toBe(false)

    await wrapper.setProps({
      node: makeNode('typescript', 'const newValue = 2'),
    })
    await flushAll()
    await waitForRendererUpdateCall(renderer, 2)

    expect(wrapper.find('.code-block-render').text()).toBe('typescript:const oldValue = 1')
    expect(wrapper.find('.code-fallback-plain').text()).toContain('const newValue = 2')

    pendingWrites.shift()?.()
    await flushAll()

    expect(wrapper.find('.code-block-render').text()).toBe('typescript:const newValue = 2')
    expect(wrapper.find('.code-fallback-plain').exists()).toBe(false)

    wrapper.unmount()
  })

  it('clears Vue fallback after an idempotent renderer update keeps DOM unchanged', async () => {
    streamMarkdownMock.createShikiStreamRenderer.mockImplementationOnce((el: HTMLElement) => {
      let rendered = ''
      const renderer = {
        updateCode: vi.fn(async (code: string, lang?: string) => {
          const next = `${lang ?? ''}:${code}`
          if (rendered === next)
            return
          rendered = next
          el.textContent = next
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
        stream: false,
        node: makeNode('typescript', 'const value = 1'),
        langs: ['typescript'],
      },
    })

    await flushAll()
    await waitForRendererCreated()
    const renderer = streamMarkdownMock.createdRenderers[0]
    await waitForRendererUpdateCall(renderer, 1)
    await flushAll()

    expect(wrapper.find('.code-block-render').text()).toBe('typescript:const value = 1')
    expect(wrapper.find('.code-fallback-plain').exists()).toBe(false)

    await wrapper.setProps({ loading: true })
    await flushAll()

    await wrapper.setProps({ loading: false })
    await flushAll()
    await waitForRendererUpdateCall(renderer, 2)
    await flushAll()

    expect(wrapper.find('.code-block-render').text()).toBe('typescript:const value = 1')
    expect(wrapper.find('.code-fallback-plain').exists()).toBe(false)

    wrapper.unmount()
  })

  it('clears Vue Shiki fallback when MutationObserver is unavailable but renderer wrote content', async () => {
    const OriginalMutationObserver = globalThis.MutationObserver
    ;(globalThis as any).MutationObserver = undefined

    const { default: MarkdownCodeBlockNode } = await import('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('typescript', 'const value = 1'),
        langs: ['typescript'],
      },
    })

    try {
      await flushAll()

      await waitUntil(
        () => !wrapper.find('.code-fallback-plain').exists(),
        () => 'Vue fallback should be removed after synchronous renderer content is written.',
      )

      expect(wrapper.text()).toContain('typescript:const value = 1')
    }
    finally {
      wrapper.unmount()
      ;(globalThis as any).MutationObserver = OriginalMutationObserver
    }
  })

  it('keeps Vue renderer reconfiguration when code updates during pending langs registration', async () => {
    const second = createDeferred()
    streamMarkdownMock.registerHighlight
      .mockImplementationOnce(async (opts?: { langs?: readonly string[] }) => {
        streamMarkdownMock.loadLangs(opts)
      })
      .mockImplementationOnce(() => second.promise.then(() => {
        streamMarkdownMock.loadLangs({ langs: ['python'] })
      }))

    const { default: MarkdownCodeBlockNode } = await import('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('typescript', 'const value = 1'),
        langs: ['typescript'],
      },
    })

    await flushAll()
    await waitForRendererCreated()

    const initialRendererCount = streamMarkdownMock.createdRenderers.length

    await wrapper.setProps({ langs: ['python'] })
    await wrapper.setProps({
      node: makeNode('python', 'fresh_value = 2'),
    })

    second.resolve()
    await second.promise
    await flushAll()
    await waitForRendererCount(initialRendererCount + 1)

    expect(streamMarkdownMock.registerHighlight).toHaveBeenLastCalledWith(
      expect.objectContaining({ langs: ['typescript', 'python'] }),
    )
    expect(streamMarkdownMock.createdRenderers.at(-1)?.updateCode).toHaveBeenLastCalledWith(
      'fresh_value = 2',
      'python',
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

  it('updates Vue2 Shiki renderer theme when isDark changes', async () => {
    const { default: Vue2MarkdownCodeBlockNode } = await import('../packages/markstream-vue2/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(Vue2MarkdownCodeBlockNode as any, {
      props: {
        loading: false,
        node: makeNode('typescript'),
        langs: ['typescript'],
        isDark: false,
        lightTheme: 'vitesse-light',
        darkTheme: 'vitesse-dark',
      },
    })

    await flushAll()
    await waitForRendererCreated()

    const renderer = streamMarkdownMock.createdRenderers.at(-1)
    renderer?.setTheme.mockClear()

    await wrapper.setProps({ isDark: true })
    await flushAll()

    await waitUntil(
      () => renderer?.setTheme.mock.calls.some(([theme]: [string]) => theme === 'vitesse-dark'),
      () => `Timed out waiting for Vue2 setTheme("vitesse-dark"); calls=${JSON.stringify(renderer?.setTheme.mock.calls ?? [])}`,
    )

    expect(renderer?.setTheme).toHaveBeenLastCalledWith('vitesse-dark')

    wrapper.unmount()
  })

  it('omits Vue2 runtime langs when stream-markdown lacks registerHighlight', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    streamMarkdownMock.omitRegisterHighlight = true
    streamMarkdownMock.loadedLangs.add('typescript')

    const { default: Vue2MarkdownCodeBlockNode } = await import('../packages/markstream-vue2/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(Vue2MarkdownCodeBlockNode as any, {
      props: {
        loading: false,
        node: makeNode('typescript'),
        langs: ['typescript'],
      },
    })

    try {
      await flushAll()
      await waitForRendererCreated()

      expect(streamMarkdownMock.registerHighlight).not.toHaveBeenCalled()
      expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenLastCalledWith(
        expect.any(HTMLElement),
        expect.not.objectContaining({ langs: expect.any(Array) }),
      )
      expect(warnSpy.mock.calls.some(([message]) => String(message).includes('`langs` requires stream-markdown'))).toBe(true)
    }
    finally {
      wrapper.unmount()
      warnSpy.mockRestore()
    }
  })

  it('observes Vue2 renderer attribute and character data mutations', async () => {
    const OriginalMutationObserver = globalThis.MutationObserver
    const observe = vi.fn()
    const disconnect = vi.fn()
    ;(globalThis as any).MutationObserver = class {
      constructor(_callback: MutationCallback) {}
      disconnect = disconnect
      observe = observe
    }

    streamMarkdownMock.createShikiStreamRenderer.mockImplementationOnce(() => {
      const renderer = {
        updateCode: vi.fn(async () => {}),
        setTheme: vi.fn(async () => {}),
        dispose: vi.fn(),
      }
      streamMarkdownMock.createdRenderers.push(renderer)
      return renderer
    })

    const { default: Vue2MarkdownCodeBlockNode } = await import('../packages/markstream-vue2/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(Vue2MarkdownCodeBlockNode as any, {
      props: {
        loading: false,
        node: makeNode('typescript'),
        langs: ['typescript'],
      },
    })

    try {
      await flushAll()
      await waitForRendererCreated()
      const renderer = streamMarkdownMock.createdRenderers[0]
      await waitForRendererUpdateCall(renderer, 1)
      await flushAll()

      expect(observe).toHaveBeenCalledWith(expect.any(HTMLElement), {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
      })
    }
    finally {
      wrapper.unmount()
      ;(globalThis as any).MutationObserver = OriginalMutationObserver
    }
  })

  it('reuses Vue2 highlight registration for later matching code block instances', async () => {
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

  it('does not treat Vue2 langs as a hard allow-list when a language is already available', async () => {
    streamMarkdownMock.loadedLangs.add('python')
    const { default: Vue2MarkdownCodeBlockNode } = await import('../packages/markstream-vue2/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(Vue2MarkdownCodeBlockNode as any, {
      props: {
        loading: false,
        node: makeNode('python'),
        langs: ['typescript'],
      },
    })

    await flushAll()
    await waitForRendererCreated()

    expect(streamMarkdownMock.createdRenderers[0]?.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'python',
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

  it('keeps previous Vue2 renderer when Shiki re-registration fails after a stable render', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const initialLang = 'vue2-fallback-forced-initial'
    const nextLang = 'vue2-fallback-forced-next'

    const { default: Vue2MarkdownCodeBlockNode } = await import(
      '../packages/markstream-vue2/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue',
    )

    const langs = ref([initialLang])
    const wrapper = mount(defineComponent({
      setup() {
        const node = makeNode(initialLang, 'const value = 1')
        return () => h(Vue2MarkdownCodeBlockNode as any, {
          loading: false,
          node,
          langs: langs.value,
        })
      },
    }))

    try {
      await flushAll()
      await waitForRendererCreated()
      await flushAll()

      expect(wrapper.find('.code-block-render').text()).toContain('const value = 1')
      await waitUntil(
        () => {
          const fallback = wrapper.find('.code-fallback-plain')
          return !fallback.exists() || !fallback.isVisible()
        },
        () => {
          const state = (wrapper.findComponent(Vue2MarkdownCodeBlockNode as any).vm as any).$.setupState
          return `Timed out waiting for Vue2 fallback to hide after stable render: ready=${state.rendererReady} fallback=${JSON.stringify(state.fallbackHtml)} stable=${state.hasStableRender} committed=${state.lastCommittedRenderSignature}`
        },
        flushAll,
      )

      const initialRendererCount = streamMarkdownMock.createdRenderers.length
      const oldRenderer = streamMarkdownMock.createdRenderers[initialRendererCount - 1]

      streamMarkdownMock.registerHighlight.mockRejectedValue(new Error('load failed'))

      langs.value = [nextLang]
      await flushAll()
      const childState = (wrapper.findComponent(Vue2MarkdownCodeBlockNode as any).vm as any).$.setupState
      await childState.safeInitRenderer()
      for (let i = 0; i < 10 && streamMarkdownMock.registerHighlight.mock.calls.length < 3; i++)
        await flushAll()

      expect(oldRenderer.dispose).not.toHaveBeenCalled()
      expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenCalledTimes(initialRendererCount)
      expect(wrapper.find('.code-block-render').text()).toContain('const value = 1')
      expect(childState.rendererReady).toBe(true)
      expect(childState.fallbackHtml).toBe('')
    }
    finally {
      wrapper.unmount()
      warnSpy.mockRestore()
    }
  })

  it('retries Vue2 Shiki registration without langs when configured langs fail', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const invalidLang = 'vue2-invalid-configured-lang'
    const theme = 'vue2-invalid-lang-fallback-theme'
    streamMarkdownMock.registerHighlight.mockImplementation(async (opts?: { langs?: readonly string[] }) => {
      if (opts?.langs?.includes(invalidLang))
        throw new Error('invalid language')
      streamMarkdownMock.loadLangs(opts)
    })

    const { default: Vue2MarkdownCodeBlockNode } = await import('../packages/markstream-vue2/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const node = ref(makeNode('typescript'))
    const wrapper = mount(defineComponent({
      setup() {
        return () => h(Vue2MarkdownCodeBlockNode as any, {
          loading: false,
          node: node.value,
          themes: [theme],
          langs: ['typescript', invalidLang],
        })
      },
    }))

    try {
      await flushAll()
      await waitForRendererCreated()

      expect(streamMarkdownMock.registerHighlight).toHaveBeenLastCalledWith({
        themes: [theme],
      })
      expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenLastCalledWith(
        expect.any(HTMLElement),
        expect.not.objectContaining({ langs: expect.any(Array) }),
      )
      expect(streamMarkdownMock.createdRenderers.at(-1)?.updateCode).toHaveBeenLastCalledWith(
        'const value = 1',
        'typescript',
      )

      const invalidLangCallsAfterFallback = countRegisterHighlightCallsForLang(invalidLang)

      node.value = makeNode('typescript', 'const value = 2')
      await flushAll()
      const childState = (wrapper.findComponent(Vue2MarkdownCodeBlockNode as any).vm as any).$.setupState
      await childState.safeInitRenderer()
      await flushAll()

      expect(countRegisterHighlightCallsForLang(invalidLang)).toBe(invalidLangCallsAfterFallback)
    }
    finally {
      wrapper.unmount()
      warnSpy.mockRestore()
    }
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

  it('matches Vue custom language code block overrides by normalized Shiki aliases', async () => {
    setCustomComponents(vueCustomId, { typescript: VueCodeBlockProbe })
    const { default: NodeRenderer } = await import('../src/components/NodeRenderer')
    const wrapper = mount(NodeRenderer, {
      props: {
        customId: vueCustomId,
        nodes: [makeNode('ts')],
        langs: ['typescript'],
      },
    })

    await flushAll()

    const probe = wrapper.get('.vue-code-block-probe')
    expect(probe.attributes('data-language')).toBe('ts')
    expect(probe.attributes('data-langs')).toBe('["typescript"]')

    wrapper.unmount()
  })

  it('matches Vue custom language code block overrides by UI aliases before Shiki aliases', async () => {
    setCustomComponents(vueCustomId, {
      plain: VueCodeBlockProbe,
      shell: VueCodeBlockProbe,
    })
    const { default: NodeRenderer } = await import('../src/components/NodeRenderer')
    const wrapper = mount(NodeRenderer, {
      props: {
        customId: vueCustomId,
        nodes: [makeNode('sh'), makeNode('txt')],
      },
    })

    await flushAll()

    const probes = wrapper.findAll('.vue-code-block-probe')
    expect(probes).toHaveLength(2)
    expect(probes[0].attributes('data-language')).toBe('sh')
    expect(probes[1].attributes('data-language')).toBe('txt')

    wrapper.unmount()
  })

  it('matches React custom language code block overrides by normalized Shiki aliases', async () => {
    setReactCustomComponents(reactCustomId, {
      typescript: ReactCodeBlockProbe as any,
    })

    const { NodeRenderer: ReactNodeRenderer } = await import('../packages/markstream-react/src/components/NodeRenderer')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(ReactNodeRenderer, {
        customId: reactCustomId,
        nodes: [makeNode('ts')],
        langs: ['typescript'],
      }))
    })

    await flushReact()

    const probe = host.querySelector('.react-code-block-probe') as HTMLElement | null
    expect(probe?.getAttribute('data-language')).toBe('ts')
    expect(probe?.getAttribute('data-langs')).toBe('["typescript"]')

    await act(async () => {
      root.unmount()
    })
  })

  it('matches React custom language code block overrides by UI aliases before Shiki aliases', async () => {
    setReactCustomComponents(reactCustomId, {
      plain: ReactCodeBlockProbe as any,
      shell: ReactCodeBlockProbe as any,
    })

    const { NodeRenderer: ReactNodeRenderer } = await import('../packages/markstream-react/src/components/NodeRenderer')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(ReactNodeRenderer, {
        customId: reactCustomId,
        nodes: [makeNode('sh'), makeNode('txt')],
      }))
    })

    await flushReact()

    const probes = host.querySelectorAll('.react-code-block-probe')
    expect(probes).toHaveLength(2)
    expect(probes[0]?.getAttribute('data-language')).toBe('sh')
    expect(probes[1]?.getAttribute('data-language')).toBe('txt')

    await act(async () => {
      root.unmount()
    })
  })

  it('matches React server custom language code block overrides by normalized Shiki aliases', async () => {
    setReactCustomComponents(reactCustomId, {
      typescript: ReactCodeBlockProbe as any,
    })

    const { NodeRenderer: ReactServerNodeRenderer } = await import('../packages/markstream-react/src/server-renderer')
    const html = renderToStaticMarkup(React.createElement(ReactServerNodeRenderer, {
      customId: reactCustomId,
      nodes: [makeNode('ts')],
      langs: ['typescript'],
    }))
    const host = document.createElement('div')
    host.innerHTML = html

    const probe = host.querySelector('.react-code-block-probe') as HTMLElement | null
    expect(probe?.getAttribute('data-language')).toBe('ts')
    expect(probe?.getAttribute('data-langs')).toBe('["typescript"]')
  })

  it('matches React server custom language code block overrides by UI aliases before Shiki aliases', async () => {
    setReactCustomComponents(reactCustomId, {
      plain: ReactCodeBlockProbe as any,
      shell: ReactCodeBlockProbe as any,
    })

    const { NodeRenderer: ReactServerNodeRenderer } = await import('../packages/markstream-react/src/server-renderer')
    const html = renderToStaticMarkup(React.createElement(ReactServerNodeRenderer, {
      customId: reactCustomId,
      nodes: [makeNode('sh'), makeNode('txt')],
    }))
    const host = document.createElement('div')
    host.innerHTML = html

    const probes = host.querySelectorAll('.react-code-block-probe')
    expect(probes).toHaveLength(2)
    expect(probes[0]?.getAttribute('data-language')).toBe('sh')
    expect(probes[1]?.getAttribute('data-language')).toBe('txt')
  })

  it('matches Vue2 custom language code block overrides by normalized Shiki aliases', async () => {
    setVue2CustomComponents(vue2CustomId, { typescript: Vue2CodeBlockProbe as any })
    const { default: LegacyNodesRenderer } = await import('../packages/markstream-vue2/src/components/NodeRenderer/LegacyNodesRenderer.vue')
    const wrapper = mount(LegacyNodesRenderer as any, {
      props: {
        customId: vue2CustomId,
        nodes: [makeNode('ts')],
        langs: ['typescript'],
      },
    })

    await flushAll()

    const probe = wrapper.get('.vue2-code-block-probe')
    expect(probe.attributes('data-language')).toBe('ts')
    expect(probe.attributes('data-langs')).toBe('["typescript"]')

    wrapper.unmount()
  })

  it('matches Vue2 custom language code block overrides by UI aliases before Shiki aliases', async () => {
    setVue2CustomComponents(vue2CustomId, {
      plain: Vue2CodeBlockProbe as any,
      shell: Vue2CodeBlockProbe as any,
    })
    const { default: LegacyNodesRenderer } = await import('../packages/markstream-vue2/src/components/NodeRenderer/LegacyNodesRenderer.vue')
    const legacyWrapper = mount(LegacyNodesRenderer as any, {
      props: {
        customId: vue2CustomId,
        nodes: [makeNode('sh'), makeNode('txt')],
      },
    })

    await flushAll()

    const legacyProbes = legacyWrapper.findAll('.vue2-code-block-probe')
    expect(legacyProbes).toHaveLength(2)
    expect(legacyProbes[0].attributes('data-language')).toBe('sh')
    expect(legacyProbes[1].attributes('data-language')).toBe('txt')
    legacyWrapper.unmount()

    const { default: Vue2NodeRenderer } = await import('../packages/markstream-vue2/src/components/NodeRenderer')
    const wrapper = mount(Vue2NodeRenderer as any, {
      props: {
        customId: vue2CustomId,
        nodes: [makeNode('sh'), makeNode('txt')],
      },
    })

    await flushAll()

    const probes = wrapper.findAll('.vue2-code-block-probe')
    expect(probes).toHaveLength(2)
    expect(probes[0].attributes('data-language')).toBe('sh')
    expect(probes[1].attributes('data-language')).toBe('txt')

    wrapper.unmount()
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

  it('reconfigures React renderer when theme order changes without repeating covered theme registration', async () => {
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
    const registerCallCount = streamMarkdownMock.registerHighlight.mock.calls.length
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

    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(registerCallCount)
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

  it('omits React runtime langs when stream-markdown lacks registerHighlight', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    streamMarkdownMock.omitRegisterHighlight = true
    streamMarkdownMock.loadedLangs.add('typescript')

    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    try {
      await act(async () => {
        root.render(React.createElement(ReactMarkdownCodeBlockNode, {
          loading: false,
          node: makeNode('typescript'),
          langs: ['typescript'],
        }))
      })

      await flushReact()
      await waitForReactRendererCreated()

      expect(streamMarkdownMock.registerHighlight).not.toHaveBeenCalled()
      expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenLastCalledWith(
        expect.any(HTMLElement),
        expect.not.objectContaining({ langs: expect.any(Array) }),
      )
      expect(warnSpy.mock.calls.some(([message]) => String(message).includes('`langs` requires stream-markdown'))).toBe(true)
    }
    finally {
      await act(async () => {
        root.unmount()
      })
      warnSpy.mockRestore()
    }
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

  it('keeps React fallback until the async Shiki renderer writes DOM content', async () => {
    let writeRendererDom: (() => void) | undefined
    streamMarkdownMock.createShikiStreamRenderer.mockImplementationOnce((el: HTMLElement) => {
      const renderer = {
        updateCode: vi.fn((code: string, lang?: string) => {
          writeRendererDom = () => {
            el.textContent = `${lang ?? ''}:${code}`
          }
          return Promise.resolve()
        }),
        setTheme: vi.fn(async () => {}),
        dispose: vi.fn(),
      }
      streamMarkdownMock.createdRenderers.push(renderer)
      return renderer
    })

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
    const renderer = streamMarkdownMock.createdRenderers[0]
    await waitForRendererUpdateCall(renderer, 1)
    await flushReact()

    expect(renderer?.updateCode).toHaveBeenLastCalledWith('const value = 1', 'typescript')
    expect(host.querySelector('.code-block-render')?.textContent).toBe('')
    expect(host.querySelector('.code-fallback-plain')?.textContent).toContain('const value = 1')
    expect(writeRendererDom).toBeTypeOf('function')

    await act(async () => {
      writeRendererDom?.()
      await Promise.resolve()
    })
    await flushReact()

    expect(host.querySelector('.code-block-render')?.textContent).toBe('typescript:const value = 1')
    expect(host.querySelector('.code-fallback-plain')).toBeNull()

    await act(async () => {
      root.unmount()
    })
  })

  it('clears React fallback after an idempotent renderer update keeps DOM unchanged', async () => {
    streamMarkdownMock.createShikiStreamRenderer.mockImplementationOnce((el: HTMLElement) => {
      let rendered = ''
      const renderer = {
        updateCode: vi.fn(async (code: string, lang?: string) => {
          const next = `${lang ?? ''}:${code}`
          if (rendered === next)
            return
          rendered = next
          el.textContent = next
        }),
        setTheme: vi.fn(async () => {}),
        dispose: vi.fn(),
      }
      streamMarkdownMock.createdRenderers.push(renderer)
      return renderer
    })

    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const node = makeNode('typescript', 'const value = 1')

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node,
        langs: ['typescript'],
      }))
    })

    await flushReact()
    await waitForReactRendererCreated()
    const renderer = streamMarkdownMock.createdRenderers[0]
    await waitForRendererUpdateCall(renderer, 1)
    await flushReact()

    expect(host.querySelector('.code-block-render')?.textContent).toBe('typescript:const value = 1')
    expect(host.querySelector('.code-fallback-plain')).toBeNull()

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        isDark: true,
        node,
        langs: ['typescript'],
      }))
    })
    await flushReact()
    await waitForRendererUpdateCall(renderer, 2)
    await flushReact()

    expect(host.querySelector('.code-block-render')?.textContent).toBe('typescript:const value = 1')
    expect(host.querySelector('.code-fallback-plain')).toBeNull()

    await act(async () => {
      root.unmount()
    })
  })

  it('clears React Shiki fallback when MutationObserver is unavailable but renderer wrote content', async () => {
    const OriginalMutationObserver = globalThis.MutationObserver
    ;(globalThis as any).MutationObserver = undefined

    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    try {
      await act(async () => {
        root.render(React.createElement(ReactMarkdownCodeBlockNode, {
          loading: false,
          node: makeNode('typescript', 'const value = 1'),
          langs: ['typescript'],
        }))
      })
      await flushReact()

      await waitUntil(
        () => host.querySelector('.code-fallback-plain') === null,
        () => 'React fallback should be removed after synchronous renderer content is written.',
        flushReact,
      )

      expect(host.textContent).toContain('typescript:const value = 1')
    }
    finally {
      await act(async () => {
        root.unmount()
      })
      ;(globalThis as any).MutationObserver = OriginalMutationObserver
    }
  })

  it('keeps React fallback over stale renderer DOM until the next async Shiki write lands', async () => {
    const pendingWrites: Array<() => void> = []
    streamMarkdownMock.createShikiStreamRenderer.mockImplementationOnce((el: HTMLElement) => {
      const renderer = {
        updateCode: vi.fn((code: string, lang?: string) => {
          pendingWrites.push(() => {
            el.textContent = `${lang ?? ''}:${code}`
          })
          return Promise.resolve()
        }),
        setTheme: vi.fn(async () => {}),
        dispose: vi.fn(),
      }
      streamMarkdownMock.createdRenderers.push(renderer)
      return renderer
    })

    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node: makeNode('typescript', 'const oldValue = 1'),
        langs: ['typescript'],
      }))
    })
    await flushReact()
    await waitForReactRendererCreated()
    const renderer = streamMarkdownMock.createdRenderers[0]
    await waitForRendererUpdateCall(renderer, 1)

    await act(async () => {
      pendingWrites.shift()?.()
      await Promise.resolve()
    })
    await flushReact()

    expect(host.querySelector('.code-block-render')?.textContent).toBe('typescript:const oldValue = 1')
    expect(host.querySelector('.code-fallback-plain')).toBeNull()

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node: makeNode('typescript', 'const newValue = 2'),
        langs: ['typescript'],
      }))
    })
    await flushReact()
    await waitForRendererUpdateCall(renderer, 2)

    expect(host.querySelector('.code-block-render')?.textContent).toBe('typescript:const oldValue = 1')
    expect(host.querySelector('.code-fallback-plain')?.textContent).toContain('const newValue = 2')

    await act(async () => {
      pendingWrites.shift()?.()
      await Promise.resolve()
    })
    await flushReact()

    expect(host.querySelector('.code-block-render')?.textContent).toBe('typescript:const newValue = 2')
    expect(host.querySelector('.code-fallback-plain')).toBeNull()

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
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        key: 'first',
        loading: false,
        node: makeNode('typescript'),
        langs: ['typescript'],
      }))
    })

    await flushReact()
    await waitForReactRendererCreated()

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
    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(1)

    await act(async () => {
      first.resolve()
      await first.promise
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
      .mockImplementation(async (opts?: { langs?: readonly string[] }) => {
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
    expect(streamMarkdownMock.registerHighlight).toHaveBeenCalledTimes(1)

    await act(async () => {
      first.reject(new Error('stale failed registration'))
      await first.promise.catch(() => {})
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
      expect.objectContaining({ langs: ['typescript', 'python'] }),
    )
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
    expect(renderer.updateCode).not.toHaveBeenCalled()
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ langs: ['python'] }),
    )
    expect(streamMarkdownMock.createdRenderers[initialRendererCount]?.updateCode).toHaveBeenLastCalledWith(
      'const value = 1',
      'typescript',
    )

    await act(async () => {
      root.unmount()
    })
  })

  it('keeps React fallback visible while langs re-registration is pending', async () => {
    const initialLang = 'react-pending-initial'
    const nextLang = 'react-pending-next'
    const pendingRegistration = createDeferred()
    streamMarkdownMock.registerHighlight
      .mockImplementationOnce(async (opts?: { langs?: readonly string[] }) => {
        streamMarkdownMock.loadLangs(opts)
      })
      .mockImplementationOnce(() => pendingRegistration.promise.then(() => {
        streamMarkdownMock.loadLangs({ langs: [nextLang] })
      }))

    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const node = makeNode(initialLang, 'const value = 1')

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node,
        langs: [initialLang],
      }))
    })

    await flushReact()
    await waitForReactRendererCreated()

    const initialRendererCount = streamMarkdownMock.createdRenderers.length

    await act(async () => {
      root.render(React.createElement(ReactMarkdownCodeBlockNode, {
        loading: false,
        node,
        langs: [nextLang],
      }))
    })
    await flushReact()

    expect(host.querySelector('.code-block-render')?.textContent).toContain('const value = 1')
    expect(host.querySelector('.code-fallback-plain')?.textContent).toContain('const value = 1')

    await act(async () => {
      pendingRegistration.resolve()
      await pendingRegistration.promise
    })
    await flushReact()
    await waitForReactRendererCount(initialRendererCount + 1)

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

  it('keeps previous React renderer when re-registration for new langs fails', async () => {
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

    expect(oldRenderer.dispose).not.toHaveBeenCalled()
    expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenCalledTimes(initialRendererCount)
    expect(host.querySelector('.code-block-render')?.textContent).toContain('const value = 1')
    expect(host.querySelector('.code-fallback-plain')).toBeNull()

    await act(async () => {
      root.unmount()
    })
  })

  it('retries React Shiki registration without langs when configured langs fail', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const invalidLang = 'react-invalid-configured-lang'
    const theme = 'react-invalid-lang-fallback-theme'
    streamMarkdownMock.registerHighlight.mockImplementation(async (opts?: { langs?: readonly string[] }) => {
      if (opts?.langs?.includes(invalidLang))
        throw new Error('invalid language')
      streamMarkdownMock.loadLangs(opts)
    })

    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    try {
      await act(async () => {
        root.render(React.createElement(ReactMarkdownCodeBlockNode, {
          loading: false,
          node: makeNode('typescript'),
          themes: [theme],
          langs: ['typescript', invalidLang],
        }))
      })

      await flushReact()
      await waitForReactRendererCreated()

      expect(streamMarkdownMock.registerHighlight).toHaveBeenLastCalledWith({
        themes: [theme],
      })
      expect(streamMarkdownMock.createShikiStreamRenderer).toHaveBeenLastCalledWith(
        expect.any(HTMLElement),
        expect.not.objectContaining({ langs: expect.any(Array) }),
      )
      expect(streamMarkdownMock.createdRenderers.at(-1)?.updateCode).toHaveBeenLastCalledWith(
        'const value = 1',
        'typescript',
      )

      const invalidLangCallsAfterFallback = countRegisterHighlightCallsForLang(invalidLang)
      const renderer = streamMarkdownMock.createdRenderers.at(-1)
      const updateCount = renderer?.updateCode.mock.calls.length ?? 0

      await act(async () => {
        root.render(React.createElement(ReactMarkdownCodeBlockNode, {
          loading: false,
          node: makeNode('typescript', 'const value = 2'),
          themes: [theme],
          langs: ['typescript', invalidLang],
        }))
      })
      await flushReact()
      await waitForRendererUpdateCall(renderer, updateCount + 1)

      expect(countRegisterHighlightCallsForLang(invalidLang)).toBe(invalidLangCallsAfterFallback)
    }
    finally {
      await act(async () => {
        root.unmount()
      })
      warnSpy.mockRestore()
    }
  })

  it('does not treat React langs as a hard allow-list when a language is already available', async () => {
    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    streamMarkdownMock.loadedLangs.add('python')
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
      'python',
    )

    await act(async () => {
      root.unmount()
    })
  })

  it('caches failed React Shiki language and falls back to plaintext on later streaming updates', async () => {
    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    try {
      await act(async () => {
        root.render(React.createElement(ReactMarkdownCodeBlockNode, {
          loading: false,
          node: makeNode('unknown-lang', 'first'),
          stream: true,
        }))
      })

      await flushReact()
      await waitForReactRendererCreated()
      const renderer = streamMarkdownMock.createdRenderers[0]
      await waitForRendererUpdateCall(renderer, 2)

      expect(renderer.updateCode).toHaveBeenCalledWith('first', 'unknown-lang')
      expect(renderer.updateCode).toHaveBeenCalledWith('first', 'plaintext')

      renderer.updateCode.mockClear()

      await act(async () => {
        root.render(React.createElement(ReactMarkdownCodeBlockNode, {
          loading: false,
          node: makeNode('unknown-lang', 'second'),
          stream: true,
        }))
      })

      await flushReact()
      await waitForRendererUpdateCall(renderer, 1)

      expect(renderer.updateCode).toHaveBeenCalledWith('second', 'plaintext')
      expect(renderer.updateCode).not.toHaveBeenCalledWith('second', 'unknown-lang')
    }
    finally {
      await act(async () => {
        root.unmount()
      })
    }
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

  it('does not repeatedly import Vue stream-markdown after a failed dynamic import', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let importAttempts = 0
    const missingStreamMarkdownFactory = () => {
      importAttempts += 1
      throw new Error('missing optional peer')
    }

    vi.doMock('stream-markdown', missingStreamMarkdownFactory)

    const { default: MarkdownCodeBlockNode } = await import('../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue')
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('typescript', 'const stale = 1'),
        langs: ['typescript'],
      },
    })

    try {
      await flushAll()

      expect(importAttempts).toBe(1)
      expect(streamMarkdownMock.createShikiStreamRenderer).not.toHaveBeenCalled()

      await wrapper.setProps({
        node: makeNode('typescript', 'const fresh = 2'),
      })
      await flushAll()

      expect(importAttempts).toBe(1)
      expect(streamMarkdownMock.createShikiStreamRenderer).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledTimes(1)
    }
    finally {
      wrapper.unmount()
      warnSpy.mockRestore()
    }
  })

  it('does not repeatedly import React stream-markdown after a failed dynamic import', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let importAttempts = 0
    const missingStreamMarkdownFactory = () => {
      importAttempts += 1
      throw new Error('missing optional peer')
    }

    vi.doMock('stream-markdown', missingStreamMarkdownFactory)
    vi.doMock('../packages/markstream-react/node_modules/stream-markdown', missingStreamMarkdownFactory)

    const { MarkdownCodeBlockNode: ReactMarkdownCodeBlockNode } = await import('../packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode')
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    try {
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

      expect(importAttempts).toBe(1)
      expect(streamMarkdownMock.createShikiStreamRenderer).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledTimes(1)
    }
    finally {
      await act(async () => {
        root.unmount()
      })
      warnSpy.mockRestore()
    }
  })
})
