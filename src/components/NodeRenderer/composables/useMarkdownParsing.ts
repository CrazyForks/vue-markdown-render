import type {
  MarkdownIt,
  ParsedNode,
} from 'stream-markdown-parser'
import type { ComputedRef } from 'vue'
import type { CustomComponents } from '../../../types'
import type { NodeRendererProps } from '../../../types/node-renderer-props'
import {
  BLOCKED_HTML_TAGS,
  EXTENDED_STANDARD_HTML_TAGS,
  getMarkdown,
  mergeCustomHtmlTags,
  normalizeCustomHtmlTagName,
  parseMarkdownToStructure,
  resolveCustomHtmlTags,
} from 'stream-markdown-parser'
import { computed, markRaw, onScopeDispose, ref, watch } from 'vue'
import { isReservedNodeComponentKey } from '../../../utils/nodeComponents'

type RendererParseOptions = NonNullable<NodeRendererProps['parseOptions']>
interface StreamStatsLike {
  total?: number
  cacheHits?: number
  appendHits?: number
  tailHits?: number
  fullParses?: number
  chunkedParses?: number
  lastMode?: string
}

interface ParserTimingMetrics {
  tokenCloneMs?: number
  processTokensMs?: number
  parseMarkdownToStructureTotalMs?: number
}

interface ParsedNodeSignatureTimingMetrics {
  /** Instrumented wall time for timed signature calls, including timing overhead. */
  signatureMs: number
  stabilizeSignatureMs: number
  primeSignatureMs: number
  signatureCallCount: number
  stabilizeSignatureCallCount: number
  primeSignatureCallCount: number
}

interface ParsedNodeStabilizeMetrics {
  /** Count of reused nodes anywhere in nextNodes, including unchanged suffix nodes after dirtyStartIndex. */
  reusedNodeCount: number
  /** First boundary where previousNodes and nextNodes diverge; -1 means no dirty tail. */
  dirtyStartIndex: number
  /** Count of stable leading nodes in nextNodes. */
  stablePrefixNodeCount: number
  /** Count of nodes in the dirty tail across previousNodes and nextNodes. */
  dirtyTailNodeCount: number
}

interface ParsedNodeStabilizeResult {
  nodes: ParsedNode[]
  metrics: ParsedNodeStabilizeMetrics
}

export interface MarkdownParsingOptions {
  instanceMsgId: string
  renderContent: ComputedRef<string>
  effectiveFinal: ComputedRef<boolean | undefined>
  smoothStreamingEnabled?: ComputedRef<boolean>
  debugPerformanceEnabled: ComputedRef<boolean>
  customComponentsMap?: ComputedRef<Partial<CustomComponents>>
  logPerf: (label: string, data: Record<string, unknown>) => void
}

export interface MarkdownParsingState {
  effectiveCustomHtmlTags: ComputedRef<readonly string[]>
  effectiveCustomHtmlTagsSet: ComputedRef<Set<string>>
  mdBase: ComputedRef<MarkdownIt>
  mdInstance: ComputedRef<MarkdownIt>
  mergedParseOptions: ComputedRef<RendererParseOptions>
  parsedNodes: ComputedRef<ParsedNode[]>
}

function getAutoCustomHtmlTags(mapping: Partial<CustomComponents>) {
  return Object.entries(mapping)
    .map(([key, component]) => {
      const normalized = normalizeCustomHtmlTagName(key)
      return component != null
        && normalized
        && !isReservedNodeComponentKey(normalized)
        && !EXTENDED_STANDARD_HTML_TAGS.has(normalized)
        && !BLOCKED_HTML_TAGS.has(normalized)
        ? normalized
        : ''
    })
    .filter(Boolean)
}

