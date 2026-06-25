/**
 * @vitest-environment jsdom
 */

import type { NodeComponentProps } from '../packages/markstream-react/src/types/node-component'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NodeRenderer } from '../packages/markstream-react/src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents, withMarkstreamComponentDisplay } from '../packages/markstream-react/src/customComponents'
import { NodeRenderer as ServerNodeRenderer } from '../packages/markstream-react/src/server-renderer'

interface DocumentLinkNode {
  type: 'documentlink'
  tag: 'documentlink'
  attrs?: [string, string | null][]
  content: string
  children?: any[]
  loading?: boolean
  autoClosed?: boolean
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

function hostFromStaticMarkup(html: string) {
  const host = document.createElement('div')
  host.innerHTML = html
  return host
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

  it('updates streaming component loading when only final changes', async () => {
    const seen: Array<NodeComponentProps<DocumentLinkNode>> = []
    function DocumentLink(props: NodeComponentProps<DocumentLinkNode>) {
      seen.push(props)
      return (
        <span data-loading={String(props.node.loading)}>
          {props.node.content}
        </span>
      )
    }

    const content = '<DocumentLink id="123">partial'
    const streamingComponents = { documentlink: DocumentLink }
    const { host, root } = await renderIntoRoot(
      <NodeRenderer
        content={content}
        final={false}
        smoothStreaming={false}
        streamingComponents={streamingComponents}
      />,
    )

    expect(host.querySelector('[data-loading="true"]')?.textContent).toBe('partial')
    expect(seen.at(-1)?.node.loading).toBe(true)

    await updateRoot(
      root,
      <NodeRenderer
        content={content}
        final
        smoothStreaming={false}
        streamingComponents={streamingComponents}
      />,
    )

    expect(host.querySelector('[data-loading="false"]')?.textContent).toBe('partial')
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

  it('does not let streamingComponents replace built-in markdown node types', async () => {
    function TextTag(props: NodeComponentProps<{ content: string }>) {
      return <span data-streaming-text>{props.node.content}</span>
    }
    function HeadingTag(props: NodeComponentProps<{ content: string }>) {
      return <span data-streaming-heading>{props.node.content}</span>
    }

    const content = [
      '# Native heading',
      '',
      '<text>Custom text</text>',
      '',
      '<heading>Custom heading</heading>',
    ].join('\n')
    const streamingComponents = {
      text: TextTag,
      heading: HeadingTag,
    }

    const { host, root } = await renderIntoRoot(
      <NodeRenderer
        content={content}
        final
        smoothStreaming={false}
        streamingComponents={streamingComponents}
      />,
    )

    expect(host.querySelector('h1')?.textContent).toBe('Native heading')
    expect(host.querySelector('h1 [data-streaming-text]')).toBeNull()
    expect(Array.from(host.querySelectorAll('[data-streaming-text]')).map(el => el.textContent)).toEqual(['Custom text'])
    expect(host.querySelector('[data-streaming-heading]')?.textContent).toBe('Custom heading')

    await unmountRoot(root)

    const ssrHost = hostFromStaticMarkup(renderToStaticMarkup(
      <ServerNodeRenderer
        content={content}
        final
        streamingComponents={streamingComponents}
      />,
    ))

    expect(ssrHost.querySelector('h1')?.textContent).toBe('Native heading')
    expect(ssrHost.querySelector('h1 [data-streaming-text]')).toBeNull()
    expect(Array.from(ssrHost.querySelectorAll('[data-streaming-text]')).map(el => el.textContent)).toEqual(['Custom text'])
    expect(ssrHost.querySelector('[data-streaming-heading]')?.textContent).toBe('Custom heading')
  })

  it('uses htmlComponents for tags parsed through customHtmlTags and parseOptions', async () => {
    function Badge(props: React.PropsWithChildren<{ kind?: string, node?: unknown }>) {
      return <span data-direct-badge={props.kind}>{props.children}</span>
    }
    function Callout(props: React.PropsWithChildren<{ tone?: string, node?: unknown }>) {
      return <section data-option-callout={props.tone}>{props.children}</section>
    }

    const content = [
      '<badge kind="direct">Direct</badge>',
      '',
      '<callout tone="option">Option</callout>',
    ].join('\n')

    const { host, root } = await renderIntoRoot(
      <NodeRenderer
        content={content}
        customHtmlTags={['badge']}
        final
        htmlComponents={{ badge: Badge, callout: Callout }}
        parseOptions={{ customHtmlTags: ['callout'] }}
        smoothStreaming={false}
      />,
    )

    expect(host.querySelector('[data-direct-badge="direct"]')?.textContent).toBe('Direct')
    expect(host.querySelector('[data-option-callout="option"]')?.textContent).toBe('Option')

    await unmountRoot(root)

    const ssrHost = hostFromStaticMarkup(renderToStaticMarkup(
      <ServerNodeRenderer
        content={content}
        customHtmlTags={['badge']}
        final
        htmlComponents={{ badge: Badge, callout: Callout }}
        parseOptions={{ customHtmlTags: ['callout'] }}
      />,
    ))

    expect(ssrHost.querySelector('[data-direct-badge="direct"]')?.textContent).toBe('Direct')
    expect(ssrHost.querySelector('[data-option-callout="option"]')?.textContent).toBe('Option')
  })

  it('passes empty children to self-closing parser-backed htmlComponents', async () => {
    const seen: Array<React.PropsWithChildren<{ kind?: string }>> = []
    function Badge(props: React.PropsWithChildren<{ kind?: string }>) {
      seen.push(props)
      return <span data-self-closing-badge={props.kind}>{Array.isArray(props.children) ? props.children.length : String(props.children ?? '')}</span>
    }

    const element = (
      <NodeRenderer
        content={'<badge kind="info" />'}
        customHtmlTags={['badge']}
        final
        htmlComponents={{ badge: Badge }}
        smoothStreaming={false}
      />
    )
    const { host, root } = await renderIntoRoot(element)

    expect(host.querySelector('[data-self-closing-badge="info"]')?.textContent).toBe('')
    expect(seen.at(-1)?.children).toBe('')
    expect(seen.at(-1)?.children).not.toBe('<badge kind="info" />')

    await unmountRoot(root)
    seen.length = 0

    const ssrHtml = renderToStaticMarkup(
      <ServerNodeRenderer
        content={'<badge kind="info" />'}
        customHtmlTags={['badge']}
        final
        htmlComponents={{ badge: Badge }}
      />,
    )

    expect(ssrHtml).toContain('data-self-closing-badge="info"')
    expect(seen.at(-1)?.children).toBe('')
    expect(seen.at(-1)?.children).not.toBe('<badge kind="info" />')
  })

  it('prefers htmlComponents before trusted structured html wrappers', async () => {
    function Card(props: React.PropsWithChildren<{ tone?: string }>) {
      return <section data-card={props.tone}>{props.children}</section>
    }

    const content = '<card tone="warm">\n\n- item\n\n</card>'
    const { host, root } = await renderIntoRoot(
      <NodeRenderer
        content={content}
        final
        htmlComponents={{ card: Card }}
        htmlPolicy="trusted"
        smoothStreaming={false}
      />,
    )

    expect(host.querySelector('[data-card="warm"] li')?.textContent).toBe('item')
    expect(host.querySelector('card')).toBeNull()

    await unmountRoot(root)

    const ssrHost = hostFromStaticMarkup(renderToStaticMarkup(
      <ServerNodeRenderer
        content={content}
        final
        htmlComponents={{ card: Card }}
        htmlPolicy="trusted"
      />,
    ))

    expect(ssrHost.querySelector('[data-card="warm"] li')?.textContent).toBe('item')
    expect(ssrHost.querySelector('card')).toBeNull()
  })

  it('matches underscore html component tags on client and server', async () => {
    function UnderscoreTag(props: React.PropsWithChildren<{ kind?: string }>) {
      return <span data-underscore={props.kind}>{props.children}</span>
    }

    const content = '<div><my_component kind="ok">Under</my_component></div>'
    const htmlComponents = { my_component: UnderscoreTag }
    const { host, root } = await renderIntoRoot(
      <NodeRenderer
        content={content}
        final
        htmlComponents={htmlComponents}
        smoothStreaming={false}
      />,
    )

    expect(host.querySelector('[data-underscore="ok"]')?.textContent).toBe('Under')

    await unmountRoot(root)

    const ssrHost = hostFromStaticMarkup(renderToStaticMarkup(
      <ServerNodeRenderer
        content={content}
        final
        htmlComponents={htmlComponents}
      />,
    ))

    expect(ssrHost.querySelector('[data-underscore="ok"]')?.textContent).toBe('Under')
  })

  it('keeps normalized inline component maps stable across renders', async () => {
    let renders = 0
    function DocumentLink(props: NodeComponentProps<DocumentLinkNode>) {
      renders++
      return <span data-stable-map>{props.node.content}</span>
    }

    const content = '<DocumentLink>Stable</DocumentLink>'
    const { host, root } = await renderIntoRoot(
      <NodeRenderer
        content={content}
        final
        smoothStreaming={false}
        streamingComponents={{ DocumentLink }}
      />,
    )

    expect(host.querySelector('[data-stable-map]')?.textContent).toBe('Stable')
    expect(renders).toBe(1)

    await updateRoot(
      root,
      <NodeRenderer
        content={content}
        final
        smoothStreaming={false}
        streamingComponents={{ DocumentLink }}
      />,
    )

    expect(renders).toBe(1)

    await unmountRoot(root)
  })

  it('renders streamingComponents nested inside standard html wrappers on client and server', async () => {
    const seen: Array<NodeComponentProps<DocumentLinkNode>> = []
    function DocumentLink(props: NodeComponentProps<DocumentLinkNode>) {
      seen.push(props)
      return <span data-nested-streaming={getAttr(props.node.attrs, 'id') ?? ''}>{props.node.content}</span>
    }
    function HtmlDocumentLink(props: React.PropsWithChildren<{ id?: string }>) {
      return <span data-nested-html={props.id}>{props.children}</span>
    }

    const content = [
      '<span><DocumentLink id="1">InlineNested</DocumentLink></span>',
      '',
      '<div><DocumentLink id="2">BlockNested</DocumentLink></div>',
    ].join('\n')
    const streamingComponents = { documentlink: DocumentLink }
    const htmlComponents = { documentlink: HtmlDocumentLink }

    const { host, root } = await renderIntoRoot(
      <NodeRenderer
        content={content}
        final
        htmlComponents={htmlComponents}
        smoothStreaming={false}
        streamingComponents={streamingComponents}
      />,
    )

    expect(host.querySelector('[data-nested-streaming="1"]')?.textContent).toBe('InlineNested')
    expect(host.querySelector('[data-nested-streaming="2"]')?.textContent).toBe('BlockNested')
    expect(host.querySelector('[data-nested-html]')).toBeNull()
    expect(seen.map(props => [getAttr(props.node.attrs, 'id'), props.node.content])).toEqual([
      ['1', 'InlineNested'],
      ['2', 'BlockNested'],
    ])

    await unmountRoot(root)
    seen.length = 0

    const ssrHost = hostFromStaticMarkup(renderToStaticMarkup(
      <ServerNodeRenderer
        content={content}
        final
        htmlComponents={htmlComponents}
        streamingComponents={streamingComponents}
      />,
    ))

    expect(ssrHost.querySelector('[data-nested-streaming="1"]')?.textContent).toBe('InlineNested')
    expect(ssrHost.querySelector('[data-nested-streaming="2"]')?.textContent).toBe('BlockNested')
    expect(ssrHost.querySelector('[data-nested-html]')).toBeNull()
    expect(seen.map(props => [getAttr(props.node.attrs, 'id'), props.node.content])).toEqual([
      ['1', 'InlineNested'],
      ['2', 'BlockNested'],
    ])
  })

  it('passes renderer context props to streamingComponents nested inside inline html wrappers on client and server', async () => {
    const seen: Array<{
      customId?: string
      fade?: boolean
      hasCtx: boolean
      hasRenderNode: boolean
      indexKey?: unknown
      isDark?: boolean
      typewriter?: boolean
    }> = []

    function DocumentLink(props: NodeComponentProps<DocumentLinkNode>) {
      seen.push({
        customId: props.customId,
        fade: props.fade,
        hasCtx: Boolean(props.ctx),
        hasRenderNode: Boolean(props.renderNode),
        indexKey: props.indexKey,
        isDark: props.isDark,
        typewriter: props.typewriter,
      })
      return <span data-inline-context>{props.node.content}</span>
    }

    const content = '<span><DocumentLink id="1">Inline</DocumentLink></span>'
    const streamingComponents = { documentlink: DocumentLink }
    const expected = {
      customId: 'chat',
      fade: false,
      hasCtx: true,
      hasRenderNode: true,
      isDark: true,
      typewriter: true,
    }

    const { host, root } = await renderIntoRoot(
      <NodeRenderer
        content={content}
        customId="chat"
        fade={false}
        final
        isDark
        smoothStreaming={false}
        streamingComponents={streamingComponents}
        typewriter
      />,
    )

    expect(host.querySelector('[data-inline-context]')?.textContent).toBe('Inline')
    expect(seen.at(-1)).toMatchObject(expected)
    expect(seen.at(-1)?.indexKey).not.toBeUndefined()

    await unmountRoot(root)
    seen.length = 0

    const ssrHost = hostFromStaticMarkup(renderToStaticMarkup(
      <ServerNodeRenderer
        content={content}
        customId="chat"
        fade={false}
        final
        isDark
        streamingComponents={streamingComponents}
        typewriter
      />,
    ))

    expect(ssrHost.querySelector('[data-inline-context]')?.textContent).toBe('Inline')
    expect(seen.at(-1)).toMatchObject(expected)
    expect(seen.at(-1)?.indexKey).not.toBeUndefined()
  })

  it('preserves loading metadata for streamingComponents nested inside structured html wrappers', async () => {
    const seen: Array<NodeComponentProps<DocumentLinkNode>> = []
    function DocumentLink(props: NodeComponentProps<DocumentLinkNode>) {
      seen.push(props)
      return (
        <span
          data-nested-loading={String(props.node.loading)}
          data-nested-auto-closed={String(props.node.autoClosed)}
        >
          {props.node.content}
        </span>
      )
    }

    const content = '<span><DocumentLink id="1">partial'
    const streamingComponents = { documentlink: DocumentLink }
    const { host, root } = await renderIntoRoot(
      <NodeRenderer
        content={content}
        final={false}
        smoothStreaming={false}
        streamingComponents={streamingComponents}
      />,
    )

    expect(host.querySelector('[data-nested-loading="true"]')?.textContent).toBe('partial')
    expect(host.querySelector('[data-nested-auto-closed="true"]')?.textContent).toBe('partial')
    expect(seen.at(-1)?.node.loading).toBe(true)
    expect(seen.at(-1)?.node.autoClosed).toBe(true)

    await unmountRoot(root)
    seen.length = 0

    const ssrHost = hostFromStaticMarkup(renderToStaticMarkup(
      <ServerNodeRenderer
        content={content}
        final={false}
        streamingComponents={streamingComponents}
      />,
    ))

    expect(ssrHost.querySelector('[data-nested-loading="true"]')?.textContent).toBe('partial')
    expect(ssrHost.querySelector('[data-nested-auto-closed="true"]')?.textContent).toBe('partial')
    expect(seen.at(-1)?.node.loading).toBe(true)
    expect(seen.at(-1)?.node.autoClosed).toBe(true)
  })

  it('keeps closed nested streamingComponents non-loading when the html wrapper is still streaming', async () => {
    const seen: Array<NodeComponentProps<DocumentLinkNode>> = []
    function DocumentLink(props: NodeComponentProps<DocumentLinkNode>) {
      seen.push(props)
      return (
        <span
          data-closed-nested-loading={String(props.node.loading)}
          data-closed-nested-auto-closed={String(props.node.autoClosed)}
        >
          {props.node.content}
        </span>
      )
    }

    const content = '<span><DocumentLink id="1">complete</DocumentLink>still streaming'
    const streamingComponents = { documentlink: DocumentLink }
    const { host, root } = await renderIntoRoot(
      <NodeRenderer
        content={content}
        final={false}
        smoothStreaming={false}
        streamingComponents={streamingComponents}
      />,
    )

    expect(host.querySelector('[data-closed-nested-loading="false"]')?.textContent).toBe('complete')
    expect(host.querySelector('[data-closed-nested-auto-closed="false"]')?.textContent).toBe('complete')
    expect(seen.at(-1)?.node.loading).toBe(false)
    expect(seen.at(-1)?.node.autoClosed).toBe(false)

    await unmountRoot(root)
    seen.length = 0

    const ssrHost = hostFromStaticMarkup(renderToStaticMarkup(
      <ServerNodeRenderer
        content={content}
        final={false}
        streamingComponents={streamingComponents}
      />,
    ))

    expect(ssrHost.querySelector('[data-closed-nested-loading="false"]')?.textContent).toBe('complete')
    expect(ssrHost.querySelector('[data-closed-nested-auto-closed="false"]')?.textContent).toBe('complete')
    expect(seen.at(-1)?.node.loading).toBe(false)
    expect(seen.at(-1)?.node.autoClosed).toBe(false)
  })

  it('preserves structured children for streamingComponents nested inside html wrappers', async () => {
    const seen: Array<NodeComponentProps<DocumentLinkNode>> = []
    function DocumentLink(props: NodeComponentProps<DocumentLinkNode>) {
      seen.push(props)
      return (
        <span
          data-nested-id={getAttr(props.node.attrs, 'id') ?? ''}
          data-nested-content={props.node.content}
          data-nested-child-types={props.node.children?.map(child => child.type).join(',') ?? ''}
        >
          {props.node.content}
        </span>
      )
    }

    const content = [
      '<span><DocumentLink id="inline">Hello <strong>world</strong></DocumentLink></span>',
      '',
      '<div>',
      '',
      '<DocumentLink id="block">Block <strong>world</strong></DocumentLink>',
      '',
      '</div>',
    ].join('\n')
    const streamingComponents = { documentlink: DocumentLink }
    const { host, root } = await renderIntoRoot(
      <NodeRenderer
        content={content}
        final
        smoothStreaming={false}
        streamingComponents={streamingComponents}
      />,
    )

    expect(host.querySelector('[data-nested-id="inline"]')?.getAttribute('data-nested-content')).toBe('Hello <strong>world</strong>')
    expect(host.querySelector('[data-nested-id="block"]')?.getAttribute('data-nested-content')).toBe('Block <strong>world</strong>')
    expect(seen.find(props => getAttr(props.node.attrs, 'id') === 'inline')?.node.content).toBe('Hello <strong>world</strong>')
    expect(seen.find(props => getAttr(props.node.attrs, 'id') === 'block')?.node.children?.map(child => child.type)).toEqual(['text', 'html_inline'])

    await unmountRoot(root)
    seen.length = 0

    const ssrHost = hostFromStaticMarkup(renderToStaticMarkup(
      <ServerNodeRenderer
        content={content}
        final
        streamingComponents={streamingComponents}
      />,
    ))

    expect(ssrHost.querySelector('[data-nested-id="inline"]')?.getAttribute('data-nested-content')).toBe('Hello <strong>world</strong>')
    expect(ssrHost.querySelector('[data-nested-id="block"]')?.getAttribute('data-nested-content')).toBe('Block <strong>world</strong>')
    expect(seen.find(props => getAttr(props.node.attrs, 'id') === 'inline')?.node.content).toBe('Hello <strong>world</strong>')
    expect(seen.find(props => getAttr(props.node.attrs, 'id') === 'block')?.node.children?.map(child => child.type)).toEqual(['text', 'html_inline'])
  })

  it('preserves raw attrs and source for streamingComponents nested inside pre-parsed html nodes', async () => {
    const seen: Array<NodeComponentProps<DocumentLinkNode>> = []
    function DocumentLink(props: NodeComponentProps<DocumentLinkNode>) {
      seen.push(props)
      return (
        <span
          data-preparsed-streaming={getAttr(props.node.attrs, 'id') ?? ''}
          data-preparsed-content={props.node.content}
        >
          {props.node.content}
        </span>
      )
    }

    const inlineNode = {
      type: 'html_inline',
      content: '<span><DocumentLink id="raw" style="color:red" href="javascript:alert(1)">Hello <strong>world</strong></DocumentLink></span>',
      loading: true,
    } as any
    const structuredBlockNode = {
      type: 'html_block',
      tag: 'div',
      content: '<div><DocumentLink id="structured">Structured <strong>world</strong></DocumentLink></div>',
      children: [
        {
          type: 'documentlink',
          tag: 'documentlink',
          attrs: [['id', 'structured']],
          content: 'Structured <strong>world</strong>',
          children: [
            { type: 'text', content: 'Structured ' },
            {
              type: 'html_inline',
              tag: 'strong',
              content: '<strong>world</strong>',
              children: [{ type: 'text', content: 'world' }],
            },
          ],
        },
      ],
    } as any
    const streamingComponents = { documentlink: DocumentLink }
    const { host, root } = await renderIntoRoot(
      <NodeRenderer
        final={false}
        nodes={[inlineNode, structuredBlockNode]}
        smoothStreaming={false}
        streamingComponents={streamingComponents}
      />,
    )

    const rawSeen = seen.find(props => getAttr(props.node.attrs, 'id') === 'raw')
    const structuredSeen = seen.find(props => getAttr(props.node.attrs, 'id') === 'structured')
    expect(host.querySelector('[data-preparsed-streaming="raw"]')?.getAttribute('data-preparsed-content')).toBe('Hello <strong>world</strong>')
    expect(getAttr(rawSeen?.node.attrs, 'style')).toBe('color:red')
    expect(getAttr(rawSeen?.node.attrs, 'href')).toBe('javascript:alert(1)')
    expect(rawSeen?.node.content).toBe('Hello <strong>world</strong>')
    expect(rawSeen?.node.loading).toBe(false)
    expect(structuredSeen?.node.children?.map(child => child.type)).toEqual(['text', 'html_inline'])

    await unmountRoot(root)
    seen.length = 0

    const ssrHost = hostFromStaticMarkup(renderToStaticMarkup(
      <ServerNodeRenderer
        final={false}
        nodes={[inlineNode, structuredBlockNode]}
        streamingComponents={streamingComponents}
      />,
    ))

    const ssrRawSeen = seen.find(props => getAttr(props.node.attrs, 'id') === 'raw')
    const ssrStructuredSeen = seen.find(props => getAttr(props.node.attrs, 'id') === 'structured')
    expect(ssrHost.querySelector('[data-preparsed-streaming="raw"]')?.getAttribute('data-preparsed-content')).toBe('Hello <strong>world</strong>')
    expect(getAttr(ssrRawSeen?.node.attrs, 'style')).toBe('color:red')
    expect(getAttr(ssrRawSeen?.node.attrs, 'href')).toBe('javascript:alert(1)')
    expect(ssrRawSeen?.node.content).toBe('Hello <strong>world</strong>')
    expect(ssrRawSeen?.node.loading).toBe(false)
    expect(ssrStructuredSeen?.node.children?.map(child => child.type)).toEqual(['text', 'html_inline'])
  })

  it('keeps legacy custom component html attr contracts per render path', async () => {
    const scopeId = 'react-local-component-legacy-attrs'
    const seen: Array<{ width?: unknown, disabled?: unknown }> = []
    function LegacyBadge(props: React.PropsWithChildren<{ disabled?: unknown, width?: unknown }>) {
      seen.push(props)
      return (
        <span
          data-legacy-disabled={String(props.disabled)}
          data-legacy-width={String(props.width)}
        >
          {props.children}
        </span>
      )
    }

    setCustomComponents(scopeId, { legacybadge: LegacyBadge as any })
    try {
      const { host, root } = await renderIntoRoot(
        <NodeRenderer
          customId={scopeId}
          content={'<legacybadge width="001">Legacy</legacybadge>'}
          final
          smoothStreaming={false}
        />,
      )

      expect(host.querySelector('[data-legacy-width="001"]')?.textContent).toBe('Legacy')
      expect(seen.at(-1)?.width).toBe('001')

      await unmountRoot(root)
      seen.length = 0

      const inline = await renderIntoRoot(
        <NodeRenderer
          customId={scopeId}
          content={'before <legacybadge width="001" disabled>Inline</legacybadge> after'}
          final
          smoothStreaming={false}
        />,
      )

      expect(inline.host.querySelector('[data-legacy-width="1"]')?.textContent).toBe('Inline')
      expect(seen.at(-1)?.width).toBe(1)
      expect(seen.at(-1)?.disabled).toBe(true)

      await unmountRoot(inline.root)
      seen.length = 0

      const ssrHtml = renderToStaticMarkup(
        <ServerNodeRenderer
          customId={scopeId}
          content={'<legacybadge width="001">Legacy</legacybadge>'}
          final
        />,
      )

      expect(ssrHtml).toContain('data-legacy-width="001"')
      expect(seen.at(-1)?.width).toBe('001')
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('lets block-marked htmlComponents break out of paragraph wrappers on client and server', async () => {
    const Card = withMarkstreamComponentDisplay((props: React.PropsWithChildren) => (
      <div data-html-card>{props.children}</div>
    ), 'block')

    const content = 'before <card>content</card> after'
    const htmlComponents = { card: Card }
    const { host, root } = await renderIntoRoot(
      <NodeRenderer
        content={content}
        final
        htmlComponents={htmlComponents}
        smoothStreaming={false}
      />,
    )

    expect(host.querySelector('[data-html-card]')?.textContent).toBe('content')
    expect(host.querySelectorAll('p.paragraph-node')).toHaveLength(2)
    expect(host.querySelector('p [data-html-card]')).toBeNull()
    expect(host.querySelector('span.html-inline-node [data-html-card]')).toBeNull()
    expect(host.querySelectorAll('p.paragraph-node')[0]?.textContent.trim()).toBe('before')
    expect(host.querySelectorAll('p.paragraph-node')[1]?.textContent.trim()).toBe('after')

    await unmountRoot(root)

    const ssrHost = hostFromStaticMarkup(renderToStaticMarkup(
      <ServerNodeRenderer
        content={content}
        final
        htmlComponents={htmlComponents}
      />,
    ))

    expect(ssrHost.querySelector('[data-html-card]')?.textContent).toBe('content')
    expect(ssrHost.querySelectorAll('p.paragraph-node')).toHaveLength(2)
    expect(ssrHost.querySelector('p [data-html-card]')).toBeNull()
    expect(ssrHost.querySelectorAll('p.paragraph-node')[0]?.textContent.trim()).toBe('before')
    expect(ssrHost.querySelectorAll('p.paragraph-node')[1]?.textContent.trim()).toBe('after')
  })

  it('does not let htmlComponents block display split escaped raw html nodes', async () => {
    const Card = withMarkstreamComponentDisplay((props: React.PropsWithChildren) => (
      <div data-escape-card>{props.children}</div>
    ), 'block')
    const content = 'before <card>content</card> after'
    const htmlComponents = { card: Card }
    const { host, root } = await renderIntoRoot(
      <NodeRenderer
        content={content}
        final
        htmlComponents={htmlComponents}
        htmlPolicy="escape"
        smoothStreaming={false}
      />,
    )

    expect(host.querySelectorAll('p.paragraph-node')).toHaveLength(1)
    expect(host.querySelector('[data-escape-card]')).toBeNull()
    expect(host.querySelector('p.paragraph-node')?.textContent).toBe(content)

    await unmountRoot(root)

    const ssrHost = hostFromStaticMarkup(renderToStaticMarkup(
      <ServerNodeRenderer
        content={content}
        final
        htmlComponents={htmlComponents}
        htmlPolicy="escape"
      />,
    ))

    expect(ssrHost.querySelectorAll('p.paragraph-node')).toHaveLength(1)
    expect(ssrHost.querySelector('[data-escape-card]')).toBeNull()
    expect(ssrHost.querySelector('p.paragraph-node')?.textContent).toBe(content)
  })

  it('passes fade to server-side streaming and coerced custom components', () => {
    const scopeId = 'react-local-component-ssr-fade'
    const seen: Array<{ fade?: boolean, type?: string }> = []
    function DirectTag(props: NodeComponentProps<{ content?: string, type: string }>) {
      seen.push({ fade: props.fade, type: props.node.type })
      return <span data-direct-fade={props.fade === false ? 'off' : 'on'}>{props.node.content}</span>
    }
    function CoercedTag(props: NodeComponentProps<{ content?: string, type: string }>) {
      seen.push({ fade: props.fade, type: props.node.type })
      return <span data-coerced-fade={props.fade === false ? 'off' : 'on'}>{props.node.content}</span>
    }

    setCustomComponents(scopeId, {
      coercedblock: CoercedTag,
      coercedinline: CoercedTag,
    } as any)
    try {
      const directHtml = renderToStaticMarkup(
        <ServerNodeRenderer
          content="<DirectTag>Direct</DirectTag>"
          fade={false}
          final
          streamingComponents={{ directtag: DirectTag }}
        />,
      )
      const coercedHtml = renderToStaticMarkup(
        <ServerNodeRenderer
          customHtmlTags={['coercedblock', 'coercedinline']}
          customId={scopeId}
          fade={false}
          final
          nodes={[
            {
              type: 'html_inline',
              tag: 'coercedinline',
              content: '<coercedinline>Inline</coercedinline>',
              raw: '<coercedinline>Inline</coercedinline>',
            } as any,
            {
              type: 'html_block',
              tag: 'coercedblock',
              content: '<coercedblock>Block</coercedblock>',
              raw: '<coercedblock>Block</coercedblock>',
            } as any,
          ]}
        />,
      )

      expect(directHtml).toContain('data-direct-fade="off"')
      expect(coercedHtml).toContain('data-coerced-fade="off"')
      expect(seen).toEqual([
        { fade: false, type: 'directtag' },
        { fade: false, type: 'coercedinline' },
        { fade: false, type: 'coercedblock' },
      ])
    }
    finally {
      removeCustomComponents(scopeId)
    }
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
