import type { ComponentType } from 'react'
import type { HtmlPolicy, ParsedNode } from 'stream-markdown-parser'
import type { RenderContext, RenderNodeFn } from '../../types'
import type { NodeComponentProps } from '../../types/node-component'
import type { HtmlToken } from '../../utils/htmlToReact'
import React, { useEffect, useRef, useState } from 'react'
import { BLOCKED_HTML_TAGS as BLOCKED_TAGS, convertHtmlAttrsToProps, isHtmlTagBlocked, isHtmlTagHardBlocked, normalizeCustomHtmlTagName, sanitizeHtmlContent, sanitizeHtmlTokenAttrs, tokenAttrsToRecord } from 'stream-markdown-parser'
import { getCustomComponentDisplay, getCustomNodeComponents } from '../../customComponents'
import { renderNodeChildren } from '../../renderers/renderChildren'
import {
  hasCustomHtmlComponents,
  isCustomHtmlComponent,
  normalizeDomAttrs,
  sanitizeHtmlAttrs,
  tokenizeHtml,
} from '../../utils/htmlToReact'

const SHOULD_LOG = (() => {
  try {
    return Boolean((import.meta as any).env?.DEV)
  }
  catch {}
  return false
})()

function warn(message: string) {
  if (SHOULD_LOG)
    console.warn(message)
}

function logError(message: string, err: unknown) {
  if (SHOULD_LOG)
    console.error(message, err)
}

function renderLiteralTagText(tagName: string, attrs?: Record<string, string>, isSelfClosing = false) {
  const pairs = Object.entries(attrs ?? {})
  const serializedAttrs = pairs.length > 0
    ? pairs.map(([name, value]) => value === '' ? ` ${name}` : ` ${name}="${value}"`).join('')
    : ''
  return isSelfClosing
    ? `<${tagName}${serializedAttrs} />`
    : `<${tagName}${serializedAttrs}>`
}

function pushRenderedNode(target: React.ReactNode[], rendered: React.ReactNode | React.ReactNode[] | null) {
  if (Array.isArray(rendered))
    target.push(...rendered)
  else if (rendered != null)
    target.push(rendered)
}

function hasBlockCustomHtmlComponent(
  content: string,
  customComponents: Record<string, ComponentType<any>>,
) {
  for (const token of tokenizeHtml(content)) {
    if (token.type !== 'tag_open' && token.type !== 'self_closing')
      continue
    const tagName = token.tagName ?? ''
    if (!isCustomHtmlComponent(tagName, customComponents))
      continue
    const component = customComponents[tagName] || customComponents[tagName.toLowerCase()]
    if (getCustomComponentDisplay(component as any) === 'block')
      return true
  }
  return false
}

interface HtmlInlineRenderOptions {
  ctx?: RenderContext
  keyPrefix?: string
  nodeComponents?: Record<string, ComponentType<any>>
  renderNode?: RenderNodeFn
  sourceNode?: ParsedNode
}

function getNodeComponent(tagName: string, options: HtmlInlineRenderOptions) {
  return options.nodeComponents?.[tagName] || options.nodeComponents?.[tagName.toLowerCase()]
}

function getTextContent(children: React.ReactNode[]) {
  return children
    .map(serializeReactContent)
    .join('')
}

function serializeReactContent(child: React.ReactNode): string {
  if (child == null || typeof child === 'boolean')
    return ''
  if (typeof child === 'string' || typeof child === 'number')
    return String(child)
  if (Array.isArray(child))
    return child.map(serializeReactContent).join('')
  if (!React.isValidElement(child))
    return ''

  const element = child as React.ReactElement<{ children?: React.ReactNode }>
  if (typeof element.type !== 'string')
    return serializeReactContent(element.props.children)

  const attrs = Object.entries(element.props)
    .filter(([name, value]) => name !== 'children' && name !== 'key' && name !== 'ref' && value != null && typeof value !== 'boolean')
    .map(([name, value]) => ` ${name === 'className' ? 'class' : name}="${String(value)}"`)
    .join('')
  return `<${element.type}${attrs}>${serializeReactContent(element.props.children)}</${element.type}>`
}

