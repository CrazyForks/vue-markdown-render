import { afterEach, describe, expect, it, vi } from 'vitest'

const codeNode = {
  type: 'code_block',
  language: 'typescript',
  code: 'const value = 1',
  raw: '```typescript\nconst value = 1\n```',
  loading: false,
} as const

async function createCodeBlockHost() {
  const vue = await import('vue')
  const viewportPriority = await import('../src/composables/viewportPriority')
  const CodeBlockNode = (await import('../src/components/CodeBlockNode/CodeBlockNode.vue')).default
  const Host = vue.defineComponent({
    setup() {
      viewportPriority.provideOffscreenHeavyNodeDeferral(vue.computed(() => true))
      viewportPriority.provideViewportPriority(() => null, true)
      return () => vue.h(CodeBlockNode, {
        node: codeNode,
        loading: false,
        stream: false,
      })
    },
  })
  return { Host, vue }
}

describe('codeBlockNode hydration', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('adds the offscreen marker after hydration without mismatching the SSR shell', async () => {
    const browserGlobals = new Map<string, PropertyDescriptor | undefined>()
    for (const key of ['window', 'document'] as const) {
      browserGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
      Object.defineProperty(globalThis, key, { configurable: true, value: undefined })
    }

    let serverHtml = ''
    try {
      vi.resetModules()
      const { Host, vue } = await createCodeBlockHost()
      const { renderToString } = await import('vue/server-renderer')
      serverHtml = await renderToString(vue.createSSRApp(Host))
    }
    finally {
      for (const [key, descriptor] of browserGlobals) {
        if (descriptor)
          Object.defineProperty(globalThis, key, descriptor)
      }
    }

    expect(serverHtml).toContain('data-markstream-code-block="1"')
    expect(serverHtml).not.toContain('data-markstream-viewport-pending')
    document.body.innerHTML = `<div id="app">${serverHtml}</div>`

    class NeverVisibleIntersectionObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', NeverVisibleIntersectionObserver)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    vi.resetModules()
    const { Host, vue } = await createCodeBlockHost()
    const container = document.querySelector('#app') as HTMLElement
    const app = vue.createSSRApp(Host)
    app.mount(container)
    await vue.nextTick()

    const diagnostics = [
      ...consoleError.mock.calls.flat(),
      ...consoleWarn.mock.calls.flat(),
    ].join(' ')

    expect(container.querySelector('.code-block-container')?.getAttribute('data-markstream-viewport-pending')).toBe('true')
    expect(diagnostics).not.toMatch(/Hydration/i)
    expect(diagnostics).not.toMatch(/mismatch/i)
    app.unmount()
  })
})
