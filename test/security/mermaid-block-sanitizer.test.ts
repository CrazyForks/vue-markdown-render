import { mount } from '@vue/test-utils'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const unsafeMermaidSvg = `
  <svg viewBox="0 0 10 10" onload="alert(1)">
    <style>.node rect { fill: #fff; stroke: #333; }</style>
    <script>alert(1)</script>
    <foreignObject><iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe></foreignObject>
    <text style="background:url(javascript:alert(1))">x</text>
    <rect width="10" height="10" />
  </svg>
`

async function flushVueUpdates() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

async function flushReactUpdates() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function expectSanitizedMermaidHtml(html: string) {
  expect(html).toMatch(/<svg/i)
  expect(html).toMatch(/<rect/i)
  expect(html).toMatch(/<style/i)
  expect(html).toContain('fill')
  expect(html).not.toMatch(/<script/i)
  expect(html).not.toMatch(/\son[a-z]+\s*=/i)
  expect(html).not.toMatch(/foreignObject/i)
  expect(html).not.toMatch(/srcdoc/i)
  expect(html).not.toMatch(/javascript:/i)
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
  document.body.innerHTML = ''
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

describe('mermaid block SVG sanitizer', () => {
  it('sanitizes rendered SVG even when Mermaid securityLevel is loose', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async () => ({
        svg: unsafeMermaidSvg,
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
    expectSanitizedMermaidHtml(html)

    wrapper.unmount()
  })

  it('sanitizes React rendered SVG even when Mermaid securityLevel is loose', async () => {
    vi.useFakeTimers()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const fakeMermaid = {
      initialize: vi.fn(),
      parse: vi.fn(async () => true),
      render: vi.fn(async () => ({
        svg: unsafeMermaidSvg,
        bindFunctions: vi.fn(),
      })),
    }

    vi.doMock('../../packages/markstream-react/src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    const getMermaid = vi.fn(async () => fakeMermaid)
    vi.doMock('../../packages/markstream-react/src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid,
    }))

    const { MermaidBlockNode } = await import('../../packages/markstream-react/src/components/MermaidBlockNode/MermaidBlockNode')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(MermaidBlockNode as any, {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code: 'flowchart TD\nA-->B\n',
          raw: '```mermaid\nflowchart TD\nA-->B\n```',
        },
        loading: false,
        isStrict: false,
      }))
    })
    await flushReactUpdates()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    await flushReactUpdates()

    expect(getMermaid).toHaveBeenCalledWith(expect.objectContaining({
      securityLevel: 'loose',
    }))
    expectSanitizedMermaidHtml(host.innerHTML)

    await act(async () => {
      root.unmount()
    })
  })

  it('sanitizes Vue 2 rendered SVG even when Mermaid securityLevel is loose', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async () => ({
        svg: unsafeMermaidSvg,
      })),
    }

    vi.doMock('../../packages/markstream-vue2/src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../../packages/markstream-vue2/src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
    }))

    const MermaidBlockNode = (await import('../../packages/markstream-vue2/src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
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

    expect(fakeMermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({
      securityLevel: 'loose',
    }))
    expectSanitizedMermaidHtml(wrapper.get('div._mermaid').html())

    wrapper.unmount()
  })
})
