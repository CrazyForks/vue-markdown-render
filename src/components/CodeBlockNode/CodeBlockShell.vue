<script setup lang="ts">
/**
 * CodeBlockShell — shared header/buttons/skeleton/collapse wrapper
 * for all built-in code block renderers (Monaco, Shiki, Pre).
 *
 * This is a "dumb" template component. All state lives in the parent;
 * Shell receives it via props and communicates back via emits.
 */
import { computed } from 'vue'
import { useSafeI18n } from '../../composables/useSafeI18n'
import { hideTooltip, showTooltipForAnchor } from '../../composables/useSingletonTooltip'

const props = withDefaults(defineProps<{
  // Header visibility
  showHeader?: boolean
  showCollapseButton?: boolean
  showFontSizeButtons?: boolean
  enableFontSizeControl?: boolean
  showCopyButton?: boolean
  showExpandButton?: boolean
  showPreviewButton?: boolean
  showTooltips?: boolean
  // State (from parent)
  isDark?: boolean
  loading?: boolean
  stream?: boolean
  isCollapsed?: boolean
  isExpanded?: boolean
  copyText?: boolean
  isPreviewable?: boolean
  // Font size state
  codeFontSize?: number
  codeFontMin?: number
  codeFontMax?: number
  defaultCodeFontSize?: number
  fontBaselineReady?: boolean
  // Diff stats (optional, CodeBlockNode only)
  diffStats?: { added: number, removed: number } | null
  diffStatsAriaLabel?: string
}>(), {
  showHeader: true,
  showCollapseButton: true,
  showCopyButton: true,
  showExpandButton: true,
  showPreviewButton: true,
  showTooltips: true,
  isDark: false,
  loading: false,
  stream: false,
  isCollapsed: false,
  isExpanded: false,
  copyText: false,
  isPreviewable: false,
  enableFontSizeControl: true,
  showFontSizeButtons: true,
  fontBaselineReady: false,
})

const emit = defineEmits<{
  (e: 'toggleCollapse'): void
  (e: 'decreaseFont'): void
  (e: 'resetFont'): void
  (e: 'increaseFont'): void
  (e: 'copy'): void
  (e: 'toggleExpand', event: MouseEvent): void
  (e: 'preview'): void
}>()

const { t } = useSafeI18n()
const tooltipsEnabled = computed(() => props.showTooltips !== false)

function onBtnHover(e: MouseEvent | FocusEvent, text: string) {
  if (!tooltipsEnabled.value) return
  showTooltipForAnchor(e.currentTarget as HTMLElement, text, 'top', false, undefined, props.isDark)
}

function onBtnLeave() {
  if (!tooltipsEnabled.value) return
  hideTooltip()
}

