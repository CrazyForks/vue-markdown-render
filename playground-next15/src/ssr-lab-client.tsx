'use client'

import * as nextEntry from 'markstream-react/next'
import { NodeRenderer, setCustomComponents } from 'markstream-react/next'
import React, { useEffect, useState } from 'react'
import { createMatrixCases, NEXT_CUSTOM_ALT_ID, NEXT_CUSTOM_ID } from './ssr-lab-data'

function readAttr(node: any, name: string) {
  if (!node?.attrs)
    return undefined
  if (Array.isArray(node.attrs))
    return node.attrs.find((item: [string, string | null]) => item[0] === name)?.[1] ?? undefined
  return node.attrs[name]
}

function renderCustomChildren(props: any) {
  if (!Array.isArray(props.node?.children) || !props.renderNode || !props.ctx)
    return null

  return props.node.children.map((child: any, idx: number) => (
    <React.Fragment key={`${String(props.indexKey ?? 'custom')}-${idx}`}>
      {props.renderNode(child, `${String(props.indexKey ?? 'custom')}-${idx}`, props.ctx)}
    </React.Fragment>
  ))
}

setCustomComponents(NEXT_CUSTOM_ID, {
  paragraph: ({ node }: any) => (
    <div data-ssr-status="next-paragraph-override">
      {node.raw}
    </div>
  ),
  insight: (props: any) => (
    <section data-ssr-status="next-custom-node">
      <strong>{props.node.label}</strong>
      <div data-ssr-status="next-custom-node-children">
        {renderCustomChildren(props)}
      </div>
    </section>
  ),
  thinking: ({ node }: any) => (
    <aside
      data-ssr-status="next-thinking-tag"
      data-ssr-tone={readAttr(node, 'data-tone')}
      data-ssr-scope={readAttr(node, 'data-scope')}
    >
      {node.content}
    </aside>
  ),
})

setCustomComponents(NEXT_CUSTOM_ALT_ID, {
  paragraph: ({ node }: any) => (
    <div data-ssr-status="next-paragraph-alt">
      {node.raw}
    </div>
  ),
  insight: (props: any) => (
    <section data-ssr-status="next-custom-node-alt">
      <strong>{props.node.label}</strong>
      <div data-ssr-status="next-custom-node-alt-children">
        {renderCustomChildren(props)}
      </div>
    </section>
  ),
  thinking: ({ node }: any) => (
    <aside
      data-ssr-status="next-thinking-tag-alt"
      data-ssr-scope={readAttr(node, 'data-scope')}
    >
      {node.content}
    </aside>
  ),
})

export function NextCustomRenderer({ customId, nodes }: { customId: string, nodes: any[] }) {
  return (
    <NodeRenderer
      customId={customId}
      customHtmlTags={['thinking']}
      nodes={nodes}
      final
    />
  )
}

export function NextExportMatrix() {
  const items = createMatrixCases(nextEntry, nextEntry)

  return (
    <article data-ssr-case="export-matrix" data-ssr-entry="next">
      <h2>Next Export Matrix</h2>
      <div className="ssr-matrix">
        {items.map(item => (
          <section key={item.name} data-ssr-export={item.name} className="ssr-card">
            <h3>{item.name}</h3>
            {item.element}
          </section>
        ))}
      </div>
    </article>
  )
}

function readEnhancementState() {
  const nextEnhanced = document.querySelector('[data-ssr-case="enhanced"][data-ssr-entry="next"]')
  const serverFallback = document.querySelector('[data-ssr-case="fallback"][data-ssr-entry="server"]')

  const codeReady = Boolean(
    nextEnhanced?.querySelector('[data-ssr-demo="code"] .monaco-editor')
    || nextEnhanced?.querySelector('[data-ssr-demo="code"] .code-editor-fallback-surface'),
  )
  const mathReady = Boolean(nextEnhanced?.querySelector('[data-ssr-demo="math"] .katex'))
  const mermaidReady = Boolean(
    nextEnhanced?.querySelector('[data-ssr-demo="mermaid"] .mermaid-block')
    && !nextEnhanced?.querySelector('[data-ssr-demo="mermaid"] [data-ssr-fallback="mermaid"]'),
  )
  const d2Ready = Boolean(nextEnhanced?.querySelector('[data-ssr-demo="d2"] .d2-svg svg'))
  const infographicReady = Boolean(nextEnhanced?.querySelector('[data-ssr-demo="infographic"] svg'))
  const fallbackStable = (serverFallback?.querySelectorAll('[data-ssr-fallback]').length ?? 0) >= 3

  return {
    codeReady,
    mathReady,
    mermaidReady,
    d2Ready,
    infographicReady,
    fallbackStable,
  }
}

export function HydrationProbe() {
  const [nextStatus, setNextStatus] = useState('server')
  const [serverStatus, setServerStatus] = useState('server')
  const [summary, setSummary] = useState('pending')

  useEffect(() => {
    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      const state = readEnhancementState()
      setSummary([
        `code:${state.codeReady ? 'ready' : 'pending'}`,
        `math:${state.mathReady ? 'ready' : 'pending'}`,
        `mermaid:${state.mermaidReady ? 'ready' : 'pending'}`,
        `d2:${state.d2Ready ? 'ready' : 'fallback'}`,
        `infographic:${state.infographicReady ? 'ready' : 'fallback'}`,
      ].join(' '))

      if (state.codeReady && state.mathReady && state.mermaidReady)
        setNextStatus('enhanced')
      else
        setNextStatus(attempts > 4 ? 'hydrating' : 'server')

      if (state.fallbackStable)
        setServerStatus('fallback-stable')
      else if (attempts > 4)
        setServerStatus('fallback-missing')

      if ((state.codeReady && state.mathReady && state.mermaidReady) && state.fallbackStable)
        window.clearInterval(timer)

      if (attempts >= 40)
        window.clearInterval(timer)
    }, 250)

    return () => window.clearInterval(timer)
  }, [])

  return (
    <>
      <article data-ssr-case="hydration" data-ssr-entry="next" data-ssr-status={nextStatus}>
        <h2>Hydration / Next</h2>
        <p>{summary}</p>
      </article>
      <article data-ssr-case="hydration" data-ssr-entry="server" data-ssr-status={serverStatus}>
        <h2>Hydration / Server</h2>
        <p>Server fallback should stay stable after hydration.</p>
      </article>
    </>
  )
}
