function readCssPx(value: string | null | undefined) {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function readElementBoxHeight(element: HTMLElement | null | undefined) {
  if (!element)
    return 0

  return Math.ceil(Math.max(
    0,
    element.offsetHeight || 0,
    element.scrollHeight || 0,
    element.getBoundingClientRect?.().height || 0,
  ))
}

export function readElementOuterHeight(element: HTMLElement | null | undefined) {
  const boxHeight = readElementBoxHeight(element)
  if (!element || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function')
    return boxHeight

  const style = window.getComputedStyle(element)
  const marginTop = readCssPx(style.marginTop)
  const marginBottom = readCssPx(style.marginBottom)

  return Math.ceil(Math.max(0, boxHeight + marginTop + marginBottom))
}

export function findMarkstreamRenderer(element: HTMLElement | null | undefined) {
  if (!element)
    return null

  if (element.matches?.('.markstream-vue.markdown-renderer'))
    return element

  return element.querySelector<HTMLElement>('.markstream-vue.markdown-renderer')
}

export function getMarkdownItemChromeHeight(element: HTMLElement | null | undefined) {
  if (!element)
    return 0

  const renderer = findMarkstreamRenderer(element)
  if (!renderer)
    return 0

  const outer = readElementOuterHeight(element)
  const rendererBox = readElementBoxHeight(renderer)

  return Math.max(0, outer - rendererBox)
}
