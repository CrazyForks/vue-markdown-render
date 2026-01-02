import type { NodeComponentProps } from '../../types/node-component'
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useViewportPriority } from '../../context/viewportPriority'
import { getCustomComponentsRevision, getCustomNodeComponents, subscribeCustomComponents } from '../../customComponents'
import { tokenAttrsToProps } from '../../renderers/renderChildren'

// Dangerous attributes that should be filtered out for XSS protection
const DANGEROUS_ATTRS = new Set([
  'onclick',
  'onerror',
  'onload',
  'onmouseover',
  'onmouseout',
  'onmousedown',
  'onmouseup',
  'onkeydown',
  'onkeyup',
  'onfocus',
  'onblur',
  'onsubmit',
  'onreset',
  'onchange',
  'onselect',
  'ondblclick',
])

const BLOCKED_TAGS = new Set(['script'])

const URL_ATTRS = new Set([
  'href',
  'src',
  'srcset',
  'xlink:href',
  'formaction',
])

function stripControlAndWhitespace(value: string): string {
  let out = ''
  for (const ch of value) {
    const code = ch.charCodeAt(0)
    if (code <= 0x1F || code === 0x7F)
      continue
    if (/\s/u.test(ch))
      continue
    out += ch
  }
  return out
}

function isUnsafeUrl(value: string): boolean {
  const normalized = stripControlAndWhitespace(value).toLowerCase()

  if (normalized.startsWith('javascript:') || normalized.startsWith('vbscript:'))
    return true

  if (normalized.startsWith('data:')) {
    return !(
      normalized.startsWith('data:image/')
      || normalized.startsWith('data:video/')
      || normalized.startsWith('data:audio/')
    )
  }

  return false
}

// Standard HTML tags
const STANDARD_HTML_TAGS = new Set([
  'a',
  'abbr',
  'address',
  'area',
  'article',
  'aside',
  'audio',
  'b',
  'base',
  'bdi',
  'bdo',
  'blockquote',
  'body',
  'br',
  'button',
  'canvas',
  'caption',
  'cite',
  'code',
  'col',
  'colgroup',
  'data',
  'datalist',
  'dd',
  'del',
  'details',
  'dfn',
  'dialog',
  'div',
  'dl',
  'dt',
  'em',
  'embed',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hgroup',
  'hr',
  'html',
  'i',
  'iframe',
  'img',
  'input',
  'ins',
  'kbd',
  'label',
  'legend',
  'li',
  'link',
  'main',
  'map',
  'mark',
  'menu',
  'meta',
  'meter',
  'nav',
  'noscript',
  'object',
  'ol',
  'optgroup',
  'option',
  'output',
  'p',
  'param',
  'picture',
  'pre',
  'progress',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'script',
  'section',
  'select',
  'small',
  'source',
  'span',
  'strong',
  'style',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'template',
  'textarea',
  'tfoot',
  'th',
  'thead',
  'time',
  'title',
  'tr',
  'track',
  'u',
  'ul',
  'var',
  'video',
  'wbr',
])

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

