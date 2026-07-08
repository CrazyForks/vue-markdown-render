<script setup lang="ts">
import type { PreCodeNodeProps } from '../../types/component-props'

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<PreCodeNodeProps>()

function getDisplayCode(code: unknown, loading?: boolean) {
  const value = String(code ?? '')
  return loading ? value : value.replace(/\r\n$|\n$|\r$/, '')
}

// Normalize language to a safe, lowercase token (fallback to 'plaintext')
const normalizedLanguage = computed(() => {
  const raw = String(props.node?.language ?? '')
  const head = String(String(raw).split(/\s+/g)[0] ?? '').toLowerCase()
  const safe = head.replace(/[^\w-]/g, '')
  return safe || 'plaintext'
})

const languageClass = computed(() => `language-${normalizedLanguage.value}`)
const isLoading = computed(() => props.loading === true || props.node?.loading === true)
const displayCode = computed(() => {
  if (props.node?.diff === true)
    return String(props.node?.code ?? '')
  return getDisplayCode(props.node?.code, isLoading.value)
})
const codeLines = computed(() => {
  return displayCode.value.split(/\r\n|\n|\r/)
})
const lineNumbers = computed(() => {
  return Array.from({ length: Math.max(1, codeLines.value.length) }, (_, index) => index + 1)
})
const isDiffPreview = computed(() => props.showLineNumbers === true && props.node?.diff === true)
const isInlineDiffPreview = computed(() => isDiffPreview.value && props.diffInline === true)
const reservedHeightStyle = computed(() => {
  const value = Number(props.reservedHeightPx)
  if (!Number.isFinite(value) || value <= 0)
    return undefined

  const height = `${Math.ceil(value)}px`

  if (isLoading.value) {
    return {
      maxHeight: height,
      overflow: 'auto',
    }
  }

  return {
    height,
    minHeight: height,
    maxHeight: height,
    overflow: 'auto',
  }
})

type DiffPreviewLineKind = 'context' | 'removed' | 'added' | 'hunk'
const DIFF_HEADER_PREFIXES = ['diff ', 'index ', '--- ', '+++ ', '@@ ']

interface DiffPreviewLine {
  code: string
  kind: DiffPreviewLineKind
  empty: boolean
  key: string
  number: number | string
}

interface SourceLineMatch {
  originalIndex: number
  modifiedIndex: number
}

function isBlankDiffPreviewLine(code: string) {
  return String(code ?? '').trim().length === 0
}

function toDiffPreviewLine(
  code: string,
  kind: DiffPreviewLineKind = 'context',
  options: { preserveBlankKind?: boolean } = {},
) {
  const empty = isBlankDiffPreviewLine(code)
  return {
    code,
    // Do not paint terminal blank lines / visual spacer rows as added/removed.
    // This keeps the pre fallback close to Monaco, where the empty continuation
    // surface should not flash red/green before highlighting is ready.
    kind: empty && kind !== 'hunk' && !options.preserveBlankKind ? 'context' : kind,
    empty,
  }
}

function splitDiffSource(source: unknown) {
  const code = String(source ?? '')
  if (!code)
    return []
  return code.split(/\r\n|\n|\r/)
}

function shouldPreserveSourceBlankDiffKind(lines: string[], index: number) {
  return !isBlankDiffPreviewLine(lines[index]) || index < lines.length - 1
}

function isRemovedDiffLine(line: string) {
  return line.startsWith('-') && !line.startsWith('---')
}

function isAddedDiffLine(line: string) {
  return line.startsWith('+') && !line.startsWith('+++')
}

function hasUnifiedDiffHeaders(lines: string[]) {
  return lines.some(line => DIFF_HEADER_PREFIXES.some(prefix => line.startsWith(prefix)))
}

function normalizeLooseDiffBody(body: string, hasHeaders: boolean) {
  return !hasHeaders && body.startsWith(' ') && !body.startsWith('  ')
    ? ` ${body}`
    : body
}

