<script setup lang="ts">
import type { MathBlockNodeProps } from '../../types/component-props'
import { computed, getCurrentInstance, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useOffscreenHeavyNodeDeferral, useViewportPriority, useViewportPriorityOptions } from '../../composables/viewportPriority'
import { resolveLifecycleIndexKey } from '../../utils/lifecycleIndexKey'
import { MARKSTREAM_NODE_LIFECYCLE_KEY } from '../../utils/nodeLifecycle'
import { normalizeKaTeXRenderInput } from '../../utils/normalizeKaTeXRenderInput'
import { renderKaTeXWithBackpressure, setKaTeXCache, WORKER_BUSY_CODE } from '../../workers/katexWorkerClient'

import { getKatex, getKatexSync } from '../MathInlineNode/katex'
import { useMathBlockMinHeightCache } from './minHeightCache'

const props = defineProps<MathBlockNodeProps>()
const containerEl = ref<HTMLElement | null>(null)
const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY, null)
const mathContent = computed(() => normalizeKaTeXRenderInput(props.node.content))
const isHydrating = getCurrentInstance()?.vnode.el?.nodeType === 1
const deferOffscreenHeavyNodes = useOffscreenHeavyNodeDeferral()
const viewportPriorityOptions = useViewportPriorityOptions()
const viewportReady = ref(
  typeof window === 'undefined'
  || isHydrating
  || !deferOffscreenHeavyNodes.value,
)
const lifecycleIndexKey = computed(() => {
  return resolveLifecycleIndexKey(props, {})
})

