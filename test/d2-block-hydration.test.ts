import { afterEach, describe, expect, it, vi } from 'vitest'

const d2Node = {
  type: 'code_block',
  language: 'd2',
  code: 'a -> b',
  raw: '```d2\na -> b\n```',
  loading: false,
} as const

const browserKeys = [
  'window',
  'document',
  'navigator',
  'self',
  'Element',
  'HTMLElement',
  'SVGElement',
  'Node',
  'Text',
  'Comment',
  'Document',
  'MutationObserver',
  'Event',
  'CustomEvent',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
] as const

async function withGlobalOverrides<T>(values: Partial<Record<(typeof browserKeys)[number], unknown>>, run: () => Promise<T>) {
  const previous = new Map<string, PropertyDescriptor | undefined>()

  for (const key of browserKeys) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    if (!(key in values))
      continue
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: values[key],
    })
  }

  try {
    return await run()
  }
  finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor)
      }
      else {
        Reflect.deleteProperty(globalThis, key)
      }
    }
  }
}

function mockD2(renderImpl?: (diagram: { code: string }) => Promise<{ svg: string }> | { svg: string }) {
  vi.doMock('../src/components/D2BlockNode/d2', () => ({
    getD2: vi.fn(async () => class FakeD2 {
      async compile(code: string) {
        return {
          diagram: { code },
          renderOptions: {},
        }
      }

      async render(diagram: { code: string }) {
        if (renderImpl)
          return await renderImpl(diagram)
        return {
          svg: `<svg width="364" height="766" viewBox="0 0 364 766"><text>${diagram.code}</text></svg>`,
        }
      }
    }),
  }))
}

async function renderServerD2Block() {
  return withGlobalOverrides(
    { window: undefined },
    async () => {
      vi.resetModules()
      mockD2()
      const vue = await import('vue')
      const { renderToString } = await import('vue/server-renderer')
      const D2BlockNode = (await import('../src/components/D2BlockNode/D2BlockNode.vue')).default

      const app = vue.createSSRApp({
        render: () => vue.h(D2BlockNode, { node: d2Node, loading: false }),
      })

      return renderToString(app)
    },
  )
}

async function waitForPendingAttribute(root: Element, timeout = 1000) {
  const startedAt = Date.now()
  while (root.getAttribute('data-markstream-pending') !== 'true') {
    if (Date.now() - startedAt > timeout)
      throw new Error('Timed out waiting for D2 pending attribute')
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

async function waitForCall(spy: ReturnType<typeof vi.fn>, timeout = 1000) {
  const startedAt = Date.now()
  while (!spy.mock.calls.length) {
    if (Date.now() - startedAt > timeout)
      throw new Error('Timed out waiting for spy call')
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

async function waitForPreview(container: Element, timeout = 1000) {
  const startedAt = Date.now()
  while (!container.querySelector('.d2-svg')) {
    if (Date.now() - startedAt > timeout)
      throw new Error('Timed out waiting for D2 preview')
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

describe('d2BlockNode hydration', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    vi.resetModules()
    vi.doUnmock('../src/components/D2BlockNode/d2')
  })

  it('hydrates the server fallback without a pending attribute mismatch', async () => {
    const serverHtml = await renderServerD2Block()

    expect(serverHtml).toContain('data-markstream-d2="1"')
    expect(serverHtml).not.toContain('data-markstream-pending')

    document.body.innerHTML = `<div id="app">${serverHtml}</div>`

    let releaseRender: () => void = () => {}
    const renderStarted = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    vi.resetModules()
    mockD2(async (diagram) => {
      renderStarted()
      await new Promise<void>((resolve) => {
        releaseRender = resolve
      })
      return {
        svg: `<svg width="364" height="766" viewBox="0 0 364 766"><text>${diagram.code}</text></svg>`,
      }
    })
    const vue = await import('vue')
    const D2BlockNode = (await import('../src/components/D2BlockNode/D2BlockNode.vue')).default

    const app = vue.createSSRApp({
      render: () => vue.h(D2BlockNode, { node: d2Node, loading: false }),
    })

    const container = document.querySelector('#app') as HTMLElement
    app.mount(container)

    await vue.nextTick()
    const root = container.querySelector('[data-markstream-d2="1"]') as HTMLElement
    await waitForPendingAttribute(root)
    await waitForCall(renderStarted)
    expect(renderStarted).toHaveBeenCalledTimes(1)

    const diagnostics = [
      ...consoleError.mock.calls.flat(),
      ...consoleWarn.mock.calls.flat(),
    ].join(' ')

    expect(diagnostics).not.toMatch(/Hydration/i)
    expect(diagnostics).not.toMatch(/mismatch/i)

    releaseRender()
    await waitForPreview(container)
    await vue.nextTick()

    expect(root.getAttribute('data-markstream-pending')).toBeNull()
    app.unmount()
  })
})
