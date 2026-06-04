<script setup lang="ts">
import { computed, provide } from 'vue'
import { useCustomNodeComponents } from '../../utils/nodeComponents'
import NodeRenderer from '../NodeRenderer'
import SimpleInlineRenderer from '../SimpleInlineRenderer'
import { areSimpleInlineNodes, getPlainTextContent } from '../SimpleInlineRenderer/simpleInline'

// child node shape used across many node components
interface NodeChild {
  type: string
  raw: string
  children?: NodeChild[]
  [key: string]: unknown
}

interface BlockquoteNode {
  type: 'blockquote'
  children: NodeChild[]
  raw: string
  // optional citation/source for the blockquote
  cite?: string
}

const props = defineProps<{
  node: BlockquoteNode
  indexKey: string | number
  typewriter?: boolean
  fade?: boolean
  customId?: string
  showTooltips?: boolean
}>()

// typed emit for better DX and type-safety when forwarding copy events
defineEmits<{
  copy: [text: string]
}>()

const customComponents = useCustomNodeComponents(() => props.customId)
const simpleParagraphChildren = computed(() => {
  if ((customComponents.value as any).paragraph)
    return null

  const children = props.node.children
  if (!Array.isArray(children) || children.length !== 1)
    return null

  const child = children[0]
  if (child?.type !== 'paragraph' || !Array.isArray(child.children))
    return null

  const paragraphChildren = child.children
  return areSimpleInlineNodes(paragraphChildren) ? paragraphChildren : null
})
const simpleInlineChildren = computed(() => {
  if (simpleParagraphChildren.value)
    return null

  const children = props.node.children
  return areSimpleInlineNodes(children) ? children : null
})
const canRenderPlainTextInline = computed(() => {
  return props.fade === false && !(customComponents.value as any).text
})
const simpleParagraphPlainText = computed(() => {
  if (!canRenderPlainTextInline.value)
    return null

  return getPlainTextContent(simpleParagraphChildren.value)
})
const simpleInlinePlainText = computed(() => {
  if (!canRenderPlainTextInline.value)
    return null

  return getPlainTextContent(simpleInlineChildren.value)
})

provide('markstreamShowTooltips', computed(() => props.showTooltips))
provide('markstreamFade', computed(() => props.fade))
</script>

<template>
  <blockquote class="blockquote blockquote-node" dir="auto" :cite="node.cite">
    <p
      v-if="simpleParagraphChildren"
      dir="auto"
      class="paragraph-node"
    >
      <span
        v-if="simpleParagraphPlainText !== null"
        class="simple-inline-text whitespace-pre-wrap break-words text-node"
        :custom-id="props.customId"
      >{{ simpleParagraphPlainText }}</span>
      <SimpleInlineRenderer
        v-else
        :nodes="simpleParagraphChildren"
        :custom-id="props.customId"
        :index-key="`blockquote-${props.indexKey}-paragraph`"
      />
    </p>
    <span
      v-else-if="simpleInlinePlainText !== null"
      class="simple-inline-text whitespace-pre-wrap break-words text-node"
      :custom-id="props.customId"
    >{{ simpleInlinePlainText }}</span>
    <SimpleInlineRenderer
      v-else-if="simpleInlineChildren"
      :nodes="simpleInlineChildren"
      :custom-id="props.customId"
      :index-key="`blockquote-${props.indexKey}`"
    />
    <NodeRenderer
      v-else
      :show-tooltips="props.showTooltips"
      :index-key="`blockquote-${props.indexKey}`"
      :nodes="props.node.children || []"
      :custom-id="props.customId"
      :typewriter="props.typewriter"
      :fade="props.fade"
      @copy="$emit('copy', $event)"
    />
  </blockquote>
</template>

<style scoped>
.blockquote {
  font-weight: 400;
  font-style: normal;
  color: var(--blockquote-fg, hsl(var(--ms-muted-foreground)));
  border-left: 3px solid var(--blockquote-border);
  margin-top: var(--ms-flow-blockquote-y);
  margin-bottom: var(--ms-flow-blockquote-y);
  padding-left: var(--ms-flow-blockquote-indent);
}

.blockquote > .paragraph-node {
  font-size: var(--ms-text-body);
  line-height: var(--ms-leading-body);
  margin: 0;
}

/* 防止内部 NodeRenderer 使用 content-visibility: auto 时在大文档滚动中出现“高但空白”的占位 */
.blockquote :deep(.markdown-renderer) {
  content-visibility: visible;
  contain: content;
  contain-intrinsic-size: 0px 0px;
}
</style>
