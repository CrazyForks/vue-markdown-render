<script setup lang="ts">
import { getCustomNodeComponents } from '../../utils/nodeComponents'
import EmojiNode from '../EmojiNode'
import EmphasisNode from '../EmphasisNode'
import FootnoteReferenceNode from '../FootnoteReferenceNode'
import HighlightNode from '../HighlightNode'
import InlineCodeNode from '../InlineCodeNode'
import InsertNode from '../InsertNode'
import LinkNode from '../LinkNode'
import { MathInlineNodeAsync } from '../NodeRenderer/asyncComponent'
import ReferenceNode from '../ReferenceNode'
import StrikethroughNode from '../StrikethroughNode'
import SubscriptNode from '../SubscriptNode'
import SuperscriptNode from '../SuperscriptNode'
import TextNode from '../TextNode'

interface NodeChild {
  type: string
  raw: string
  [key: string]: unknown
}

const props = defineProps<{
  node: {
    type: 'strong'
    children: NodeChild[]
    raw: string
  }
  customId?: string
  indexKey?: number | string
}>()

// Available node components for child rendering
const nodeComponents = {
  text: TextNode,
  inline_code: InlineCodeNode,
  link: LinkNode,
  emphasis: EmphasisNode,
  strikethrough: StrikethroughNode,
  highlight: HighlightNode,
  insert: InsertNode,
  subscript: SubscriptNode,
  superscript: SuperscriptNode,
  emoji: EmojiNode,
  footnote_reference: FootnoteReferenceNode,
  math_inline: MathInlineNodeAsync,
  reference: ReferenceNode,
  // 添加其他内联元素组件
  ...getCustomNodeComponents(props.customId),
}
</script>

<template>
  <strong class="strong-node">
    <component
      :is="nodeComponents[child.type]"
      v-for="(child, index) in node.children"
      :key="`${indexKey || 'strong'}-${index}`"
      :index-key="`${indexKey || 'strong'}-${index}`"
      :node="child"
      :custom-id="props.customId"
    />
  </strong>
</template>

<style scoped>
.strong-node {
  font-weight: bold;
}
</style>