function attrsToTokenPairs(attrs: Record<string, string>) {
  return Object.entries(attrs).map(([key, value]) => [key, value === '' ? null : value] as [string, string | null])
}

interface NodeComponentState {
  loading: boolean
  autoClosed: boolean
}

function getUnclosedNodeState(options: HtmlInlineRenderOptions): NodeComponentState {
  const sourceNode = options.sourceNode as any
  const loading = options.ctx?.final === true
    ? false
    : options.ctx?.final === false
      ? true
      : Boolean(sourceNode?.loading)
  return {
    loading,
    autoClosed: loading || Boolean(sourceNode?.autoClosed),
  }
}

function renderNodeComponent(
  tagName: string,
  attrs: Record<string, string>,
  children: React.ReactNode[],
  key: string,
  options: HtmlInlineRenderOptions,
  contentSource?: string,
  rawSource?: string,
  state: NodeComponentState = getUnclosedNodeState(options),
) {
  const normalizedTag = normalizeCustomHtmlTagName(tagName)
  const content = contentSource ?? getTextContent(children)
  const node = {
    type: normalizedTag,
    tag: normalizedTag,
    attrs: attrsToTokenPairs(attrs),
    content,
    raw: rawSource ?? `${renderLiteralTagText(tagName, attrs)}${content}</${tagName}>`,
    loading: state.loading,
    autoClosed: state.autoClosed,
  } as ParsedNode

  if (options.ctx && options.renderNode)
    return options.renderNode(node, key, options.ctx)

  const component = getNodeComponent(tagName, options)
  return component
    ? React.createElement(component as ComponentType<Record<string, unknown>>, { key, node })
    : null
}

/**
 * Build React element tree from tokens
 */
