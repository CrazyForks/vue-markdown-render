<script setup lang="ts">
import type { SimpleInlineNode } from './simpleInline'
import { computed } from 'vue'
import { useCustomNodeComponents } from '../../utils/nodeComponents'
import CheckboxNode from '../CheckboxNode'
import EmojiNode from '../EmojiNode'
import EmphasisNode from '../EmphasisNode'
import HardBreakNode from '../HardBreakNode'
import HighlightNode from '../HighlightNode'
import InlineCodeNode from '../InlineCodeNode'
import InsertNode from '../InsertNode'
import LinkNode from '../LinkNode'
import NodeChildRenderer from '../NodeChildRenderer'
import ReferenceNode from '../ReferenceNode'
import StrikethroughNode from '../StrikethroughNode'
import StrongNode from '../StrongNode'
import SubscriptNode from '../SubscriptNode'
import SuperscriptNode from '../SuperscriptNode'
import TextNode from '../TextNode'

const props = defineProps<{
  nodes: SimpleInlineNode[]
  customId?: string
  indexKey?: number | string
}>()

const overrides = useCustomNodeComponents(() => props.customId)
const nodeComponents = computed(() => ({
  checkbox: CheckboxNode,
  checkbox_input: CheckboxNode,
  emoji: EmojiNode,
  emphasis: EmphasisNode,
  hardbreak: HardBreakNode,
  highlight: HighlightNode,
  inline_code: InlineCodeNode,
  insert: InsertNode,
  link: LinkNode,
  reference: ReferenceNode,
  strikethrough: StrikethroughNode,
  strong: StrongNode,
  subscript: SubscriptNode,
  superscript: SuperscriptNode,
  text: TextNode,
  ...overrides.value,
}))
</script>

<template>
  <NodeChildRenderer
    v-for="(node, index) in nodes"
    :key="`${indexKey || 'inline'}-${index}`"
    :components="nodeComponents"
    :node="node"
    :custom-id="props.customId"
    :index-key="`${indexKey || 'inline'}-${index}`"
  />
</template>
