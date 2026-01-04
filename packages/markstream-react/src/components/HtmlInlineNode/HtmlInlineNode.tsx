import type { ComponentType } from 'react'
import type { NodeComponentProps } from '../../types/node-component'
import React, { useEffect, useRef, useState } from 'react'
import { getCustomNodeComponents } from '../../customComponents'

// HTML Parser Token type
interface HtmlToken {
  type: 'text' | 'tag_open' | 'tag_close' | 'self_closing'
  tagName?: string
  attrs?: Record<string, string>
  content?: string
}

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
  'ontouchstart',
  'ontouchend',
  'ontouchmove',
  'ontouchcancel',
  'onwheel',
  'onscroll',
  'oncopy',
  'oncut',
  'onpaste',
  'oninput',
  'oninvalid',
  'onreset',
  'onsearch',
  'onsubmit',
])

const BLOCKED_TAGS = new Set(['script'])

const URL_ATTRS = new Set([
  'href',
  'src',
  'srcset',
  'xlink:href',
  'formaction',
])

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

// Standard HTML void elements (self-closing)
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

// Standard HTML tags that should NOT be treated as custom components
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

/**
 * Check if a tag name is a custom React component
 */
function isCustomComponent(
  tagName: string,
  customComponents: Record<string, ComponentType<any>>,
): boolean {
  const lowerTag = tagName.toLowerCase()

  // Fast path: check if it's a standard HTML tag
  if (STANDARD_HTML_TAGS.has(lowerTag))
    return false

  // Check if it's registered in custom components (case-insensitive)
  return Object.prototype.hasOwnProperty.call(customComponents, lowerTag)
    || Object.prototype.hasOwnProperty.call(customComponents, tagName)
}

/**
 * Sanitize attributes to remove XSS-prone event handlers
 */
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

/**
 * Convert attribute value to appropriate type
 */
function convertPropValue(value: string, key: string): any {
  const lowerKey = key.toLowerCase()

  // Boolean attributes - HTML5 spec
  if (['checked', 'disabled', 'readonly', 'required', 'autofocus', 'multiple', 'hidden'].includes(lowerKey))
    return value === 'true' || value === '' || value === key

  // Numeric attributes
  if (['value', 'min', 'max', 'step', 'width', 'height', 'size', 'maxlength'].includes(lowerKey)) {
    const num = Number(value)
    if (value !== '' && !Number.isNaN(num))
      return num
  }

  return value
}

/**
 * Convert all attribute values to appropriate types
 */
function convertAttrsToProps(attrs: Record<string, string>): Record<string, any> {
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(attrs))
    result[key] = convertPropValue(value, key)
  return result
}

/**
 * Check if text content is meaningful (not just whitespace)
 */
function isMeaningfulText(text: string): boolean {
  return text.trim().length > 0
}

/**
 * Simple HTML tokenizer
 */
