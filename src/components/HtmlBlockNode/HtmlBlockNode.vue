<script setup lang="ts">
defineProps<{
  node: {
    content: string
    loading?: boolean
  }
}>()
</script>

<template>
  <div class="html-block-node" v-html="node.content" />
</template>

<style scoped>
</style>
