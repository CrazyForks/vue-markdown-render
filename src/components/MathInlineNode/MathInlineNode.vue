<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { renderKaTeXInWorker } from '../../workers/katexWorkerClient'
import { getKatex } from './katex'

const props = defineProps<{
  node: {
    type: 'math_inline'
    content: string
    raw: string
    loading?: boolean
  }
}>()
let katex = null
getKatex().then((k) => {
  katex = k
})

const mathElement = ref<HTMLElement | null>(null)
let hasRenderedOnce = false
let currentRenderId = 0
let isUnmounted = false
let currentAbortController: AbortController | null = null
const renderingLoading = ref(true)

function renderMath() {
  if (!props.node.content || !mathElement.value || isUnmounted)
    return

  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }

  const renderId = ++currentRenderId
  const abortController = new AbortController()
  currentAbortController = abortController

  renderKaTeXInWorker(props.node.content, false, 1500, abortController.signal)
    .then((html) => {
      if (isUnmounted || renderId !== currentRenderId)
        return
      if (!mathElement.value)
        return
      renderingLoading.value = false
      mathElement.value.innerHTML = html
      hasRenderedOnce = true
    })
    .catch((err: any) => {
      if (isUnmounted || renderId !== currentRenderId)
        return
      if (!mathElement.value)
        return

      // Only attempt synchronous KaTeX fallback when the worker failed to initialize.
      // If the worker returned a render error (syntax), leave the loading state as-is
      // and don't try to synchronously render here to avoid surfacing KaTeX errors.
      if (katex && (err?.code === 'WORKER_INIT_ERROR' || err?.fallbackToRenderer)) {
        try {
          const html = katex.renderToString(props.node.content, { throwOnError: true, displayMode: false })
          renderingLoading.value = false
          mathElement.value.innerHTML = html
          hasRenderedOnce = true
          return
        }
        catch {
          // fall through to existing loading/raw behaviour
        }
      }

      if (!hasRenderedOnce || !props.node.loading) {
        renderingLoading.value = true
        // mathElement.value.textContent = props.node.raw
      }
    })
}

watch(
  () => props.node.content,
  () => {
    renderMath()
  },
)

onMounted(() => {
  renderMath()
})

onBeforeUnmount(() => {
  isUnmounted = true
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }
})
</script>

<template>
  <span class="math-inline-wrapper">
    <span v-show="!renderingLoading" ref="mathElement" class="math-inline" />
    <transition v-if="renderingLoading" name="table-node-fade">
      <span
        class="math-inline__loading"
        role="status"
        aria-live="polite"
      >
        <slot name="loading" :is-loading="renderingLoading">
          <span class="math-inline__spinner animate-spin" aria-hidden="true" />
          <span class="sr-only">Loading</span>
        </slot>
      </span>
    </transition>
  </span>
</template>

<style scoped>
.math-inline-wrapper {
  position: relative;
  display: inline-block;
}

.math-inline {
  display: inline-block;
  vertical-align: middle;
}

.math-inline__loading {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.math-inline__spinner {
  width: 1rem;
  height: 1rem;
  border-radius: 9999px;
  border: 2px solid rgba(94, 104, 121, 0.25);
  border-top-color: rgba(94, 104, 121, 0.8);
  will-change: transform;
}

.table-node-fade-enter-active,
.table-node-fade-leave-active {
  transition: opacity 0.18s ease;
}

.table-node-fade-enter-from,
.table-node-fade-leave-to {
  opacity: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
