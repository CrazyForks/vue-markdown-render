<script setup lang="ts">
import NodeRenderer from '../NodeRenderer'

// 定义脚注节点
interface FootnoteNode {
  type: 'footnote'
  id: string
  children: { type: string, raw: string }[]
  raw: string
}

// 接收props
defineProps<{
  node: FootnoteNode
  indexKey: string | number
  typewriter?: boolean
}>()

// 定义事件
defineEmits(['copy'])
</script>

<template>
  <div
    :id="`footnote-${node.id}`"
    class="flex mt-2 mb-2 text-sm leading-relaxed border-t border-[#eaecef] pt-2"
  >
    <span class="font-semibold mr-2 text-[#0366d6]">[{{ node.id }}]</span>
    <div class="flex-1">
      <NodeRenderer :index-key="`footnote-${indexKey}`" :nodes="node.children" :typewriter="typewriter" @copy="$emit('copy', $event)" />
    </div>
  </div>
</template>

<style>
/* 脚注中嵌套 NodeRenderer 关闭 content-visibility 占位，防止空白内容 */
[class*="footnote-"] :deep(.markdown-renderer),
.flex-1 :deep(.markdown-renderer) {
  content-visibility: visible;
  contain-intrinsic-size: auto;
}
</style>
