<script setup lang="ts">
const props = defineProps<{ node: { type: 'footnote_anchor', id: string, raw?: string } }>()

function scrollToReference(e: MouseEvent) {
  e.preventDefault()
  if (typeof document === 'undefined')
    return
  const id = `fnref-${String(props.node.id ?? '')}`
  const anchors = document.getElementById(id)
  if (anchors) {
    anchors.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}
</script>

<template>
  <a
    class="footnote-anchor text-sm hover:underline cursor-pointer"
    :href="`#fnref-${node.id}`"
    :title="`返回引用 ${node.id}`"
    @click="scrollToReference"
  >
    ↩︎
  </a>
</template>

<style scoped>
.footnote-anchor {
  margin-left: 0.5rem;
  color: var(--link-color);
}
</style>