const DEFAULT_PARSE_COALESCE_MS = 80
const STREAM_STAT_COUNTER_KEYS: Array<keyof StreamStatsLike> = [
  'total',
  'cacheHits',
  'appendHits',
  'tailHits',
  'fullParses',
  'chunkedParses',
]
const PARSE_TIMING_KEYS: Array<keyof ParserTimingMetrics> = [
  'tokenCloneMs',
  'processTokensMs',
  'parseMarkdownToStructureTotalMs',
]
const STRUCTURAL_OBJECT_FIELDS = new Set([
  'attrs',
  'data',
  'items',
  'header',
  'payload',
  'props',
  'rows',
  'cells',
  'term',
  'definition',
])
const TEXT_SIGNATURE_FIELDS = ['raw', 'content', 'code', 'originalCode', 'updatedCode']
const MAX_SIGNATURE_DEPTH = 6
const MAX_SIGNATURE_KEYS = 80
const MAX_SIGNATURE_ARRAY_ITEMS = 200
const MAX_SIGNATURE_STRING_CHARS = 8192
const MAX_CHEAP_NODE_KEY_DEPTH = 4
const objectIdentityIds = new WeakMap<object, number>()
const nodeSignatureCache = new WeakMap<object, string>()
let nextObjectIdentityId = 1

function getNow() {
  return typeof performance !== 'undefined'
    ? performance.now()
    : Date.now()
}

function readStreamStats(md: MarkdownIt): StreamStatsLike | null {
  const stream = md.stream
  if (!stream || typeof stream.stats !== 'function')
    return null

  return stream.stats() as StreamStatsLike
}

function getIdentityKey(value: unknown) {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null)
    return ''

  const object = value as object
  let id = objectIdentityIds.get(object)
  if (!id) {
    id = nextObjectIdentityId++
    objectIdentityIds.set(object, id)
  }
  return String(id)
}

function stableParseKey(
  options: RendererParseOptions,
  md: MarkdownIt,
  customMarkdownIt: NodeRendererProps['customMarkdownIt'],
  config: { includeFinal?: boolean } = {},
) {
  const includeFinal = config.includeFinal !== false
  const key: Record<string, unknown> = {
    md: getIdentityKey(md),
    customMarkdownIt: getIdentityKey(customMarkdownIt),
    requireClosingStrong: options.requireClosingStrong === true,
    customHtmlTags: options.customHtmlTags ?? [],
    streamParse: options.streamParse ?? 'auto',
    validateLink: getIdentityKey(options.validateLink),
    preTransformTokens: getIdentityKey(options.preTransformTokens),
    postTransformTokens: getIdentityKey(options.postTransformTokens),
  }

  if (includeFinal)
    key.final = options.final === true

  return JSON.stringify(key)
}

function resetStreamParseCache(md: MarkdownIt) {
  md.stream?.reset?.()
}

function shouldFlushParseImmediately(previous: string, next: string) {
  if (!previous && next)
    return true

  if (next.length <= 80)
    return true

  if (next.length < previous.length || !next.startsWith(previous))
    return true

  const appended = next.slice(previous.length)
  if (!appended)
    return false

  return appended.endsWith('\n')
    || appended.includes('\n\n')
    || /(?:^|\n)(?:#{1,6}\s|[-+*]\s+|\d+[.)]\s+|>\s*|`{3,}|~{3,})/.test(appended)
    || endsWithTableDelimiterLine(next)
}

function endsWithTableDelimiterLine(value: string) {
  const lineStart = value.lastIndexOf('\n') + 1
  const line = value.slice(lineStart).trim()
  if (!line.includes('|'))
    return false

  const cells = line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')

  return cells.length >= 2 && cells.every((cell) => {
    const marker = cell.trim()
    return marker.length >= 1
      && marker.replace(/^:/, '').replace(/:$/, '').split('').every(char => char === '-')
  })
}

function resolveParseCoalesceMs(props: Readonly<NodeRendererProps>) {
  const value = props.parseCoalesceMs
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : DEFAULT_PARSE_COALESCE_MS
}

function hashString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function signatureString(value: unknown) {
  const text = String(value ?? '')
  return `${text.length}:${hashString(text)}`
}

function stableStringSignature(value: string) {
  return value.length <= MAX_SIGNATURE_STRING_CHARS
    ? signatureString(value)
    : `${value.length}:${hashString(value.slice(0, MAX_SIGNATURE_STRING_CHARS))}:truncated`
}

function stableValueSignature(
  value: unknown,
  seen = new WeakMap<object, string>(),
  depth = 0,
): string {
  if (value == null || typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  if (typeof value === 'string')
    return `s:${stableStringSignature(value)}`
  if (typeof value === 'function')
    return `fn:${getIdentityKey(value)}`
  if (typeof value !== 'object')
    return typeof value

  const object = value as object
  const existing = seen.get(object)
  if (existing)
    return `cycle:${existing}`

  if (depth >= MAX_SIGNATURE_DEPTH)
    return `object:${getIdentityKey(object)}`

  const id = getIdentityKey(object)
  seen.set(object, id)

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_SIGNATURE_ARRAY_ITEMS)
    return `a:${value.length}:${items
      .map(item => stableValueSignature(item, seen, depth + 1))
      .join(',')}`
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    const sampledKeys = keys.slice(0, MAX_SIGNATURE_KEYS)
    return `o:${keys.length}:${sampledKeys
      .sort()
      .map(key => `${key}:${stableValueSignature(record[key], seen, depth + 1)}`)
      .join(';')}`
  }

  return typeof value
}

