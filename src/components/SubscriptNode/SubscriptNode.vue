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
import SuperscriptNode from '../SuperscriptNode'
import TextNode from '../TextNode'

interface NodeChild {
  type: string
  raw: string
  [key: string]: unknown
}

const props = defineProps<{
  node: {
    type: 'subscript'
    children: NodeChild[]
    raw: string
  }
  customId?: string
  indexKey?: number | string
}>()

const overrides = getCustomNodeComponents(props.customId)

const nodeComponents = {
  text: overrides.text || TextNode,
  inline_code: overrides.inline_code || InlineCodeNode,
  link: overrides.link || LinkNode,
  strong: overrides.strong || StrongNode,
  emphasis: overrides.emphasis || EmphasisNode,
  footnote_reference: overrides.footnote_reference || FootnoteReferenceNode,
  strikethrough: overrides.strikethrough || StrikethroughNode,
  highlight: overrides.highlight || HighlightNode,
  insert: overrides.insert || InsertNode,
  superscript: overrides.superscript || SuperscriptNode,
  emoji: overrides.emoji || EmojiNode,
  math_inline: overrides.math_inline || MathInlineNodeAsync,
  reference: overrides.reference || ReferenceNode,
}
</script>

<template>
  <sub class="subscript-node">
    <template v-for="(child, index) in node.children" :key="`${indexKey || 'subscript'}-${index}`">
      <component
        :is="nodeComponents[child.type]"
        v-if="nodeComponents[child.type]"
        :node="child"
        :custom-id="props.customId"
        :index-key="`${indexKey || 'subscript'}-${index}`"
      />
      <span v-else>{{ (child as any).content || (child as any).raw }}</span>
    </template>
  </sub>
</template>

<style scoped>
.subscript-node {
  font-size: 0.8em;
  vertical-align: sub;
}
</style>
