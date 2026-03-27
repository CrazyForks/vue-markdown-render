import type { ComponentType, ReactNode } from 'react'
import React from 'react'
import {
  BLOCKED_HTML_TAGS as BLOCKED_TAGS,
  DANGEROUS_HTML_ATTRS as DANGEROUS_ATTRS,
  isUnsafeHtmlUrl as isUnsafeUrl,
  EXTENDED_STANDARD_HTML_TAGS as STANDARD_HTML_TAGS,
  URL_HTML_ATTRS as URL_ATTRS,
  VOID_HTML_TAGS as VOID_ELEMENTS,
} from 'stream-markdown-parser'

interface HtmlTextToken {
  type: 'text'
  content?: string
}

interface HtmlOpenToken {
  type: 'tag_open'
  tagName: string
  attrs?: Record<string, string>
}

interface HtmlCloseToken {
  type: 'tag_close'
  tagName: string
}

interface HtmlSelfClosingToken {
  type: 'self_closing'
  tagName: string
  attrs?: Record<string, string>
}

type HtmlToken
  = | HtmlTextToken
    | HtmlOpenToken
    | HtmlCloseToken
    | HtmlSelfClosingToken

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

function normalizeDomAttrs(attrs: Record<string, string>) {
  const next: Record<string, any> = { ...attrs }
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

function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = []
  let pos = 0

  while (pos < html.length) {
    if (html.startsWith('<!--', pos)) {
      const commentEnd = html.indexOf('-->', pos)
      if (commentEnd !== -1) {
        pos = commentEnd + 3
        continue
      }
      break
    }

    const tagStart = html.indexOf('<', pos)
    if (tagStart === -1) {
      if (pos < html.length && html.slice(pos).trim())
        tokens.push({ type: 'text', content: html.slice(pos) })
      break
    }

    if (tagStart > pos) {
      const textContent = html.slice(pos, tagStart)
      if (textContent.trim())
        tokens.push({ type: 'text', content: textContent })
    }

    const tagEnd = html.indexOf('>', tagStart)
    if (tagEnd === -1)
      break

    const tagContent = html.slice(tagStart + 1, tagEnd).trim()
    const isClosingTag = tagContent.startsWith('/')
    const isSelfClosing = tagContent.endsWith('/')

    if (isClosingTag) {
      tokens.push({ type: 'tag_close', tagName: tagContent.slice(1).trim() })
    }
    else {
      const spaceIndex = tagContent.indexOf(' ')
      let tagName: string
      let attrsStr = ''

      if (spaceIndex === -1) {
        tagName = isSelfClosing ? tagContent.slice(0, -1).trim() : tagContent.trim()
      }
      else {
        tagName = tagContent.slice(0, spaceIndex).trim()
        attrsStr = tagContent.slice(spaceIndex + 1)
      }

      const attrs: Record<string, string> = {}
      if (attrsStr) {
        const attrRegex = /([^\s=]+)(?:=(?:"([^"]*)"|'([^']*)'|(\S*)))?/g
        let attrMatch: RegExpExecArray | null
        while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
          const name = attrMatch[1]
          const value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? ''
          if (name && !name.endsWith('/'))
            attrs[name] = value
        }
      }

      tokens.push({
        type: isSelfClosing || VOID_ELEMENTS.has(tagName.toLowerCase()) ? 'self_closing' : 'tag_open',
        tagName,
        attrs,
      })
    }

    pos = tagEnd + 1
  }

  return tokens
}

function sanitizeAttrs(attrs: Record<string, string>) {
  const clean: Record<string, string> = {}
  for (const [key, value] of Object.entries(attrs)) {
    const lowerKey = key.toLowerCase()
    if (DANGEROUS_ATTRS.has(lowerKey))
      continue
    if (URL_ATTRS.has(lowerKey) && value && isUnsafeUrl(value))
      continue
    clean[key] = value
  }
  return clean
}