function isParsedNodeLike(value: unknown): value is ParsedNode {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { type?: unknown }).type === 'string'
    && typeof (value as { raw?: unknown }).raw === 'string'
}

function structuralFieldSignature(
  value: unknown,
  seen = new WeakMap<object, string>(),
  depth = 0,
): string {
  if (Array.isArray(value)) {
    return `a:${value.length}:${value
      .slice(0, MAX_SIGNATURE_ARRAY_ITEMS)
      .map(item => isParsedNodeLike(item) ? getParsedNodeSignature(item, seen, depth + 1) : structuralFieldSignature(item, seen, depth + 1))
      .join(',')}`
  }
  if (isParsedNodeLike(value))
    return getParsedNodeSignature(value, seen, depth)
  return stableValueSignature(value, seen, depth)
}

function buildPrimitiveFieldSignature(
  record: Record<string, unknown>,
  seen: WeakMap<object, string>,
  depth: number,
) {
  return Object.keys(record)
    .sort()
    .filter(key => key !== 'children' && !TEXT_SIGNATURE_FIELDS.includes(key))
    .map((key) => {
      const value = record[key]

      if (typeof value === 'string')
        return `${key}=s:${signatureString(value)}`
      if (typeof value === 'number' || typeof value === 'boolean' || value == null)
        return `${key}=${String(value)}`
      if (typeof value === 'function')
        return `${key}=fn:${getIdentityKey(value)}`
      if (STRUCTURAL_OBJECT_FIELDS.has(key) && (Array.isArray(value) || typeof value === 'object'))
        return `${key}=${structuralFieldSignature(value, seen, depth + 1)}`
      if (value && typeof value === 'object')
        return `${key}=object:${getIdentityKey(value)}`

      return ''
    })
    .filter(Boolean)
    .join(';')
}

function buildTextFieldSignature(record: Record<string, unknown>) {
  return TEXT_SIGNATURE_FIELDS
    .map((key) => {
      const value = record[key]
      return typeof value === 'string'
        ? `${key}=s:${signatureString(value)}`
        : ''
    })
    .filter(Boolean)
    .join(';')
}

function buildCheapNodeSignature(
  node: ParsedNode,
  seen: WeakMap<object, string>,
  depth: number,
) {
  const record = node as Record<string, unknown>
  const children = Array.isArray(record.children)
    ? record.children as ParsedNode[]
    : []
  const childSignature = children.length
    ? children
        .slice(0, MAX_SIGNATURE_ARRAY_ITEMS)
        .map(child => getParsedNodeSignature(child, seen, depth + 1))
        .join('|')
    : ''

  return [
    node.type,
    buildTextFieldSignature(record),
    buildPrimitiveFieldSignature(record, seen, depth),
    children.length,
    childSignature,
  ].join(':')
}

function getParsedNodeSignature(
  node: ParsedNode,
  seen = new WeakMap<object, string>(),
  depth = 0,
) {
  const cached = nodeSignatureCache.get(node as object)
  if (cached)
    return cached

  const object = node as object
  const existing = seen.get(object)
  if (existing)
    return `node-cycle:${existing}`

  if (depth >= MAX_SIGNATURE_DEPTH)
    return `node:${node.type}:${getIdentityKey(object)}`

  const id = getIdentityKey(object)
  seen.set(object, id)

  const signature = buildCheapNodeSignature(node, seen, depth)
  nodeSignatureCache.set(object, signature)
  return signature
}

function isParsedNodeStable(previous: ParsedNode, next: ParsedNode) {
  return getParsedNodeSignature(previous) === getParsedNodeSignature(next)
}

