<script setup lang="ts">
import { ref } from 'vue'
import { getKatex } from '../MathInlineNode/katex'

defineProps<{
  node: {
    type: 'text'
    content: string
    raw: string
    center?: boolean
  }
}>()
defineEmits(['copy'])
const katex = ref<boolean>(false)
getKatex().then((k) => {
  katex.value = !!k
})
</script>

<template>
  <span
    :class="[katex && node.center ? '!inline-flex !justify-center w-full' : '']"
    class="whitespace-pre-wrap break-words text-node"
  >
    {{ node.content }}
  </span>
</template>

<style scoped>
.text-node {
  display: inline;
  font-weight: inherit;
  vertical-align: baseline;
}
</style>
