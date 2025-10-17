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
import StrongNode from '../StrongNode'
import SubscriptNode from '../SubscriptNode'
import TextNode from '../TextNode'

interface NodeChild {
  type: string
  raw: string
  [key: string]: unknown
}

const props = defineProps<{
  node: {
    type: 'superscript'
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
  strong: StrongNode,
  emphasis: EmphasisNode,
  footnote_reference: FootnoteReferenceNode,
  strikethrough: StrikethroughNode,
  highlight: HighlightNode,
  insert: InsertNode,
  subscript: SubscriptNode,
  emoji: EmojiNode,
  math_inline: MathInlineNodeAsync,
  reference: ReferenceNode,
  // 添加其他内联元素组件
  ...getCustomNodeComponents(props.customId),
}
</script>

<template>
  <sup class="superscript-node">
    <component
      :is="nodeComponents[child.type]"
      v-for="(child, index) in node.children"
      :key="`${indexKey || 'superscript'}-${index}`"
      :index-key="`${indexKey || 'superscript'}-${index}`"
      :node="child"
      :custom-id="props.customId"
    />
  </sup>
</template>

<style scoped>
.superscript-node {
  font-size: 0.8em;
  vertical-align: super;
}
</style>