function trackSignatureTiming<T>(
  metrics: ParsedNodeSignatureTimingMetrics,
  metricKey: 'stabilizeSignatureMs' | 'primeSignatureMs',
  callback: () => T,
) {
  const startedAt = getNow()
  const countKey = metricKey === 'stabilizeSignatureMs'
    ? 'stabilizeSignatureCallCount'
    : 'primeSignatureCallCount'
  try {
    return callback()
  }
  finally {
    metrics[metricKey] += getNow() - startedAt
    metrics[countKey] += 1
    metrics.signatureMs = metrics.stabilizeSignatureMs + metrics.primeSignatureMs
    metrics.signatureCallCount = metrics.stabilizeSignatureCallCount + metrics.primeSignatureCallCount
  }
}

function getParsedNodeSignatureWithTiming(
  node: ParsedNode,
  metrics: ParsedNodeSignatureTimingMetrics,
  metricKey: 'stabilizeSignatureMs' | 'primeSignatureMs',
) {
  return trackSignatureTiming(
    metrics,
    metricKey,
    () => getParsedNodeSignature(node),
  )
}

function isParsedNodeStableWithMetrics(
  previous: ParsedNode,
  next: ParsedNode,
  metrics: ParsedNodeSignatureTimingMetrics,
) {
  return getParsedNodeSignatureWithTiming(previous, metrics, 'stabilizeSignatureMs')
    === getParsedNodeSignatureWithTiming(next, metrics, 'stabilizeSignatureMs')
}

function getInitialStabilizeMetrics(nodeCount: number): ParsedNodeStabilizeMetrics {
  return {
    reusedNodeCount: 0,
    dirtyStartIndex: nodeCount > 0 ? 0 : -1,
    stablePrefixNodeCount: 0,
    dirtyTailNodeCount: nodeCount,
  }
}

function getDirtyTailNodeCount(
  dirtyStartIndex: number,
  nextNodes: ParsedNode[],
  previousNodes: ParsedNode[],
) {
  return dirtyStartIndex < 0
    ? 0
    : Math.max(nextNodes.length, previousNodes.length) - dirtyStartIndex
}

function compareCheapStringIfSafe(previous: string, next: string) {
  return previous.length === next.length && previous === next
}

function compareCheapParsedNodesIfSafe(
  previous: ParsedNode,
  next: ParsedNode,
  depth = 0,
): boolean | null {
  if (depth >= MAX_CHEAP_NODE_KEY_DEPTH)
    return null

  if (previous.type !== next.type)
    return false

  const previousRecord = previous as Record<string, unknown>
  const nextRecord = next as Record<string, unknown>
  const previousKeys = Object.keys(previousRecord)
    .filter(key => key !== 'type' && key !== 'children')
    .sort()
  const nextKeys = Object.keys(nextRecord)
    .filter(key => key !== 'type' && key !== 'children')
    .sort()

  if (previousKeys.length !== nextKeys.length)
    return false

  for (let index = 0; index < previousKeys.length; index++) {
    const key = previousKeys[index]!
    if (key !== nextKeys[index])
      return false

    const previousValue = previousRecord[key]
    const nextValue = nextRecord[key]

    if (typeof previousValue !== typeof nextValue)
      return false

    if (typeof previousValue === 'string') {
      if (typeof nextValue !== 'string')
        return false

      if (!compareCheapStringIfSafe(previousValue, nextValue))
        return false

      continue
    }

    if (
      typeof previousValue === 'number'
      || typeof previousValue === 'boolean'
      || previousValue == null
    ) {
      if (!Object.is(previousValue, nextValue))
        return false
      continue
    }

    return null
  }

  const previousHasChildren = Object.prototype.hasOwnProperty.call(previousRecord, 'children')
  const nextHasChildren = Object.prototype.hasOwnProperty.call(nextRecord, 'children')

  if (previousHasChildren !== nextHasChildren)
    return false

  if (!previousHasChildren)
    return true

  const previousChildren = previousRecord.children
  const nextChildren = nextRecord.children

  if (!Array.isArray(previousChildren) || !Array.isArray(nextChildren))
    return null

  if (previousChildren.length !== nextChildren.length)
    return false

  for (let index = 0; index < previousChildren.length; index++) {
    const previousChild = previousChildren[index]
    const nextChild = nextChildren[index]

    if (!isParsedNodeLike(previousChild) || !isParsedNodeLike(nextChild))
      return null

    const childResult = compareCheapParsedNodesIfSafe(
      previousChild,
      nextChild,
      depth + 1,
    )

    if (childResult == null)
      return null

    if (!childResult)
      return false
  }

  return true
}

