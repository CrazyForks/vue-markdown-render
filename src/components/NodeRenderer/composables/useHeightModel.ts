import type { ParsedNode } from 'stream-markdown-parser'
import type { ComputedRef, Ref } from 'vue'
import type { EstimatedNodeHeight } from '../../../internal/heightEstimationExperiment'

const HEIGHT_CACHE_WIDTH_BUCKET_PX = 32

export const UNKNOWN_HEIGHT_CACHE_WIDTH_BUCKET = -1

export interface VirtualHeightSummary {
  totalNodes: number
  measuredCount: number
  estimatedCount: number
  averageNodeHeight: number
  topSpacerHeight: number
  bottomSpacerHeight: number
  estimatedTotalHeight: number
  width: number
}

export interface HeightModelOptions {
  parsedNodes: ComputedRef<ParsedNode[]>
  nodeHeights: Record<number, number>
  heightStats: {
    total: number
    count: number
  }
  heightTreeSize: Ref<number>
  heightSumTree: Ref<number[]>
  heightKnownTree: Ref<number[]>
  averageNodeHeight: ComputedRef<number>
  heightEstimationActive: ComputedRef<boolean>
  estimatedNodeHeights: ComputedRef<readonly (EstimatedNodeHeight | null)[]>
  getContainerWidth: () => number
  getPrefixCacheKeyParts: () => readonly unknown[]
  fenwickRangeSum: (tree: number[], start: number, end: number) => number
}

export interface BuildVirtualHeightSummaryOptions {
  topSpacerHeight: number
  bottomSpacerHeight: number
  width?: number
}

type HeightFallbackNode = ParsedNode & {
  content?: string
  rows?: unknown[]
  children?: unknown[]
  items?: unknown[]
}

export function getHeightCacheWidthBucket(width: unknown) {
  const numeric = Number(width)
  if (!Number.isFinite(numeric) || numeric <= 0)
    return UNKNOWN_HEIGHT_CACHE_WIDTH_BUCKET

  return Math.round(numeric / HEIGHT_CACHE_WIDTH_BUCKET_PX)
}

export function estimateTextFallbackHeight(
  text: string,
  width: number,
  minHeight: number,
  lineHeight = 22,
) {
  const source = String(text ?? '')
  if (!source)
    return minHeight

  const charsPerLine = Math.max(18, Math.floor(Math.max(320, width) / 8))
  const hardLines = source.split(/\r?\n/).length
  const softLines = Math.ceil(source.length / charsPerLine)
  const lines = Math.max(1, hardLines, softLines)

  return Math.max(minHeight, Math.ceil(lines * lineHeight + 12))
}

export function estimateStaticNodeHeightFallback(node: ParsedNode | undefined, width: number) {
  if (!node || typeof node !== 'object')
    return 32

  const fallbackNode = node as HeightFallbackNode
  const type = String(fallbackNode.type ?? '')
  const fallbackWidth = Number.isFinite(width) && width > 0 ? width : 640

  switch (type) {
    case 'heading':
      return 44

    case 'paragraph':
      return estimateTextFallbackHeight(
        String(fallbackNode.raw ?? fallbackNode.content ?? ''),
        fallbackWidth,
        34,
      )

    case 'list': {
      const items = Array.isArray(fallbackNode.items) ? fallbackNode.items.length : 1
      return Math.max(48, items * 30 + 12)
    }

    case 'list_item':
      return estimateTextFallbackHeight(
        String(fallbackNode.raw ?? fallbackNode.content ?? ''),
        fallbackWidth,
        34,
      )

    case 'blockquote':
      return estimateTextFallbackHeight(
        String(fallbackNode.raw ?? fallbackNode.content ?? ''),
        fallbackWidth,
        56,
      )

    case 'table': {
      const rowCount = Array.isArray(fallbackNode.rows)
        ? fallbackNode.rows.length
        : Array.isArray(fallbackNode.children)
          ? fallbackNode.children.length
          : 3
      return Math.max(120, rowCount * 38 + 48)
    }

    case 'code_block':
      return estimateTextFallbackHeight(
        String(fallbackNode.code ?? fallbackNode.raw ?? ''),
        fallbackWidth,
        96,
        20,
      )

    case 'math_block':
      return 72

    case 'image':
      return 220

    case 'admonition':
    case 'vmr_container':
    case 'html_block':
      return estimateTextFallbackHeight(
        String(fallbackNode.raw ?? fallbackNode.content ?? ''),
        fallbackWidth,
        96,
      )

    case 'thematic_break':
      return 24

    default:
      return estimateTextFallbackHeight(
        String(fallbackNode.raw ?? fallbackNode.content ?? ''),
        fallbackWidth,
        40,
      )
  }
}

