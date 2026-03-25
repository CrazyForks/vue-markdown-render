<script setup lang="ts">
import { computed } from 'vue'
import { getCustomNodeComponents } from '../../utils/nodeComponents'
import CheckboxNode from '../CheckboxNode'
import EmojiNode from '../EmojiNode'
import EmphasisNode from '../EmphasisNode'
import FootnoteAnchorNode from '../FootnoteAnchorNode'
import FootnoteReferenceNode from '../FootnoteReferenceNode'
import HardBreakNode from '../HardBreakNode'
import HighlightNode from '../HighlightNode'
import HtmlBlockNode from '../HtmlBlockNode'
import HtmlInlineNode from '../HtmlInlineNode'
import ImageNode from '../ImageNode'
import InlineCodeNode from '../InlineCodeNode'
import InsertNode from '../InsertNode'
import LinkNode from '../LinkNode'
import { MathInlineNodeAsync } from '../NodeRenderer/asyncComponent'
import ReferenceNode from '../ReferenceNode'
import StrikethroughNode from '../StrikethroughNode'
import StrongNode from '../StrongNode'
import SubscriptNode from '../SubscriptNode'
import SuperscriptNode from '../SuperscriptNode'
import TextNode from '../TextNode'

// Define the type for the node children
interface NodeChild {
  type: string
  raw: string
  [key: string]: unknown
}

const props = defineProps<{
  node: {
    type: 'paragraph'
    children: NodeChild[]
    raw: string
  }
  customId?: string
  indexKey?: number | string
}>()
const overrides = getCustomNodeComponents(props.customId)
const paragraphTag = computed(() => {
  if (props.node.children.length === 0)
    return 'p'

  const isMediaOnlyParagraph = props.node.children.every((child) => {
    if (child.type === 'image')
      return true
    if (child.type !== 'text')
      return false
    return String((child as any).content ?? '').trim() === ''
  })

  return isMediaOnlyParagraph ? 'div' : 'p'
})

const nodeComponents = {
  inline_code: InlineCodeNode,
  image: ImageNode,
  link: LinkNode,
  hardbreak: HardBreakNode,
  emphasis: EmphasisNode,
  strong: StrongNode,
  strikethrough: StrikethroughNode,
  highlight: HighlightNode,
  insert: InsertNode,
  subscript: SubscriptNode,
  superscript: SuperscriptNode,
  html_inline: HtmlInlineNode,
  html_block: HtmlBlockNode,
  emoji: EmojiNode,
  checkbox: CheckboxNode,
  math_inline: MathInlineNodeAsync,
  checkbox_input: CheckboxNode,
  reference: ReferenceNode,
  footnote_anchor: FootnoteAnchorNode,
  footnote_reference: FootnoteReferenceNode,
  text: TextNode,
  ...overrides,
}
</script>

<template>
  <component :is="paragraphTag" dir="auto" class="paragraph-node">
    <component
      :is="nodeComponents[child.type]"
      v-for="(child, index) in node.children"
      :key="`${indexKey || 'paragraph'}-${index}`"
      :node="child"
      :index-key="`${indexKey}-${index}`"
      :custom-id="props.customId"
    />
  </component>
</template>

<style scoped>
.paragraph-node{
  margin: 1.25em 0;
}
li .paragraph-node{
  margin: 0;
}
</style>
