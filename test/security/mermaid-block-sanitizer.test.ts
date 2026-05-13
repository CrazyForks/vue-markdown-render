import { mount } from '@vue/test-utils'
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

describe('mermaid block SVG sanitizer', () => {
  it('sanitizes rendered SVG even when Mermaid securityLevel is loose', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async () => ({
        svg: `
          <svg viewBox="0 0 10 10" onload="alert(1)">
            <script>alert(1)</script>
            <foreignObject><iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe></foreignObject>
            <text style="background:url(javascript:alert(1))">x</text>
            <rect width="10" height="10" />
          </svg>
        `,
      })),
    }

    vi.doMock('../../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
      isMermaidEnabled: vi.fn(() => true),
    }))

    const MermaidBlockNode = (await import('../../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code: 'flowchart TD\nA-->B\n',
          raw: '```mermaid\nflowchart TD\nA-->B\n```',
        },
        loading: false,
        isStrict: false,
      },
    })

    await flushVueUpdates()
    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).showSource = false
    ;(wrapper.vm as any).viewportReady = true
    await flushVueUpdates()
    await vi.advanceTimersByTimeAsync(5000)
    await flushVueUpdates()

    const html = wrapper.get('div._mermaid').html()
    expect(fakeMermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({
      securityLevel: 'loose',
    }))
    expect(wrapper.find('div._mermaid svg').exists()).toBe(true)
    expect(html).toMatch(/<rect/i)
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/\son[a-z]+\s*=/i)
    expect(html).not.toMatch(/foreignObject/i)
    expect(html).not.toMatch(/srcdoc/i)
    expect(html).not.toMatch(/javascript:/i)

    wrapper.unmount()
  })
})