function normalizeCssPropName(prop: string): string {
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

function normalizeDomAttrs(attrs: Record<string, string>): Record<string, any> {
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

type HtmlToken
  = | { type: 'text', content?: string }
    | { type: 'tag_open', tagName: string, attrs?: Record<string, string> }
    | { type: 'tag_close', tagName: string }
    | { type: 'self_closing', tagName: string, attrs?: Record<string, string> }

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
      if (pos < html.length && html.slice(pos).trim()) {
        tokens.push({ type: 'text', content: html.slice(pos) })
      }
      break
    }

    if (tagStart > pos) {
      const textContent = html.slice(pos, tagStart)
      if (textContent.trim()) {
        tokens.push({ type: 'text', content: textContent })
      }
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

function sanitizeAttrs(attrs: Record<string, string>): Record<string, string> {
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
  customComponents: Record<string, React.ComponentType<any>>,
): boolean {
  const lowerTag = tagName.toLowerCase()
  if (STANDARD_HTML_TAGS.has(lowerTag))
    return false
  return Object.prototype.hasOwnProperty.call(customComponents, lowerTag)
    || Object.prototype.hasOwnProperty.call(customComponents, tagName)
}

function parseHtmlToReactNodes(
  content: string,
  customComponents: Record<string, React.ComponentType<any>>,
): React.ReactNode[] | null {
  if (!content)
    return []

  try {
    const tokens = tokenizeHtml(content)
    const stack: Array<{ tagName: string, children: React.ReactNode[], attrs?: Record<string, string>, blocked?: boolean }> = []
    const rootNodes: React.ReactNode[] = []

    for (const token of tokens) {
      if (token.type === 'text') {
        if (stack.length > 0 && stack[stack.length - 1].blocked)
          continue
        const target = stack.length > 0 ? stack[stack.length - 1].children : rootNodes
        target.push(token.content!)
      }
      else if (token.type === 'self_closing') {
        if (BLOCKED_TAGS.has(token.tagName!.toLowerCase()))
          continue
        const attrs = sanitizeAttrs(token.attrs || {})
        const Comp = isCustomComponent(token.tagName, customComponents)
          ? (customComponents[token.tagName] || customComponents[token.tagName.toLowerCase()])
          : undefined
        if (Comp) {
          const target = stack.length > 0 ? stack[stack.length - 1].children : rootNodes
          target.push(React.createElement(Comp, attrs))
        }
        else {
          const target = stack.length > 0 ? stack[stack.length - 1].children : rootNodes
          target.push(React.createElement(token.tagName, {
            ...normalizeDomAttrs(attrs),
            suppressHydrationWarning: true,
          }))
        }
      }
      else if (token.type === 'tag_open') {
        stack.push({
          tagName: token.tagName,
          children: [],
          attrs: token.attrs,
          blocked: BLOCKED_TAGS.has(token.tagName.toLowerCase()),
        })
      }
      else if (token.type === 'tag_close') {
        const opening = stack.pop()
        if (opening) {
          if (opening.blocked)
            continue
          const attrs = sanitizeAttrs(opening.attrs || {})
          const Comp = isCustomComponent(opening.tagName, customComponents)
            ? (customComponents[opening.tagName] || customComponents[opening.tagName.toLowerCase()])
            : undefined
          const element = Comp
            ? React.createElement(Comp, attrs, ...opening.children)
            : React.createElement(opening.tagName, {
                ...normalizeDomAttrs(attrs),
                suppressHydrationWarning: true,
              }, ...opening.children)

          if (stack.length > 0)
            stack[stack.length - 1].children.push(element)
          else
            rootNodes.push(element)
        }
      }
    }

    while (stack.length > 0) {
      const unclosed = stack.pop()!
      if (unclosed.blocked)
        continue
      const attrs = sanitizeAttrs(unclosed.attrs || {})
      const Comp = isCustomComponent(unclosed.tagName, customComponents)
        ? (customComponents[unclosed.tagName] || customComponents[unclosed.tagName.toLowerCase()])
        : undefined
      const element = Comp
        ? React.createElement(Comp, attrs, ...unclosed.children)
        : React.createElement(unclosed.tagName, {
            ...normalizeDomAttrs(attrs),
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

function hasCustomComponents(
  content: string,
  customComponents: Record<string, React.ComponentType<any>>,
): boolean {
  const tagRegex = /<([a-z][a-z0-9-]*)\b[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = tagRegex.exec(content)) !== null) {
    const tagName = match[1]
    if (isCustomComponent(tagName, customComponents))
      return true
  }
  return false
}

export function HtmlBlockNode(props: NodeComponentProps<{
  type: 'html_block'
  content: string
  attrs?: [string, string | null][] | null
  loading?: boolean
}> & {
  customComponents?: Record<string, React.ComponentType<any>>
  placeholder?: React.ReactNode
}) {
  const { node, placeholder, customId } = props
  const registerViewport = useViewportPriority()
  const [hostEl, setHostEl] = useState<HTMLElement | null>(null)
  const handleRef = useRef<ReturnType<typeof registerViewport> | null>(null)
  const [shouldRender, setShouldRender] = useState(() => typeof window === 'undefined')
  const [renderContent, setRenderContent] = useState(node.content)
  const isDeferred = Boolean(node.loading)

  const customComponentsRevision = useSyncExternalStore(
    subscribeCustomComponents,
    getCustomComponentsRevision,
    getCustomComponentsRevision,
  )

  const effectiveCustomComponents = useMemo(() => {
    // Allow explicit injection (primarily for tests), otherwise fall back to global store.
    return props.customComponents ?? getCustomNodeComponents(customId)
  }, [customId, props.customComponents, customComponentsRevision])

  useEffect(() => {
    if (typeof window === 'undefined') {
      setShouldRender(true)
      return
    }
    handleRef.current?.destroy()
    handleRef.current = null
    if (!isDeferred) {
      setShouldRender(true)
      setRenderContent(node.content)
      return
    }
    if (!hostEl) {
      setShouldRender(false)
      return
    }
    const handle = registerViewport(hostEl, { rootMargin: '400px' })
    handleRef.current = handle
    if (handle.isVisible())
      setShouldRender(true)
    handle.whenVisible.then(() => setShouldRender(true)).catch(() => {})
    return () => {
      handle.destroy()
      handleRef.current = null
    }
  }, [hostEl, isDeferred, node.content, registerViewport])

  useEffect(() => () => {
    handleRef.current?.destroy()
    handleRef.current = null
  }, [])

  useEffect(() => {
    if (!isDeferred || shouldRender)
      setRenderContent(node.content)
  }, [isDeferred, node.content, shouldRender])

  const boundAttrs = useMemo(() => tokenAttrsToProps(node.attrs ?? undefined), [node.attrs])

  // Check if we should use dynamic rendering
  const useDynamic = useMemo(() => {
    return hasCustomComponents(node.content ?? '', effectiveCustomComponents)
  }, [effectiveCustomComponents, node.content])

  const reactNodes = useMemo(() => {
    if (!useDynamic || !node.content)
      return null
    return parseHtmlToReactNodes(node.content, effectiveCustomComponents)
  }, [effectiveCustomComponents, node.content, useDynamic])

  return (
    <div ref={setHostEl} className="html-block-node" {...(boundAttrs as any)}>
      {shouldRender
        ? (
            useDynamic && reactNodes
              ? (
                  <>{reactNodes}</>
                )
              : (
                  <div dangerouslySetInnerHTML={{ __html: renderContent ?? '' }} />
                )
          )
        : (
            <div className="html-block-node__placeholder">
              {placeholder ?? (
                <>
                  <span className="html-block-node__placeholder-bar" />
                  <span className="html-block-node__placeholder-bar w-4/5" />
                  <span className="html-block-node__placeholder-bar w-2/3" />
                </>
              )}
            </div>
          )}
    </div>
  )
}

export default HtmlBlockNode
