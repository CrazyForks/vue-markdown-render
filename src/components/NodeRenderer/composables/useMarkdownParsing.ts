import type {
  MarkdownIt,
  ParsedNode,
} from 'stream-markdown-parser'
import type { ComputedRef } from 'vue'
import type { NodeRendererProps } from '../../../types/node-renderer-props'
import {
  getMarkdown,
  mergeCustomHtmlTags,
  parseMarkdownToStructure,
  resolveCustomHtmlTags,
} from 'stream-markdown-parser'
import { computed, markRaw } from 'vue'

type RendererParseOptions = NonNullable<NodeRendererProps['parseOptions']>

export interface MarkdownParsingOptions {
  instanceMsgId: string
  renderContent: ComputedRef<string>
  effectiveFinal: ComputedRef<boolean | undefined>
  debugPerformanceEnabled: ComputedRef<boolean>
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

export function useMarkdownParsing(
  props: Readonly<NodeRendererProps>,
  options: MarkdownParsingOptions,
): MarkdownParsingState {
  const defaultMd = getMarkdown(options.instanceMsgId)
  const customTagCache = new Map<string, MarkdownIt>()

  const effectiveCustomHtmlTags = computed(() => {
    return mergeCustomHtmlTags(
      props.customHtmlTags,
      props.parseOptions?.customHtmlTags,
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
    if (props.nodes?.length)
      return markRaw((props.nodes as unknown as ParsedNode[]).slice())

    const contentToParse = options.renderContent.value

    if (!contentToParse)
      return []

    const parseStart = options.debugPerformanceEnabled.value
      ? performance.now()
      : 0

    const parsed = parseMarkdownToStructure(
      contentToParse,
      mdInstance.value,
      mergedParseOptions.value,
    )

    if (options.debugPerformanceEnabled.value) {
      options.logPerf('parse(sync)', {
        ms: Math.round(performance.now() - parseStart),
        nodes: parsed.length,
        contentLength: contentToParse.length,
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
