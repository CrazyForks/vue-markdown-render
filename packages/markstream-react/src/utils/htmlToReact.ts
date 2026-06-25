import type { ComponentType, ReactNode } from 'react'
import type { HtmlPolicy, ParsedNode } from 'stream-markdown-parser'
import type { RenderContext, RenderNodeFn } from '../types'
import React from 'react'
import {
  BLOCKED_HTML_TAGS as BLOCKED_TAGS,
  convertHtmlAttrsToProps,
  hasCustomHtmlComponents as hasCustomHtmlComponentsBase,
  isCustomHtmlComponentTag,
  isHtmlTagBlocked,
  isHtmlTagHardBlocked,
  normalizeCustomHtmlTagName,
  sanitizeHtmlAttrs as sanitizeHtmlAttrsBase,
  tokenizeHtml as tokenizeHtmlBase,
} from 'stream-markdown-parser'

export type { HtmlToken } from 'stream-markdown-parser'

type HtmlReactComponentMap = Record<string, ComponentType<any>>
type HtmlReactPropComponentMap = Record<string, ComponentType<any>>
type HtmlReactNodeComponentMap = Record<string, ComponentType<any>>

interface HtmlToReactOptions {
  ctx?: RenderContext
  keyPrefix?: string
  nodeComponents?: HtmlReactNodeComponentMap
  propComponents?: HtmlReactPropComponentMap
  renderNode?: RenderNodeFn
  sourceNode?: ParsedNode
}

function normalizeCssPropName(prop: string) {
  if (prop.startsWith('--'))
    return prop
  return prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
}

function parseInlineStyle(style: string): Record<string, string> | undefined {
  const input = style.trim()
  if (!input)
    return undefined

  const out: Record<string, string> = {}
  for (const part of input.split(';')) {
    const chunk = part.trim()
    if (!chunk)
      continue
    const idx = chunk.indexOf(':')
    if (idx === -1)
      continue
    const key = normalizeCssPropName(chunk.slice(0, idx).trim())
    const value = chunk.slice(idx + 1).trim()
    if (key)
      out[key] = value
  }

  return Object.keys(out).length ? out : undefined
}

export function normalizeDomAttrs(attrs: Record<string, string>) {
  const next: Record<string, unknown> = { ...attrs }
  if (Object.prototype.hasOwnProperty.call(next, 'class')) {
    next.className = next.class
    delete next.class
  }
  if (Object.prototype.hasOwnProperty.call(next, 'for')) {
    next.htmlFor = next.for
    delete next.for
  }
  if (typeof next.style === 'string') {
    const parsed = parseInlineStyle(next.style)
    if (parsed)
      next.style = parsed
    else
      delete next.style
  }
  return next
}

export const tokenizeHtml = tokenizeHtmlBase
export const sanitizeHtmlAttrs = sanitizeHtmlAttrsBase

export function isCustomHtmlComponent(
  tagName: string,
  customComponents: HtmlReactComponentMap,
) {
  return isCustomHtmlComponentTag(tagName, customComponents as Record<string, unknown>)
}

