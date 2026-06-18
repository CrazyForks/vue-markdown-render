import { mount } from '@vue/test-utils'
import mermaid from 'mermaid'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

async function flushVueUpdates() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('mermaid sequence semicolon retry', () => {
  it('renders sequence messages with ASCII semicolons after the first Mermaid render failure', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const render = vi.fn(async (_id: string, source: string) => {
      if (source.includes('BEGIN; SELECT'))
        throw new Error('Parse error on line 3')
      return {
        svg: '<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>',
      }
    })

    const fakeMermaid = {
      initialize: vi.fn(),
      render,
    }

    vi.doMock('../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
      isMermaidEnabled: vi.fn(() => true),
    }))

    const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const code = [
      'sequenceDiagram',
      '  A->>B: BEGIN; SELECT ... FOR UPDATE',
      '  A->>B: hello; B-->>A: ok',
    ].join('\n')
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code,
          raw: `\`\`\`mermaid\n${code}\n\`\`\``,
        },
        loading: false,
      },
    })

    await flushVueUpdates()
    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).showSource = false
    ;(wrapper.vm as any).viewportReady = true
    await flushVueUpdates()
    await vi.advanceTimersByTimeAsync(5000)
    await flushVueUpdates()

    expect(render).toHaveBeenCalledTimes(2)
    expect(render.mock.calls[0]?.[1]).toContain('BEGIN; SELECT')
    expect(render.mock.calls[1]?.[1]).toContain('BEGIN#59; SELECT')
    expect(render.mock.calls[1]?.[1]).toContain('hello; B-->>A: ok')
    expect(wrapper.find('div._mermaid svg').exists()).toBe(true)

    wrapper.unmount()
  })

  it('keeps the retry source parseable for Mermaid sequence diagrams', async () => {
    const source = [
      'sequenceDiagram',
      '  OI->>DB: BEGIN; SELECT ... FOR UPDATE',
      '  OI->>DB: use_count++ ; update status',
      '  OI->>DB: BEGIN; SELECT; DB-->>OI: OK',
      '  OI->>DB: BEGIN; SELECT; activate DB',
      '  OI->>DB: hello; DB-->>OI: ok',
    ].join('\n')

    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })

    const { escapeSequenceTextSemicolons } = await import('../src/utils/mermaidSequenceSemicolons')
    const retrySource = escapeSequenceTextSemicolons(source)

    expect(retrySource).not.toBe(source)
    expect(retrySource).toContain('BEGIN#59; SELECT')
    expect(retrySource).toContain('use_count++ #59; update status')
    expect(retrySource).toContain('BEGIN#59; SELECT; DB-->>OI: OK')
    expect(retrySource).toContain('BEGIN#59; SELECT; activate DB')
    expect(retrySource).toContain('hello; DB-->>OI: ok')
    const parsed = mermaid.parse(retrySource)
    if (parsed && typeof (parsed as any).then === 'function')
      await expect(parsed).resolves.not.toBe(false)
    else
      expect(parsed).not.toBe(false)
  })

  it('does not retry semicolon escaping after render timeouts', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const render = vi.fn(async () => {
      throw new Error('Operation timed out')
    })
    const fakeMermaid = {
      initialize: vi.fn(),
      render,
    }

    vi.doMock('../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
      isMermaidEnabled: vi.fn(() => true),
    }))

    const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const code = 'sequenceDiagram\n  A->>B: BEGIN; SELECT ... FOR UPDATE'
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code,
          raw: `\`\`\`mermaid\n${code}\n\`\`\``,
        },
        loading: false,
      },
    })

    await flushVueUpdates()
    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).showSource = false
    ;(wrapper.vm as any).viewportReady = true
    await flushVueUpdates()

    expect(render).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })
})
