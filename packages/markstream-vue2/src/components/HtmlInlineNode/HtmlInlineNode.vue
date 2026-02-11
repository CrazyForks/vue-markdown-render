<script setup lang="ts">
import { computed, defineComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue-demi'
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
    content: {
      type: String,
      required: true,
    },
    customComponents: {
      type: Object as () => Record<string, any>,
      required: true,
    },
  },
  render() {
    const nodes = parseHtmlToVNodes(this.content, this.customComponents)
    return (nodes || []) as any
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

  return { mode: 'dynamic', content }
})

const containerRef = ref<HTMLElement | null>(null)
const isClient = typeof window !== 'undefined'
type DomRenderMode = 'html' | 'text'
const lastDomRender = ref<{ mode: DomRenderMode | '', content: string, el: HTMLElement | null }>({
  mode: '',
  content: '',
  el: null,
})
let templateEl: HTMLTemplateElement | null = null

function getTemplateEl() {
  if (!templateEl && isClient)
    templateEl = document.createElement('template')
  return templateEl
}

function commitDomRender(mode: DomRenderMode, content: string) {
  if (!isClient || !containerRef.value)
    return
  const host = containerRef.value
  const last = lastDomRender.value
  if (last.el === host && last.mode === mode && last.content === content)
    return
  if (mode === 'text') {
    host.textContent = content
  }
  else {
    const template = getTemplateEl()
    if (template) {
      template.innerHTML = content
      const fragment = template.content.cloneNode(true)
      if (typeof host.replaceChildren === 'function') {
        host.replaceChildren(fragment)
      }
      else {
        host.innerHTML = ''
        host.appendChild(fragment)
      }
    }
    else {
      host.innerHTML = content
    }
  }
  lastDomRender.value = { mode, content, el: host }
}

function renderHtmlContent() {
  commitDomRender('html', props.node.content)
}

function renderLoadingContent() {
  commitDomRender('text', props.node.content)
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
  lastDomRender.value = { mode: '', content: '', el: null }
})
</script>

<template>
  <span
    v-if="renderMode.mode === 'dynamic'"
    class="html-inline-node"
    :class="{ 'html-inline-node--loading': props.node.loading }"
  >
    <DynamicRenderer :content="renderMode.content" :custom-components="customComponents" />
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
