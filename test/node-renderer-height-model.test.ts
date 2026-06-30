/**
 * @vitest-environment node
 */

import type { ParsedNode } from 'stream-markdown-parser'
import type { EstimatedNodeHeight } from '../src/internal/heightEstimationExperiment'
import { describe, expect, it } from 'vitest'
import { computed, ref } from 'vue'
import { useHeightMeasurements } from '../src/components/NodeRenderer/composables/useHeightMeasurements'
import {
  estimateStaticNodeHeightFallback,
  estimateTextFallbackHeight,
  getHeightCacheWidthBucket,
  UNKNOWN_HEIGHT_CACHE_WIDTH_BUCKET,
  useHeightModel,
} from '../src/components/NodeRenderer/composables/useHeightModel'

function paragraph(raw: string): ParsedNode {
  return {
    type: 'paragraph',
    raw,
    children: [],
  } as ParsedNode
}

function createModel(options: {
  nodes: ParsedNode[]
  active?: boolean
  estimates?: Array<EstimatedNodeHeight | null>
  width?: number
}) {
  const nodes = ref(options.nodes)
  const active = ref(options.active ?? false)
  const estimates = ref<Array<EstimatedNodeHeight | null>>(options.estimates ?? [])
  const width = ref(options.width ?? 640)
  const measurements = useHeightMeasurements()
  const model = useHeightModel({
    parsedNodes: computed(() => nodes.value),
    nodeHeights: measurements.nodeHeights,
    heightStats: measurements.heightStats,
    heightTreeSize: measurements.heightTreeSize,
    heightSumTree: measurements.heightSumTree,
    heightKnownTree: measurements.heightKnownTree,
    averageNodeHeight: measurements.averageNodeHeight,
    heightEstimationActive: computed(() => active.value),
    estimatedNodeHeights: computed(() => estimates.value),
    getContainerWidth: () => width.value,
    getPrefixCacheKeyParts: () => [
      nodes.value.length,
      measurements.heightStats.count,
      Math.round(measurements.heightStats.total),
      Math.round(measurements.averageNodeHeight.value * 100),
      getHeightCacheWidthBucket(width.value),
      active.value ? 1 : 0,
    ],
    fenwickRangeSum: measurements.fenwickRangeSum,
  })

  return {
    active,
    estimates,
    measurements,
    model,
    nodes,
    width,
  }
}

describe('useHeightModel', () => {
  it('keeps text and static fallback estimates deterministic', () => {
    expect(estimateTextFallbackHeight('', 640, 34)).toBe(34)
    expect(estimateTextFallbackHeight('x'.repeat(200), 320, 34)).toBeGreaterThan(
      estimateTextFallbackHeight('x'.repeat(200), 960, 34),
    )
    expect(estimateStaticNodeHeightFallback({
      type: 'list',
      raw: '- a\n- b\n- c',
      ordered: false,
      items: [paragraph('a'), paragraph('b'), paragraph('c')],
    } as ParsedNode, 640)).toBe(102)
    expect(estimateStaticNodeHeightFallback(undefined, 640)).toBe(32)
  })

  it('uses measured Fenwick trees for range and offset lookup when estimation is inactive', () => {
    const { measurements, model } = createModel({
      nodes: [
        paragraph('a'),
        paragraph('b'),
        paragraph('c'),
        paragraph('d'),
      ],
    })

    measurements.recordNodeHeight(0, 10)
    measurements.recordNodeHeight(2, 30)
    measurements.rebuildHeightTrees(4)

    expect(measurements.averageNodeHeight.value).toBe(20)
    expect(model.estimateHeightRange(0, 4)).toBe(80)
    expect(model.estimateHeightRange(1, 3)).toBe(50)
    expect(model.estimateIndexForOffset(1)).toBe(0)
    expect(model.estimateIndexForOffset(11)).toBe(1)
    expect(model.estimateIndexForOffset(60)).toBe(2)
    expect(model.estimateIndexForOffsetFromEnd(25)).toBe(2)
  })

  it('prefers active node estimates but keeps measured heights authoritative', () => {
    const { measurements, model } = createModel({
      active: true,
      nodes: [
        paragraph('first'),
        paragraph('second'),
        paragraph('third'),
      ],
      estimates: [
        { kind: 'simple-text', height: 50 },
        null,
        { kind: 'simple-text', height: 70 },
      ],
    })

    measurements.recordNodeHeight(2, 20)

    expect(model.getFallbackNodeHeight(0)).toBe(50)
    expect(model.getFallbackNodeHeight(1)).toBe(34)
    expect(model.getFallbackNodeHeight(2)).toBe(20)
    expect(model.estimateHeightRange(0, 3)).toBe(104)
    expect(model.estimateIndexForOffset(84)).toBe(1)
    expect(model.estimateIndexForOffsetFromEnd(21)).toBe(1)
    expect(model.buildVirtualHeightSummary({
      topSpacerHeight: 50,
      bottomSpacerHeight: 20,
      width: 640,
    })).toMatchObject({
      totalNodes: 3,
      measuredCount: 1,
      estimatedCount: 1,
      topSpacerHeight: 50,
      bottomSpacerHeight: 20,
      estimatedTotalHeight: 104,
      width: 640,
    })
  })

  it('invalidates active fallback prefixes when cache key parts change', () => {
    const { model, width } = createModel({
      active: true,
      nodes: [paragraph('x'.repeat(200))],
      width: 320,
    })

    const narrowHeight = model.estimateHeightRange(0, 1)

    width.value = 960

    expect(model.estimateHeightRange(0, 1)).toBeLessThan(narrowHeight)
  })

  it('maps width buckets consistently', () => {
    expect(getHeightCacheWidthBucket(0)).toBe(UNKNOWN_HEIGHT_CACHE_WIDTH_BUCKET)
    expect(getHeightCacheWidthBucket(Number.NaN)).toBe(UNKNOWN_HEIGHT_CACHE_WIDTH_BUCKET)
    expect(getHeightCacheWidthBucket(64)).toBe(2)
    expect(getHeightCacheWidthBucket(80)).toBe(3)
  })
})
