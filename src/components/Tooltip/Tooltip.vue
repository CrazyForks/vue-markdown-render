<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  anchorEl: HTMLElement | null
  content: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  offset?: number
  originX?: number | null
  originY?: number | null
  id?: string | null
  /** @deprecated Dark mode is now handled via semantic CSS tokens. */
  isDark?: boolean | null
}>()

const tooltip = ref<HTMLElement | null>(null)
const arrowEl = ref<HTMLElement | null>(null)
const style = ref<Record<string, string>>({ transform: 'translate3d(0px, 0px, 0px)', left: '0px', top: '0px' })
const arrowStyle = ref<Record<string, string>>({})
const actualPlacement = ref<string>(props.placement ?? 'top')
const ready = ref(false)

let cleanupAutoUpdate: (() => void) | null = null
let observedAnchorEl: HTMLElement | null = null
let observedTooltipEl: HTMLElement | null = null
let floatingModule: typeof import('@floating-ui/dom') | null = null
let floatingPromise: Promise<typeof import('@floating-ui/dom')> | null = null
let visibilityRunId = 0

function loadFloating() {
  if (floatingModule)
    return Promise.resolve(floatingModule)

  if (!floatingPromise) {
    floatingPromise = import('@floating-ui/dom')
      .then((mod) => {
        floatingModule = mod
        return mod
      })
      .catch((error) => {
        floatingPromise = null
        throw error
      })
  }

  return floatingPromise
}

function cleanupPositionObserver() {
  if (cleanupAutoUpdate) {
    cleanupAutoUpdate()
    cleanupAutoUpdate = null
  }
  observedAnchorEl = null
  observedTooltipEl = null
}

async function setupPositionObserver(runIsCurrent: () => boolean) {
  const anchor = props.anchorEl
  const tooltipEl = tooltip.value

  if (!props.visible || !anchor || !tooltipEl)
    return

  if (observedAnchorEl === anchor && observedTooltipEl === tooltipEl)
    return

  const { autoUpdate } = await loadFloating()

  if (!runIsCurrent() || !props.visible || props.anchorEl !== anchor || tooltip.value !== tooltipEl)
    return

  cleanupPositionObserver()
  observedAnchorEl = anchor
  observedTooltipEl = tooltipEl
  cleanupAutoUpdate = autoUpdate(anchor, tooltipEl, () => {
    void updatePosition().catch(() => {
      applyFallbackPosition()
    })
  })
}

async function updatePosition() {
  const anchor = props.anchorEl
  const tooltipEl = tooltip.value

  if (!props.visible || !anchor || !tooltipEl)
    return false

  const { arrow: arrowMiddleware, computePosition, flip, offset, shift } = await loadFloating()

  if (!props.visible || props.anchorEl !== anchor || tooltip.value !== tooltipEl)
    return false

  const middleware = [
    offset(props.offset ?? 6),
    flip(),
    shift({ padding: 6 }),
    ...(arrowEl.value ? [arrowMiddleware({ element: arrowEl.value, padding: 4 })] : []),
  ]
  const { x, y, placement, middlewareData } = await computePosition(anchor, tooltipEl, {
    placement: props.placement ?? 'top',
    middleware,
    strategy: 'fixed',
  })

  if (!props.visible || props.anchorEl !== anchor || tooltip.value !== tooltipEl)
    return false

  style.value.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
  style.value.left = '0px'
  style.value.top = '0px'
  actualPlacement.value = placement

  // Arrow positioning
  if (middlewareData.arrow && arrowEl.value) {
    const { x: ax, y: ay } = middlewareData.arrow
    const side = placement.split('-')[0] as 'top' | 'bottom' | 'left' | 'right'
    const staticSide = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[side]
    arrowStyle.value = {
      left: ax != null ? `${ax}px` : '',
      top: ay != null ? `${ay}px` : '',
      [staticSide]: '-3px',
    }
  }

  return true
}

function applyFallbackPosition() {
  const anchor = props.anchorEl
  const tooltipEl = tooltip.value
  if (!anchor || !tooltipEl)
    return false

  const rect = anchor.getBoundingClientRect()
  const tooltipRect = tooltipEl.getBoundingClientRect()
  const gap = props.offset ?? 6
  const placement = props.placement ?? 'top'

  let x = rect.left
  let y = rect.top

  if (placement === 'bottom') {
    y = rect.bottom + gap
  }
  else if (placement === 'left') {
    x = rect.left - tooltipRect.width - gap
  }
  else if (placement === 'right') {
    x = rect.right + gap
  }
  else {
    y = rect.top - tooltipRect.height - gap
  }

  style.value.transform = `translate3d(${Math.round(Math.max(0, x))}px, ${Math.round(Math.max(0, y))}px, 0)`
  style.value.left = '0px'
  style.value.top = '0px'
  actualPlacement.value = placement
  arrowStyle.value = {}
  return true
}

