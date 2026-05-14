import { isUnsafeHtmlUrl } from './htmlTags'

const DISALLOWED_STYLE_PATTERNS = [/javascript:/i, /vbscript:/i, /data:text\/html/i, /expression\s*\(/i, /@import/i]
const ALLOWED_SVG_TAGS = new Set([
  'svg',
  'style',
  'g',
  'a',
  'defs',
  'marker',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'title',
  'desc',
  'use',
  'image',
  'lineargradient',
  'radialgradient',
  'stop',
  'clippath',
  'mask',
  'pattern',
])
const URL_LIKE_SVG_ATTRS = new Set([
  'href',
  'xlink:href',
  'src',
  'srcdoc',
  'action',
  'data',
  'formaction',
  'poster',
])
const URL_REFERENCE_SVG_ATTRS = new Set([
  'clip-path',
  'fill',
  'filter',
  'marker-end',
  'marker-mid',
  'marker-start',
  'mask',
  'stroke',
])
const RENDERABLE_SVG_TAGS = new Set([
  'circle',
  'ellipse',
  'image',
  'line',
  'path',
  'polygon',
  'polyline',
  'rect',
  'text',
  'tspan',
  'use',
])

function hasSafeSvgHref(node: Element) {
  const href = node.getAttribute('href') || node.getAttribute('xlink:href')
  return href?.startsWith('#') === true
}

function hasImageSource(node: Element) {
  return Boolean(node.getAttribute('href') || node.getAttribute('xlink:href') || node.getAttribute('src'))
}

function isRenderableSvgNode(node: Element) {
  const tag = node.nodeName.toLowerCase()

  if (tag === 'use')
    return hasSafeSvgHref(node)

  if (tag === 'image')
    return hasImageSource(node)

  if (tag === 'text' || tag === 'tspan')
    return Boolean(node.textContent?.trim())

  return RENDERABLE_SVG_TAGS.has(tag)
}

function neutralizeScriptProtocols(raw: string) {
  return raw
    .replace(/(["'])\s*javascript:/gi, '$1#')
    .replace(/\bjavascript:/gi, '#')
    .replace(/(["'])\s*vbscript:/gi, '$1#')
    .replace(/\bvbscript:/gi, '#')
    .replace(/\bdata:text\/html/gi, '#')
}

function sanitizeSvgUrl(tagName: string, attrName: string, value: string | null | undefined) {
  const tag = tagName.toLowerCase()
  const attr = attrName.toLowerCase()
  const url = String(value ?? '').trim()
  if (!url)
    return ''

  if ((tag === 'use' || tag === 'marker' || tag === 'clippath' || tag === 'mask') && (attr === 'href' || attr === 'xlink:href'))
    return url.startsWith('#') ? url : ''

  if (tag === 'a' && (attr === 'href' || attr === 'xlink:href'))
    return isUnsafeHtmlUrl(url, { tagName: 'a', attrName: 'href' }) ? '' : url

  if (tag === 'image' && (attr === 'href' || attr === 'xlink:href' || attr === 'src'))
    return isUnsafeHtmlUrl(url, { tagName: 'img', attrName: 'src' }) ? '' : url

  if (attr === 'href' || attr === 'xlink:href')
    return url.startsWith('#') ? url : ''

  return isUnsafeHtmlUrl(url, { tagName: tag, attrName: attr }) ? '' : url
}

function readCssUrl(value: string, start: number) {
  let pos = start + 4
  while (pos < value.length && /\s/.test(value[pos] ?? ''))
    pos++

  const quote = value[pos]
  if (quote === '"' || quote === '\'') {
    const urlStart = pos + 1
    const urlEnd = value.indexOf(quote, urlStart)
    if (urlEnd === -1)
      return { next: value.length, url: '' }
    pos = urlEnd + 1
    while (pos < value.length && /\s/.test(value[pos] ?? ''))
      pos++
    return {
      next: pos < value.length && value[pos] === ')' ? pos + 1 : pos,
      url: value.slice(urlStart, urlEnd),
    }
  }

  const urlStart = pos
  while (pos < value.length && value[pos] !== ')')
    pos++
  return {
    next: pos < value.length ? pos + 1 : pos,
    url: value.slice(urlStart, pos),
  }
}

function hasUnsafeCssUrl(value: string) {
  const lower = value.toLowerCase()
  let pos = 0
  while (pos < lower.length) {
    const start = lower.indexOf('url(', pos)
    if (start === -1)
      return false
    const cssUrl = readCssUrl(value, start)
    pos = Math.max(cssUrl.next, start + 4)
    const rawUrl = cssUrl.url.trim()
    if (!rawUrl.startsWith('#'))
      return true
  }
  return false
}

function hasUnsafeStyle(value: string) {
  return DISALLOWED_STYLE_PATTERNS.some(re => re.test(value)) || hasUnsafeCssUrl(value)
}

function hardenSvgAnchorAttrs(node: Element) {
  if (node.tagName.toLowerCase() !== 'a')
    return

  const target = node.getAttribute('target')?.trim().toLowerCase()
  if (target !== '_blank')
    return

  const relTokens = new Set(
    String(node.getAttribute('rel') ?? '')
      .split(/\s+/)
      .map(token => token.trim())
      .filter(Boolean)
      .filter(token => token.toLowerCase() !== 'opener'),
  )
  relTokens.add('noopener')
  relTokens.add('noreferrer')
  node.setAttribute('rel', Array.from(relTokens).join(' '))
}

function scrubSvgElement(svgEl: SVGElement) {
  const nodes = [svgEl, ...Array.from(svgEl.querySelectorAll<Element>('*'))]
  for (const node of nodes) {
    const tag = node.tagName.toLowerCase()
    if (!ALLOWED_SVG_TAGS.has(tag)) {
      node.remove()
      continue
    }

    if (tag === 'style') {
      if (hasUnsafeStyle(node.textContent ?? '')) {
        node.remove()
        continue
      }
    }

    const attrs = Array.from(node.attributes)
    for (const attr of attrs) {
      const name = attr.name.toLowerCase()
      if (/^on/i.test(name)) {
        node.removeAttribute(attr.name)
        continue
      }

      if (name === 'style' && attr.value) {
        if (hasUnsafeStyle(attr.value)) {
          node.removeAttribute(attr.name)
          continue
        }
      }

      if (name === 'srcdoc') {
        node.removeAttribute(attr.name)
        continue
      }

      if (URL_LIKE_SVG_ATTRS.has(name) && attr.value) {
        const safe = sanitizeSvgUrl(tag, name, attr.value)
        if (!safe) {
          node.removeAttribute(attr.name)
          continue
        }
        if (safe !== attr.value)
          node.setAttribute(attr.name, safe)
        continue
      }

      if (URL_REFERENCE_SVG_ATTRS.has(name) && attr.value && hasUnsafeCssUrl(attr.value)) {
        node.removeAttribute(attr.name)
        continue
      }

      if (attr.value) {
        const neutralized = neutralizeScriptProtocols(attr.value)
        if (neutralized !== attr.value)
          node.setAttribute(attr.name, neutralized)
      }
    }

    hardenSvgAnchorAttrs(node)
  }
}

/**
 * Sanitizes Mermaid SVG with DOMParser and returns a detached SVG element.
 * Returns null in non-DOM runtimes such as plain Node.js.
 */
export function toSafeSvgElement<TElement = unknown>(svg: string | null | undefined): TElement | null {
  if (typeof DOMParser === 'undefined')
    return null
  if (!svg)
    return null
  try {
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const svgEl = parsed.documentElement
    if (!svgEl || svgEl.nodeName.toLowerCase() !== 'svg')
      return null
    const svgElement = svgEl as unknown as SVGElement
    scrubSvgElement(svgElement)
    if (isBrokenMermaidSvgElement(svgElement))
      return null
    return svgElement as unknown as TElement
  }
  catch {
    return null
  }
}

/**
 * Sanitizes Mermaid SVG with DOMParser.
 * Returns null in non-DOM runtimes such as plain Node.js.
 */
export function sanitizeMermaidSvg(svg: string | null | undefined): string | null {
  return toSafeSvgElement<SVGElement>(svg)?.outerHTML ?? null
}

/**
 * Sanitizes Mermaid SVG with DOMParser.
 * Returns an empty string in non-DOM runtimes such as plain Node.js.
 */
export function toSafeMermaidSvgMarkup(svg: string | null | undefined) {
  return sanitizeMermaidSvg(svg) ?? ''
}

export function isBrokenMermaidSvg(svg: string | null | undefined) {
  if (!svg)
    return true
  if (typeof DOMParser === 'undefined')
    return true

  try {
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const svgEl = parsed.documentElement
    if (!svgEl || svgEl.nodeName.toLowerCase() !== 'svg')
      return true

    return isBrokenMermaidSvgElement(svgEl)
  }
  catch {
    return true
  }
}

function isBrokenMermaidSvgElement(svgEl: Element) {
  const viewBox = svgEl.getAttribute('viewBox')
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/)
    if (parts.length === 4) {
      const width = Number.parseFloat(parts[2] || '')
      const height = Number.parseFloat(parts[3] || '')
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
        return true
    }
  }

  const nodes = [svgEl, ...Array.from(svgEl.querySelectorAll('*'))]
  let hasRenderableNode = false
  for (const node of nodes) {
    if (isRenderableSvgNode(node))
      hasRenderableNode = true
    for (const attr of Array.from(node.attributes)) {
      if (/\bNaN\b/i.test(attr.value))
        return true
      if (attr.name === 'style' && /max-width:\s*0(?:px)?/i.test(attr.value))
        return true
    }
  }

  return !hasRenderableNode
}