function isExplicitDiffLanguage() {
  if (normalizedLanguage.value === 'diff')
    return true

  const firstLine = String(props.node?.raw ?? '').split(/\r?\n/, 1)[0]?.trim() ?? ''
  return /^`{3,}\s*diff(?:\s|$)|^~{3,}\s*diff(?:\s|$)/.test(firstLine)
}

function hasPatchLines(lines: string[]) {
  const hasRemoved = lines.some(line => isRemovedDiffLine(line))
  const hasAdded = lines.some(line => isAddedDiffLine(line))
  return (hasRemoved && hasAdded)
    || (isExplicitDiffLanguage() && (hasRemoved || hasAdded))
}

function hasDiffSourcePair() {
  return props.node?.originalCode != null || props.node?.updatedCode != null
}

function computeSourceLineMatches(original: string[], modified: string[]): SourceLineMatch[] | null {
  const n = original.length
  const m = modified.length
  const prefixMatches: SourceLineMatch[] = []
  let start = 0
  while (start < n && start < m && original[start] === modified[start]) {
    prefixMatches.push({ originalIndex: start, modifiedIndex: start })
    start++
  }

  const suffixMatches: SourceLineMatch[] = []
  let originalEnd = n - 1
  let modifiedEnd = m - 1
  while (
    originalEnd >= start
    && modifiedEnd >= start
    && original[originalEnd] === modified[modifiedEnd]
  ) {
    suffixMatches.unshift({ originalIndex: originalEnd, modifiedIndex: modifiedEnd })
    originalEnd--
    modifiedEnd--
  }

  const middleOriginalLength = originalEnd - start + 1
  const middleModifiedLength = modifiedEnd - start + 1
  if (middleOriginalLength <= 0 || middleModifiedLength <= 0)
    return prefixMatches.concat(suffixMatches)

  const maxCells = 1_500_000
  if ((middleOriginalLength + 1) * (middleModifiedLength + 1) > maxCells)
    return null

  const cols = middleModifiedLength + 1
  const dp = new Uint32Array((middleOriginalLength + 1) * (middleModifiedLength + 1))
  for (let i = middleOriginalLength - 1; i >= 0; i--) {
    for (let j = middleModifiedLength - 1; j >= 0; j--) {
      const index = i * cols + j
      if (original[start + i] === modified[start + j]) {
        dp[index] = dp[(i + 1) * cols + j + 1] + 1
      }
      else {
        const top = dp[(i + 1) * cols + j]
        const left = dp[i * cols + j + 1]
        dp[index] = top >= left ? top : left
      }
    }
  }

  const matches: SourceLineMatch[] = []
  let i = 0
  let j = 0
  while (i < middleOriginalLength && j < middleModifiedLength) {
    if (original[start + i] === modified[start + j]) {
      matches.push({ originalIndex: start + i, modifiedIndex: start + j })
      i++
      j++
    }
    else if (dp[(i + 1) * cols + j] >= dp[i * cols + j + 1]) {
      i++
    }
    else {
      j++
    }
  }
  return prefixMatches.concat(matches, suffixMatches)
}

function buildInlinePatchPreviewLines(lines: string[]): DiffPreviewLine[] {
  const result: DiffPreviewLine[] = []
  let modifiedLine = 1
  const hasHeaders = hasUnifiedDiffHeaders(lines)

  for (const [index, raw] of lines.entries()) {
    if (raw.startsWith('@@')) {
      result.push({
        ...toDiffPreviewLine(raw, 'hunk'),
        key: `inline-hunk-${index}`,
        number: '',
      })
    }
    else if (isRemovedDiffLine(raw)) {
      result.push({
        ...toDiffPreviewLine(normalizeLooseDiffBody(raw.slice(1), hasHeaders), 'removed', { preserveBlankKind: true }),
        key: `inline-removed-${index}`,
        number: '',
      })
    }
    else if (isAddedDiffLine(raw)) {
      result.push({
        ...toDiffPreviewLine(normalizeLooseDiffBody(raw.slice(1), hasHeaders), 'added', { preserveBlankKind: true }),
        key: `inline-added-${index}`,
        number: modifiedLine++,
      })
    }
    else {
      const code = hasHeaders && raw.startsWith(' ') ? raw.slice(1) : raw
      result.push({
        ...toDiffPreviewLine(code),
        key: `inline-context-${index}`,
        number: modifiedLine,
      })
      modifiedLine++
    }
  }

  return result
}

function buildInlineSourcePreviewLines(originalSource: unknown, modifiedSource: unknown): DiffPreviewLine[] {
  const original = splitDiffSource(originalSource)
  const modified = splitDiffSource(modifiedSource)
  const matches = computeSourceLineMatches(original, modified)
  if (matches) {
    const result: DiffPreviewLine[] = []
    let originalIndex = 0
    let modifiedIndex = 0

    for (const match of matches) {
      while (originalIndex < match.originalIndex) {
        result.push({
          ...toDiffPreviewLine(original[originalIndex], 'removed', {
            preserveBlankKind: shouldPreserveSourceBlankDiffKind(original, originalIndex),
          }),
          key: `inline-removed-source-${originalIndex}`,
          number: '',
        })
        originalIndex++
      }
      while (modifiedIndex < match.modifiedIndex) {
        result.push({
          ...toDiffPreviewLine(modified[modifiedIndex], 'added', {
            preserveBlankKind: shouldPreserveSourceBlankDiffKind(modified, modifiedIndex),
          }),
          key: `inline-added-source-${modifiedIndex}`,
          number: modifiedIndex + 1,
        })
        modifiedIndex++
      }
      result.push({
        ...toDiffPreviewLine(modified[match.modifiedIndex]),
        key: `inline-context-source-${match.originalIndex}-${match.modifiedIndex}`,
        number: match.modifiedIndex + 1,
      })
      originalIndex = match.originalIndex + 1
      modifiedIndex = match.modifiedIndex + 1
    }

    while (originalIndex < original.length) {
      result.push({
        ...toDiffPreviewLine(original[originalIndex], 'removed', {
          preserveBlankKind: shouldPreserveSourceBlankDiffKind(original, originalIndex),
        }),
        key: `inline-removed-source-${originalIndex}`,
        number: '',
      })
      originalIndex++
    }
    while (modifiedIndex < modified.length) {
      result.push({
        ...toDiffPreviewLine(modified[modifiedIndex], 'added', {
          preserveBlankKind: shouldPreserveSourceBlankDiffKind(modified, modifiedIndex),
        }),
        key: `inline-added-source-${modifiedIndex}`,
        number: modifiedIndex + 1,
      })
      modifiedIndex++
    }

    return result
  }

  const result: DiffPreviewLine[] = []
  let start = 0
  let originalEnd = original.length - 1
  let modifiedEnd = modified.length - 1

  while (
    start <= originalEnd
    && start <= modifiedEnd
    && original[start] === modified[start]
  ) {
    result.push({
      ...toDiffPreviewLine(modified[start]),
      key: `inline-prefix-${start}`,
      number: start + 1,
    })
    start++
  }

  const suffix: DiffPreviewLine[] = []
  while (
    originalEnd >= start
    && modifiedEnd >= start
    && original[originalEnd] === modified[modifiedEnd]
  ) {
    suffix.unshift({
      ...toDiffPreviewLine(modified[modifiedEnd]),
      key: `inline-suffix-${modifiedEnd}`,
      number: modifiedEnd + 1,
    })
    originalEnd--
    modifiedEnd--
  }

  for (let index = start; index <= originalEnd; index++) {
    result.push({
      ...toDiffPreviewLine(original[index], 'removed', {
        preserveBlankKind: shouldPreserveSourceBlankDiffKind(original, index),
      }),
      key: `inline-removed-source-${index}`,
      number: '',
    })
  }

  for (let index = start; index <= modifiedEnd; index++) {
    result.push({
      ...toDiffPreviewLine(modified[index], 'added', {
        preserveBlankKind: shouldPreserveSourceBlankDiffKind(modified, index),
      }),
      key: `inline-added-source-${index}`,
      number: index + 1,
    })
  }

  return result.concat(suffix)
}

const diffPreviewPanes = computed(() => {
  const hasPatchDiffLines = hasPatchLines(codeLines.value)
  const hasSourcePair = hasDiffSourcePair()
  if (isInlineDiffPreview.value) {
    const lines = hasSourcePair
      ? buildInlineSourcePreviewLines(props.node?.originalCode, props.node?.updatedCode)
      : buildInlinePatchPreviewLines(codeLines.value)

    return [
      {
        key: 'inline',
        className: 'markstream-pre__diff-pane--inline',
        lines,
      },
    ]
  }

  if (!hasPatchDiffLines && hasSourcePair) {
    const originalLines = splitDiffSource(props.node?.originalCode)
    const modifiedLines = splitDiffSource(props.node?.updatedCode)
    return [
      {
        key: 'original',
        className: 'markstream-pre__diff-pane--original',
        lines: originalLines.map((line, index) => {
          const kind = modifiedLines[index] === line ? 'context' : 'removed'
          return {
            ...toDiffPreviewLine(line, kind, {
              preserveBlankKind: shouldPreserveSourceBlankDiffKind(originalLines, index),
            }),
            key: `original-${index}`,
            number: index + 1,
          }
        }),
      },
      {
        key: 'modified',
        className: 'markstream-pre__diff-pane--modified',
        lines: modifiedLines.map((line, index) => {
          const kind = originalLines[index] === line ? 'context' : 'added'
          return {
            ...toDiffPreviewLine(line, kind, {
              preserveBlankKind: shouldPreserveSourceBlankDiffKind(modifiedLines, index),
            }),
            key: `modified-${index}`,
            number: index + 1,
          }
        }),
      },
    ]
  }

  const original = [] as Array<{ code: string, kind: DiffPreviewLineKind, empty: boolean }>
  const modified = [] as Array<{ code: string, kind: DiffPreviewLineKind, empty: boolean }>
  const hasHeaders = hasUnifiedDiffHeaders(codeLines.value)

  for (const raw of codeLines.value) {
    if (raw.startsWith('@@')) {
      original.push(toDiffPreviewLine(raw, 'hunk'))
      modified.push(toDiffPreviewLine(raw, 'hunk'))
    }
    else if (raw.startsWith('-') && !raw.startsWith('---')) {
      original.push(toDiffPreviewLine(normalizeLooseDiffBody(raw.slice(1), hasHeaders), 'removed', { preserveBlankKind: true }))
    }
    else if (raw.startsWith('+') && !raw.startsWith('+++')) {
      modified.push(toDiffPreviewLine(normalizeLooseDiffBody(raw.slice(1), hasHeaders), 'added', { preserveBlankKind: true }))
    }
    else {
      const code = hasHeaders && raw.startsWith(' ') ? raw.slice(1) : raw
      original.push(toDiffPreviewLine(code))
      modified.push(toDiffPreviewLine(code))
    }
  }

  return [
    {
      key: 'original',
      className: 'markstream-pre__diff-pane--original',
      lines: original.map((line, index) => ({ ...line, key: `original-${index}`, number: index + 1 })),
    },
    {
      key: 'modified',
      className: 'markstream-pre__diff-pane--modified',
      lines: modified.map((line, index) => ({ ...line, key: `modified-${index}`, number: index + 1 })),
    },
  ]
})

const ariaLabel = computed(() => {
  const lang = normalizedLanguage.value
  return lang ? `Code block: ${lang}` : 'Code block'
})

// ─── Diff row-height sync ────────────────────────────────────────────────────
// Keeps the left and right diff panes in vertical lockstep when content wraps.
// We measure each pane's natural line heights via DOM, then apply a shared
// `min-height` so that line N on both sides always starts at the same Y.

const preRef = ref<HTMLPreElement | null>(null)

interface DiffLineMetric {
  rowHeight: number
  originalHeight: number
  modifiedHeight: number
}

const diffLineMetrics = ref<DiffLineMetric[]>([])
let diffLineMetricsRaf: number | null = null
let diffResizeObserver: ResizeObserver | null = null

function readPx(value: string | null | undefined) {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function readBaseDiffLineHeight(root: HTMLElement) {
  const style = window.getComputedStyle(root)
  const fromVar = readPx(style.getPropertyValue('--markstream-pre-diff-line-height'))
  if (fromVar > 0)
    return fromVar

  const fromLineHeight = readPx(style.lineHeight)
  return fromLineHeight > 0 ? fromLineHeight : 18
}

function readNaturalDiffLineHeight(line: HTMLElement | null, baseLineHeight: number) {
  if (!line)
    return baseLineHeight

  const content = line.querySelector('.markstream-pre__diff-content') as HTMLElement | null
  const contentRect = content?.getBoundingClientRect()
  const contentHeight = contentRect?.height ?? 0

  return Math.max(baseLineHeight, Math.ceil(contentHeight))
}

function areDiffMetricsEqual(a: DiffLineMetric[], b: DiffLineMetric[]) {
  if (a.length !== b.length)
    return false

  return a.every((item, index) => {
    const other = b[index]
    return other
      && Math.abs(item.rowHeight - other.rowHeight) <= 0.5
      && Math.abs(item.originalHeight - other.originalHeight) <= 0.5
      && Math.abs(item.modifiedHeight - other.modifiedHeight) <= 0.5
  })
}

function syncDiffLineMetrics() {
  diffLineMetricsRaf = null

  const root = preRef.value
  if (!root || !isDiffPreview.value) {
    if (diffLineMetrics.value.length)
      diffLineMetrics.value = []
    return
  }

  const baseLineHeight = readBaseDiffLineHeight(root)

  const originalLines = Array.from(
    root.querySelectorAll<HTMLElement>('.markstream-pre__diff-pane--original .markstream-pre__diff-line'),
  )
  const modifiedLines = Array.from(
    root.querySelectorAll<HTMLElement>('.markstream-pre__diff-pane--modified .markstream-pre__diff-line'),
  )

  const count = Math.max(originalLines.length, modifiedLines.length)
  const next: DiffLineMetric[] = []

  for (let i = 0; i < count; i++) {
    const originalHeight = readNaturalDiffLineHeight(originalLines[i] ?? null, baseLineHeight)
    const modifiedHeight = readNaturalDiffLineHeight(modifiedLines[i] ?? null, baseLineHeight)
    const rowHeight = Math.max(baseLineHeight, originalHeight, modifiedHeight)

    next.push({ rowHeight, originalHeight, modifiedHeight })
  }

  if (!areDiffMetricsEqual(diffLineMetrics.value, next))
    diffLineMetrics.value = next
}

function scheduleDiffLineMetricsSync() {
  if (typeof window === 'undefined')
    return

  if (diffLineMetricsRaf != null)
    window.cancelAnimationFrame(diffLineMetricsRaf)

  diffLineMetricsRaf = window.requestAnimationFrame(() => {
    syncDiffLineMetrics()
  })
}

function setupDiffResizeObserver(el: HTMLElement | null) {
  diffResizeObserver?.disconnect()
  diffResizeObserver = null

  if (!el || !isDiffPreview.value || typeof ResizeObserver === 'undefined')
    return

  diffResizeObserver = new ResizeObserver(() => {
    scheduleDiffLineMetricsSync()
  })
  diffResizeObserver.observe(el)
}

watch(
  preRef,
  (el) => {
    setupDiffResizeObserver(el)
    void nextTick(() => scheduleDiffLineMetricsSync())
  },
  { flush: 'post' },
)

watch(
  [isDiffPreview, diffPreviewPanes],
  () => {
    setupDiffResizeObserver(preRef.value)
    void nextTick(() => scheduleDiffLineMetricsSync())
  },
  { flush: 'post', immediate: true },
)

onBeforeUnmount(() => {
  if (diffLineMetricsRaf != null) {
    window.cancelAnimationFrame(diffLineMetricsRaf)
    diffLineMetricsRaf = null
  }

  diffResizeObserver?.disconnect()
  diffResizeObserver = null
})

function getDiffLineStyle(index: number, side: 'original' | 'modified') {
  const metric = diffLineMetrics.value[index]
  if (!metric)
    return undefined

  const contentHeight = side === 'original' ? metric.originalHeight : metric.modifiedHeight

  return {
    '--markstream-pre-diff-synced-row-height': `${Math.ceil(metric.rowHeight)}px`,
    '--markstream-pre-diff-content-height': `${Math.ceil(contentHeight)}px`,
  }
}
</script>

<template>
  <pre
    ref="preRef"
    :style="reservedHeightStyle"
    :class="[languageClass, { 'markstream-pre--line-numbers': props.showLineNumbers, 'markstream-pre--diff-preview': isDiffPreview, 'markstream-pre--diff-inline': isInlineDiffPreview }]"
    :aria-busy="isLoading"
    :aria-label="ariaLabel"
    :data-language="normalizedLanguage"
    :data-markstream-line-numbers="props.showLineNumbers ? '1' : undefined"
    data-markstream-pre="1"
    tabindex="0"
  ><code v-if="isDiffPreview" translate="no" class="markstream-pre__diff-code"><span v-for="pane in diffPreviewPanes" :key="pane.key" class="markstream-pre__diff-pane" :class="pane.className"><span v-for="(line, index) in pane.lines" :key="line.key" class="markstream-pre__diff-line" :class="[`markstream-pre__diff-line--${line.kind}`, { 'markstream-pre__diff-line--empty': line.empty }]" :style="getDiffLineStyle(index, pane.key as 'original' | 'modified')"><span class="markstream-pre__diff-rail" aria-hidden="true" /><span class="markstream-pre__diff-number" aria-hidden="true">{{ line.number }}</span><span class="markstream-pre__diff-content"><span class="markstream-pre__diff-content-inner">{{ line.code }}</span></span></span></span></code><template v-else><span v-if="props.showLineNumbers" class="markstream-pre__line-numbers" aria-hidden="true"><span v-for="line in lineNumbers" :key="line" class="markstream-pre__line-number">{{ line }}</span></span><code translate="no" class="markstream-pre__code" v-text="displayCode" /></template></pre>
</template>

<style>
/* Minimal, safe defaults to reduce flicker during frequent text updates */
.markstream-vue pre[class^='language-'],
.markstream-vue pre[class*=' language-'] {
  /* Ensure code layout is stable */
  white-space: pre;
  overflow: auto;
  tab-size: 2;
  font-variant-ligatures: none;
  /* Isolate painting/layout to this block to avoid ancestor reflow jank */
  contain: content;
  /* Hint GPU compositing on WebKit/Blink to reduce paint flashing */
  backface-visibility: hidden;
  transform: translateZ(0);
  -webkit-font-smoothing: antialiased;
}
.markstream-vue pre[class^='language-'] > code,
.markstream-vue pre[class*=' language-'] > code {
  display: block;
}

.markstream-vue pre.markstream-pre--line-numbers {
  position: relative;
}

.markstream-vue pre.code-pre-fallback[data-markstream-code-loading='1'] {
  --markstream-pre-line-number-top: var(--markstream-code-padding-y, 8px);
  --markstream-pre-line-number-left: 4px;
  --markstream-pre-line-number-width: 44px;
  --markstream-pre-line-number-gap: 8px;
  --markstream-code-padding-left: 48px;
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: var(--markstream-code-padding-y, 8px) var(--markstream-code-padding-x, 12px);
  padding-left: var(--markstream-code-padding-left);
  overflow: auto;
  border: 1px solid var(--code-border);
  border-radius: var(--ms-radius);
  background: var(--code-bg);
  color: var(--code-fg);
  font-family: var(
    --markstream-code-font-family,
    Menlo,
    Monaco,
    Courier New,
    monospace
  );
  font-size: var(--vscode-editor-font-size, 12px);
  line-height: var(--vscode-editor-line-height, 18px);
}

.markstream-vue pre.markstream-pre--line-numbers > .markstream-pre__line-numbers {
  position: absolute;
  top: var(--markstream-pre-line-number-top, 0);
  left: var(--markstream-pre-line-number-left, 0);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  width: var(
    --markstream-pre-line-number-width,
    calc(var(--markstream-code-padding-left, 52px) - var(--markstream-code-padding-x, 12px))
  );
  padding-right: var(--markstream-pre-line-number-gap, 12px);
  color: var(--code-line-number);
  font: inherit;
  font-variant-numeric: tabular-nums;
  line-height: inherit;
  pointer-events: none;
  user-select: none;
}

.markstream-vue pre.markstream-pre--line-numbers:not(.markstream-pre--diff-preview):not(.code-pre-fallback) > .markstream-pre__code {
  box-sizing: border-box;
  min-width: 100%;
  padding-left: var(--markstream-code-padding-left, 52px);
  padding-right: var(--markstream-code-padding-x, 12px);
}

.markstream-vue pre.markstream-pre--line-numbers > .markstream-pre__line-numbers > .markstream-pre__line-number {
  display: block;
  min-height: 1lh;
}

.markstream-vue pre.markstream-pre--diff-preview {
  box-sizing: border-box;
  padding-left: 0;
  padding-right: 0;
  width: 100%;

  --markstream-pre-diff-gutter-marker-width: var(--stream-monaco-gutter-marker-width, 4px);
  --markstream-pre-diff-gutter-gap: var(--stream-monaco-gutter-gap, 16px);
  --markstream-pre-diff-code-gap: var(--stream-monaco-diff-code-gap, 2px);
  --markstream-pre-diff-code-padding: var(--stream-monaco-diff-code-padding, 7.8px);
  --markstream-pre-diff-line-number-width: var(
    --stream-monaco-line-number-width,
    15.6px
  );
  --markstream-pre-diff-line-number-padding-left: var(--stream-monaco-line-number-padding-left, 15.6px);
  --markstream-pre-diff-line-number-padding-right: var(--stream-monaco-line-number-padding-right, 7.8px);
  --markstream-pre-diff-line-number-box-width: calc(
    var(--markstream-pre-diff-line-number-padding-left)
    + var(--markstream-pre-diff-line-number-width)
    + var(--markstream-pre-diff-line-number-padding-right)
  );
  --markstream-pre-diff-line-number-bg: var(
    --stream-monaco-line-number-bg,
    var(--markstream-diff-line-number-bg, transparent)
  );
  --markstream-pre-diff-line-number-gap-to-code: var(
    --stream-monaco-original-line-number-gap-to-code,
    var(--stream-monaco-line-number-gap-to-code, var(--markstream-pre-diff-code-gap))
  );
  --markstream-pre-diff-line-number-left: var(
    --stream-monaco-line-number-left,
    var(--markstream-pre-diff-gutter-marker-width)
  );
  --markstream-pre-diff-line-number-align: var(--markstream-diff-line-number-align, right);
  --markstream-pre-diff-code-fill-left: calc(
    var(--markstream-pre-diff-line-number-left)
    + var(--markstream-pre-diff-line-number-box-width)
    + var(--markstream-pre-diff-line-number-gap-to-code)
  );
  --markstream-pre-diff-code-left: calc(
    var(--markstream-pre-diff-code-fill-left)
    + var(--markstream-pre-diff-code-padding)
  );
}

.markstream-vue pre.markstream-pre--diff-preview.is-wrap {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.markstream-vue pre.markstream-pre--diff-preview.markstream-pre--diff-inline {
  --markstream-pre-diff-line-number-gap-to-code: var(
    --stream-monaco-modified-line-number-gap-to-code,
    var(--stream-monaco-line-number-gap-to-code, var(--markstream-pre-diff-code-gap))
  );
  --markstream-pre-diff-line-number-left: var(
    --stream-monaco-line-number-left,
    var(--markstream-pre-diff-gutter-marker-width)
  );
}

.markstream-vue pre.markstream-pre--diff-preview > .markstream-pre__diff-code {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  font: inherit;
  line-height: inherit;
  min-width: 100%;
  width: 100%;
}

.markstream-vue pre.markstream-pre--diff-preview.markstream-pre--diff-inline > .markstream-pre__diff-code {
  grid-template-columns: minmax(0, 1fr);
}

.markstream-vue pre.markstream-pre--diff-preview.markstream-pre--diff-inline:not(.is-wrap) > .markstream-pre__diff-code {
  grid-template-columns: minmax(100%, max-content);
  width: 100%;
  min-width: max-content;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-pane {
  min-width: 0;
  overflow: hidden;
}

.markstream-vue pre.markstream-pre--diff-preview:not(.is-wrap):not(.markstream-pre--diff-inline) .markstream-pre__diff-pane {
  overflow-x: auto;
  overflow-y: hidden;
}

.markstream-vue pre.markstream-pre--diff-preview.markstream-pre--diff-inline:not(.is-wrap) .markstream-pre__diff-pane {
  min-width: max-content;
  width: 100%;
  overflow: visible;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-pane--modified {
  --markstream-pre-diff-line-number-gap-to-code: var(
    --stream-monaco-modified-line-number-gap-to-code,
    var(--stream-monaco-line-number-gap-to-code, var(--markstream-pre-diff-code-gap))
  );
  --markstream-pre-diff-line-number-left: var(
    --stream-monaco-line-number-left,
    var(--markstream-pre-diff-gutter-marker-width)
  );
  box-shadow: inset 1px 0 var(--markstream-diff-pane-divider, hsl(var(--ms-border)));
}

.markstream-vue pre.markstream-pre--diff-preview.markstream-pre--diff-inline .markstream-pre__diff-pane--modified {
  box-shadow: none;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line {
  position: relative;
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-width: 100%;
  min-height: var(
    --markstream-pre-diff-synced-row-height,
    var(--markstream-pre-diff-line-height, 18px)
  );
  padding-left: var(--markstream-pre-diff-code-left);
  line-height: var(--markstream-pre-diff-line-height, 18px);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line::before {
  content: '';
  position: absolute;
  left: var(--markstream-pre-diff-code-fill-left);
  right: 0;
  top: 0;
  height: var(
    --markstream-pre-diff-content-height,
    var(--markstream-pre-diff-line-height, 18px)
  );
  z-index: 0;
  pointer-events: none;
  border-radius: 0;
  background: transparent;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line::after {
  content: '';
  position: absolute;
  left: var(--markstream-pre-diff-line-number-left);
  top: 0;
  width: var(--markstream-pre-diff-line-number-box-width);
  height: var(
    --markstream-pre-diff-content-height,
    var(--markstream-pre-diff-line-height, 18px)
  );
  z-index: 0;
  pointer-events: none;
  background: var(--markstream-pre-diff-line-number-bg);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-rail {
  position: absolute;
  z-index: 2;
  top: 0;
  left: 0;
  height: var(
    --markstream-pre-diff-content-height,
    var(--markstream-pre-diff-line-height, 18px)
  );
  width: var(--markstream-pre-diff-gutter-marker-width, 4px);
  min-width: var(--markstream-pre-diff-gutter-marker-width, 4px);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-number {
  position: absolute;
  z-index: 1;
  top: 0;
  left: var(--markstream-pre-diff-line-number-left);
  width: var(--markstream-pre-diff-line-number-width);
  height: var(
    --markstream-pre-diff-content-height,
    var(--markstream-pre-diff-line-height, 18px)
  );
  box-sizing: content-box;
  background: var(--markstream-pre-diff-line-number-bg);
  padding-left: var(--markstream-pre-diff-line-number-padding-left, 15.6px);
  padding-right: var(--markstream-pre-diff-line-number-padding-right, 7.8px);
  color: var(--code-line-number);
  font-variant-numeric: tabular-nums;
  line-height: var(--markstream-pre-diff-line-height, 18px);
  text-align: var(--markstream-pre-diff-line-number-align, right);
  user-select: none;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--added > .markstream-pre__diff-number {
  background: var(--stream-monaco-added-line-fill, var(--markstream-diff-added-line-fill, transparent));
  color: var(--stream-monaco-added-fg, var(--markstream-diff-added-fg, var(--code-line-number)));
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--removed > .markstream-pre__diff-number {
  background: var(--stream-monaco-removed-line-fill, var(--markstream-diff-removed-line-fill, transparent));
  color: var(--stream-monaco-removed-fg, var(--markstream-diff-removed-fg, var(--code-line-number)));
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-content {
  position: relative;
  z-index: 1;
  display: block;
  width: max-content;
  min-width: 100%;
  line-height: var(--markstream-pre-diff-line-height, 18px);
  white-space: inherit;
  overflow-wrap: normal;
  word-break: normal;
  line-break: auto;
}

.markstream-vue pre.markstream-pre--diff-preview.is-wrap .markstream-pre__diff-content {
  width: auto;
  min-width: 0;
  overflow-wrap: inherit;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-content-inner {
  white-space: inherit;
  overflow-wrap: inherit;
  word-break: inherit;
  line-break: inherit;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--hunk {
  color: var(--stream-monaco-unchanged-fg, var(--markstream-diff-unchanged-fg, var(--code-line-number)));
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--hunk::before {
  background: var(--stream-monaco-unchanged-bg, var(--markstream-diff-unchanged-bg, transparent));
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--added::before {
  background: var(--stream-monaco-added-line-fill, var(--markstream-diff-added-line-fill, transparent));
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--removed::before {
  background: var(--stream-monaco-removed-line-fill, var(--markstream-diff-removed-line-fill, transparent));
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--added::after {
  background: var(--stream-monaco-added-line-fill, var(--markstream-diff-added-line-fill, transparent));
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--removed::after {
  background: var(--stream-monaco-removed-line-fill, var(--markstream-diff-removed-line-fill, transparent));
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--added > .markstream-pre__diff-rail {
  background: var(--stream-monaco-added-gutter, var(--markstream-diff-added-gutter, currentColor));
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--removed > .markstream-pre__diff-rail {
  background: var(--stream-monaco-removed-gutter, var(--markstream-diff-removed-gutter, currentColor));
}

/* Keyboard accessibility: visible focus when scroll container is focused */
.markstream-vue pre[class^='language-']:focus,
.markstream-vue pre[class*=' language-']:focus {
  outline: var(--ms-focus-ring-width) solid var(--focus-ring);
  outline-offset: var(--ms-focus-ring-offset);
}
</style>
