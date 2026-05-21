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

function stableParseKey(options: RendererParseOptions, md: MarkdownIt, customMarkdownIt: NodeRendererProps['customMarkdownIt']) {
  return JSON.stringify({
    md: getIdentityKey(md),
    customMarkdownIt: getIdentityKey(customMarkdownIt),
    final: options.final === true,
    requireClosingStrong: options.requireClosingStrong === true,
    customHtmlTags: options.customHtmlTags ?? [],
    streamParse: options.streamParse ?? 'auto',
    validateLink: getIdentityKey(options.validateLink),
    preTransformTokens: getIdentityKey(options.preTransformTokens),
    postTransformTokens: getIdentityKey(options.postTransformTokens),
  })
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
    || /(?:^|\n)(?:#{1,6}\s|[-+*]\s+|\d+[.)]\s+|>\s*|`{3,}|~{3,}|\|)/.test(appended)
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

function buildPrimitiveFieldSignature(record: Record<string, unknown>) {
  return Object.keys(record)
    .sort()
    .filter(key => key !== 'children' && key !== 'raw' && key !== 'content' && key !== 'code')
    .map((key) => {
      const value = record[key]

      if (typeof value === 'string')
        return `${key}=s:${signatureString(value)}`
      if (typeof value === 'number' || typeof value === 'boolean' || value == null)
        return `${key}=${String(value)}`
      if (typeof value === 'function')
        return `${key}=fn:${getIdentityKey(value)}`
      if (Array.isArray(value)) {
        const items = value.map((item) => {
          if (typeof item === 'string')
            return `s:${signatureString(item)}`
          if (typeof item === 'number' || typeof item === 'boolean' || item == null)
            return String(item)
          return typeof item
        })
        return `${key}=a:${items.length}:${items.join(',')}`
      }

      return ''
    })
    .filter(Boolean)
    .join(';')
}

function buildCheapNodeSignature(node: ParsedNode) {
  const record = node as Record<string, unknown>
  const raw = typeof record.raw === 'string'
    ? record.raw
    : typeof record.content === 'string'
      ? record.content
      : typeof record.code === 'string'
        ? record.code
        : ''
  const children = Array.isArray(record.children)
    ? record.children as ParsedNode[]
    : []
  const childSignature = children.length
    ? children.map(getParsedNodeSignature).join('|')
    : ''

  return [
    node.type,
    signatureString(raw),
    buildPrimitiveFieldSignature(record),
    children.length,
    childSignature,
  ].join(':')
}

function getParsedNodeSignature(node: ParsedNode) {
  const cached = nodeSignatureCache.get(node as object)
  if (cached)
    return cached

  const signature = buildCheapNodeSignature(node)
  nodeSignatureCache.set(node as object, signature)
  return signature
}

function isParsedNodeStable(previous: ParsedNode, next: ParsedNode) {
  return getParsedNodeSignature(previous) === getParsedNodeSignature(next)
}

function stabilizeParsedNodes(nextNodes: ParsedNode[], previousNodes: ParsedNode[]) {
  if (!previousNodes.length)
    return nextNodes

  const stableNodes = new Array<ParsedNode>(nextNodes.length)
  let identical = nextNodes.length === previousNodes.length

  for (let index = 0; index < nextNodes.length; index++) {
    const previous = previousNodes[index]
    const next = nextNodes[index]

    if (previous && isParsedNodeStable(previous, next)) {
      stableNodes[index] = previous
    }
    else {
      stableNodes[index] = next
      identical = false
    }
  }

  return identical ? previousNodes : stableNodes
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
  let previousParseSemanticKey = ''
  let previousContent = ''
  let parseCoalesceTimer: ReturnType<typeof setTimeout> | undefined
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

    if (!hasFinal && !hasCustom)
      return base

    return {
      ...base,
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

  const parseSemanticKey = computed(() => stableParseKey(
    mergedParseOptions.value,
    mdInstance.value,
    props.customMarkdownIt,
  ))

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

    const parseStart = options.debugPerformanceEnabled.value
      ? getNow()
      : 0
    const md = mdInstance.value
    const currentParseSemanticKey = parseSemanticKey.value
    const canReuseParsedNodes = previousParsedNodes.length > 0
      && content.startsWith(previousContent)
      && currentParseSemanticKey === previousParseSemanticKey

    if (previousParseSemanticKey && currentParseSemanticKey !== previousParseSemanticKey) {
      previousParsedNodes = []
      previousContent = ''
      resetStreamParseCache(md)
    }

    const streamStatsBefore = options.debugPerformanceEnabled.value
      ? readStreamStats(md)
      : null

    const nextParsed = parseMarkdownToStructure(
      content,
      md,
      mergedParseOptions.value,
    )
    const parsed = canReuseParsedNodes
      ? stabilizeParsedNodes(nextParsed, previousParsedNodes)
      : nextParsed

    previousContent = content
    previousParseSemanticKey = currentParseSemanticKey
    previousParsedNodes = parsed

    if (options.debugPerformanceEnabled.value) {
      const streamStats = readStreamStats(md)
      const usedStream = typeof streamStats?.total === 'number'
        && streamStats.total > (streamStatsBefore?.total ?? 0)

      options.logPerf(usedStream ? 'parse(stream)' : 'parse(sync)', {
        ms: Math.round(getNow() - parseStart),
        nodes: parsed.length,
        contentLength: content.length,
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
