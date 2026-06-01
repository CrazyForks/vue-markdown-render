export interface NormalizedScrollTopOptions {
  isReverseFlexScrollRoot: (root: HTMLElement) => boolean
  getNormalizedScrollTop: (
    root: HTMLElement,
    doc: Document,
    isViewportRoot: boolean,
  ) => number
  epsilonPx?: number
}

function getElementScrollMax(root: HTMLElement) {
  return Math.max(
    0,
    Math.ceil(root.scrollHeight || 0) - Math.ceil(root.clientHeight || 0),
  )
}

function clampScrollTop(value: number, max: number) {
  if (!Number.isFinite(value))
    return 0

  return Math.min(Math.max(0, value), max)
}

/**
 * Write a normalized top-origin scroll position to a normal or reverse-flex
 * element scroll root.
 *
 * For reverse-flex roots, browsers may expose either negative scrollTop
 * or positive distance-from-bottom. Try both models and keep the one that
 * produces the smallest normalized drift.
 */
export function setNormalizedElementScrollTop(
  root: HTMLElement,
  doc: Document,
  targetNormalized: number,
  options: NormalizedScrollTopOptions,
) {
  const max = getElementScrollMax(root)
  const target = clampScrollTop(targetNormalized, max)

  if (!options.isReverseFlexScrollRoot(root)) {
    root.scrollTop = target
    return
  }

  const distanceFromBottom = Math.max(0, max - target)
  const candidates = [-distanceFromBottom, distanceFromBottom]

  let bestRaw = candidates[0]
  let bestDrift = Number.POSITIVE_INFINITY

  for (const raw of candidates) {
    root.scrollTop = raw

    const normalized = options.getNormalizedScrollTop(root, doc, false)
    const drift = Math.abs(normalized - target)

    if (drift < bestDrift) {
      bestDrift = drift
      bestRaw = raw
    }
  }

  root.scrollTop = bestRaw

  const epsilon = options.epsilonPx ?? 2
  const finalDrift = Math.abs(
    options.getNormalizedScrollTop(root, doc, false) - target,
  )

  if (finalDrift > epsilon)
    root.scrollTop = bestRaw
}