function buildReactElementTree(
  tokens: HtmlToken[],
  customComponents: Record<string, ComponentType<any>>,
  htmlPolicy: HtmlPolicy = 'safe',
  options: HtmlInlineRenderOptions = {},
): React.ReactNode[] {
  let autoKeySeed = 0
  const keyPrefix = options.keyPrefix ?? 'ms-html'
  const stack: Array<{
    tagName: string
    children: React.ReactNode[]
    attrs?: Record<string, string>
    hardBlocked?: boolean
    sourceParts: string[]
    softBlocked?: boolean
    customComponent?: boolean
  }> = []
  const rootNodes: React.ReactNode[] = []

  for (const token of tokens) {
    if (token.type === 'text') {
      if (stack.length > 0 && stack[stack.length - 1].hardBlocked)
        continue
      const target = stack.length > 0 ? stack[stack.length - 1].children : rootNodes
      target.push(token.content!)
      if (stack.length > 0)
        stack[stack.length - 1].sourceParts.push(token.content!)
    }
    else if (token.type === 'self_closing') {
      const rawAttrs = token.attrs || {}
      const rawSource = renderLiteralTagText(token.tagName!, rawAttrs, true)
      const customComponent = isCustomHtmlComponent(token.tagName!, customComponents)
      const nodeComponent = Boolean(getNodeComponent(token.tagName!, options))
      if (BLOCKED_TAGS.has(token.tagName!.toLowerCase()) || (!customComponent && !nodeComponent && isHtmlTagHardBlocked(token.tagName, htmlPolicy)))
        continue
      if (!customComponent && !nodeComponent && isHtmlTagBlocked(token.tagName, htmlPolicy)) {
        const target = stack.length > 0 ? stack[stack.length - 1].children : rootNodes
        target.push(rawSource)
        if (stack.length > 0)
          stack[stack.length - 1].sourceParts.push(rawSource)
        continue
      }
      const element = createReactElement(token.tagName!, rawAttrs, [], customComponents, `${keyPrefix}-${autoKeySeed++}`, htmlPolicy, options, '', rawSource, {
        loading: false,
        autoClosed: false,
      })
      const target = stack.length > 0 ? stack[stack.length - 1].children : rootNodes
      pushRenderedNode(target, element)
      if (stack.length > 0)
        stack[stack.length - 1].sourceParts.push(rawSource)
    }
    else if (token.type === 'tag_open') {
      const parentHardBlocked = stack.length > 0 && stack[stack.length - 1].hardBlocked
      const customComponent = isCustomHtmlComponent(token.tagName!, customComponents)
      const nodeComponent = Boolean(getNodeComponent(token.tagName!, options))
      stack.push({
        tagName: token.tagName!,
        children: [],
        attrs: token.attrs,
        sourceParts: [],
        customComponent: customComponent || nodeComponent,
        hardBlocked: parentHardBlocked || BLOCKED_TAGS.has(token.tagName!.toLowerCase()) || (!customComponent && !nodeComponent && isHtmlTagHardBlocked(token.tagName, htmlPolicy)),
        softBlocked: !parentHardBlocked && !customComponent && !nodeComponent && isHtmlTagBlocked(token.tagName, htmlPolicy),
      })
    }
    else if (token.type === 'tag_close') {
      const closingTag = token.tagName!.toLowerCase()

      // Find matching opening tag (handle nested same tags)
      let matchedIndex = -1
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tagName.toLowerCase() === closingTag) {
          matchedIndex = i
          break
        }
      }

      if (matchedIndex !== -1) {
        // Pop all tags until the matched one (auto-closing intermediate tags)
        while (stack.length > matchedIndex) {
          const opening = stack.pop()!
          const innerSource = opening.sourceParts.join('')
          const rawSource = `${renderLiteralTagText(opening.tagName, opening.attrs || {})}${innerSource}</${opening.tagName}>`
          let element: React.ReactNode | React.ReactNode[] | null
          if (opening.hardBlocked) {
            element = null
          }
          else if (opening.softBlocked) {
            element = [
              renderLiteralTagText(opening.tagName, opening.attrs || {}),
              ...opening.children,
              `</${opening.tagName}>`,
            ]
          }
          else {
            const state = opening.tagName.toLowerCase() === closingTag
              ? { loading: false, autoClosed: false }
              : getUnclosedNodeState(options)
            element = createReactElement(opening.tagName, opening.attrs || {}, opening.children, customComponents, `${keyPrefix}-${autoKeySeed++}`, htmlPolicy, options, innerSource, rawSource, state)
          }

          if (stack.length > 0)
            pushRenderedNode(stack[stack.length - 1].children, element)
          else
            pushRenderedNode(rootNodes, element)
          if (stack.length > 0 && !opening.hardBlocked)
            stack[stack.length - 1].sourceParts.push(rawSource)

          // Warn if auto-closing tags
          if (opening.tagName.toLowerCase() !== closingTag && stack.length > matchedIndex) {
            warn(`Auto-closing unclosed tag: <${opening.tagName}>`)
          }
        }
      }
      else {
        // No matching opening tag, warn and ignore
        warn(`Ignoring closing tag with no matching opening tag: </${token.tagName}>`)
      }
    }
  }

  // Handle any remaining unclosed tags
  while (stack.length > 0) {
    const unclosed = stack.pop()!
    const innerSource = unclosed.sourceParts.join('')
    const rawSource = `${renderLiteralTagText(unclosed.tagName, unclosed.attrs || {})}${innerSource}`
    let element: React.ReactNode | React.ReactNode[] | null
    if (unclosed.hardBlocked) {
      element = null
    }
    else if (unclosed.softBlocked) {
      element = [
        renderLiteralTagText(unclosed.tagName, unclosed.attrs || {}),
        ...unclosed.children,
        `</${unclosed.tagName}>`,
      ]
    }
    else {
      element = createReactElement(unclosed.tagName, unclosed.attrs || {}, unclosed.children, customComponents, `${keyPrefix}-${autoKeySeed++}`, htmlPolicy, options, innerSource, rawSource, getUnclosedNodeState(options))
    }
    pushRenderedNode(rootNodes, element)
    if (stack.length > 0 && !unclosed.hardBlocked)
      stack[stack.length - 1].sourceParts.push(rawSource)
    warn(`Auto-closing unclosed tag: <${unclosed.tagName}>`)
  }

  return rootNodes
}

