<script setup lang="ts">
import { computed, defineComponent, onBeforeUnmount, ref, watch } from 'vue-demi'
import { useViewportPriority } from '../../composables/viewportPriority'
import { hasCustomComponents, parseHtmlToVNodes } from '../../utils/htmlRenderer'
import { getCustomNodeComponents } from '../../utils/nodeComponents'

const props = defineProps<{
  node: {
    content: string
    attrs?: [string, string][] | null
    loading?: boolean
  }
  customId?: string
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

const htmlRef = ref<HTMLElement | null>(null)
const shouldRender = ref(typeof window === 'undefined')
const renderContent = ref(props.node.content)
const registerVisibility = useViewportPriority()
let visibilityHandle: ReturnType<typeof registerVisibility> | null = null
const isDeferred = !!props.node.loading

if (typeof window !== 'undefined') {
  watch(
    htmlRef,
    (el) => {
      visibilityHandle?.destroy?.()
      visibilityHandle = null
      if (!isDeferred) {
        shouldRender.value = true
        renderContent.value = props.node.content
        return
      }
      if (!el) {
        shouldRender.value = false
        return
      }
      const handle = registerVisibility(el, { rootMargin: '400px' })
      visibilityHandle = handle
      shouldRender.value = handle.isVisible.value
      handle.whenVisible.then(() => {
        shouldRender.value = true
      })
    },
    { immediate: true },
  )

  watch(
    () => props.node.content,
    (val) => {
      if (!isDeferred || shouldRender.value) {
        renderContent.value = val
      }
    },
  )
}
else {
  shouldRender.value = true
}

onBeforeUnmount(() => {
  visibilityHandle?.destroy?.()
  visibilityHandle = null
})
</script>

<template>
  <div ref="htmlRef" class="html-block-node" v-bind="boundAttrs">
    <template v-if="shouldRender">
      <!-- Use dynamic rendering for custom components -->
      <DynamicRenderer v-if="renderMode.mode === 'dynamic'" :content="renderMode.content" :custom-components="customComponents" />
      <!-- Fallback to v-html for standard HTML -->
      <div v-else v-html="renderContent" />
    </template>
    <div v-else class="html-block-node__placeholder">
      <slot name="placeholder" :node="node">
        <span class="html-block-node__placeholder-bar" />
        <span class="html-block-node__placeholder-bar w-4/5" />
        <span class="html-block-node__placeholder-bar w-2/3" />
      </slot>
    </div>
  </div>
</template>

<style scoped>
.html-block-node__placeholder {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.5rem 0;
}
.html-block-node__placeholder-bar {
  display: block;
  height: 0.8rem;
  border-radius: 9999px;
  background-image: linear-gradient(90deg, rgba(148, 163, 184, 0.35), rgba(148, 163, 184, 0.1), rgba(148, 163, 184, 0.35));
  background-size: 200% 100%;
  animation: html-block-node-shimmer 1.2s ease infinite;
}

@keyframes html-block-node-shimmer {
  0% {
    background-position: 0% 0%;
  }
  100% {
    background-position: 200% 0%;
  }
}
</style>
