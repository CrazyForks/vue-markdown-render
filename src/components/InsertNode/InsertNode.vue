<script setup lang="ts">
import { getCustomNodeComponents } from '../../utils/nodeComponents'
import EmojiNode from '../EmojiNode'
import EmphasisNode from '../EmphasisNode'
import FootnoteReferenceNode from '../FootnoteReferenceNode'
import HighlightNode from '../HighlightNode'
import InlineCodeNode from '../InlineCodeNode'
import LinkNode from '../LinkNode'
import { MathInlineNodeAsync } from '../NodeRenderer/asyncComponent'
import ReferenceNode from '../ReferenceNode'
import StrikethroughNode from '../StrikethroughNode'
import StrongNode from '../StrongNode'
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
    type: 'insert'
    children: NodeChild[]
    raw: string
  }
  customId?: string
  indexKey?: number | string
}>()

const overrides = getCustomNodeComponents(props.customId)

// Available node components for child rendering; prefer custom overrides
const nodeComponents = {
  text: overrides.text || TextNode,
  inline_code: overrides.inline_code || InlineCodeNode,
  link: overrides.link || LinkNode,
  strong: overrides.strong || StrongNode,
  emphasis: overrides.emphasis || EmphasisNode,
  strikethrough: overrides.strikethrough || StrikethroughNode,
  highlight: overrides.highlight || HighlightNode,
  subscript: overrides.subscript || SubscriptNode,
  superscript: overrides.superscript || SuperscriptNode,
  emoji: overrides.emoji || EmojiNode,
  footnote_reference: overrides.footnote_reference || FootnoteReferenceNode,
  math_inline: overrides.math_inline || MathInlineNodeAsync,
  reference: overrides.reference || ReferenceNode,
}
</script>

<template>
  <ins class="insert-node">
    <component
      :is="nodeComponents[child.type]"
      v-for="(child, index) in node.children"
      :key="`${indexKey || 'insert'}-${index}`"
      :node="child"
      :custom-id="props.customId"
      :index-key="`${indexKey || 'insert'}-${index}`"
    />
  </ins>
</template>

<style scoped>
.insert-node {
  text-decoration: underline;
}
</style>