function onCopyHover(e: MouseEvent | FocusEvent) {
  onBtnHover(e, props.copyText ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy'))
}

const fontDecreaseDisabled = computed(() =>
  Number.isFinite(props.codeFontSize) ? (props.codeFontSize ?? 0) <= (props.codeFontMin ?? 0) : false,
)
const fontResetDisabled = computed(() =>
  !props.fontBaselineReady || props.codeFontSize === props.defaultCodeFontSize,
)
const fontIncreaseDisabled = computed(() =>
  Number.isFinite(props.codeFontSize) ? (props.codeFontSize ?? 0) >= (props.codeFontMax ?? 100) : false,
)
</script>

<template>
  <!-- Header -->
  <div
    v-if="props.showHeader"
    class="code-block-header flex justify-between items-center px-4 py-2.5 border-b"
  >
    <!-- left: language icon + title (provided by parent via slot) -->
    <slot name="header-left" />

    <!-- right: action buttons -->
    <slot name="header-right">
      <div class="code-header-actions">
        <!-- Diff stats (optional) -->
        <div
          v-if="diffStats"
          class="code-diff-stats"
          :aria-label="diffStatsAriaLabel"
        >
          <span class="code-diff-stat removed">-{{ diffStats.removed }}</span>
          <span class="code-diff-stat added">+{{ diffStats.added }}</span>
        </div>

        <!-- Collapse -->
        <button
          v-if="props.showCollapseButton"
          type="button"
          class="code-action-btn p-2 text-xs rounded-md transition-colors"
          :aria-pressed="isCollapsed"
          @click="emit('toggleCollapse')"
          @mouseenter="onBtnHover($event, isCollapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))"
          @focus="onBtnHover($event, isCollapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <svg :style="{ rotate: isCollapsed ? '0deg' : '90deg' }" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 18l6-6l-6-6" /></svg>
        </button>

        <!-- Font size controls -->
        <template v-if="props.showFontSizeButtons && props.enableFontSizeControl">
          <button
            type="button"
            class="code-action-btn p-2 text-xs rounded-md transition-colors"
            :disabled="fontDecreaseDisabled"
            @click="emit('decreaseFont')"
            @mouseenter="onBtnHover($event, t('common.decrease') || 'Decrease')"
            @focus="onBtnHover($event, t('common.decrease') || 'Decrease')"
            @mouseleave="onBtnLeave"
            @blur="onBtnLeave"
          >
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14" /></svg>
          </button>
          <button
            type="button"
            class="code-action-btn p-2 text-xs rounded-md transition-colors"
            :disabled="fontResetDisabled"
            @click="emit('resetFont')"
            @mouseenter="onBtnHover($event, t('common.reset') || 'Reset')"
            @focus="onBtnHover($event, t('common.reset') || 'Reset')"
            @mouseleave="onBtnLeave"
            @blur="onBtnLeave"
          >
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></g></svg>
          </button>
          <button
            type="button"
            class="code-action-btn p-2 text-xs rounded-md transition-colors"
            :disabled="fontIncreaseDisabled"
            @click="emit('increaseFont')"
            @mouseenter="onBtnHover($event, t('common.increase') || 'Increase')"
            @focus="onBtnHover($event, t('common.increase') || 'Increase')"
            @mouseleave="onBtnLeave"
            @blur="onBtnLeave"
          >
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14m-7-7v14" /></svg>
          </button>
        </template>

        <!-- Copy -->
        <button
          v-if="props.showCopyButton"
          type="button"
          class="code-action-btn p-2 text-xs rounded-md transition-colors"
          :aria-label="copyText ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy')"
          @click="emit('copy')"
          @mouseenter="onCopyHover($event)"
          @focus="onCopyHover($event)"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <svg v-if="!copyText" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></g></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 6L9 17l-5-5" /></svg>
        </button>

        <!-- Expand -->
        <button
          v-if="props.showExpandButton"
          type="button"
          class="code-action-btn p-2 text-xs rounded-md transition-colors"
          :aria-pressed="isExpanded"
          @click="emit('toggleExpand', $event)"
          @mouseenter="onBtnHover($event, isExpanded ? (t('common.collapse') || 'Collapse') : (t('common.expand') || 'Expand'))"
          @focus="onBtnHover($event, isExpanded ? (t('common.collapse') || 'Collapse') : (t('common.expand') || 'Expand'))"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <svg v-if="isExpanded" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="0.75rem" height="0.75rem" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m14 10l7-7m-1 7h-6V4M3 21l7-7m-6 0h6v6" /></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="0.75rem" height="0.75rem" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 3h6v6m0-6l-7 7M3 21l7-7m-1 7H3v-6" /></svg>
        </button>

        <!-- Preview -->
        <button
          v-if="isPreviewable && props.showPreviewButton"
          type="button"
          class="code-action-btn p-2 text-xs rounded-md transition-colors"
          :aria-label="t('common.preview') || 'Preview'"
          @click="emit('preview')"
          @mouseenter="onBtnHover($event, t('common.preview') || 'Preview')"
          @focus="onBtnHover($event, t('common.preview') || 'Preview')"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M2.062 12.348a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 19.876 0a1 1 0 0 1 0 .696a10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></g></svg>
        </button>
      </div>
    </slot>
  </div>

  <!-- Content: visible when not collapsed and (streaming OR not loading) -->
  <slot v-if="!isCollapsed && (stream ? true : !loading)" />

  <!-- Loading skeleton -->
  <div v-show="!stream && loading" class="code-loading-placeholder">
    <slot name="loading">
      <div class="loading-skeleton">
        <div class="skeleton-line" />
        <div class="skeleton-line" />
        <div class="skeleton-line short" />
      </div>
    </slot>
  </div>

  <!-- Screen reader copy status -->
  <span class="sr-only" aria-live="polite" role="status">{{ copyText ? t('common.copied') || 'Copied' : '' }}</span>
</template>
