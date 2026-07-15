<script setup lang="ts">
import type { MathInlineNodeProps } from '../../types/component-props'
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useOffscreenHeavyNodeDeferral, useViewportPriority, useViewportPriorityOptions, waitForVisibilityOrAbort } from '../../composables/viewportPriority'
import { normalizeKaTeXRenderInput } from '../../utils/normalizeKaTeXRenderInput'
import { renderKaTeXWithBackpressure, setKaTeXCache, WORKER_BUSY_CODE } from '../../workers/katexWorkerClient'

import { getKatex, getKatexSync } from './katex'

const props = defineProps<MathInlineNodeProps>()

const containerEl = ref<HTMLElement | null>(null)
const displayMode = computed(() => props.node.markup === '$$')
const mathContent = computed(() => normalizeKaTeXRenderInput(props.node.content))
const isHydrating = getCurrentInstance()?.vnode.el?.nodeType === 1
const deferOffscreenHeavyNodes = useOffscreenHeavyNodeDeferral()
const viewportPriorityOptions = useViewportPriorityOptions()
const viewportReady = ref(
  typeof window === 'undefined'
  || isHydrating
  || !deferOffscreenHeavyNodes.value,
)

function resolveInitialState() {
  if (!props.node.content) {
    return {
      html: '',
      text: props.node.loading ? '' : props.node.raw,
      loading: props.node.loading,
    }
  }

  if (props.node.loading) {
    return {
      html: '',
      text: '',
      loading: true,
    }
  }

  const katex = typeof window === 'undefined' || isHydrating || !deferOffscreenHeavyNodes.value
    ? getKatexSync()
    : null
  if (!katex) {
    return {
      html: '',
      text: props.node.loading ? '' : props.node.raw,
      loading: props.node.loading,
    }
  }

  try {
    const html = katex.renderToString(mathContent.value, {
      throwOnError: false,
      displayMode: displayMode.value,
    })
    setKaTeXCache(mathContent.value, displayMode.value, html)
    return {
      html,
      text: '',
      loading: false,
    }
  }
  catch {
    return {
      html: '',
      text: props.node.loading ? '' : props.node.raw,
      loading: props.node.loading,
    }
  }
}

const initialState = resolveInitialState()
const renderedHtml = ref(initialState.html)
const renderedText = ref(initialState.text)
let hasRenderedOnce = false
let currentRenderId = 0
let isUnmounted = false
let currentAbortController: AbortController | null = null
const renderingLoading = ref(initialState.loading)
const renderingPending = ref(false)
const registerVisibility = useViewportPriority()
let visibilityHandle: ReturnType<typeof registerVisibility> | null = null

if (initialState.html)
  hasRenderedOnce = true

function markRenderPending() {
  renderingPending.value = true
}

function clearRenderPending(renderId?: number) {
  if (renderId != null && renderId !== currentRenderId)
    return

  renderingPending.value = false
}