function areTopLevelNodesStable(previous: ParsedNode | undefined, next: ParsedNode | undefined) {
  if (!previous || !next)
    return false
  if (previous === next)
    return true
  if (previous.type !== next.type)
    return false

  const cheapResult = compareCheapParsedNodesIfSafe(previous, next)
  if (cheapResult != null)
    return cheapResult

  return isParsedNodeStable(previous, next)
}

function areTopLevelNodesStableWithMetrics(
  previous: ParsedNode | undefined,
  next: ParsedNode | undefined,
  signatureTiming: ParsedNodeSignatureTimingMetrics,
) {
  if (!previous || !next)
    return false
  if (previous === next)
    return true
  if (previous.type !== next.type)
    return false

  let cheapResult: boolean | null = null
  trackSignatureTiming(
    signatureTiming,
    'stabilizeSignatureMs',
    () => {
      cheapResult = compareCheapParsedNodesIfSafe(previous, next)
    },
  )

  if (cheapResult != null)
    return cheapResult

  return isParsedNodeStableWithMetrics(previous, next, signatureTiming)
}

function findDirtyStartIndex(nextNodes: ParsedNode[], previousNodes: ParsedNode[]) {
  const limit = Math.min(nextNodes.length, previousNodes.length)

  for (let index = 0; index < limit; index++) {
    const previous = previousNodes[index]
    const next = nextNodes[index]

    if (!areTopLevelNodesStable(previous, next))
      return index
  }

  return nextNodes.length === previousNodes.length ? -1 : limit
}

function findDirtyStartIndexWithMetrics(
  nextNodes: ParsedNode[],
  previousNodes: ParsedNode[],
  signatureTiming: ParsedNodeSignatureTimingMetrics,
) {
  const limit = Math.min(nextNodes.length, previousNodes.length)

  for (let index = 0; index < limit; index++) {
    const previous = previousNodes[index]
    const next = nextNodes[index]

    if (!areTopLevelNodesStableWithMetrics(previous, next, signatureTiming)) {
      return index
    }
  }

  return nextNodes.length === previousNodes.length ? -1 : limit
}

function stabilizeParsedNodes(nextNodes: ParsedNode[], previousNodes: ParsedNode[]): ParsedNodeStabilizeResult {
  if (!previousNodes.length) {
    return {
      nodes: nextNodes,
      metrics: getInitialStabilizeMetrics(nextNodes.length),
    }
  }

  const dirtyStartIndex = findDirtyStartIndex(nextNodes, previousNodes)

  if (dirtyStartIndex < 0) {
    return {
      nodes: previousNodes,
      metrics: {
        reusedNodeCount: nextNodes.length,
        dirtyStartIndex,
        stablePrefixNodeCount: nextNodes.length,
        dirtyTailNodeCount: 0,
      },
    }
  }

  const stableNodes = nextNodes.slice()
  let reusedNodeCount = dirtyStartIndex

  for (let index = 0; index < dirtyStartIndex; index++)
    stableNodes[index] = previousNodes[index]!

  for (let index = dirtyStartIndex; index < nextNodes.length; index++) {
    const previous = previousNodes[index]
    const next = nextNodes[index]

    if (previous && isParsedNodeStable(previous, next)) {
      stableNodes[index] = previous
      reusedNodeCount += 1
    }
  }

  return {
    nodes: stableNodes,
    metrics: {
      reusedNodeCount,
      dirtyStartIndex,
      stablePrefixNodeCount: dirtyStartIndex,
      dirtyTailNodeCount: getDirtyTailNodeCount(dirtyStartIndex, nextNodes, previousNodes),
    },
  }
}

