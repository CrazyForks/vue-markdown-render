<script setup lang="ts">
import { computed } from 'vue'

interface VmrContainerNode {
  type: 'vmr_container'
  name: string
  attrs?: Record<string, string>
  children: { type: string, raw: string }[]
  raw: string
}

const props = defineProps<{ node: VmrContainerNode, indexKey: number | string, isDark?: boolean, typewriter?: boolean, customId?: string }>()

// Build CSS class from container name
const containerClass = computed(() => `vmr-container vmr-container-${props.node.name}`)
</script>

<template>
  <div :class="containerClass" v-bind="node.attrs">
    {{ node.raw }}
  </div>
</template>

<style scoped>
.vmr-container {
  margin: 1rem 0;
  padding: 1rem;
}
</style>
