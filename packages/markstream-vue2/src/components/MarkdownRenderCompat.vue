<script lang="ts">
import type { BaseNode, MarkdownIt, ParseOptions } from 'stream-markdown-parser'
import type { NodeRendererProps } from './NodeRenderer/NodeRenderer.vue'
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { defineComponent } from 'vue-demi'
import { isLegacyVue26Vm, resolveVueListeners } from '../utils/vue26'
import NodeRenderer from './NodeRenderer'
import LegacyNodesRenderer from './NodeRenderer/LegacyNodesRenderer.vue'

function normalizeCustomTag(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw)
    return ''
  const match = raw.match(/^[<\s/]*([A-Z][\w:-]*)/i)
  return match ? match[1].toLowerCase() : ''
}

function resolveCustomHtmlTags(tags?: readonly string[]) {
  if (!tags || tags.length === 0)
    return { key: '', tags: [] as string[] }
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const tag of tags) {
    const value = normalizeCustomTag(tag)
    if (!value || seen.has(value))
      continue
    seen.add(value)
    normalized.push(value)
  }
  return {
    key: normalized.join(','),
    tags: normalized,
  }
}

export default defineComponent({
  name: 'MarkdownRender',
  components: {
    LegacyNodesRenderer,
    NodeRenderer,
  },
  props: {
    content: String,
    nodes: Array as unknown as () => BaseNode[] | undefined,
    final: Boolean,
    parseOptions: Object as unknown as () => ParseOptions | undefined,
    customMarkdownIt: Function as unknown as () => ((md: MarkdownIt) => MarkdownIt) | undefined,
    debugPerformance: Boolean,
    customHtmlTags: Array as unknown as () => readonly string[] | undefined,
    viewportPriority: Boolean,
    codeBlockStream: {
      type: Boolean,
      default: true,
    },
    codeBlockDarkTheme: null,
    codeBlockLightTheme: null,
    codeBlockMonacoOptions: Object as unknown as () => Record<string, any> | undefined,
    renderCodeBlocksAsPre: Boolean,
    codeBlockMinWidth: [String, Number],
    codeBlockMaxWidth: [String, Number],
    codeBlockProps: Object as unknown as () => Record<string, any> | undefined,
    showTooltips: Boolean,
    themes: Array as unknown as () => string[] | undefined,
    isDark: Boolean,
    customId: [String, Number],
    indexKey: [String, Number],
    typewriter: Boolean,
    batchRendering: Boolean,
    initialRenderBatchSize: Number,
    renderBatchSize: Number,
    renderBatchDelay: Number,
    renderBatchBudgetMs: Number,
    renderBatchIdleTimeoutMs: Number,
    deferNodesUntilVisible: Boolean,
    maxLiveNodes: Number,
    liveNodeBuffer: Number,
  },
  data() {
    return {
      instanceMsgId: this.customId
        ? `renderer-${this.customId}`
        : `renderer-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }
  },
  computed: {
    legacyVue26(): boolean {
      return isLegacyVue26Vm(this)
    },
    mergedParseOptions(): ParseOptions | undefined {
      const base = this.parseOptions ?? {}
      const resolvedFinal = this.final ?? (base as any).final
      const propTags = this.customHtmlTags ?? []
      const optionTags = (base as any).customHtmlTags ?? []
      const merged = [...propTags, ...optionTags]
        .map(normalizeCustomTag)
        .filter(Boolean)
      const hasFinal = resolvedFinal != null
      const hasCustom = merged.length > 0
      if (!hasFinal && !hasCustom)
        return base
      return {
        ...(base as any),
        ...(hasFinal ? { final: resolvedFinal } : {}),
        ...(hasCustom ? { customHtmlTags: Array.from(new Set(merged)) } : {}),
      } as ParseOptions
    },
    parsedLegacyNodes(): BaseNode[] {
      if (Array.isArray(this.nodes) && this.nodes.length > 0)
        return this.nodes
      if (!this.content)
        return []
      const { key, tags } = resolveCustomHtmlTags(this.customHtmlTags)
      const markdown = getMarkdown(key ? `${this.instanceMsgId}:${key}` : this.instanceMsgId, {
        customHtmlTags: tags,
      })
      const md = this.customMarkdownIt ? this.customMarkdownIt(markdown) : markdown
      return parseMarkdownToStructure(this.content, md, this.mergedParseOptions)
    },
    forwardedProps(): NodeRendererProps {
      return {
        content: this.content,
        nodes: this.nodes,
        final: this.final,
        parseOptions: this.parseOptions,
        customMarkdownIt: this.customMarkdownIt,
        debugPerformance: this.debugPerformance,
        customHtmlTags: this.customHtmlTags,
        viewportPriority: this.viewportPriority,
        codeBlockStream: this.codeBlockStream,
        codeBlockDarkTheme: this.codeBlockDarkTheme,
        codeBlockLightTheme: this.codeBlockLightTheme,
        codeBlockMonacoOptions: this.codeBlockMonacoOptions,
        renderCodeBlocksAsPre: this.renderCodeBlocksAsPre,
        codeBlockMinWidth: this.codeBlockMinWidth,
        codeBlockMaxWidth: this.codeBlockMaxWidth,
        codeBlockProps: this.codeBlockProps,
        showTooltips: this.showTooltips,
        themes: this.themes,
        isDark: this.isDark,
        customId: this.customId as string | undefined,
        indexKey: this.indexKey,
        typewriter: this.typewriter,
        batchRendering: this.batchRendering,
        initialRenderBatchSize: this.initialRenderBatchSize,
        renderBatchSize: this.renderBatchSize,
        renderBatchDelay: this.renderBatchDelay,
        renderBatchBudgetMs: this.renderBatchBudgetMs,
        renderBatchIdleTimeoutMs: this.renderBatchIdleTimeoutMs,
        deferNodesUntilVisible: this.deferNodesUntilVisible,
        maxLiveNodes: this.maxLiveNodes,
        liveNodeBuffer: this.liveNodeBuffer,
      }
    },
  },
  render(h) {
    const listeners = resolveVueListeners(this)

    if (this.legacyVue26) {
      return h(LegacyNodesRenderer, {
        props: {
          nodes: this.parsedLegacyNodes,
          customId: this.customId,
          indexKey: this.indexKey,
          typewriter: this.typewriter,
          showTooltips: this.showTooltips,
          codeBlockStream: this.codeBlockStream,
          codeBlockDarkTheme: this.codeBlockDarkTheme,
          codeBlockLightTheme: this.codeBlockLightTheme,
          codeBlockMonacoOptions: this.codeBlockMonacoOptions,
          renderCodeBlocksAsPre: this.renderCodeBlocksAsPre,
          codeBlockMinWidth: this.codeBlockMinWidth,
          codeBlockMaxWidth: this.codeBlockMaxWidth,
          codeBlockProps: this.codeBlockProps,
          themes: this.themes,
          isDark: this.isDark,
        },
        ...(Object.keys(listeners).length > 0 ? { on: listeners } : {}),
      })
    }

    return h(NodeRenderer, {
      props: this.forwardedProps,
      ...(Object.keys(listeners).length > 0 ? { on: listeners } : {}),
    })
  },
})
</script>
