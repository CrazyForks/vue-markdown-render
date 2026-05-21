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

const PARSE_COALESCE_MS = 80

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

function getStableNodePayload(node: ParsedNode) {
  const record = node as Record<string, unknown>
  const raw = record.raw
  if (typeof raw === 'string')
    return raw

  for (const key of ['code', 'content', 'text']) {
    const value = record[key]
    if (typeof value === 'string')
      return value
  }

  return ''
}

function isParsedNodeStable(previous: ParsedNode, next: ParsedNode) {
  if (previous.type !== next.type)
    return false

  const previousRecord = previous as Record<string, unknown>
  const nextRecord = next as Record<string, unknown>

  if (previousRecord.loading !== nextRecord.loading)
    return false
  if (previousRecord.diff !== nextRecord.diff)
    return false
  if (previousRecord.language !== nextRecord.language)
    return false

  const previousPayload = getStableNodePayload(previous)
  return previousPayload !== '' && previousPayload === getStableNodePayload(next)
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

export function useMarkdownParsing(
  props: Readonly<NodeRendererProps>,
  options: MarkdownParsingOptions,
): MarkdownParsingState {
  const defaultMd = getMarkdown(options.instanceMsgId)
  const customTagCache = new Map<string, MarkdownIt>()
  const smoothStreamingEnabled = options.smoothStreamingEnabled ?? computed(() => false)
  const contentToParse = ref(options.renderContent.value)
  let previousParsedNodes: ParsedNode[] = []
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

    const delay = Math.max(0, PARSE_COALESCE_MS - (getNow() - lastParseFlushAt))
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

  const parsedNodes = computed<ParsedNode[]>(() => {
    if (props.nodes?.length) {
      previousParsedNodes = []
      return markRaw((props.nodes as unknown as ParsedNode[]).slice())
    }

    const content = contentToParse.value

    if (!content) {
      previousParsedNodes = []
      return []
    }

    const parseStart = options.debugPerformanceEnabled.value
      ? getNow()
      : 0
    const md = mdInstance.value
    const streamStatsBefore = options.debugPerformanceEnabled.value
      ? readStreamStats(md)
      : null

    const parsed = stabilizeParsedNodes(parseMarkdownToStructure(
      content,
      md,
      mergedParseOptions.value,
    ), previousParsedNodes)
    previousParsedNodes = parsed

    if (options.debugPerformanceEnabled.value) {
      const streamStats = readStreamStats(md)
      const usedStream = typeof streamStats?.total === 'number'
        && streamStats.total > (streamStatsBefore?.total ?? 0)

      options.logPerf(usedStream ? 'parse(stream)' : 'parse(sync)', {
        ms: Math.round(getNow() - parseStart),
        nodes: parsed.length,
        contentLength: content.length,
        ...(streamStats ? { streamStats } : {}),
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
