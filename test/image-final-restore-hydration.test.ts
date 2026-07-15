import { afterEach, describe, expect, it, vi } from 'vitest'

const imageNode = {
  type: 'image',
  src: 'https://example.com/history.png',
  alt: 'History image',
  title: 'History image',
  raw: '![History image](https://example.com/history.png)',
} as const

async function withServerGlobals<T>(run: () => Promise<T>) {
  const previous = new Map<string, PropertyDescriptor | undefined>()
  for (const key of ['window'] as const) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: undefined,
    })
  }

  try {
    return await run()
  }
  finally {
    for (const [key, descriptor] of previous) {
      if (descriptor)
        Object.defineProperty(globalThis, key, descriptor)
      else
        Reflect.deleteProperty(globalThis, key)
    }
  }
}

async function createHistoryImageApp(node = imageNode, fallbackSrc = '') {
  const vue = await import('vue')
  const viewportPriority = await import('../src/composables/viewportPriority')
  const ImageNode = (await import('../src/components/ImageNode/ImageNode.vue')).default
  const Host = vue.defineComponent({
    setup() {
      viewportPriority.provideOffscreenHeavyNodeDeferral(vue.computed(() => true))
      viewportPriority.provideViewportPriority(() => null, true)
      return () => vue.h(ImageNode, { node, fallbackSrc })
    },
  })
  return { Host, vue }
}

describe('history image hydration', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('preserves an SSR image request while hydrating the deferred client path', async () => {
    const serverHtml = await withServerGlobals(async () => {
      vi.resetModules()
      const { Host, vue } = await createHistoryImageApp()
      const { renderToString } = await import('vue/server-renderer')
      return renderToString(vue.createSSRApp(Host))
    })

    expect(serverHtml).toContain('src="https://example.com/history.png"')
    document.body.innerHTML = `<div id="app">${serverHtml}</div>`

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const setImageSrc = vi.spyOn(HTMLImageElement.prototype, 'src', 'set')

    vi.resetModules()
    const { Host, vue } = await createHistoryImageApp()
    const app = vue.createSSRApp(Host)
    const container = document.querySelector('#app') as HTMLElement
    app.mount(container)
    await vue.nextTick()

    const diagnostics = [
      ...consoleError.mock.calls.flat(),
      ...consoleWarn.mock.calls.flat(),
    ].map(value => String(value)).join(' ')
    const repeatedRequestWrites = setImageSrc.mock.calls.filter(
      ([src]) => src === 'https://example.com/history.png',
    )

    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.com/history.png')
    expect(repeatedRequestWrites).toHaveLength(0)
    expect(diagnostics).not.toMatch(/Hydration/i)
    expect(diagnostics).not.toMatch(/mismatch/i)
    app.unmount()
  })

  it('preserves an SSR fallback image request while hydrating the deferred client path', async () => {
    const fallbackSrc = 'https://example.com/history-fallback.png'
    const node = { ...imageNode, src: '' }
    const serverHtml = await withServerGlobals(async () => {
      vi.resetModules()
      const { Host, vue } = await createHistoryImageApp(node, fallbackSrc)
      const { renderToString } = await import('vue/server-renderer')
      return renderToString(vue.createSSRApp(Host))
    })

    expect(serverHtml).toContain(`src="${fallbackSrc}"`)
    document.body.innerHTML = `<div id="app">${serverHtml}</div>`

    const setImageSrc = vi.spyOn(HTMLImageElement.prototype, 'src', 'set')

    vi.resetModules()
    const { Host, vue } = await createHistoryImageApp(node, fallbackSrc)
    const app = vue.createSSRApp(Host)
    const container = document.querySelector('#app') as HTMLElement
    app.mount(container)
    await vue.nextTick()

    const repeatedRequestWrites = setImageSrc.mock.calls.filter(
      ([src]) => src === fallbackSrc,
    )

    expect(container.querySelector('img')?.getAttribute('src')).toBe(fallbackSrc)
    expect(repeatedRequestWrites).toHaveLength(0)
    app.unmount()
  })
})