export function useHeightModel(options: HeightModelOptions) {
  let fallbackHeightPrefixDirty = true
  let fallbackHeightPrefixCache: number[] = [0]
  let fallbackHeightPrefixCacheKey = ''

  function markFallbackHeightPrefixDirty() {
    fallbackHeightPrefixDirty = true
  }

  function getFallbackNodeHeight(index: number) {
    const measured = options.nodeHeights[index]
    if (Number.isFinite(measured) && measured > 0)
      return measured

    const estimated = options.estimatedNodeHeights.value[index]?.height
    if (Number.isFinite(estimated) && estimated > 0)
      return estimated

    return Math.max(
      options.averageNodeHeight.value,
      estimateStaticNodeHeightFallback(
        options.parsedNodes.value[index],
        options.getContainerWidth() || 640,
      ),
    )
  }

  function getFallbackHeightPrefix() {
    const total = options.parsedNodes.value.length
    const key = options.getPrefixCacheKeyParts().join(':')

    if (!fallbackHeightPrefixDirty && fallbackHeightPrefixCacheKey === key)
      return fallbackHeightPrefixCache

    const prefix = new Array<number>(total + 1)
    prefix[0] = 0

    for (let i = 0; i < total; i++) {
      prefix[i + 1] = prefix[i] + (
        options.heightEstimationActive.value
          ? getFallbackNodeHeight(i)
          : (options.nodeHeights[i] ?? options.averageNodeHeight.value)
      )
    }

    fallbackHeightPrefixCache = prefix
    fallbackHeightPrefixCacheKey = key
    fallbackHeightPrefixDirty = false

    return prefix
  }

  function estimateHeightRangeFromPrefix(start: number, end: number) {
    const total = options.parsedNodes.value.length
    const boundedStart = clamp(Math.trunc(start), 0, total)
    const boundedEnd = clamp(Math.trunc(end), boundedStart, total)
    if (boundedStart >= boundedEnd)
      return 0

    const prefix = getFallbackHeightPrefix()
    return (prefix[boundedEnd] ?? 0) - (prefix[boundedStart] ?? 0)
  }

  function estimateIndexForOffsetFromPrefix(offsetPx: number) {
    const nodes = options.parsedNodes.value
    const total = nodes.length
    if (total <= 0)
      return 0
    if (offsetPx <= 0)
      return 0

    const prefix = getFallbackHeightPrefix()
    const totalHeight = prefix[total] ?? 0
    if (offsetPx >= totalHeight)
      return total - 1

    let low = 0
    let high = total - 1
    let answer = total - 1

    while (low <= high) {
      const mid = (low + high) >> 1
      const midEnd = prefix[mid + 1] ?? 0

      if (midEnd >= offsetPx) {
        answer = mid
        high = mid - 1
      }
      else {
        low = mid + 1
      }
    }

    return answer
  }

  function estimateHeightRange(start: number, end: number) {
    if (start >= end)
      return 0
    if (options.heightEstimationActive.value) {
      return estimateHeightRangeFromPrefix(start, end)
    }
    if (options.heightTreeSize.value !== options.parsedNodes.value.length) {
      let total = 0
      for (let i = start; i < end; i++)
        total += options.nodeHeights[i] ?? options.averageNodeHeight.value
      return total
    }
    const sumTree = options.heightSumTree.value
    const countTree = options.heightKnownTree.value
    if (!sumTree.length || !countTree.length) {
      let total = 0
      for (let i = start; i < end; i++)
        total += options.nodeHeights[i] ?? options.averageNodeHeight.value
      return total
    }
    const sumKnown = options.fenwickRangeSum(sumTree, start, end)
    const countKnown = options.fenwickRangeSum(countTree, start, end)
    const unknownCount = (end - start) - countKnown
    return sumKnown + unknownCount * options.averageNodeHeight.value
  }

  function estimateIndexForOffset(offsetPx: number) {
    if (offsetPx <= 0)
      return 0
    const nodes = options.parsedNodes.value
    if (options.heightEstimationActive.value) {
      return estimateIndexForOffsetFromPrefix(offsetPx)
    }
    if (options.heightTreeSize.value === nodes.length && options.heightSumTree.value.length && options.heightKnownTree.value.length) {
      const avg = options.averageNodeHeight.value
      const sumTree = options.heightSumTree.value
      const countTree = options.heightKnownTree.value
      const prefix = (endExclusive: number) => {
        if (endExclusive <= 0)
          return 0
        const sumKnown = options.fenwickRangeSum(sumTree, 0, endExclusive)
        const countKnown = options.fenwickRangeSum(countTree, 0, endExclusive)
        return sumKnown + (endExclusive - countKnown) * avg
      }
      let low = 0
      let high = nodes.length - 1
      let ans = nodes.length - 1
      while (low <= high) {
        const mid = (low + high) >> 1
        const height = prefix(mid + 1)
        if (height >= offsetPx) {
          ans = mid
          high = mid - 1
        }
        else {
          low = mid + 1
        }
      }
      return ans
    }
    let remaining = offsetPx
    for (let i = 0; i < nodes.length; i++) {
      const height = options.nodeHeights[i] ?? options.averageNodeHeight.value
      if (remaining <= height)
        return i
      remaining -= height
    }
    return Math.max(0, nodes.length - 1)
  }

  function estimateIndexForOffsetFromEnd(offsetPx: number) {
    const nodes = options.parsedNodes.value
    if (!nodes.length)
      return 0
    if (offsetPx <= 0)
      return Math.max(0, nodes.length - 1)
    if (options.heightEstimationActive.value) {
      const prefix = getFallbackHeightPrefix()
      const totalHeight = prefix[nodes.length] ?? 0
      return estimateIndexForOffsetFromPrefix(Math.max(0, totalHeight - offsetPx))
    }
    if (options.heightTreeSize.value === nodes.length) {
      const totalHeight = estimateHeightRange(0, nodes.length)
      const target = Math.max(0, totalHeight - offsetPx)
      return estimateIndexForOffset(target)
    }
    let remaining = offsetPx
    for (let i = nodes.length - 1; i >= 0; i--) {
      const height = options.nodeHeights[i] ?? options.averageNodeHeight.value
      if (remaining <= height)
        return i
      remaining -= height
    }
    return 0
  }

  function getEstimatedNodeHeightCount() {
    if (!options.heightEstimationActive.value)
      return 0

    let count = 0
    const estimates = options.estimatedNodeHeights.value
    for (let i = 0; i < estimates.length; i++) {
      if (!estimates[i])
        continue

      const measuredHeight = options.nodeHeights[i]
      if (Number.isFinite(measuredHeight) && measuredHeight > 0)
        continue

      count++
    }
    return count
  }

  function buildVirtualHeightSummary(summaryOptions: BuildVirtualHeightSummaryOptions): VirtualHeightSummary {
    const totalNodes = options.parsedNodes.value.length

    return {
      totalNodes,
      measuredCount: options.heightStats.count,
      estimatedCount: getEstimatedNodeHeightCount(),
      averageNodeHeight: options.averageNodeHeight.value,
      topSpacerHeight: summaryOptions.topSpacerHeight,
      bottomSpacerHeight: summaryOptions.bottomSpacerHeight,
      estimatedTotalHeight: estimateHeightRange(0, totalNodes),
      width: summaryOptions.width ?? options.getContainerWidth(),
    }
  }

  return {
    markFallbackHeightPrefixDirty,
    getFallbackNodeHeight,
    estimateHeightRange,
    estimateIndexForOffset,
    estimateIndexForOffsetFromEnd,
    getEstimatedNodeHeightCount,
    buildVirtualHeightSummary,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
