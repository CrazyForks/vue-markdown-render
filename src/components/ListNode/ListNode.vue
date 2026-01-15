<script setup lang="ts">
import { computed } from 'vue'
import ListItemNode from '../ListItemNode'
import { customComponentsRevision, getCustomNodeComponents } from '../../utils/nodeComponents'

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

const { node, customId, indexKey, typewriter } = defineProps<{
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
}>()

defineEmits(['copy'])

const listItemComponent = computed(() => {
  void customComponentsRevision.value
  const customComponents = getCustomNodeComponents(customId)
  return (customComponents as any).list_item || ListItemNode
})
</script>

<template>
  <component
    :is="node.ordered ? 'ol' : 'ul'"
    class="list-node"
    :class="{ 'list-decimal': node.ordered, 'list-disc': !node.ordered }"
  >
    <component
      :is="listItemComponent"
      v-for="(item, index) in node.items"
      :key="`${indexKey || 'list'}-${index}`"
      v-memo="[item]"
      :node="item"
      :custom-id="customId"
      :index-key="`${indexKey || 'list'}-${index}`"
      :typewriter="typewriter"
      :value="node.ordered ? (node.start ?? 1) + index : undefined"
      @copy="$emit('copy', $event)"
    />
  </component>
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
