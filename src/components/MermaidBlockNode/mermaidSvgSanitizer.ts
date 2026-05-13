const DISALLOWED_STYLE_PATTERNS = [/javascript:/i, /expression\s*\(/i, /url\s*\(\s*javascript:/i, /@import/i]
const SAFE_URL_PROTOCOLS = /^(?:https?:|mailto:|tel:|#|\/|data:image\/(?:png|gif|jpe?g|webp);)/i
const RENDERABLE_SVG_TAGS = new Set([
  'circle',
  'ellipse',
  'foreignobject',
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
  if (!value)
    return ''
  const trimmed = value.trim()
  if (SAFE_URL_PROTOCOLS.test(trimmed))
    return trimmed
  return ''
}

function scrubSvgElement(svgEl: SVGElement) {
  const forbiddenTags = new Set(['script'])
  const nodes = [svgEl, ...Array.from(svgEl.querySelectorAll<SVGElement>('*'))]
  for (const node of nodes) {
    if (forbiddenTags.has(node.tagName.toLowerCase())) {
      node.remove()
      continue
    }
    const attrs = Array.from(node.attributes)
    for (const attr of attrs) {
      const name = attr.name
      if (/^on/i.test(name)) {
        node.removeAttribute(name)
        continue
      }
      if (name === 'style' && attr.value) {
        const val = attr.value
        if (DISALLOWED_STYLE_PATTERNS.some(re => re.test(val))) {
          node.removeAttribute(name)
          continue
        }
      }
      if ((name === 'href' || name === 'xlink:href') && attr.value) {
        const safe = sanitizeUrl(attr.value)
        if (!safe) {
          node.removeAttribute(name)
          continue
        }
        if (safe !== attr.value)
          node.setAttribute(name, safe)
      }
    }
  }
}

export function toSafeSvgElement(svg: string | null | undefined): SVGElement | null {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined')
    return null
  if (!svg)
    return null
  const neutralized = neutralizeScriptProtocols(svg)
  const parsed = new DOMParser().parseFromString(neutralized, 'image/svg+xml')
  const svgEl = parsed.documentElement
  if (!svgEl || svgEl.nodeName.toLowerCase() !== 'svg')
    return null
  const svgElement = svgEl as unknown as SVGElement
  scrubSvgElement(svgElement)
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