function stabilizeParsedNodesWithMetrics(
  nextNodes: ParsedNode[],
  previousNodes: ParsedNode[],
  signatureTiming: ParsedNodeSignatureTimingMetrics,
): ParsedNodeStabilizeResult {
  if (!previousNodes.length) {
    return {
      nodes: nextNodes,
      metrics: getInitialStabilizeMetrics(nextNodes.length),
    }
  }

  const dirtyStartIndex = findDirtyStartIndexWithMetrics(nextNodes, previousNodes, signatureTiming)

  if (dirtyStartIndex < 0) {
    return {
      nodes: previousNodes,
      metrics: {
        reusedNodeCount: nextNodes.length,
        dirtyStartIndex,
        stablePrefixNodeCount: nextNodes.length,
        dirtyTailNodeCount: 0,
      },
    }
  }

  const stableNodes = nextNodes.slice()
  let reusedNodeCount = dirtyStartIndex

  for (let index = 0; index < dirtyStartIndex; index++)
    stableNodes[index] = previousNodes[index]!

  for (let index = dirtyStartIndex; index < nextNodes.length; index++) {
    const previous = previousNodes[index]
    const next = nextNodes[index]

    if (previous && isParsedNodeStableWithMetrics(previous, next, signatureTiming)) {
      stableNodes[index] = previous
      reusedNodeCount += 1
    }
  }

  return {
    nodes: stableNodes,
    metrics: {
      reusedNodeCount,
      dirtyStartIndex,
      stablePrefixNodeCount: dirtyStartIndex,
      dirtyTailNodeCount: getDirtyTailNodeCount(dirtyStartIndex, nextNodes, previousNodes),
    },
  }
}

function primeParsedNodeSignatures(nodes: ParsedNode[], startIndex = 0) {
  for (let index = Math.max(0, startIndex); index < nodes.length; index++)
    getParsedNodeSignature(nodes[index]!)
}

function primeParsedNodeSignaturesWithMetrics(
  nodes: ParsedNode[],
  signatureTiming: ParsedNodeSignatureTimingMetrics,
  startIndex = 0,
) {
  for (let index = Math.max(0, startIndex); index < nodes.length; index++) {
    trackSignatureTiming(
      signatureTiming,
      'primeSignatureMs',
      () => getParsedNodeSignature(nodes[index]!),
    )
  }
}

function getStreamStatsDelta(current: StreamStatsLike, previous: StreamStatsLike | null) {
  const delta: Record<string, number> = {}

  for (const key of STREAM_STAT_COUNTER_KEYS) {
    const currentValue = current[key]
    const previousValue = previous?.[key]
    if (typeof currentValue === 'number')
      delta[key] = currentValue - (typeof previousValue === 'number' ? previousValue : 0)
  }

  return delta
}