function resolveInitialState() {
  if (!props.node.content) {
    return {
      html: '',
      text: props.node.raw,
      loading: false,
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
      displayMode: true,
    })
    setKaTeXCache(mathContent.value, true, html)
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
const minHeightCacheContext = useMathBlockMinHeightCache()
const registerVisibility = useViewportPriority()
let visibilityHandle: ReturnType<typeof registerVisibility> | null = null
let resizeObserver: ResizeObserver | null = null
let lifecyclePendingIndexKey = ''
const renderingLoading = ref(initialState.loading)
const renderingPending = ref(false)
const lockedMinHeight = ref(resolveCachedMinHeight())

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

function getHeightCacheKey() {
  if (props.indexKey == null)
    return ''

  const scope = props.cacheScope ?? minHeightCacheContext?.scope
  const scopedPrefix = scope != null && String(scope).length > 0
    ? `${String(scope)}:`
    : ''
  return `${scopedPrefix}math-block:${String(props.indexKey)}`
}

function resolveCachedMinHeight() {
  const cacheKey = getHeightCacheKey()
  return cacheKey ? (minHeightCacheContext?.cache.get(cacheKey) ?? 0) : 0
}

function clearLockedMinHeight() {
  if (lockedMinHeight.value === 0)
    return

  lockedMinHeight.value = 0
  const cacheKey = getHeightCacheKey()
  if (cacheKey)
    minHeightCacheContext?.cache.set(cacheKey, 0)
}

if (initialState.html)
  clearLockedMinHeight()

function updateLockedMinHeight(height: number) {
  if (renderedHtml.value) {
    clearLockedMinHeight()
    return
  }

  if (!Number.isFinite(height) || height <= 0)
    return

  const nextMinHeight = Math.max(lockedMinHeight.value, height)
  if (nextMinHeight === lockedMinHeight.value)
    return

  lockedMinHeight.value = nextMinHeight
  const cacheKey = getHeightCacheKey()
  if (cacheKey)
    minHeightCacheContext?.cache.set(cacheKey, nextMinHeight)
}

function captureHeight() {
  nextTick(() => {
    updateLockedMinHeight(containerEl.value?.offsetHeight ?? 0)
  })
}

function markLifecyclePending() {
  const indexKey = lifecycleIndexKey.value
  if (!lifecycle || !indexKey)
    return

  if (lifecyclePendingIndexKey === indexKey)
    return

  if (lifecyclePendingIndexKey)
    lifecycle.markSettled(lifecyclePendingIndexKey)

  lifecyclePendingIndexKey = indexKey
  lifecycle.markPending(indexKey)
}

function markLifecycleSettled() {
  const indexKey = lifecyclePendingIndexKey
  if (!lifecycle || !indexKey)
    return

  lifecyclePendingIndexKey = ''
  nextTick(() => {
    if (!isUnmounted) {
      const height = containerEl.value?.offsetHeight ?? 0
      if (height > 0)
        lifecycle.reportHeight(indexKey, height)
    }
    lifecycle.markSettled(indexKey)
  })
}

function clearLifecyclePending() {
  const indexKey = lifecyclePendingIndexKey
  if (!lifecycle || !indexKey)
    return

  lifecyclePendingIndexKey = ''
  lifecycle.markSettled(indexKey)
}

// Function to render math using KaTeX
async function renderMath() {
  if (isUnmounted) {
    clearLifecyclePending()
    clearRenderPending()
    return
  }

  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }

  const renderId = ++currentRenderId

  if (!props.node.content) {
    clearLifecyclePending()
    clearRenderPending()
    renderingLoading.value = false
    renderedHtml.value = ''
    renderedText.value = props.node.raw
    hasRenderedOnce = false
    captureHeight()
    return
  }

  const abortController = new AbortController()
  currentAbortController = abortController

  // Mark pending before visibility wait. During restore, the element may be in
  // layout but visually hidden; readiness must not reveal raw fallback as final.
  markRenderPending()

  // Wait until near/in viewport to prioritize visible area
  if (!hasRenderedOnce && deferOffscreenHeavyNodes.value) {
    try {
      // register once per mount
      if (!visibilityHandle && containerEl.value) {
        // Observe the outer wrapper to ensure IO triggers even if inner is empty
        visibilityHandle = registerVisibility(containerEl.value, {
          rootMargin: viewportPriorityOptions?.value.heavyBlockMargin,
          allowIdle: false,
        })
        viewportReady.value = visibilityHandle.isVisible.value
      }
      await visibilityHandle?.whenVisible
      viewportReady.value = true
    }
    catch {}
  }
  else if (!deferOffscreenHeavyNodes.value) {
    viewportReady.value = true
  }
  if (isUnmounted || renderId !== currentRenderId || abortController.signal.aborted) {
    if (!isUnmounted)
      clearRenderPending(renderId)
    return
  }

  markLifecyclePending()
  renderKaTeXWithBackpressure(mathContent.value, true, {
    timeout: 3000,
    waitTimeout: 2000,
    maxRetries: 8,
    signal: abortController.signal,
  })
    .then((html) => {
      // ignore if a newer render was requested or component unmounted
      if (isUnmounted || renderId !== currentRenderId)
        return
      renderedHtml.value = html
      renderedText.value = ''
      hasRenderedOnce = true
      renderingLoading.value = false
      clearLockedMinHeight()
      captureHeight()
    })
    .catch(async (err: any) => {
      // ignore if a newer render was requested or component unmounted
      if (isUnmounted || renderId !== currentRenderId)
        return

      // If the worker failed to initialize (e.g. bad new Worker path), the
      // worker client will return a special error with code 'WORKER_INIT_ERROR'
      // and `fallbackToRenderer = true`. In that case, perform a synchronous
      // KaTeX render on the main thread as a fallback. If the error is a
      // KaTeX render error from the worker (syntax), we should ignore it here
      // and fall through to the raw/text fallback below.
      const code = err?.code || err?.name
      const isWorkerInitFailure = code === 'WORKER_INIT_ERROR' || err?.fallbackToRenderer
      const isBusyOrTimeout = code === WORKER_BUSY_CODE || code === 'WORKER_TIMEOUT'
      const isDisabled = code === 'KATEX_DISABLED'

      // For blocks, also fall back to main-thread render when the worker is busy/timeout
      // under viewport bursts to avoid showing raw text.
      if (isWorkerInitFailure || (isBusyOrTimeout && !props.node.loading)) {
        const katex = await getKatex()
        if (isUnmounted || renderId !== currentRenderId)
          return

        if (katex) {
          try {
            const html = katex.renderToString(mathContent.value, {
              throwOnError: props.node.loading,
              displayMode: true,
            })
            renderedHtml.value = html
            renderedText.value = ''
            hasRenderedOnce = true
            renderingLoading.value = false
            clearLockedMinHeight()
            captureHeight()
            // populate worker client cache so future calls hit cache
            setKaTeXCache(mathContent.value, true, html)
          }
          catch {
          }
          return
        }
      }

      // show raw fallback when we never successfully rendered before or when loading flag is false

      if (isDisabled || !props.node.loading) {
        renderingLoading.value = false
        renderedHtml.value = ''
        renderedText.value = props.node.raw
        captureHeight()
        return
      }

      if (!hasRenderedOnce)
        renderingLoading.value = true
    })
    .finally(() => {
      if (!isUnmounted && renderId === currentRenderId) {
        clearRenderPending(renderId)
        markLifecycleSettled()
      }
    })
}

