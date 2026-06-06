<script setup lang="ts">
import { computed, getCurrentInstance } from 'vue-demi'
import { customComponentsRevision, getCustomNodeComponents } from '../../utils/nodeComponents'
import ListItemNode from '../ListItemNode'
import { MathBlockNodeAsync } from '../NodeRenderer/asyncComponent'
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

const { node, customId, indexKey, typewriter, fade, showTooltips } = defineProps<{
  node: {
    type: 'list'
    ordered: boolean
    start?: number
    items: ListItem[]
    raw: string
  }
  customId?: string
  indexKey?: number | string
  typewriter?: boolean
  fade?: boolean
  showTooltips?: boolean
}>()

const emit = defineEmits(['copy'])
const instance = getCurrentInstance()

const customComponents = computed(() => {
  void customComponentsRevision.value
  return getCustomNodeComponents(customId)
})
const listItemComponent = computed(() => {
  return (customComponents.value as any).list_item || ListItemNode
})
const hasListItemOverride = computed(() => Boolean((customComponents.value as any).list_item))
const hasListOverride = computed(() => Boolean((customComponents.value as any).list))
const hasParagraphOverride = computed(() => Boolean((customComponents.value as any).paragraph))
const hasMathBlockOverride = computed(() => Boolean((customComponents.value as any).math_block))
const hasCopyListener = Boolean((instance?.proxy as any)?.$listeners?.copy)
function handleCopy(text: string) {
  emit('copy', text)
}
const listItemListeners = hasCopyListener ? { copy: handleCopy } : {}

function canRenderDirectListItem(item: ListItem) {
  if (hasListItemOverride.value || hasListOverride.value || hasParagraphOverride.value || hasMathBlockOverride.value)
    return false

  return Array.isArray(item.children)
    && item.children.length > 0
    && item.children.every(child => child?.type === 'paragraph' || child?.type === 'math_block' || child?.type === 'list')
}

function getListItemChildComponent(child: NodeChild) {
  if (child.type === 'math_block')
    return MathBlockNodeAsync
  if (child.type === 'list')
    return (instance?.proxy as any)?.$options
  return ParagraphNode
}
</script>

<template>
  <ol
    v-if="node.ordered"
    class="list-node"
    :class="{ 'list-decimal': node.ordered, 'list-disc': !node.ordered }"
  >
    <template v-for="(item, index) in node.items">
      <li
        v-if="canRenderDirectListItem(item)"
        :key="`${indexKey || 'list'}-${index}`"
        class="list-item pl-1.5 my-2"
        dir="auto"
        :value="(node.start ?? 1) + index"
      >
        <component
          :is="getListItemChildComponent(child)"
          v-for="(child, childIndex) in item.children"
          :key="`${indexKey || 'list'}-${index}-${childIndex}`"
          :node="child"
          :custom-id="customId"
          :index-key="`${indexKey || 'list'}-${index}-${childIndex}`"
          :typewriter="typewriter"
          :fade="fade"
          :show-tooltips="showTooltips"
        />
      </li>
      <component
        :is="listItemComponent"
        v-else
        :key="`${indexKey || 'list'}-${index}`"
        :show-tooltips="showTooltips"
        :node="item"
        :custom-id="customId"
        :index-key="`${indexKey || 'list'}-${index}`"
        :typewriter="typewriter"
        :fade="fade"
        :value="(node.start ?? 1) + index"
        v-on="listItemListeners"
      />
    </template>
  </ol>
  <ul
    v-else
    class="list-node"
    :class="{ 'list-decimal': node.ordered, 'list-disc': !node.ordered }"
  >
    <template v-for="(item, index) in node.items">
      <li
        v-if="canRenderDirectListItem(item)"
        :key="`${indexKey || 'list'}-${index}`"
        class="list-item pl-1.5 my-2"
        dir="auto"
      >
        <component
          :is="getListItemChildComponent(child)"
          v-for="(child, childIndex) in item.children"
          :key="`${indexKey || 'list'}-${index}-${childIndex}`"
          :node="child"
          :custom-id="customId"
          :index-key="`${indexKey || 'list'}-${index}-${childIndex}`"
          :typewriter="typewriter"
          :fade="fade"
          :show-tooltips="showTooltips"
        />
      </li>
      <component
        :is="listItemComponent"
        v-else
        :key="`${indexKey || 'list'}-${index}`"
        :show-tooltips="showTooltips"
        :node="item"
        :custom-id="customId"
        :index-key="`${indexKey || 'list'}-${index}`"
        :typewriter="typewriter"
        :fade="fade"
        :value="undefined"
        v-on="listItemListeners"
      />
    </template>
  </ul>
</template>

<style scoped>
.list-node {
  @apply my-5 pl-[calc(13/8*1em)];
}
.list-decimal {
  list-style-type: decimal;
}
.list-disc {
  list-style-type: disc;
  @apply max-lg:my-[calc(4/3*1em)] max-lg:pl-[calc(14/9*1em)];
}
</style>
