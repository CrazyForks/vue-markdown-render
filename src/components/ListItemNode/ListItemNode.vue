<script setup lang="ts">
import { computed, provide } from 'vue'
import { useCustomNodeComponents } from '../../utils/nodeComponents'
import NodeRenderer from '../NodeRenderer'
import SimpleInlineRenderer from '../SimpleInlineRenderer'
import { areSimpleInlineNodes, getPlainTextContent } from '../SimpleInlineRenderer/simpleInline'

// 节点子元素类型
interface NodeChild {
  type: string
  raw: string
  [key: string]: unknown
}

// 列表项类型
interface ListItem {
  type: 'list_item'
  children: NodeChild[]
  raw: string
}

const props = defineProps<{
  /**
   * Preferred prop name for consistency with other node components.
   * `item` is kept for backward compatibility.
   */
  node?: ListItem
  item?: ListItem
  indexKey?: number | string
  customId?: string
  typewriter?: boolean
  fade?: boolean
  showTooltips?: boolean
  value?: number | null
}>()

defineEmits<{
  copy: [text: string]
}>()

const itemNode = computed(() => props.node ?? props.item)
const customComponents = useCustomNodeComponents(() => props.customId)
const simpleParagraphChildren = computed(() => {
  if ((customComponents.value as any).paragraph)
    return null

  const children = itemNode.value?.children
  if (!Array.isArray(children) || children.length !== 1)
    return null

  const child = children[0]
  if (child?.type !== 'paragraph' || !Array.isArray((child as any).children))
    return null

  const paragraphChildren = (child as any).children
  return areSimpleInlineNodes(paragraphChildren) ? paragraphChildren : null
})
const simpleInlineChildren = computed(() => {
  if (simpleParagraphChildren.value)
    return null

  const children = itemNode.value?.children
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

const EMPTY_LI_VALUE_ATTRS = Object.freeze({}) as Record<string, never>

const liValueAttrs = computed(() => {
  const { value } = props

  return typeof value === 'number' && Number.isFinite(value)
    ? { value }
    : EMPTY_LI_VALUE_ATTRS
})

provide('markstreamShowTooltips', computed(() => props.showTooltips))
provide('markstreamFade', computed(() => props.fade))
</script>

<template>
  <li class="list-item" dir="auto" v-bind="liValueAttrs">
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
        :index-key="`list-item-${props.indexKey}-paragraph`"
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
      :index-key="`list-item-${props.indexKey}`"
    />
    <NodeRenderer
      v-else
      :show-tooltips="props.showTooltips"
      :index-key="`list-item-${props.indexKey}`"
      :nodes="itemNode?.children ?? []"
      :custom-id="props.customId"
      :typewriter="props.typewriter"
      :fade="props.fade"
      :batch-rendering="false"
      @copy="$emit('copy', $event)"
    />
  </li>
</template>

<style scoped>
.list-item {
  margin: var(--ms-flow-list-item-y) 0;
  padding-left: var(--ms-space-1_5);
}

ol > .list-item::marker {
  color: var(--list-counter-marker);
  line-height: 1.6;
}

ul > .list-item::marker {
  color: var(--list-marker);
}

.list-item > .paragraph-node {
  font-size: var(--ms-text-body);
  line-height: var(--ms-leading-body);
  margin: 0;
}

/* 大列表滚动到视口时，嵌套 NodeRenderer 需要立即绘制内容，避免空白 */
.list-item :deep(.markdown-renderer) {
  content-visibility: visible;
  contain-intrinsic-size: 0px 0px;
  contain: none;
}
</style>