/**
 * Create React element for a tag
 */
function createReactElement(
  tagName: string,
  attrs: Record<string, string>,
  children: React.ReactNode[],
  customComponents: Record<string, ComponentType<any>>,
  autoKey: string,
  htmlPolicy: HtmlPolicy,
  options: HtmlInlineRenderOptions,
  contentSource?: string,
  rawSource?: string,
  state?: NodeComponentState,
): React.ReactNode {
  const customComponent = isCustomHtmlComponent(tagName, customComponents)
  const nodeComponent = Boolean(getNodeComponent(tagName, options))
  if (BLOCKED_TAGS.has(tagName.toLowerCase()) || (!customComponent && !nodeComponent && isHtmlTagHardBlocked(tagName, htmlPolicy)))
    return null

  if (!customComponent && !nodeComponent && isHtmlTagBlocked(tagName, htmlPolicy)) {
    return [
      renderLiteralTagText(tagName, attrs),
      ...children,
      `</${tagName}>`,
    ]
  }

  const sanitizedAttrs = sanitizeHtmlAttrs(attrs, htmlPolicy, tagName)
  const explicitKey = (sanitizedAttrs as any).key
  const elementKey = explicitKey != null && explicitKey !== '' ? explicitKey : autoKey

  if (nodeComponent) {
    return renderNodeComponent(tagName, attrs, children, String(elementKey), options, contentSource, rawSource, state)
  }
  else if (customComponent) {
    // It's a custom React component
    const component = customComponents[tagName] || customComponents[tagName.toLowerCase()]
    const componentProps = convertHtmlAttrsToProps(sanitizedAttrs)
    return React.createElement(component as ComponentType<Record<string, unknown>>, { ...componentProps, key: elementKey }, ...children)
  }
  else {
    // It's a standard HTML element
    return React.createElement(tagName, { ...normalizeDomAttrs(sanitizedAttrs), key: elementKey }, ...children)
  }
}

/**
 * Parse HTML content to React elements
 */
function parseHtmlToReactNodes(
  content: string,
  customComponents: Record<string, ComponentType<any>>,
  htmlPolicy: HtmlPolicy = 'safe',
  options: HtmlInlineRenderOptions = {},
): React.ReactNode[] | null {
  if (!content)
    return []

  try {
    const tokens = tokenizeHtml(content)
    const nodes = buildReactElementTree(tokens, customComponents, htmlPolicy, options)
    return nodes
  }
  catch (error) {
    logError('Failed to parse HTML to React nodes:', error)
    return null
  }
}

