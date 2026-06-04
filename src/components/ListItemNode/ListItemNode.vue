<script setup lang="ts">
import { computed, provide } from 'vue'
import { useCustomNodeComponents } from '../../utils/nodeComponents'
import NodeRenderer from '../NodeRenderer'
import ParagraphNode from '../ParagraphNode'
import SimpleInlineRenderer from '../SimpleInlineRenderer'
import { areSimpleInlineNodes } from '../SimpleInlineRenderer/simpleInline'

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
const simpleParagraphNode = computed(() => {
  if ((customComponents.value as any).paragraph)
    return null

  const children = itemNode.value?.children
  if (!Array.isArray(children) || children.length !== 1)
    return null

  const child = children[0]
  if (child?.type !== 'paragraph' || !Array.isArray((child as any).children))
    return null

  return areSimpleInlineNodes((child as any).children) ? child : null
})
const simpleInlineChildren = computed(() => {
  if (simpleParagraphNode.value)
    return null

  const children = itemNode.value?.children
  return areSimpleInlineNodes(children) ? children : null
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
    <ParagraphNode
      v-if="simpleParagraphNode"
      :node="simpleParagraphNode as any"
      :custom-id="props.customId"
      :index-key="`list-item-${props.indexKey}-paragraph`"
    />
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

/* 大列表滚动到视口时，嵌套 NodeRenderer 需要立即绘制内容，避免空白 */
.list-item :deep(.markdown-renderer) {
  content-visibility: visible;
  contain-intrinsic-size: 0px 0px;
  contain: none;
}
</style>
