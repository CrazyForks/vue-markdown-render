/**
 * @vitest-environment jsdom
 */

import type { NodeComponentProps } from '../packages/markstream-react/src/types/node-component'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NodeRenderer } from '../packages/markstream-react/src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents } from '../packages/markstream-react/src/customComponents'
import { NodeRenderer as ServerNodeRenderer } from '../packages/markstream-react/src/server-renderer'

interface DocumentLinkNode {
  type: 'documentlink'
  tag: 'documentlink'
  attrs?: [string, string | null][]
  content: string
  loading?: boolean
}

function getAttr(attrs: [string, string | null][] | undefined, name: string) {
  return attrs?.find(([key]) => key === name)?.[1]
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function renderIntoRoot(element: React.ReactElement) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(element)
  })
  await flushReact()
  return { host, root }
}

async function updateRoot(root: ReturnType<typeof createRoot>, element: React.ReactElement) {
  await act(async () => {
    root.render(element)
  })
  await flushReact()
}

async function unmountRoot(root: ReturnType<typeof createRoot>) {
  await act(async () => {
    root.unmount()
  })
}

describe('react local component maps', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    document.body.innerHTML = ''
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders parser-backed streaming components without registry', async () => {
    const seen: Array<NodeComponentProps<DocumentLinkNode>> = []
    function DocumentLink(props: NodeComponentProps<DocumentLinkNode>) {
      seen.push(props)
      return <span data-document-link={getAttr(props.node.attrs, 'id') ?? ''}>{props.node.content}</span>
    }

    const { host, root } = await renderIntoRoot(
      <NodeRenderer
        content={'<DocumentLink id="123">Rasmus'}
        final={false}
        smoothStreaming={false}
        streamingComponents={{ documentlink: DocumentLink }}
      />,
    )

    expect(host.querySelector('[data-document-link="123"]')?.textContent).toBe('Rasmus')
    expect(getAttr(seen.at(-1)?.node.attrs, 'id')).toBe('123')
    expect(seen.at(-1)?.node.content).toBe('Rasmus')
    expect(seen.at(-1)?.node.loading).toBe(true)

    await updateRoot(
      root,
      <NodeRenderer
        content={'<DocumentLink id="123">Rasmus Schultz</DocumentLink>'}
        final
        smoothStreaming={false}
        streamingComponents={{ documentlink: DocumentLink }}
      />,
    )

    expect(host.querySelector('[data-document-link="123"]')?.textContent).toBe('Rasmus Schultz')
    expect(seen.at(-1)?.node.content).toBe('Rasmus Schultz')
    expect(seen.at(-1)?.node.loading).toBe(false)

    await unmountRoot(root)
  })

  it('renders html components with normal props and children without registry', async () => {
    const seen: Array<React.PropsWithChildren<{ kind?: string, node?: unknown }>> = []
    function Badge(props: React.PropsWithChildren<{ kind?: string, node?: unknown }>) {
      seen.push(props)
      return <span data-badge-kind={props.kind}>{props.children}</span>
    }

    const { host, root } = await renderIntoRoot(
      <NodeRenderer
        content={'<badge kind="info">Stable</badge>'}
        final
        smoothStreaming={false}
        htmlComponents={{ badge: Badge }}
      />,
    )

    expect(host.querySelector('[data-badge-kind="info"]')?.textContent).toBe('Stable')
    expect(seen.at(-1)?.kind).toBe('info')
    expect(seen.at(-1)?.children).toBe('Stable')
    expect('node' in (seen.at(-1) ?? {})).toBe(false)

    await unmountRoot(root)
  })

  it('keeps same-tag streaming components isolated per renderer instance', async () => {
    function FirstDocumentLink(props: NodeComponentProps<DocumentLinkNode>) {
      return <span data-owner="first">{props.node.content}</span>
    }
    function SecondDocumentLink(props: NodeComponentProps<DocumentLinkNode>) {
      return <span data-owner="second">{props.node.content}</span>
    }

    const { host, root } = await renderIntoRoot(
      <div>
        <NodeRenderer
          content="<DocumentLink>One</DocumentLink>"
          final
          smoothStreaming={false}
          streamingComponents={{ documentlink: FirstDocumentLink }}
        />
        <NodeRenderer
          content="<DocumentLink>Two</DocumentLink>"
          final
          smoothStreaming={false}
          streamingComponents={{ documentlink: SecondDocumentLink }}
        />
      </div>,
    )

    expect(host.querySelector('[data-owner="first"]')?.textContent).toBe('One')
    expect(host.querySelector('[data-owner="second"]')?.textContent).toBe('Two')

    await unmountRoot(root)
  })

  it('prefers streamingComponents over the legacy scoped registry', async () => {
    const scopeId = 'react-local-component-precedence'
    function LegacyDocumentLink(props: NodeComponentProps<DocumentLinkNode>) {
      return <span data-source="legacy">{props.node.content}</span>
    }
    function DirectDocumentLink(props: NodeComponentProps<DocumentLinkNode>) {
      return <span data-source="direct">{props.node.content}</span>
    }

    setCustomComponents(scopeId, { documentlink: LegacyDocumentLink })
    try {
      const { host, root } = await renderIntoRoot(
        <NodeRenderer
          customId={scopeId}
          content="<DocumentLink>Direct</DocumentLink>"
          final
          smoothStreaming={false}
          streamingComponents={{ documentlink: DirectDocumentLink }}
        />,
      )

      expect(host.querySelector('[data-source="direct"]')?.textContent).toBe('Direct')
      expect(host.querySelector('[data-source="legacy"]')).toBeNull()

      await unmountRoot(root)
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('warns once and selects streamingComponents when both maps use the same tag', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    function StreamingConflict(props: NodeComponentProps<{ content: string }>) {
      return <span data-contract="streaming">{props.node.content}</span>
    }
    function HtmlConflict(props: React.PropsWithChildren) {
      return <span data-contract="html">{props.children}</span>
    }

    const element = (
      <NodeRenderer
        content="<ConflictTag>Conflict</ConflictTag>"
        final
        smoothStreaming={false}
        streamingComponents={{ conflicttag: StreamingConflict }}
        htmlComponents={{ conflicttag: HtmlConflict }}
      />
    )
    const { host, root } = await renderIntoRoot(element)
    await updateRoot(root, element)

    expect(host.querySelector('[data-contract="streaming"]')?.textContent).toBe('Conflict')
    expect(host.querySelector('[data-contract="html"]')).toBeNull()
    expect(warn.mock.calls.filter(([message]) => String(message).includes('conflicttag'))).toHaveLength(1)

    await unmountRoot(root)
  })

  it('keeps legacy scoped customHtmlTags behavior working', async () => {
    const scopeId = 'react-local-component-legacy'
    function DocumentLink(props: NodeComponentProps<DocumentLinkNode>) {
      return <span data-legacy-document-link={getAttr(props.node.attrs, 'id') ?? ''}>{props.node.content}</span>
    }

    setCustomComponents(scopeId, { documentlink: DocumentLink })
    try {
      const { host, root } = await renderIntoRoot(
        <NodeRenderer
          customId={scopeId}
          customHtmlTags={['documentlink']}
          content={'<DocumentLink id="123">Legacy</DocumentLink>'}
          final
          smoothStreaming={false}
        />,
      )

      expect(host.querySelector('[data-legacy-document-link="123"]')?.textContent).toBe('Legacy')

      await unmountRoot(root)
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('normalizes component map keys before parsing', async () => {
    function DocumentLink(props: NodeComponentProps<DocumentLinkNode>) {
      return <span data-normalized-type={props.node.type}>{props.node.content}</span>
    }

    const { host, root } = await renderIntoRoot(
      <NodeRenderer
        content="<DocumentLink>Case</DocumentLink>"
        final
        smoothStreaming={false}
        streamingComponents={{ DocumentLink }}
      />,
    )

    expect(host.querySelector('[data-normalized-type="documentlink"]')?.textContent).toBe('Case')

    await unmountRoot(root)
  })

  it('supports streamingComponents and htmlComponents during SSR without registry', () => {
    function DocumentLink(props: NodeComponentProps<DocumentLinkNode>) {
      return <span data-ssr-streaming={getAttr(props.node.attrs, 'id') ?? ''}>{props.node.content}</span>
    }
    function Badge(props: React.PropsWithChildren<{ kind?: string }>) {
      return <span data-ssr-badge={props.kind}>{props.children}</span>
    }

    const streamingHtml = renderToStaticMarkup(
      <ServerNodeRenderer
        content={'<DocumentLink id="ssr">Server Stream</DocumentLink>'}
        final
        streamingComponents={{ documentlink: DocumentLink }}
      />,
    )
    const htmlComponentHtml = renderToStaticMarkup(
      <ServerNodeRenderer
        content={'<badge kind="ssr">Server HTML</badge>'}
        final
        htmlComponents={{ badge: Badge }}
      />,
    )

    expect(streamingHtml).toContain('data-ssr-streaming="ssr"')
    expect(streamingHtml).toContain('Server Stream')
    expect(htmlComponentHtml).toContain('data-ssr-badge="ssr"')
    expect(htmlComponentHtml).toContain('Server HTML')
  })
})