function isCustomComponent(
  tagName: string,
  customComponents: Record<string, ComponentType<any>>,
) {
  const lowerTag = tagName.toLowerCase()
  if (STANDARD_HTML_TAGS.has(lowerTag))
    return false
  return Object.prototype.hasOwnProperty.call(customComponents, lowerTag)
    || Object.prototype.hasOwnProperty.call(customComponents, tagName)
}

export function parseHtmlToReactNodes(
  content: string,
  customComponents: Record<string, ComponentType<any>>,
): ReactNode[] | null {
  if (!content)
    return []

  try {
    const tokens = tokenizeHtml(content)
    let autoKeySeed = 0
    const stack: Array<{ tagName: string, children: ReactNode[], attrs?: Record<string, string>, blocked?: boolean }> = []
    const rootNodes: ReactNode[] = []

    for (const token of tokens) {
      if (token.type === 'text') {
        if (stack.length > 0 && stack[stack.length - 1].blocked)
          continue
        const target = stack.length > 0 ? stack[stack.length - 1].children : rootNodes
        target.push(token.content ?? '')
        continue
      }

      if (token.type === 'self_closing') {
        if (BLOCKED_TAGS.has(token.tagName.toLowerCase()))
          continue
        const attrs = sanitizeAttrs(token.attrs || {})
        const explicitKey = (attrs as any).key
        const elementKey = explicitKey != null && explicitKey !== '' ? explicitKey : `ms-html-${autoKeySeed++}`
        const Comp = isCustomComponent(token.tagName, customComponents)
          ? (customComponents[token.tagName] || customComponents[token.tagName.toLowerCase()])
          : undefined
        const target = stack.length > 0 ? stack[stack.length - 1].children : rootNodes
        if (Comp) {
          target.push(React.createElement(Comp, { ...attrs, key: elementKey }))
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
        stack.push({
          tagName: token.tagName,
          children: [],
          attrs: token.attrs,
          blocked: BLOCKED_TAGS.has(token.tagName.toLowerCase()),
        })
        continue
      }

      const opening = stack.pop()
      if (!opening || opening.blocked)
        continue

      const attrs = sanitizeAttrs(opening.attrs || {})
      const explicitKey = (attrs as any).key
      const elementKey = explicitKey != null && explicitKey !== '' ? explicitKey : `ms-html-${autoKeySeed++}`
      const Comp = isCustomComponent(opening.tagName, customComponents)
        ? (customComponents[opening.tagName] || customComponents[opening.tagName.toLowerCase()])
        : undefined
      const element = Comp
        ? React.createElement(Comp, { ...attrs, key: elementKey }, ...opening.children)
        : React.createElement(opening.tagName, {
            ...normalizeDomAttrs(attrs),
            key: elementKey,
            suppressHydrationWarning: true,
          }, ...opening.children)

      if (stack.length > 0)
        stack[stack.length - 1].children.push(element)
      else
        rootNodes.push(element)
    }

    while (stack.length > 0) {
      const unclosed = stack.pop()
      if (!unclosed || unclosed.blocked)
        continue
      const attrs = sanitizeAttrs(unclosed.attrs || {})
      const explicitKey = (attrs as any).key
      const elementKey = explicitKey != null && explicitKey !== '' ? explicitKey : `ms-html-${autoKeySeed++}`
      const Comp = isCustomComponent(unclosed.tagName, customComponents)
        ? (customComponents[unclosed.tagName] || customComponents[unclosed.tagName.toLowerCase()])
        : undefined
      const element = Comp
        ? React.createElement(Comp, { ...attrs, key: elementKey }, ...unclosed.children)
        : React.createElement(unclosed.tagName, {
            ...normalizeDomAttrs(attrs),
            key: elementKey,
            suppressHydrationWarning: true,
          }, ...unclosed.children)
      rootNodes.push(element)
    }

    return rootNodes
  }
  catch {
    return null
  }
}
