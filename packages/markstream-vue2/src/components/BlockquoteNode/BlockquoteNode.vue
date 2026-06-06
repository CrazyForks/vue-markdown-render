<script setup lang="ts">
import { computed, getCurrentInstance } from 'vue-demi'
import { customComponentsRevision, getCustomNodeComponents } from '../../utils/nodeComponents'
import { isLegacyVue26Vm } from '../../utils/vue26'
import ListNode from '../ListNode'
import NodeRenderer from '../NodeRenderer'
import { MathBlockNodeAsync } from '../NodeRenderer/asyncComponent'
import LegacyNodesRenderer from '../NodeRenderer/LegacyNodesRenderer.vue'
import ParagraphNode from '../ParagraphNode'

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
  cite?: string
}

const props = defineProps<{
  node: BlockquoteNode
  indexKey: string | number
  typewriter?: boolean
  fade?: boolean
  customId?: string
}>()

const emit = defineEmits<{
  (e: 'copy', text: string): void
}>()

const instance = getCurrentInstance()
const customComponents = computed(() => {
  void customComponentsRevision.value
  return getCustomNodeComponents(props.customId)
})
const nestedRenderer = computed(() => {
  const vm = instance?.proxy as any
  return isLegacyVue26Vm(vm) ? LegacyNodesRenderer : NodeRenderer
})
const hasCopyListener = Boolean((instance?.proxy as any)?.$listeners?.copy)
function handleCopy(text: string) {
  emit('copy', text)
}
const directChildListeners = hasCopyListener ? { copy: handleCopy } : {}

function canRenderDirectChild(child: NodeChild) {
  const components = customComponents.value as any
  if (child.type === 'paragraph')
    return !components.paragraph
  if (child.type === 'math_block')
    return !components.math_block
  if (child.type === 'list')
    return !components.list && !components.list_item && !components.paragraph && !components.math_block
  if (child.type === 'blockquote')
    return !components.blockquote && Array.isArray(child.children) && child.children.length > 0 && child.children.every(canRenderDirectChild)
  return false
}

const directChildren = computed<NodeChild[] | null>(() => {
  const children = props.node.children || []
  if (!children.length || !children.every(canRenderDirectChild))
    return null

  return children
})
const staticDirectChildren = computed(() => (
  props.typewriter === false && props.fade === false
    ? directChildren.value
    : null
))

function getDirectChildComponent(child: NodeChild) {
  if (child.type === 'math_block')
    return MathBlockNodeAsync
  if (child.type === 'list')
    return ListNode
  if (child.type === 'blockquote')
    return (instance?.proxy as any)?.$options
  return ParagraphNode
}
</script>

<template>
  <blockquote v-if="staticDirectChildren" v-once class="blockquote" dir="auto" :cite="node.cite">
    <component
      :is="getDirectChildComponent(child)"
      v-for="(child, childIndex) in staticDirectChildren"
      :key="`${props.indexKey}-${childIndex}`"
      :node="child"
      :custom-id="props.customId"
      :index-key="`blockquote-${props.indexKey}-${childIndex}`"
      :typewriter="props.typewriter"
      :fade="props.fade"
      v-on="directChildListeners"
    />
  </blockquote>
  <blockquote v-else class="blockquote" dir="auto" :cite="node.cite">
    <template v-if="directChildren">
      <component
        :is="getDirectChildComponent(child)"
        v-for="(child, childIndex) in directChildren"
        :key="`${props.indexKey}-${childIndex}`"
        :node="child"
        :custom-id="props.customId"
        :index-key="`blockquote-${props.indexKey}-${childIndex}`"
        :typewriter="props.typewriter"
        :fade="props.fade"
        v-on="directChildListeners"
      />
    </template>
    <component
      :is="nestedRenderer"
      v-else-if="hasCopyListener"
      :index-key="`blockquote-${props.indexKey}`"
      :nodes="props.node.children || []"
      :custom-id="props.customId"
      :typewriter="props.typewriter"
      :fade="props.fade"
      @copy="handleCopy"
    />
    <component
      :is="nestedRenderer"
      v-else
      :index-key="`blockquote-${props.indexKey}`"
      :nodes="props.node.children || []"
      :custom-id="props.customId"
      :typewriter="props.typewriter"
      :fade="props.fade"
    />
  </blockquote>
</template>

<style scoped>
.blockquote {
  font-weight: 500;
  font-style: italic;
  border-left: 0.25rem solid var(--blockquote-border-color,#e2e8f0);
  quotes: "\201C" "\201D" "\2018" "\2019";
  margin: 1.6em 0;
  padding-left: 1em;
}

.blockquote ::v-deep .markdown-renderer {
  content-visibility: visible;
  contain: content;
  contain-intrinsic-size: 0px 0px;
}
</style>
