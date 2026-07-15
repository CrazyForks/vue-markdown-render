import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

async function flushVueUpdates() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve))
}

afterEach(() => {
  vi.resetModules()
})

describe('mermaid render identity', () => {
  it('restarts a first render when its theme changes', async () => {
    const resolvers: Array<(value: { svg: string }) => void> = []
    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(() => new Promise<{ svg: string }>((resolve) => {
        resolvers.push(resolve)
      })),
    }
    vi.doMock('../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
      isMermaidEnabled: vi.fn(() => true),
    }))
    vi.doMock('../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))

    const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code: 'graph LR\nA-->B\n',
          raw: '```mermaid\ngraph LR\nA-->B\n```',
        },
        loading: false,
        isDark: false,
      },
    })

    await flushVueUpdates()
    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ isDark: true })
    resolvers.shift()?.({ svg: '<svg viewBox="0 0 10 10" data-theme="light"><rect width="1" height="1" /></svg>' })
    await flushVueUpdates()

    expect(fakeMermaid.render).toHaveBeenCalledTimes(2)
    expect(fakeMermaid.render.mock.calls[1]?.[1]).toContain('"theme":"dark"')

    resolvers.shift()?.({ svg: '<svg viewBox="0 0 10 10" data-theme="dark"><rect width="1" height="1" /></svg>' })
    await flushVueUpdates()

    expect(wrapper.html()).toContain('data-theme="dark"')
    wrapper.unmount()
  })

  it('does not treat source changes that differ only in whitespace as the same render', async () => {
    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async () => ({ svg: '<svg viewBox="0 0 10 10"><rect width="1" height="1" /></svg>' })),
    }
    vi.doMock('../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
      isMermaidEnabled: vi.fn(() => true),
    }))
    vi.doMock('../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))

    const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const node = {
      type: 'code_block',
      language: 'mermaid',
      code: 'graph LR\nA-->B\n',
      raw: '```mermaid\ngraph LR\nA-->B\n```',
    }
    const wrapper = mount(MermaidBlockNode as any, { props: { node, loading: false } })

    await flushVueUpdates()
    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)

    await wrapper.setProps({
      node: { ...node, code: 'graph LR\nA --> B\n' },
    })
    await flushVueUpdates()

    expect(fakeMermaid.render).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})
