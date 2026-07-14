<script setup lang="ts">
import type { CodeBlockPreviewPayload, MarkdownCodeBlockPreviewPayload, ShikiCodeBlockProps } from '../../types/component-props'
import { computed, useAttrs } from 'vue'
import CodeBlockNode from '../CodeBlockNode/CodeBlockNode.vue'

const CodeBlockNodeAdapter = CodeBlockNode as any

interface MarkdownCodeBlockNodeProps extends ShikiCodeBlockProps {
  node: {
    type: 'code_block'
    language: string
    code: string
    raw: string
    loading?: boolean
    diff?: boolean
    originalCode?: string
    updatedCode?: string
  }
  loading?: boolean
  stream?: boolean
  darkTheme?: string
  lightTheme?: string
  isDark?: boolean
  isShowPreview?: boolean
  enableFontSizeControl?: boolean
  minWidth?: string | number
  maxWidth?: string | number
  showPreviewButton?: boolean
  showCollapseButton?: boolean
  showFontSizeButtons?: boolean
  showTooltips?: boolean
  autoScrollOnUpdate?: boolean
  autoScrollInitial?: boolean
  estimatedHeightPx?: number
  estimatedContentHeightPx?: number
}

const props = withDefaults(defineProps<MarkdownCodeBlockNodeProps>(), {
  isShowPreview: true,
  darkTheme: 'vitesse-dark',
  lightTheme: 'vitesse-light',
  isDark: false,
  loading: true,
  stream: true,
  enableFontSizeControl: true,
  minWidth: undefined,
  maxWidth: undefined,
  showHeader: true,
  showCopyButton: true,
  showExpandButton: true,
  showPreviewButton: true,
  showCollapseButton: true,
  showFontSizeButtons: true,
})

const emits = defineEmits<{
  (e: 'previewCode', payload: MarkdownCodeBlockPreviewPayload): void
  (e: 'copy', code: string): void
}>()

const attrs = useAttrs()
const codeBlockProps = computed<Record<string, unknown>>(() => ({
  ...attrs,
  node: props.node,
  loading: props.loading,
  stream: props.stream,
  darkTheme: props.darkTheme,
  lightTheme: props.lightTheme,
  isDark: props.isDark,
  isShowPreview: props.isShowPreview,
  enableFontSizeControl: props.enableFontSizeControl,
  minWidth: props.minWidth,
  maxWidth: props.maxWidth,
  themes: props.themes as unknown as Record<string, unknown>[],
  showHeader: props.showHeader,
  showCopyButton: props.showCopyButton,
  showExpandButton: props.showExpandButton,
  showPreviewButton: props.showPreviewButton,
  showCollapseButton: props.showCollapseButton,
  showFontSizeButtons: props.showFontSizeButtons,
  showTooltips: props.showTooltips,
  estimatedHeightPx: props.estimatedHeightPx,
  estimatedContentHeightPx: props.estimatedContentHeightPx,
}))

function handlePreview(payload: CodeBlockPreviewPayload) {
  emits('previewCode', {
    type: payload.artifactType,
    content: props.node.code,
    title: payload.artifactTitle,
  })
}
</script>

<template>
  <CodeBlockNodeAdapter
    v-bind="codeBlockProps"
    @preview-code="handlePreview"
    @copy="code => emits('copy', code)"
  >
    <template v-if="$slots['header-left']" #header-left>
      <slot name="header-left" />
    </template>
    <template v-if="$slots['header-right']" #header-right>
      <slot name="header-right" />
    </template>
    <template v-if="$slots.loading" #loading="slotProps">
      <slot name="loading" v-bind="slotProps" />
    </template>
  </CodeBlockNodeAdapter>
</template>
