import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setInfographicLoader } from '../src/components/InfographicBlockNode/infographic'
import InfographicBlockNode from '../src/components/InfographicBlockNode/InfographicBlockNode.vue'
import { MARKSTREAM_NODE_LIFECYCLE_KEY } from '../src/utils/nodeLifecycle'
import { flushAll } from './setup/flush-all'

const defaultInfographicLoader = () => import('@antv/infographic')

function createNode(code: string) {
  return {
    type: 'code_block',
    language: 'infographic',
    code,
    raw: `\`\`\`infographic\n${code}\n\`\`\``,
  }
}

class ErrorInfographic {
  private errorHandler?: (error: unknown) => void

  on(event: string, handler: (error: unknown) => void) {
    if (event === 'error')
      this.errorHandler = handler
  }

  render() {
    this.errorHandler?.(new Error('Incomplete options'))
  }

  destroy() {}
}

class HeightChangingInfographic {
  container: HTMLElement

  constructor(options: { container: HTMLElement }) {
    this.container = options.container
  }

  render() {
    this.container.innerHTML = '<svg data-infographic="1" style="height: 900px"></svg>'
  }

  destroy() {}
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  setInfographicLoader(defaultInfographicLoader)
})

describe('infographicBlockNode streaming errors', () => {
  it('only reports render errors after streaming completes', async () => {
    vi.stubGlobal('IntersectionObserver', undefined as any)
    setInfographicLoader(() => ErrorInfographic)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const wrapper = mount(InfographicBlockNode as any, {
      props: {
        node: createNode('infographic list-row-simple-horizontal-arrow'),
        loading: true,
      },
    })

    await flushAll()

    expect(errorSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('Failed to render infographic')

    await wrapper.setProps({ loading: false })
    await flushAll()

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Failed to render infographic: Incomplete options')

    wrapper.unmount()
  })

  it('keeps lifecycle pending across a queued rerender', async () => {
    vi.stubGlobal('IntersectionObserver', undefined as any)

    let resolveLoader: ((value: unknown) => void) | null = null
    const loaderPromise = new Promise<unknown>((resolve) => {
      resolveLoader = resolve
    })

    class AsyncInfographic {
      container: HTMLElement

      constructor(options: { container: HTMLElement }) {
        this.container = options.container
      }

      render(source: string) {
        this.container.innerHTML = `<svg data-source="${source}"></svg>`
      }

      destroy() {}
    }

    setInfographicLoader(() => loaderPromise)

    const markPending = vi.fn()
    const reportHeight = vi.fn()
    const markSettled = vi.fn()

    const wrapper = mount(InfographicBlockNode as any, {
      props: {
        node: createNode('first'),
        loading: true,
      },
      attrs: {
        'index-key': 'markdown-renderer-0',
      },
      global: {
        provide: {
          [MARKSTREAM_NODE_LIFECYCLE_KEY]: {
            markPending,
            reportHeight,
            markSettled,
          },
        },
      },
    })

    await flushAll()
    expect(markPending).toHaveBeenCalledTimes(1)

    await wrapper.setProps({
      node: createNode('second'),
    })
    await flushAll()

    resolveLoader?.(AsyncInfographic)
    await flushAll()

    expect(markPending).toHaveBeenCalledTimes(1)
    expect(markSettled).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('keeps an externally estimated preview height stable after render', async () => {
    vi.stubGlobal('IntersectionObserver', undefined as any)
    setInfographicLoader(() => HeightChangingInfographic)

    const wrapper = mount(InfographicBlockNode as any, {
      props: {
        node: createNode('infographic list-row-simple-horizontal-arrow'),
        loading: false,
        estimatedPreviewHeightPx: 360,
      },
    })

    await flushAll()

    const preview = wrapper.get('.infographic-preview').element as HTMLElement
    expect(preview.style.height).toBe('360px')

    wrapper.unmount()
  })
})