watch(
  () => [props.node.content, props.node.loading, props.node.raw],
  () => {
    renderMath()
  },
  { flush: 'post' },
)

watch(
  [() => props.indexKey, () => props.cacheScope],
  () => {
    lockedMinHeight.value = resolveCachedMinHeight()
    captureHeight()
  },
)

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && containerEl.value) {
    resizeObserver = new ResizeObserver(() => {
      updateLockedMinHeight(containerEl.value?.offsetHeight ?? 0)
    })
    resizeObserver.observe(containerEl.value)
  }

  captureHeight()

  if (renderedHtml.value)
    return
  renderMath()
})

onBeforeUnmount(() => {
  // prevent any pending worker responses from touching the DOM
  isUnmounted = true
  clearLifecyclePending()
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }
  resizeObserver?.disconnect()
  resizeObserver = null
  visibilityHandle?.destroy?.()
  visibilityHandle = null
})
</script>

<template>
  <div
    ref="containerEl"
    class="math-block text-center overflow-x-auto relative"
    data-markstream-math="block"
    :data-markstream-mode="renderedHtml ? 'katex' : renderedText ? 'fallback' : 'loading'"
    :data-markstream-pending="renderingPending ? 'true' : undefined"
    :data-markstream-viewport-pending="deferOffscreenHeavyNodes && !viewportReady ? 'true' : undefined"
    :style="lockedMinHeight ? { minHeight: `${lockedMinHeight}px` } : undefined"
  >
    <Transition name="math-fade">
      <div v-if="renderingLoading && !renderedHtml && !renderedText" class="math-loading-overlay">
        <div class="math-loading-spinner" />
      </div>
    </Transition>
    <div
      v-if="renderedHtml"
      class="math-block__content"
      :class="{ 'math-rendering': renderingLoading }"
      v-html="renderedHtml"
    />
    <pre v-else-if="renderedText" class="math-block__fallback text-left">{{ renderedText }}</pre>
    <div v-else class="math-block__content" :class="{ 'math-rendering': renderingLoading }" />
  </div>
</template>

<style scoped>
.math-block {
  min-height: var(--ms-size-math-min-height);
  transition: min-height var(--ms-duration-overlay) var(--ms-ease-standard);
}

.math-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(2px);
  min-height: var(--ms-size-math-min-height);
}

.math-loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid color-mix(in srgb, var(--loading-spinner) 15%, transparent);
  border-top-color: color-mix(in srgb, var(--loading-spinner) 80%, transparent);
  border-radius: 50%;
  animation: math-spin 0.8s linear infinite;
}

.math-block[data-markstream-viewport-pending='true'] .math-loading-overlay {
  backdrop-filter: none;
}

.math-block[data-markstream-viewport-pending='true'] .math-loading-spinner {
  animation: none;
}

@keyframes math-spin {
  to {
    transform: rotate(360deg);
  }
}

.math-rendering {
  opacity: 0.3;
  transition: opacity var(--ms-duration-overlay) var(--ms-ease-standard);
}

.math-block__fallback {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 0;
}

.math-fade-enter-active,
.math-fade-leave-active {
  transition: all var(--ms-duration-slow) var(--ms-ease-standard);
}

.math-fade-enter-from,
.math-fade-leave-to {
  opacity: 0;
}

/* Dark mode spinner now handled by --loading-spinner token; no override needed */
</style>
