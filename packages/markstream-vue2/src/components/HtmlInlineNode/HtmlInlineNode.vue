<script setup lang="ts">
import { computed, defineComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { hasCustomComponents, parseHtmlToVNodes } from '../../utils/htmlRenderer'
import { getCustomNodeComponents } from '../../utils/nodeComponents'

const props = defineProps<{
  node: {
    type: 'html_inline'
    tag?: string
    content: string
    loading?: boolean
    autoClosed?: boolean
  }
  customId?: string
}>()

// Get custom components from global registry
const customComponents = computed(() => {
  return getCustomNodeComponents(props.customId)
})

// Dynamic wrapper component for rendering VNodes
const DynamicRenderer = defineComponent({
  name: 'DynamicRenderer',
  props: {
    nodes: {
      type: Array as () => any[],
      required: true,
    },
  },
  render() {
    return this.nodes
  },
})

// Computed property to determine render mode and content
const renderMode = computed(() => {
  const content = props.node.content
  if (!content)
    return { mode: 'html', content: '' }

  // Check if content contains custom components
  if (!hasCustomComponents(content, customComponents.value))
    return { mode: 'html', content }

  // Parse and build VNode tree
  const nodes = parseHtmlToVNodes(content, customComponents.value)
  if (nodes === null)
    return { mode: 'html', content } // Fallback to DOM rendering if parsing fails

  return { mode: 'dynamic', nodes }
})

const containerRef = ref<HTMLElement | null>(null)
const isClient = typeof window !== 'undefined'

function renderHtmlContent() {
  if (!isClient || !containerRef.value)
    return
  const host = containerRef.value
  host.innerHTML = ''
  const template = document.createElement('template')
  template.innerHTML = props.node.content
  host.appendChild(template.content.cloneNode(true))
}

function renderLoadingContent() {
  if (!containerRef.value)
    return
  const host = containerRef.value
  host.innerHTML = ''
  host.textContent = props.node.content
}

onMounted(() => {
  // Only use DOM rendering for non-custom-component content
  if (renderMode.value.mode === 'html') {
    if (props.node.loading && !props.node.autoClosed)
      renderLoadingContent()
    else
      renderHtmlContent()
  }
})

watch(
  () => [props.node.content, props.node.loading, props.node.autoClosed],
  () => {
    // Only use DOM rendering for non-custom-component content
    if (renderMode.value.mode === 'html') {
      if (props.node.loading && !props.node.autoClosed)
        renderLoadingContent()
      else
        renderHtmlContent()
    }
  },
)

onBeforeUnmount(() => {
  if (!containerRef.value)
    return
  containerRef.value.innerHTML = ''
})
</script>

<template>
  <span
    v-if="renderMode.mode === 'dynamic'"
    class="html-inline-node"
    :class="{ 'html-inline-node--loading': props.node.loading }"
  >
    <DynamicRenderer :nodes="renderMode.nodes" />
  </span>
  <span
    v-else
    ref="containerRef"
    class="html-inline-node"
    :class="{ 'html-inline-node--loading': props.node.loading }"
  />
</template>

<style scoped>
.html-inline-node {
  display: inline;
}

.html-inline-node--loading {
  opacity: 0.85;
}
</style>