export function HtmlInlineNode(props: NodeComponentProps<{
  type: 'html_inline'
  content: string
  tag?: string
  attrs?: [string, string | null][] | null
  children?: ParsedNode[]
  loading?: boolean
  autoClosed?: boolean
}> & { htmlPolicy?: HtmlPolicy }) {
  const { node, customId } = props
  const htmlPolicy = props.htmlPolicy ?? props.ctx?.htmlPolicy ?? 'safe'
  const containerRef = useRef<HTMLSpanElement>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  const customComponents = React.useMemo(() => {
    const legacyComponents = props.ctx?.customComponents ?? getCustomNodeComponents(customId)
    return {
      ...legacyComponents,
      ...(props.ctx?.htmlComponents ?? {}),
    }
  }, [customId, props.ctx?.customComponents, props.ctx?.htmlComponents])
  const dynamicCustomComponents = React.useMemo(() => ({
    ...customComponents,
    ...(props.ctx?.streamingComponents ?? {}),
  }), [customComponents, props.ctx?.streamingComponents])
  const safeHtmlContent = React.useMemo(() => sanitizeHtmlContent(node.content ?? '', htmlPolicy), [htmlPolicy, node.content])
  const structuredTag = React.useMemo(() => String(node.tag ?? '').trim(), [node.tag])
  const normalizedStructuredTag = React.useMemo(() => normalizeCustomHtmlTagName(structuredTag), [structuredTag])
  const structuredChildren = React.useMemo(() => Array.isArray(node.children) ? node.children : [], [node.children])
  const structuredHtmlComponentProps = React.useMemo(() => {
    return convertHtmlAttrsToProps(tokenAttrsToRecord(sanitizeHtmlTokenAttrs(node.attrs ?? undefined, htmlPolicy, normalizedStructuredTag)))
  }, [htmlPolicy, node.attrs, normalizedStructuredTag])
  const StructuredHtmlComponent = normalizedStructuredTag
    ? props.ctx?.htmlComponents?.[normalizedStructuredTag]
    : undefined
  const isStructured = structuredChildren.length > 0
    && !!structuredTag
    && htmlPolicy !== 'escape'
    && !isHtmlTagBlocked(structuredTag, htmlPolicy)
    && !!props.ctx
    && !!props.renderNode
    && !!StructuredHtmlComponent
  const structuredContent = React.useMemo(() => {
    if (!isStructured || !props.ctx || !props.renderNode)
      return null
    return renderNodeChildren(
      structuredChildren,
      props.ctx,
      `${String(props.indexKey ?? 'html-inline')}-structured`,
      props.renderNode,
    )
  }, [isStructured, props.ctx, props.indexKey, props.renderNode, structuredChildren])

  // Computed property to determine render mode and content
  const renderMode = React.useMemo(() => {
    const content = node.content
    if (!content)
      return { mode: 'html', content: '' }

    if (htmlPolicy === 'escape')
      return { mode: 'html', content }

    // Check if content contains custom components
    if (!hasCustomHtmlComponents(content, dynamicCustomComponents))
      return { mode: 'html', content }

    // Parse and build React element tree
    const nodes = parseHtmlToReactNodes(content, customComponents, htmlPolicy, {
      ctx: props.ctx,
      keyPrefix: String(props.indexKey ?? 'html-inline'),
      nodeComponents: props.ctx?.streamingComponents,
      renderNode: props.renderNode,
      sourceNode: node as ParsedNode,
    })
    if (nodes === null)
      return { mode: 'html', content } // Fallback to dangerouslySetInnerHTML if parsing fails

    return {
      mode: 'dynamic',
      block: hasBlockCustomHtmlComponent(content, dynamicCustomComponents),
      nodes,
    }
  }, [customComponents, dynamicCustomComponents, htmlPolicy, node.autoClosed, node.content, node.loading, props.ctx, props.indexKey, props.renderNode])

  // Use DOM manipulation for pure HTML (mode: 'html')
  useEffect(() => {
    if (!isClient || !containerRef.current || renderMode.mode !== 'html')
      return

    const host = containerRef.current
    host.innerHTML = ''
    const template = document.createElement('template')
    template.innerHTML = safeHtmlContent
    host.appendChild(template.content.cloneNode(true))
  }, [renderMode.mode, isClient, safeHtmlContent])

  // Loading state handling
  if (node.loading && !node.autoClosed && !isStructured && renderMode.mode !== 'dynamic') {
    return (
      <span className="html-inline-node html-inline-node--loading">
        {node.content}
      </span>
    )
  }

  if (isStructured) {
    return React.createElement(
      StructuredHtmlComponent as any,
      structuredHtmlComponentProps,
      structuredContent,
    )
  }

  // Dynamic rendering for custom components
  if (renderMode.mode === 'dynamic') {
    if (renderMode.block)
      return <>{renderMode.nodes}</>

    return (
      <span
        className="html-inline-node"
        style={{ display: 'inline' }}
      >
        {renderMode.nodes}
      </span>
    )
  }

  // Fallback to DOM rendering for standard HTML
  return (
    <span
      ref={containerRef}
      className="html-inline-node"
      style={{ display: 'inline' }}
    />
  )
}

export default HtmlInlineNode
