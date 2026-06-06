<script setup lang="ts">
import { computed, getCurrentInstance } from 'vue-demi'
import { customComponentsRevision, getCustomNodeComponents } from '../../utils/nodeComponents'
import { isLegacyVue26Vm } from '../../utils/vue26'
import NodeRenderer from '../NodeRenderer'
import LegacyNodesRenderer from '../NodeRenderer/LegacyNodesRenderer.vue'
import ParagraphNode from '../ParagraphNode'

interface NodeChild {
  type: string
  raw: string
  children?: NodeChild[]
  [key: string]: unknown
}

interface ListItem {
  type: 'list_item'
  children: NodeChild[]
  raw: string
}

interface ParagraphNodeChild {
  type: 'paragraph'
  children: NodeChild[]
  raw: string
}

const props = defineProps<{
  node?: ListItem
  item?: ListItem
  indexKey?: number | string
  value?: number
  customId?: string
  typewriter?: boolean
  fade?: boolean
  showTooltips?: boolean
}>()

const emit = defineEmits<{
  (e: 'copy', text: string): void
}>()

const itemNode = computed(() => props.node ?? props.item)
const liValueAttr = computed(() => (props.value == null ? {} : { value: props.value }))
const instance = getCurrentInstance()
const customComponents = computed(() => {
  void customComponentsRevision.value
  return getCustomNodeComponents(props.customId)
})
const hasParagraphOverride = computed(() => Boolean((customComponents.value as any).paragraph))
const simpleParagraph = computed<ParagraphNodeChild | null>(() => {
  if (hasParagraphOverride.value)
    return null

  const children = itemNode.value?.children
  if (!Array.isArray(children) || children.length !== 1)
    return null

  const child = children[0]
  return child?.type === 'paragraph' && Array.isArray((child as any).children)
    ? child as ParagraphNodeChild
    : null
})
const nestedRenderer = computed(() => {
  const vm = instance?.proxy as any
  return isLegacyVue26Vm(vm) ? LegacyNodesRenderer : NodeRenderer
})
const hasCopyListener = Boolean((instance?.proxy as any)?.$listeners?.copy)
function handleCopy(text: string) {
  emit('copy', text)
}
const nestedListeners = hasCopyListener ? { copy: handleCopy } : {}
</script>

<template>
  <li class="list-item pl-1.5 my-2" dir="auto" v-bind="liValueAttr">
    <ParagraphNode
      v-if="simpleParagraph"
      :node="simpleParagraph"
      :custom-id="props.customId"
      :index-key="`list-item-${props.indexKey}-paragraph`"
    />
    <component
      :is="nestedRenderer"
      v-else
      :show-tooltips="props.showTooltips"
      :index-key="`list-item-${props.indexKey}`"
      :nodes="itemNode?.children ?? []"
      :custom-id="props.customId"
      :typewriter="props.typewriter"
      :fade="props.fade"
      :batch-rendering="false"
      v-on="nestedListeners"
    />
  </li>
</template>

<style scoped>
ol > .list-item::marker{
  color: var(--list-item-counter-marker,#64748b);
  line-height: 1.6;
}
ul > .list-item::marker{
  color: var(--list-item-marker,#cbd5e1)
}

.list-item ::v-deep .markdown-renderer {
  content-visibility: visible;
  contain-intrinsic-size: 0px 0px;
  contain: none;
}
</style>