async function renderMath() {
  if (isUnmounted)
    return

  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }

  const renderId = ++currentRenderId

  if (!props.node.content) {
    clearRenderPending()
    renderedHtml.value = ''
    renderedText.value = props.node.loading ? '' : props.node.raw
    renderingLoading.value = props.node.loading
    hasRenderedOnce = false
    return
  }

  const abortController = new AbortController()
  currentAbortController = abortController

  // Mark pending before visibility wait. During restore, the element may be in
  // layout but visually hidden; readiness must not reveal raw fallback as final.
  markRenderPending()

  // Defer heavy work until visible on first render
  if (!hasRenderedOnce && deferOffscreenHeavyNodes.value) {
    try {
      if (!visibilityHandle && containerEl.value) {
        // Observe the always-visible wrapper, not the v-show hidden math span
        visibilityHandle = registerVisibility(containerEl.value, {
          rootMargin: viewportPriorityOptions?.value.rootMargin,
          allowIdle: false,
        })
        viewportReady.value = visibilityHandle.isVisible.value
      }
      await waitForVisibilityOrAbort(visibilityHandle, abortController.signal)
      viewportReady.value = true
    }
    catch {}
  }
  else if (!deferOffscreenHeavyNodes.value) {
    viewportReady.value = true
  }

  if (isUnmounted || renderId !== currentRenderId || abortController.signal.aborted) {
    clearRenderPending(renderId)
    return
  }

  renderKaTeXWithBackpressure(mathContent.value, displayMode.value, {
    timeout: 1500,
    waitTimeout: 1500,
    maxRetries: 8,
    signal: abortController.signal,
  })
    .then((html) => {
      if (isUnmounted || renderId !== currentRenderId)
        return
      renderedHtml.value = html
      renderedText.value = ''
      renderingLoading.value = false
      hasRenderedOnce = true
    })
    .catch(async (err: any) => {
      if (isUnmounted || renderId !== currentRenderId)
        return
      // Fallback cases:
      // 1) Worker failed to initialize -> try sync render
      // 2) Worker is busy/timeout under heavy concurrency -> try sync render to avoid perpetual loading
      //    (inline math is usually cheap to render on main thread)
      const code = err?.code || err?.name
      const isWorkerInitFailure = code === 'WORKER_INIT_ERROR' || err?.fallbackToRenderer
      const isBusyOrTimeout = code === WORKER_BUSY_CODE || code === 'WORKER_TIMEOUT'
      const isDisabled = code === 'KATEX_DISABLED'

      if (isWorkerInitFailure || (isBusyOrTimeout && !props.node.loading)) {
        const katex = await getKatex()
        if (isUnmounted || renderId !== currentRenderId)
          return

        if (katex) {
          try {
            const html = katex.renderToString(mathContent.value, {
              throwOnError: props.node.loading,
              displayMode: displayMode.value,
            })
            renderedHtml.value = html
            renderedText.value = ''
            renderingLoading.value = false
            hasRenderedOnce = true
            // populate worker client cache for inline as well
            setKaTeXCache(mathContent.value, displayMode.value, html)
          }
          catch {
          }

          return
        }
      }
      if (isDisabled || !props.node.loading) {
        renderingLoading.value = false
        renderedHtml.value = ''
        renderedText.value = props.node.raw
        return
      }
      // If we reach here, the worker render failed and sync fallback was not possible.
      // Stop the spinner and show raw text when we have not rendered once yet.
      if (!hasRenderedOnce)
        renderingLoading.value = true
    })
    .finally(() => {
      if (!isUnmounted)
        clearRenderPending(renderId)
    })
}

watch(
  () => [props.node.content, props.node.loading, props.node.raw, props.node.markup],
  () => {
    renderMath()
  },
)

onMounted(() => {
  if (renderedHtml.value)
    return
  renderMath()
})

onBeforeUnmount(() => {
  isUnmounted = true
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }
  visibilityHandle?.destroy?.()
  visibilityHandle = null
})
</script>

<template>
  <span
    ref="containerEl"
    class="math-inline-wrapper"
    data-markstream-math="inline"
    :data-markstream-mode="renderedHtml ? 'katex' : renderedText ? 'fallback' : 'loading'"
    :data-markstream-pending="renderingPending ? 'true' : undefined"
    :data-markstream-viewport-pending="deferOffscreenHeavyNodes && !viewportReady ? 'true' : undefined"
  >
    <span v-if="renderedHtml" class="math-inline" v-html="renderedHtml" />
    <span v-else-if="renderedText" class="math-inline math-inline--fallback">{{ renderedText }}</span>
    <transition v-else-if="renderingLoading" name="table-node-fade">
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

.math-inline--fallback {
  white-space: pre-wrap;
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
  border: 2px solid color-mix(in srgb, var(--loading-spinner) 25%, transparent);
  border-top-color: color-mix(in srgb, var(--loading-spinner) 80%, transparent);
  will-change: transform;
}

.math-inline-wrapper[data-markstream-viewport-pending='true'] .math-inline__spinner {
  animation: none !important;
  will-change: auto;
}

.table-node-fade-enter-active,
.table-node-fade-leave-active {
  transition: opacity var(--ms-duration-standard) var(--ms-ease-standard);
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