export function useMarkdownParsing(
  props: Readonly<NodeRendererProps>,
  options: MarkdownParsingOptions,
): MarkdownParsingState {
  const defaultMd = getMarkdown(options.instanceMsgId)
  const customTagCache = new Map<string, MarkdownIt>()
  const smoothStreamingEnabled = options.smoothStreamingEnabled ?? computed(() => false)
  const contentToParse = ref(options.renderContent.value)
  let previousParsedNodes: ParsedNode[] = []
  let previousParserCacheSemanticKey = ''
  let previousNodeReuseSemanticKey = ''
  let previousContent = ''
  let parseCoalesceTimer: ReturnType<typeof setTimeout> | undefined
  let parseCommitCount = 0
  let parseCoalescedCount = 0
  let lastParseFlushAt = getNow()

  function clearParseCoalesceTimer() {
    if (!parseCoalesceTimer)
      return

    clearTimeout(parseCoalesceTimer)
    parseCoalesceTimer = undefined
  }

  function flushParseContent() {
    clearParseCoalesceTimer()
    const nextContent = options.renderContent.value
    if (contentToParse.value !== nextContent)
      contentToParse.value = nextContent
    lastParseFlushAt = getNow()
  }

  function scheduleParseContentFlush() {
    parseCoalescedCount += 1

    if (parseCoalesceTimer)
      return

    const delay = Math.max(0, resolveParseCoalesceMs(props) - (getNow() - lastParseFlushAt))
    if (delay <= 0) {
      flushParseContent()
      return
    }

    parseCoalesceTimer = setTimeout(flushParseContent, delay)
  }

  watch(
    [options.renderContent, options.effectiveFinal, smoothStreamingEnabled],
    ([nextContent, final, smoothEnabled]) => {
      if (contentToParse.value === nextContent)
        return

      if (!smoothEnabled || final || shouldFlushParseImmediately(contentToParse.value, nextContent)) {
        flushParseContent()
        return
      }

      scheduleParseContentFlush()
    },
    { flush: 'sync', immediate: true },
  )

  onScopeDispose(clearParseCoalesceTimer)

  const effectiveCustomHtmlTags = computed(() => {
    return mergeCustomHtmlTags(
      props.customHtmlTags,
      props.parseOptions?.customHtmlTags,
      getAutoCustomHtmlTags(options.customComponentsMap?.value ?? {}),
    )
  })

  const mdBase = computed(() => {
    const { key, tags } = resolveCustomHtmlTags(effectiveCustomHtmlTags.value)

    if (!key)
      return defaultMd

    const cached = customTagCache.get(key)

    if (cached)
      return cached

    const md = getMarkdown(options.instanceMsgId, {
      customHtmlTags: tags,
    })

    customTagCache.set(key, md)

    return md
  })

  const mdInstance = computed(() => {
    const base = mdBase.value

    return props.customMarkdownIt
      ? props.customMarkdownIt(base)
      : base
  })

  const mergedParseOptions = computed(() => {
    const base = (props.parseOptions ?? {}) as RendererParseOptions
    const resolvedFinal = options.effectiveFinal.value
    const customHtmlTags = effectiveCustomHtmlTags.value

    const hasFinal = resolvedFinal != null
    const hasCustom = customHtmlTags.length > 0

    if (!hasFinal && !hasCustom && base.streamParse != null)
      return base

    return {
      ...base,
      // Keep renderer content parses on the stream parser by default. Final
      // transitions reset parser cache without invalidating unchanged node reuse.
      streamParse: base.streamParse ?? true,
      ...(hasFinal ? { final: resolvedFinal } : {}),
      ...(hasCustom ? { customHtmlTags } : {}),
    } as RendererParseOptions
  })

  const effectiveCustomHtmlTagsSet = computed(() => {
    return new Set(
      (mergedParseOptions.value.customHtmlTags ?? [])
        .map(tag => String(tag).trim().toLowerCase())
        .filter(Boolean),
    )
  })

  const parserCacheSemanticKey = computed(() => stableParseKey(
    mergedParseOptions.value,
    mdInstance.value,
    props.customMarkdownIt,
    { includeFinal: true },
  ))

  const nodeReuseSemanticKey = computed(() => stableParseKey(
    mergedParseOptions.value,
    mdInstance.value,
    props.customMarkdownIt,
    { includeFinal: false },
  ))

  watch(
    [parserCacheSemanticKey, nodeReuseSemanticKey],
    ([currentParserCacheKey, currentNodeReuseKey], [previousParserCacheKey, previousNodeReuseKey]) => {
      if (!previousParserCacheKey)
        return

      if (
        currentParserCacheKey === previousParserCacheKey
        && currentNodeReuseKey === previousNodeReuseKey
      ) {
        return
      }

      flushParseContent()

      if (currentNodeReuseKey !== previousNodeReuseKey) {
        previousParsedNodes = []
        previousContent = ''
      }
    },
    { flush: 'sync' },
  )

  const parsedNodes = computed<ParsedNode[]>(() => {
    if (props.nodes?.length) {
      previousParsedNodes = []
      previousContent = ''
      return markRaw((props.nodes as unknown as ParsedNode[]).slice())
    }

    const content = contentToParse.value

    if (!content) {
      previousParsedNodes = []
      previousContent = ''
      return []
    }

    const collectPerformanceMetrics = options.debugPerformanceEnabled.value
    const parseStart = collectPerformanceMetrics
      ? getNow()
      : 0
    const md = mdInstance.value
    const currentParserCacheSemanticKey = parserCacheSemanticKey.value
    const currentNodeReuseSemanticKey = nodeReuseSemanticKey.value

    if (
      previousParserCacheSemanticKey
      && currentParserCacheSemanticKey !== previousParserCacheSemanticKey
    ) {
      resetStreamParseCache(md)
    }

    if (
      previousNodeReuseSemanticKey
      && currentNodeReuseSemanticKey !== previousNodeReuseSemanticKey
    ) {
      previousParsedNodes = []
      previousContent = ''
    }

    const canReuseParsedNodes = previousParsedNodes.length > 0
      && content.startsWith(previousContent)
      && currentNodeReuseSemanticKey === previousNodeReuseSemanticKey

    const streamStatsBefore = collectPerformanceMetrics
      ? readStreamStats(md)
      : null

    const parserTiming: ParserTimingMetrics | undefined = collectPerformanceMetrics
      ? {}
      : undefined
    const parseOptionsForCall = parserTiming
      ? ({ ...mergedParseOptions.value, __timing: parserTiming } as RendererParseOptions & { __timing: ParserTimingMetrics })
      : mergedParseOptions.value

    const nextParsed = parseMarkdownToStructure(
      content,
      md,
      parseOptionsForCall,
    )
    const reuseStart = collectPerformanceMetrics
      ? getNow()
      : 0
    const signatureTiming: ParsedNodeSignatureTimingMetrics | undefined = collectPerformanceMetrics
      ? {
          signatureMs: 0,
          stabilizeSignatureMs: 0,
          primeSignatureMs: 0,
          signatureCallCount: 0,
          stabilizeSignatureCallCount: 0,
          primeSignatureCallCount: 0,
        }
      : undefined
    let stabilizeMetrics: ParsedNodeStabilizeMetrics | undefined = collectPerformanceMetrics
      ? getInitialStabilizeMetrics(nextParsed.length)
      : undefined
    let stabilizeMs = 0
    let parsed: ParsedNode[]
    let primeStartIndex = 0

    if (canReuseParsedNodes) {
      const stabilizeStart = collectPerformanceMetrics
        ? getNow()
        : 0
      if (signatureTiming) {
        const result = stabilizeParsedNodesWithMetrics(nextParsed, previousParsedNodes, signatureTiming)
        parsed = result.nodes
        stabilizeMetrics = result.metrics
      }
      else {
        const result = stabilizeParsedNodes(nextParsed, previousParsedNodes)
        parsed = result.nodes
        stabilizeMetrics = result.metrics
      }
      stabilizeMs = collectPerformanceMetrics
        ? getNow() - stabilizeStart
        : 0
      primeStartIndex = stabilizeMetrics?.dirtyStartIndex == null || stabilizeMetrics.dirtyStartIndex < 0
        ? parsed.length
        : stabilizeMetrics.dirtyStartIndex
    }
    else {
      parsed = nextParsed
    }

    if (signatureTiming)
      primeParsedNodeSignaturesWithMetrics(parsed, signatureTiming, primeStartIndex)
    else
      primeParsedNodeSignatures(parsed, primeStartIndex)

    const nodeReuseMs = collectPerformanceMetrics
      ? getNow() - reuseStart
      : 0
    parseCommitCount += 1
    previousContent = content
    previousParserCacheSemanticKey = currentParserCacheSemanticKey
    previousNodeReuseSemanticKey = currentNodeReuseSemanticKey
    previousParsedNodes = parsed

    if (collectPerformanceMetrics) {
      const streamStats = readStreamStats(md)
      const usedStream = typeof streamStats?.total === 'number'
        && streamStats.total > (streamStatsBefore?.total ?? 0)

      options.logPerf(usedStream ? 'parse(stream)' : 'parse(sync)', {
        rendererId: options.instanceMsgId,
        ms: Math.round(getNow() - parseStart),
        nodes: parsed.length,
        contentLength: content.length,
        parseCommitCount,
        parseCoalescedCount,
        nodeReuseMs,
        signatureMs: signatureTiming?.signatureMs ?? 0,
        stabilizeSignatureMs: signatureTiming?.stabilizeSignatureMs ?? 0,
        primeSignatureMs: signatureTiming?.primeSignatureMs ?? 0,
        signatureCallCount: signatureTiming?.signatureCallCount ?? 0,
        stabilizeSignatureCallCount: signatureTiming?.stabilizeSignatureCallCount ?? 0,
        primeSignatureCallCount: signatureTiming?.primeSignatureCallCount ?? 0,
        stabilizeMs,
        ...(stabilizeMetrics ?? {}),
        ...(parserTiming
          ? Object.fromEntries(PARSE_TIMING_KEYS.map(key => [key, parserTiming[key] ?? 0]))
          : {}),
        ...(streamStats
          ? {
              streamMode: streamStats.lastMode,
              streamDelta: getStreamStatsDelta(streamStats, streamStatsBefore),
              streamStats,
            }
          : {}),
      })
    }

    return markRaw(parsed)
  })

  return {
    effectiveCustomHtmlTags,
    effectiveCustomHtmlTagsSet,
    mdBase,
    mdInstance,
    mergedParseOptions,
    parsedNodes,
  }
}
