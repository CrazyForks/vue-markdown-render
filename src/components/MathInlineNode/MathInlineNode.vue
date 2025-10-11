<script setup lang="ts">
import katex from 'katex'
import { computed, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue'
import { renderKaTeXInWorker } from '../../workers/katexWorkerClient'

const props = defineProps<{
  node: {
    type: 'math_inline'
    content: string
    raw: string
    loading?: boolean
  }
  /** link text / underline color (CSS color string) */
  color?: string
  /** underline height in px */
  underlineHeight?: number
  /** underline bottom offset (px). Can be negative. */
  underlineBottom?: number | string
  /** total animation duration in seconds */
  animationDuration?: number
  /** underline opacity */
  animationOpacity?: number
  /** animation timing function */
  animationTiming?: string
  /** animation iteration (e.g. 'infinite' or a number) */
  animationIteration?: string | number
}>()

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
      if (err?.code === 'WORKER_INIT_ERROR' || err?.fallbackToRenderer) {
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

// watch(
//   () => props.node.loading,
//   (newVal) => {
//     nextTick(() => {

//     })
//   },
// )
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
const cssVars = computed(() => {
  const bottom = props.underlineBottom !== undefined
    ? (typeof props.underlineBottom === 'number' ? `${props.underlineBottom}px` : String(props.underlineBottom))
    : '-3px'

  return {
    '--link-color': props.color ?? '#0366d6',
    '--underline-height': `${props.underlineHeight ?? 2}px`,
    '--underline-bottom': bottom,
    '--underline-opacity': String(props.animationOpacity ?? 0.9),
    '--underline-duration': `${props.animationDuration ?? 0.8}s`,
    '--underline-timing': props.animationTiming ?? 'linear',
    '--underline-iteration': typeof props.animationIteration === 'number' ? String(props.animationIteration) : (props.animationIteration ?? 'infinite'),
  } as Record<string, string>
})
const attrs = useAttrs()
</script>

<template>
  <span v-show="renderingLoading" class="math-loading inline-flex items-baseline gap-1.5" :aria-hidden="!node.loading ? 'true' : 'false'" v-bind="attrs" :style="cssVars">
    <span class="math-text-wrapper relative inline-flex">
      <span class="leading-[normal] math-text">
        <!-- Allow consumers to override the loading content via a named slot `loading`,
             or via the default slot. Fallback to the original text when no slot is provided. -->
        <slot name="loading">
          <slot>Loading...</slot>
        </slot>
      </span>
      <span class="underline-anim" aria-hidden="true" />
    </span>
  </span>
  <span v-show="!renderingLoading" ref="mathElement" class="math-inline" />
</template>

<style>
.math-inline {
  display: inline-block;
  vertical-align: middle;
}
.math-loading .math-text-wrapper {
  position: relative;
}

.math-loading .math-text {
  position: relative;
  z-index: 2;
}

.underline-anim {
  position: absolute;
  left: 0;
  right: 0;
  height: var(--underline-height, 2px);
  bottom: var(--underline-bottom, -3px); /* a little below text */
  background: currentColor;
  /* grow symmetrically from the center */
  transform-origin: center center;
  will-change: transform, opacity;
  opacity: var(--underline-opacity, 0.9);
  transform: scaleX(0);
  animation: underlineLoop var(--underline-duration, 0.8s) var(--underline-timing, linear) var(--underline-iteration, infinite);
}

@keyframes underlineLoop {
  0% { transform: scaleX(0); opacity: var(--underline-opacity, 0.9); }
  /* draw to full width by 75% (0.6s) */
  75% { transform: scaleX(1); opacity: var(--underline-opacity, 0.9); }
  /* hold at full width until ~99% (~0.2s pause) */
  99% { transform: scaleX(1); opacity: var(--underline-opacity, 0.9); }
  /* collapse quickly back to center right at the end */
  100% { transform: scaleX(0); opacity: 0; }
}
</style>
