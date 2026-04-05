<script setup lang="ts">
import { getCustomNodeComponents } from '../../utils/nodeComponents'
import CheckboxNode from '../CheckboxNode'
import EmojiNode from '../EmojiNode'
import EmphasisNode from '../EmphasisNode'
import FootnoteReferenceNode from '../FootnoteReferenceNode'
import HardBreakNode from '../HardBreakNode'
import HighlightNode from '../HighlightNode'
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
    type: 'heading'
    level: number
    text: string
    attrs?: Record<string, string | boolean>
    children: NodeChild[]
    raw: string
  }
  customId?: string
  indexKey?: number | string
}>()

const overrides = getCustomNodeComponents(props.customId)

const nodeComponents = {
  text: TextNode,
  inline_code: InlineCodeNode,
  link: LinkNode,
  image: ImageNode,
  strong: StrongNode,
  emphasis: EmphasisNode,
  strikethrough: StrikethroughNode,
  highlight: HighlightNode,
  insert: InsertNode,
  subscript: SubscriptNode,
  superscript: SuperscriptNode,
  emoji: EmojiNode,
  checkbox: CheckboxNode,
  checkbox_input: CheckboxNode,
  footnote_reference: FootnoteReferenceNode,
  hardbreak: HardBreakNode,
  math_inline: MathInlineNodeAsync,
  reference: ReferenceNode,
  ...overrides,
}
</script>

<template>
  <component
    :is="`h${node.level}`"
    class="heading-node"
    :class="[`heading-${node.level}`]"
    dir="auto"
    v-bind="node.attrs"
  >
    <component
      :is="nodeComponents[child.type]"
      v-for="(child, index) in node.children"
      :key="`${indexKey || 'heading'}-${index}`"
      :custom-id="props.customId"
      :node="child"
      :index-key="`${indexKey || 'heading'}-${index}`"
    />
  </component>
</template>

<style scoped>
.heading-node {
  @apply font-medium leading-tight;
}
hr + .heading-node {
  @apply mt-0;
}

.heading-1 {
  @apply text-4xl leading-[calc(10/9*1)] font-extrabold;
  margin-top: var(--ms-flow-heading-1-mt);
  margin-bottom: var(--ms-flow-heading-1-mb);
}

.heading-2 {
  @apply text-2xl leading-[calc(4/3*1)] font-bold;
  margin-top: var(--ms-flow-heading-2-mt);
  margin-bottom: var(--ms-flow-heading-2-mb);
}

.heading-3 {
  @apply text-xl font-semibold leading-[calc(5/3*1)];
  margin-top: var(--ms-flow-heading-3-mt);
  margin-bottom: var(--ms-flow-heading-3-mb);
}

.heading-4 {
  @apply text-base font-semibold;
  margin-top: var(--ms-flow-heading-4-mt);
  margin-bottom: var(--ms-flow-heading-4-mb);
}

.heading-5 {
  @apply text-base;
  margin-top: var(--ms-flow-heading-5-mt);
  margin-bottom: var(--ms-flow-heading-5-mb);
}

.heading-6 {
  @apply text-base;
  margin-top: var(--ms-flow-heading-6-mt);
  margin-bottom: var(--ms-flow-heading-6-mb);
}
</style>