watch(
  () => props.visible,
  async (v) => {
    const runId = ++visibilityRunId
    if (v) {
      ready.value = false
      await nextTick()
      if (runId !== visibilityRunId || !props.visible)
        return
      if (props.anchorEl && tooltip.value) {
        try {
          const anchor = props.anchorEl
          const tooltipEl = tooltip.value
          const rect = anchor.getBoundingClientRect()
          const positioned = await updatePosition()
          if (!positioned || runId !== visibilityRunId || !props.visible || props.anchorEl !== anchor || tooltip.value !== tooltipEl)
            return
          const targetTransform = style.value.transform
          if (props.originX != null && props.originY != null) {
            const dx = Math.abs(Number(props.originX) - rect.left)
            const dy = Math.abs(Number(props.originY) - rect.top)
            const dist = Math.hypot(dx, dy)
            if (dist > 120) {
              style.value.transform = `translate3d(${Math.round(props.originX)}px, ${Math.round(props.originY)}px, 0)`
              await nextTick()
              if (runId !== visibilityRunId || !props.visible)
                return
              ready.value = true
              await nextTick()
              if (runId !== visibilityRunId || !props.visible)
                return
              style.value.transform = targetTransform
            }
            else {
              ready.value = true
            }
          }
          else {
            ready.value = true
          }
          await setupPositionObserver(() => runId === visibilityRunId)
        }
        catch {
          if (runId !== visibilityRunId || !props.visible)
            return
          ready.value = applyFallbackPosition()
          if (props.anchorEl && tooltip.value) {
            try {
              await setupPositionObserver(() => runId === visibilityRunId)
            }
            catch {}
          }
        }
      }
      else {
        ready.value = true
      }
    }
    else {
      ready.value = false
      cleanupPositionObserver()
    }
  },
)

let updateRunId = 0

watch([
  () => props.anchorEl,
  () => props.placement,
  () => props.content,
], async () => {
  const runId = ++updateRunId

  if (props.visible && props.anchorEl && tooltip.value) {
    await nextTick()
    if (runId !== updateRunId || !props.visible || !props.anchorEl || !tooltip.value)
      return
    try {
      const positioned = await updatePosition()
      if (runId !== updateRunId || !props.visible || !props.anchorEl || !tooltip.value)
        return
      if (!positioned)
        applyFallbackPosition()
    }
    catch {
      applyFallbackPosition()
    }

    await setupPositionObserver(() => runId === updateRunId)
  }
})

onBeforeUnmount(() => {
  visibilityRunId += 1
  cleanupPositionObserver()
})
</script>

<template>
  <teleport to="body">
    <div class="markstream-vue" :class="{ dark: isDark }">
      <transition name="tooltip" appear>
        <div
          v-show="visible"
          :id="props.id"
          ref="tooltip"
          :style="{
            position: 'fixed',
            left: style.left,
            top: style.top,
            transform: style.transform,
            visibility: ready ? 'visible' : 'hidden',
            pointerEvents: ready ? undefined : 'none',
          }"
          class="tooltip-element"
          role="tooltip"
        >
          {{ content }}
          <div ref="arrowEl" class="tooltip-arrow" :data-placement="actualPlacement" :style="arrowStyle" />
        </div>
      </transition>
    </div>
  </teleport>
</template>

<style scoped>
.tooltip-element {
  z-index: 9999;
  display: inline-block;
  max-width: 20rem;
  padding: 0.25rem 0.5rem;
  border-radius: calc(var(--ms-radius) * 0.75);
  font-size: 0.75rem;
  line-height: 1.4;
  white-space: normal;
  word-break: break-word;
  pointer-events: none;
  background-color: var(--tooltip-bg);
  color: var(--tooltip-fg);
  box-shadow: inset 0 1px 0 0 hsl(0 0% 100% / 0.15), 0 0 0 1px hsl(0 0% 0% / 0.12), var(--ms-shadow-popover);
  transition: transform var(--ms-duration-emphasis) var(--ms-ease-spring),
              box-shadow var(--ms-duration-emphasis) var(--ms-ease-spring);
}

/* Arrow */
.tooltip-arrow {
  position: absolute;
  width: 6px;
  height: 6px;
  background: inherit;
  transform: rotate(45deg);
}
.tooltip-arrow[data-placement^="top"] {
  bottom: -3px;
}
.tooltip-arrow[data-placement^="bottom"] {
  top: -3px;
}
.tooltip-arrow[data-placement^="left"] {
  right: -3px;
}
.tooltip-arrow[data-placement^="right"] {
  left: -3px;
}

/* Transitions */
.tooltip-enter-active {
  transition: opacity 180ms cubic-bezier(.16, 1, .3, 1),
              transform 180ms cubic-bezier(.16, 1, .3, 1);
}
.tooltip-leave-active {
  transition: opacity 120ms ease-in,
              transform 120ms ease-in;
}
.tooltip-enter-from {
  opacity: 0;
  transform: scale(0.96);
}
.tooltip-enter-to,
.tooltip-leave-from {
  opacity: 1;
  transform: scale(1);
}
.tooltip-leave-to {
  opacity: 0;
  transform: scale(0.97);
}
</style>
