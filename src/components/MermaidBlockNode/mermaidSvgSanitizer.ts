import { isUnsafeHtmlUrl } from 'stream-markdown-parser'

const DISALLOWED_STYLE_PATTERNS = [/javascript:/i, /vbscript:/i, /data:text\/html/i, /expression\s*\(/i, /url\s*\(\s*javascript:/i, /@import/i]
const ALLOWED_SVG_TAGS = new Set([
  'svg',
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

function neutralizeScriptProtocols(raw: string) {
  return raw
    .replace(/(["'])\s*javascript:/gi, '$1#')
    .replace(/\bjavascript:/gi, '#')
    .replace(/(["'])\s*vbscript:/gi, '$1#')
    .replace(/\bvbscript:/gi, '#')
    .replace(/\bdata:text\/html/gi, '#')
}

function sanitizeUrl(value: string | null | undefined) {
  const url = String(value ?? '').trim()
  if (!url)
    return ''
  return isUnsafeHtmlUrl(url, { tagName: 'svg', attrName: 'href' }) ? '' : url
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
    if (rawUrl.startsWith('#'))
      continue
    if (!rawUrl || !sanitizeUrl(rawUrl))
      return true
  }
  return false
}

function hasUnsafeStyle(value: string) {
  return DISALLOWED_STYLE_PATTERNS.some(re => re.test(value)) || hasUnsafeCssUrl(value)
}

function scrubSvgElement(svgEl: SVGElement) {
  const nodes = [svgEl, ...Array.from(svgEl.querySelectorAll<Element>('*'))]
  for (const node of nodes) {
    const tag = node.tagName.toLowerCase()
    if (!ALLOWED_SVG_TAGS.has(tag)) {
      node.remove()
      continue
    }

    if (tag === 'style' && hasUnsafeStyle(node.textContent ?? '')) {
      node.remove()
      continue
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
        const safe = sanitizeUrl(attr.value)
        if (!safe) {
          node.removeAttribute(attr.name)
          continue
        }
        if (safe !== attr.value)
          node.setAttribute(attr.name, safe)
        continue
      }

      if (attr.value) {
        const neutralized = neutralizeScriptProtocols(attr.value)
        if (neutralized !== attr.value)
          node.setAttribute(attr.name, neutralized)
      }
    }
  }
}

export function toSafeSvgElement(svg: string | null | undefined): SVGElement | null {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined')
    return null
  if (!svg)
    return null
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const svgEl = parsed.documentElement
  if (!svgEl || svgEl.nodeName.toLowerCase() !== 'svg')
    return null
  const svgElement = svgEl as unknown as SVGElement
  scrubSvgElement(svgElement)
  if (isBrokenMermaidSvg(svgElement.outerHTML))
    return null
  return svgElement
}

export function sanitizeMermaidSvg(svg: string | null | undefined): string | null {
  return toSafeSvgElement(svg)?.outerHTML ?? null
}

export function isBrokenMermaidSvg(svg: string | null | undefined) {
  if (!svg || typeof DOMParser === 'undefined')
    return !svg

  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const svgEl = parsed.documentElement
  if (!svgEl || svgEl.nodeName.toLowerCase() !== 'svg')
    return true

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
    if (RENDERABLE_SVG_TAGS.has(node.nodeName.toLowerCase()))
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