function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = []
  let pos = 0

  while (pos < html.length) {
    // Skip HTML comments
    if (html.startsWith('<!--', pos)) {
      const commentEnd = html.indexOf('-->', pos)
      if (commentEnd !== -1) {
        pos = commentEnd + 3
        continue
      }
      // Unclosed comment, treat rest as text
      break
    }

    // Find next tag
    const tagStart = html.indexOf('<', pos)

    if (tagStart === -1) {
      // No more tags, add remaining text if meaningful
      if (pos < html.length) {
        const remainingText = html.slice(pos)
        if (isMeaningfulText(remainingText))
          tokens.push({ type: 'text', content: remainingText })
      }
      break
    }

    // Handle text content before this tag
    if (tagStart > pos) {
      const textContent = html.slice(pos, tagStart)
      if (isMeaningfulText(textContent))
        tokens.push({ type: 'text', content: textContent })
    }

    // Handle CDATA sections
    if (html.startsWith('![CDATA[', tagStart + 1)) {
      const cdataEnd = html.indexOf(']]>', tagStart)
      if (cdataEnd !== -1) {
        tokens.push({ type: 'text', content: html.slice(tagStart, cdataEnd + 3) })
        pos = cdataEnd + 3
        continue
      }
      // Unclosed CDATA, treat rest as text
      break
    }

    // Handle DOCTYPE and other special declarations
    if (html.startsWith('!', tagStart + 1)) {
      const specialEnd = html.indexOf('>', tagStart)
      if (specialEnd !== -1) {
        pos = specialEnd + 1
        continue
      }
      break
    }

    // Parse tag
    const tagEnd = html.indexOf('>', tagStart)
    if (tagEnd === -1)
      break // Invalid HTML, abort

    const tagContent = html.slice(tagStart + 1, tagEnd).trim()
    const isClosingTag = tagContent.startsWith('/')
    const isSelfClosing = tagContent.endsWith('/')

    if (isClosingTag) {
      const tagName = tagContent.slice(1).trim()
      tokens.push({ type: 'tag_close', tagName })
    }
    else {
      // Extract tag name and attributes
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

      // Parse attributes with better regex
      const attrs: Record<string, string> = {}
      if (attrsStr) {
        const attrRegex = /([^\s=]+)(?:=(?:"([^"]*)"|'([^']*)'|(\S*)))?/g
        let attrMatch: RegExpExecArray | null
        while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
          const name = attrMatch[1]
          // Try double quotes, then single quotes, then unquoted
          const value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? ''
          // Filter out trailing slash from self-closing syntax
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

/**
 * Build React element tree from tokens
 */
function buildReactElementTree(
  tokens: HtmlToken[],
  customComponents: Record<string, ComponentType<any>>,
): React.ReactNode[] {
  let autoKeySeed = 0
  const stack: Array<{ tagName: string, children: React.ReactNode[], attrs?: Record<string, string> }> = []
  const rootNodes: React.ReactNode[] = []

  for (const token of tokens) {
    if (token.type === 'text') {
      const target = stack.length > 0 ? stack[stack.length - 1].children : rootNodes
      target.push(token.content!)
    }
    else if (token.type === 'self_closing') {
      const element = createReactElement(token.tagName!, token.attrs || {}, [], customComponents, `ms-html-${autoKeySeed++}`)
      const target = stack.length > 0 ? stack[stack.length - 1].children : rootNodes
      element != null && target.push(element)
    }
    else if (token.type === 'tag_open') {
      stack.push({ tagName: token.tagName!, children: [], attrs: token.attrs })
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
          const element = createReactElement(opening.tagName, opening.attrs || {}, opening.children, customComponents, `ms-html-${autoKeySeed++}`)

          if (stack.length > 0)
            element != null && stack[stack.length - 1].children.push(element)
          else
            element != null && rootNodes.push(element)

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
    const element = createReactElement(unclosed.tagName, unclosed.attrs || {}, unclosed.children, customComponents, `ms-html-${autoKeySeed++}`)
    element != null && rootNodes.push(element)
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
): React.ReactNode {
  if (BLOCKED_TAGS.has(tagName.toLowerCase()))
    return null

  const sanitizedAttrs = sanitizeAttrs(attrs)
  const explicitKey = (sanitizedAttrs as any).key
  const elementKey = explicitKey != null && explicitKey !== '' ? explicitKey : autoKey

  if (isCustomComponent(tagName, customComponents)) {
    // It's a custom React component
    const component = customComponents[tagName] || customComponents[tagName.toLowerCase()]
    const convertedAttrs = convertAttrsToProps(sanitizedAttrs)
    return React.createElement(component as ComponentType<any>, { ...convertedAttrs, key: elementKey }, ...children)
  }
  else {
    // It's a standard HTML element
    return React.createElement(tagName, { ...normalizeDomAttrs(sanitizedAttrs), key: elementKey }, ...children)
  }
}

/**
 * Check if HTML content contains custom components
 */
function hasCustomComponents(
  content: string,
  customComponents: Record<string, ComponentType<any>>,
): boolean {
  // Fast path: check for any non-standard tags
  const tagRegex = /<([a-z][a-z0-9-]*)\b[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = tagRegex.exec(content)) !== null) {
    if (isCustomComponent(match[1], customComponents))
      return true
  }
  return false
}

/**
 * Parse HTML content to React elements
 */
function parseHtmlToReactNodes(
  content: string,
  customComponents: Record<string, ComponentType<any>>,
): React.ReactNode[] | null {
  if (!content)
    return []

  try {
    const tokens = tokenizeHtml(content)
    const nodes = buildReactElementTree(tokens, customComponents)
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
  loading?: boolean
  autoClosed?: boolean
}>) {
  const { node, customId } = props
  const containerRef = useRef<HTMLSpanElement>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  // Get custom components from global registry
  const customComponents = getCustomNodeComponents(customId)

  // Computed property to determine render mode and content
  const renderMode = React.useMemo(() => {
    const content = node.content
    if (!content)
      return { mode: 'html', content: '' }

    // Check if content contains custom components
    if (!hasCustomComponents(content, customComponents))
      return { mode: 'html', content }

    // Parse and build React element tree
    const nodes = parseHtmlToReactNodes(content, customComponents)
    if (nodes === null)
      return { mode: 'html', content } // Fallback to dangerouslySetInnerHTML if parsing fails

    return { mode: 'dynamic', nodes }
  }, [node.content, customComponents])

  // Use DOM manipulation for pure HTML (mode: 'html')
  useEffect(() => {
    if (!isClient || !containerRef.current || renderMode.mode !== 'html')
      return

    const host = containerRef.current
    host.innerHTML = ''
    const template = document.createElement('template')
    template.innerHTML = node.content ?? ''
    host.appendChild(template.content.cloneNode(true))
  }, [node.content, renderMode.mode, isClient])

  // Loading state handling
  if (node.loading && !node.autoClosed) {
    return (
      <span className="html-inline-node html-inline-node--loading">
        {node.content}
      </span>
    )
  }

  // Dynamic rendering for custom components
  if (renderMode.mode === 'dynamic') {
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
