<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  node: {
    content: string
    attrs?: [string, string][] | null
    loading?: boolean
  }
}>()

// The parser produces attrs as an array of [key, value] tuples.
// Vue's `v-bind` expects an object (or array of objects). Convert safely.
const boundAttrs = computed(() => {
  const a = props.node.attrs
  if (!a)
    return undefined
  if (Array.isArray(a)) {
    // Convert tuple array to object; guard against malformed entries.
    const obj: Record<string, string> = {}
    for (const tuple of a) {
      if (!tuple || tuple.length < 2)
        continue
      const [k, v] = tuple
      if (k != null)
        obj[String(k)] = v == null ? '' : String(v)
    }
    return obj
  }
  return a
})
</script>

<template>
  <div class="html-block-node" v-bind="boundAttrs" v-html="node.content" />
</template>

<style scoped>
</style>