export function hasCustomHtmlComponents(
  content: string,
  customComponents: HtmlReactComponentMap,
) {
  return hasCustomHtmlComponentsBase(content, customComponents as Record<string, unknown>)
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

function pushRenderedNode(target: ReactNode[], rendered: ReactNode | ReactNode[] | null) {
  if (Array.isArray(rendered))
    target.push(...rendered)
  else if (rendered != null)
    target.push(rendered)
}

function shouldUseHtmlPropContract(
  tagName: string,
  options: HtmlToReactOptions,
) {
  return Boolean(options.propComponents?.[tagName] || options.propComponents?.[tagName.toLowerCase()])
}

function getNodeComponent(
  tagName: string,
  options: HtmlToReactOptions,
) {
  return options.nodeComponents?.[tagName] || options.nodeComponents?.[tagName.toLowerCase()]
}

function getTextContent(children: ReactNode[]) {
  return children
    .map(serializeReactContent)
    .join('')
}

function serializeReactContent(child: ReactNode): string {
  if (child == null || typeof child === 'boolean')
    return ''
  if (typeof child === 'string' || typeof child === 'number')
    return String(child)
  if (Array.isArray(child))
    return child.map(serializeReactContent).join('')
  if (!React.isValidElement(child))
    return ''

  const element = child as React.ReactElement<{ children?: ReactNode }>
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

function getCustomComponentProps(
  tagName: string,
  attrs: Record<string, string>,
  options: HtmlToReactOptions,
) {
  return shouldUseHtmlPropContract(tagName, options)
    ? convertHtmlAttrsToProps(attrs)
    : attrs
}

function renderNodeComponent(
  tagName: string,
  attrs: Record<string, string>,
  children: ReactNode[],
  key: string,
  options: HtmlToReactOptions,
) {
  const normalizedTag = normalizeCustomHtmlTagName(tagName)
  const content = getTextContent(children)
  const node = {
    type: normalizedTag,
    tag: normalizedTag,
    attrs: attrsToTokenPairs(attrs),
    content,
    raw: `${renderLiteralTagText(tagName, attrs)}${content}</${tagName}>`,
    loading: Boolean((options.sourceNode as any)?.loading),
    autoClosed: Boolean((options.sourceNode as any)?.autoClosed ?? (options.sourceNode as any)?.loading),
  } as ParsedNode

  if (options.ctx && options.renderNode)
    return options.renderNode(node, key, options.ctx)

  const component = getNodeComponent(tagName, options)
  return component
    ? React.createElement(component as ComponentType<Record<string, unknown>>, { key, node })
    : null
}

export function parseHtmlToReactNodes(
  content: string,
  customComponents: HtmlReactComponentMap,
  htmlPolicy: HtmlPolicy = 'safe',
  options: HtmlToReactOptions = {},
): ReactNode[] | null {
  if (!content)
    return []
  if (htmlPolicy === 'escape')
    return [content]

  try {
    const tokens = tokenizeHtml(content)
    let autoKeySeed = 0
    const keyPrefix = options.keyPrefix ?? 'ms-html'
    const stack: Array<{
      tagName: string
      children: ReactNode[]
      attrs?: Record<string, string>
      hardBlocked?: boolean
      softBlocked?: boolean
      customComponent?: boolean
    }> = []
    const rootNodes: ReactNode[] = []

    for (const token of tokens) {
      if (token.type === 'text') {
        if (stack.length > 0 && stack[stack.length - 1].hardBlocked)
          continue
        const target = stack.length > 0 ? stack[stack.length - 1].children : rootNodes
        target.push(token.content ?? '')
        continue
      }

      if (token.type === 'self_closing') {
        const customComponent = isCustomHtmlComponent(token.tagName, customComponents)
        const nodeComponent = Boolean(getNodeComponent(token.tagName, options))
        if (BLOCKED_TAGS.has(token.tagName.toLowerCase()) || (!customComponent && !nodeComponent && isHtmlTagHardBlocked(token.tagName, htmlPolicy)))
          continue
        if (!customComponent && !nodeComponent && isHtmlTagBlocked(token.tagName, htmlPolicy)) {
          const target = stack.length > 0 ? stack[stack.length - 1].children : rootNodes
          target.push(renderLiteralTagText(token.tagName, token.attrs, true))
          continue
        }
        const attrs = sanitizeHtmlAttrs(token.attrs || {}, htmlPolicy, token.tagName)
        const explicitKey = (attrs as any).key
        const elementKey = explicitKey != null && explicitKey !== '' ? explicitKey : `${keyPrefix}-${autoKeySeed++}`
        const Comp = customComponent
          ? (customComponents[token.tagName] || customComponents[token.tagName.toLowerCase()])
          : undefined
        const target = stack.length > 0 ? stack[stack.length - 1].children : rootNodes
        if (nodeComponent) {
          target.push(renderNodeComponent(token.tagName, attrs, [], elementKey, options))
        }
        else if (Comp) {
          const componentProps = getCustomComponentProps(token.tagName, attrs, options)
          target.push(React.createElement(Comp as ComponentType<Record<string, unknown>>, { ...componentProps, key: elementKey }))
        }
        else {
          target.push(React.createElement(token.tagName, {
            ...normalizeDomAttrs(attrs),
            key: elementKey,
            suppressHydrationWarning: true,
          }))
        }
        continue
      }

      if (token.type === 'tag_open') {
        const parentHardBlocked = stack.length > 0 && stack[stack.length - 1].hardBlocked
        const customComponent = isCustomHtmlComponent(token.tagName, customComponents)
        const nodeComponent = Boolean(getNodeComponent(token.tagName, options))
        stack.push({
          tagName: token.tagName,
          children: [],
          attrs: token.attrs,
          customComponent: customComponent || nodeComponent,
          hardBlocked: parentHardBlocked || BLOCKED_TAGS.has(token.tagName.toLowerCase()) || (!customComponent && !nodeComponent && isHtmlTagHardBlocked(token.tagName, htmlPolicy)),
          softBlocked: !parentHardBlocked && !customComponent && !nodeComponent && isHtmlTagBlocked(token.tagName, htmlPolicy),
        })
        continue
      }

      const opening = stack.pop()
      if (!opening || opening.hardBlocked)
        continue

      if (opening.softBlocked) {
        const rendered = [
          renderLiteralTagText(opening.tagName, opening.attrs),
          ...opening.children,
          `</${opening.tagName}>`,
        ]
        if (stack.length > 0)
          pushRenderedNode(stack[stack.length - 1].children, rendered)
        else
          pushRenderedNode(rootNodes, rendered)
        continue
      }

      const attrs = sanitizeHtmlAttrs(opening.attrs || {}, htmlPolicy, opening.tagName)
      const explicitKey = (attrs as any).key
      const elementKey = explicitKey != null && explicitKey !== '' ? explicitKey : `${keyPrefix}-${autoKeySeed++}`
      const Comp = opening.customComponent
        ? (customComponents[opening.tagName] || customComponents[opening.tagName.toLowerCase()])
        : undefined
      const nodeComponent = Boolean(getNodeComponent(opening.tagName, options))
      let element: ReactNode
      if (nodeComponent) {
        element = renderNodeComponent(opening.tagName, attrs, opening.children, elementKey, options)
      }
      else if (Comp) {
        element = React.createElement(Comp as ComponentType<Record<string, unknown>>, { ...getCustomComponentProps(opening.tagName, attrs, options), key: elementKey }, ...opening.children)
      }
      else {
        element = React.createElement(opening.tagName, {
          ...normalizeDomAttrs(attrs),
          key: elementKey,
          suppressHydrationWarning: true,
        }, ...opening.children)
      }

      if (stack.length > 0)
        stack[stack.length - 1].children.push(element)
      else
        rootNodes.push(element)
    }

    while (stack.length > 0) {
      const unclosed = stack.pop()
      if (!unclosed || unclosed.hardBlocked)
        continue
      if (unclosed.softBlocked) {
        pushRenderedNode(rootNodes, [
          renderLiteralTagText(unclosed.tagName, unclosed.attrs),
          ...unclosed.children,
          `</${unclosed.tagName}>`,
        ])
        continue
      }
      const attrs = sanitizeHtmlAttrs(unclosed.attrs || {}, htmlPolicy, unclosed.tagName)
      const explicitKey = (attrs as any).key
      const elementKey = explicitKey != null && explicitKey !== '' ? explicitKey : `${keyPrefix}-${autoKeySeed++}`
      const Comp = unclosed.customComponent
        ? (customComponents[unclosed.tagName] || customComponents[unclosed.tagName.toLowerCase()])
        : undefined
      const nodeComponent = Boolean(getNodeComponent(unclosed.tagName, options))
      let element: ReactNode
      if (nodeComponent) {
        element = renderNodeComponent(unclosed.tagName, attrs, unclosed.children, elementKey, options)
      }
      else if (Comp) {
        element = React.createElement(Comp as ComponentType<Record<string, unknown>>, { ...getCustomComponentProps(unclosed.tagName, attrs, options), key: elementKey }, ...unclosed.children)
      }
      else {
        element = React.createElement(unclosed.tagName, {
          ...normalizeDomAttrs(attrs),
          key: elementKey,
          suppressHydrationWarning: true,
        }, ...unclosed.children)
      }
      rootNodes.push(element)
    }

    return rootNodes
  }
  catch {
    return null
  }
}
