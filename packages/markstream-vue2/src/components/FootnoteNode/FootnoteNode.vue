<script setup lang="ts">
import { computed, getCurrentInstance } from 'vue-demi'
import { customComponentsRevision, getCustomNodeComponents } from '../../utils/nodeComponents'
import { isLegacyVue26Vm } from '../../utils/vue26'
import NodeRenderer from '../NodeRenderer'
import LegacyNodesRenderer from '../NodeRenderer/LegacyNodesRenderer.vue'
import ParagraphNode from '../ParagraphNode'

interface FootnoteChild {
  type: string
  raw: string
  children?: FootnoteChild[]
  [key: string]: unknown
}

interface ParagraphNodeChild {
  type: 'paragraph'
  children: FootnoteChild[]
  raw: string
}

// 定义脚注节点
interface FootnoteNode {
  type: 'footnote'
  id: string
  children: FootnoteChild[]
  raw: string
}

// 接收props
const props = defineProps<{
  node: FootnoteNode
  indexKey: string | number
  typewriter?: boolean
  fade?: boolean
  customId?: string
}>()

// 定义事件
const emit = defineEmits(['copy'])
const instance = getCurrentInstance()
const nestedRenderer = computed(() => {
  const vm = instance?.proxy as any
  return isLegacyVue26Vm(vm) ? LegacyNodesRenderer : NodeRenderer
})
const customComponents = computed(() => {
  void customComponentsRevision.value
  return getCustomNodeComponents(props.customId)
})
const directParagraphChildren = computed<ParagraphNodeChild[] | null>(() => {
  if ((customComponents.value as any).paragraph)
    return null

  if (!props.node.children.every(child => child?.type === 'paragraph' && Array.isArray(child.children)))
    return null

  return props.node.children as ParagraphNodeChild[]
})
const staticDirectParagraphChildren = computed(() => (
  props.typewriter === false && props.fade === false
    ? directParagraphChildren.value
    : null
))
const hasCopyListener = Boolean((instance?.proxy as any)?.$listeners?.copy)
function handleCopy(text: string) {
  emit('copy', text)
}
</script>

<template>
  <div
    v-if="staticDirectParagraphChildren"
    v-once
    :id="`fnref--${node.id}`"
    class="footnote-node flex text-sm leading-relaxed border-t border-[var(--footnote-border,#eaecef)] pt-2"
  >
    <div class="flex-1">
      <ParagraphNode
        v-for="(child, childIndex) in staticDirectParagraphChildren"
        :key="`${indexKey}-${childIndex}`"
        :node="child"
        :custom-id="props.customId"
        :index-key="`footnote-${indexKey}-${childIndex}`"
      />
    </div>
  </div>
  <div
    v-else
    :id="`fnref--${node.id}`"
    class="footnote-node flex text-sm leading-relaxed border-t border-[var(--footnote-border,#eaecef)] pt-2"
  >
    <!-- <span class="font-semibold mr-2 text-[#0366d6]">[{{ node.id }}]</span> -->
    <div class="flex-1">
      <template v-if="directParagraphChildren">
        <ParagraphNode
          v-for="(child, childIndex) in directParagraphChildren"
          :key="`${indexKey}-${childIndex}`"
          :node="child"
          :custom-id="props.customId"
          :index-key="`footnote-${indexKey}-${childIndex}`"
        />
      </template>
      <component
        :is="nestedRenderer"
        v-else-if="hasCopyListener"
        :index-key="`footnote-${props.indexKey}`"
        :nodes="props.node.children"
        :custom-id="props.customId"
        :typewriter="props.typewriter"
        :fade="props.fade"
        @copy="handleCopy"
      />
      <component
        :is="nestedRenderer"
        v-else
        :index-key="`footnote-${props.indexKey}`"
        :nodes="props.node.children"
        :custom-id="props.customId"
        :typewriter="props.typewriter"
        :fade="props.fade"
      />
    </div>
  </div>
</template>

<style>
.footnote-node {
  margin-top: var(--ms-flow-footnote-y, 0.5em);
  margin-bottom: var(--ms-flow-footnote-y, 0.5em);
}

/* 脚注中嵌套 NodeRenderer 关闭 content-visibility 占位，防止空白内容 */
.markstream-vue2 [class*="footnote-"] .markdown-renderer,
.markstream-vue2 .flex-1 .markdown-renderer {
  content-visibility: visible;
  contain: content;
  contain-intrinsic-size: 0px 0px;
}
</style>
