<script setup lang="ts">
import { computed, getCurrentInstance } from 'vue-demi'
import { isLegacyVue26Vm } from '../../utils/vue26'
import NodeRenderer from '../NodeRenderer'
import LegacyNodesRenderer from '../NodeRenderer/LegacyNodesRenderer.vue'

interface DefinitionItemNode {
  type: 'definition_item'
  term: { type: string, raw: string }[]
  definition: { type: string, raw: string }[]
  raw: string
}

interface DefinitionListNode {
  type: 'definition_list'
  items: DefinitionItemNode[]
  raw: string
}

const props = defineProps<{
  node: DefinitionListNode
  indexKey: string | number
  typewriter?: boolean
  fade?: boolean
  customId?: string
}>()

const emit = defineEmits(['copy'])

const instance = getCurrentInstance()
const nestedRenderer = computed(() => {
  const vm = instance?.proxy as any
  return isLegacyVue26Vm(vm) ? LegacyNodesRenderer : NodeRenderer
})
const hasCopyListener = Boolean((instance?.proxy as any)?.$listeners?.copy)
function handleCopy(text: string) {
  emit('copy', text)
}

const definitionEntries = computed(() => {
  return props.node.items.flatMap((item, index) => ([
    {
      key: `definition-term-${props.indexKey}-${index}`,
      tag: 'dt',
      className: 'definition-term',
      nodes: item.term,
    },
    {
      key: `definition-desc-${props.indexKey}-${index}`,
      tag: 'dd',
      className: 'definition-desc',
      nodes: item.definition,
    },
  ]))
})
</script>

<template>
  <dl class="definition-list">
    <component
      :is="entry.tag"
      v-for="entry in definitionEntries"
      :key="entry.key"
      :class="entry.className"
    >
      <component
        :is="nestedRenderer"
        v-if="hasCopyListener"
        :index-key="entry.key"
        :nodes="entry.nodes"
        :custom-id="props.customId"
        :typewriter="props.typewriter"
        :fade="props.fade"
        @copy="handleCopy"
      />
      <component
        :is="nestedRenderer"
        v-else
        :index-key="entry.key"
        :nodes="entry.nodes"
        :custom-id="props.customId"
        :typewriter="props.typewriter"
        :fade="props.fade"
      />
    </component>
  </dl>
</template>

<style scoped>
.definition-list {
  margin: 0 0 1rem;
}

.definition-term {
  font-weight: 600;
  margin-top: 0.5rem;
}

.definition-desc {
  margin-left: 1rem;
  margin-bottom: 0.5rem;
}

.definition-list ::v-deep .markdown-renderer {
  content-visibility: visible;
  contain: content;
  contain-intrinsic-size: 0px 0px;
}
</style>
