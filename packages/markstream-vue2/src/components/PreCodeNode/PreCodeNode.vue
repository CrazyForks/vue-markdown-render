<script setup lang="ts">
import { computed } from 'vue-demi'

interface PreCodeNodeProps {
  node: any
  showLineNumbers?: boolean
  diffInline?: boolean
}

const props = defineProps<PreCodeNodeProps>()

type DiffPreviewLineKind = 'context' | 'removed' | 'added' | 'hunk'

interface DiffPreviewLine {
  code: string
  empty: boolean
  kind: DiffPreviewLineKind
  key: string
  number: number | string
}

interface DiffPreviewPane {
  className: string
  key: string
  lines: DiffPreviewLine[]
}

// Normalize language to a safe, lowercase token (fallback to 'plaintext')
const normalizedLanguage = computed(() => {
  const raw = String(props.node?.language ?? '')
  const head = String(String(raw).split(/\s+/g)[0] ?? '')
    .split(':')[0]
    .toLowerCase()
  const safe = head.replace(/[^\w-]/g, '')
  return safe || 'plaintext'
})

const languageClass = computed(() => `language-${normalizedLanguage.value}`)
const isDiffPreview = computed(() => props.showLineNumbers === true && props.node?.diff === true)
const isInlineDiffPreview = computed(() => isDiffPreview.value && props.diffInline === true)
const displayCode = computed(() => {
  if (props.node?.diff === true)
    return String(props.node?.code ?? '')
  const value = String(props.node?.code ?? '')
  return props.node?.loading === true ? value : value.replace(/\r\n$|\n$|\r$/, '')
})

const ariaLabel = computed(() => {
  const lang = normalizedLanguage.value
  return lang ? `Code block: ${lang}` : 'Code block'
})

function splitLines(source: unknown) {
  return String(source ?? '').split(/\r\n|\n|\r/)
}

function splitDiffSource(source: unknown) {
  const code = String(source ?? '')
  if (!code)
    return []
  return code.split(/\r\n|\n|\r/)
}

function isRemovedDiffLine(line: string) {
  return line.startsWith('-') && !line.startsWith('---')
}

function isAddedDiffLine(line: string) {
  return line.startsWith('+') && !line.startsWith('+++')
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

function shouldPreserveSourceBlankDiffKind(lines: string[], index: number) {
  return !isBlankDiffLine(lines[index]) || index < lines.length - 1
}

function isBlankDiffLine(code: string) {
  return String(code ?? '').trim().length === 0
}

function toDiffLine(
  code: string,
  kind: DiffPreviewLineKind,
  key: string,
  number: number | string,
  options: { preserveBlankKind?: boolean } = {},
): DiffPreviewLine {
  const empty = String(code ?? '').trim().length === 0
  return {
    code,
    empty,
    kind: empty && kind !== 'hunk' && !options.preserveBlankKind ? 'context' : kind,
    key,
    number,
  }
}

function computeSourceLineMatches(original: string[], modified: string[]) {
  const n = original.length
  const m = modified.length
  const maxCells = 1_500_000
  if ((n + 1) * (m + 1) > maxCells)
    return null

  const cols = m + 1
  const scores = new Uint16Array((n + 1) * (m + 1))

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const current = i * cols + j
      if (original[i] === modified[j]) {
        scores[current] = scores[(i + 1) * cols + j + 1] + 1
      }
      else {
        scores[current] = Math.max(scores[(i + 1) * cols + j], scores[i * cols + j + 1])
      }
    }
  }

  const matches: Array<{ originalIndex: number, modifiedIndex: number }> = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (original[i] === modified[j]) {
      matches.push({ originalIndex: i, modifiedIndex: j })
      i++
      j++
    }
    else if (scores[(i + 1) * cols + j] >= scores[i * cols + j + 1]) {
      i++
    }
    else {
      j++
    }
  }

  return matches
}

function buildInlinePatchPreviewLines(lines: string[]) {
  let modifiedLine = 1
  return lines.map((raw, index) => {
    if (raw.startsWith('@@'))
      return toDiffLine(raw, 'hunk', `inline-hunk-${index}`, '')
    if (isRemovedDiffLine(raw)) {
      const line = toDiffLine(raw.slice(1), 'removed', `inline-removed-${index}`, '', { preserveBlankKind: true })
      return line
    }
    if (isAddedDiffLine(raw))
      return toDiffLine(raw.slice(1), 'added', `inline-added-${index}`, modifiedLine++, { preserveBlankKind: true })

    const code = raw.startsWith(' ') ? raw.slice(1) : raw
    return toDiffLine(code, 'context', `inline-context-${index}`, modifiedLine++)
  })
}

function buildInlineSourcePreviewLines(originalSource: unknown, modifiedSource: unknown) {
  const original = splitDiffSource(originalSource)
  const modified = splitDiffSource(modifiedSource)
  const matches = computeSourceLineMatches(original, modified)

  if (matches) {
    const result: DiffPreviewLine[] = []
    let originalIndex = 0
    let modifiedIndex = 0

    for (const match of matches) {
      while (originalIndex < match.originalIndex) {
        result.push(toDiffLine(original[originalIndex], 'removed', `inline-removed-source-${originalIndex}`, '', {
          preserveBlankKind: shouldPreserveSourceBlankDiffKind(original, originalIndex),
        }))
        originalIndex++
      }
      while (modifiedIndex < match.modifiedIndex) {
        result.push(toDiffLine(modified[modifiedIndex], 'added', `inline-added-source-${modifiedIndex}`, modifiedIndex + 1, {
          preserveBlankKind: shouldPreserveSourceBlankDiffKind(modified, modifiedIndex),
        }))
        modifiedIndex++
      }
      result.push(toDiffLine(modified[match.modifiedIndex], 'context', `inline-context-source-${match.originalIndex}-${match.modifiedIndex}`, match.modifiedIndex + 1))
      originalIndex = match.originalIndex + 1
      modifiedIndex = match.modifiedIndex + 1
    }

    while (originalIndex < original.length) {
      result.push(toDiffLine(original[originalIndex], 'removed', `inline-removed-source-${originalIndex}`, '', {
        preserveBlankKind: shouldPreserveSourceBlankDiffKind(original, originalIndex),
      }))
      originalIndex++
    }
    while (modifiedIndex < modified.length) {
      result.push(toDiffLine(modified[modifiedIndex], 'added', `inline-added-source-${modifiedIndex}`, modifiedIndex + 1, {
        preserveBlankKind: shouldPreserveSourceBlankDiffKind(modified, modifiedIndex),
      }))
      modifiedIndex++
    }

    return result
  }

  const result: DiffPreviewLine[] = []
  let start = 0
  let originalEnd = original.length - 1
  let modifiedEnd = modified.length - 1

  while (start <= originalEnd && start <= modifiedEnd && original[start] === modified[start]) {
    result.push(toDiffLine(modified[start], 'context', `inline-prefix-${start}`, start + 1))
    start++
  }

  const suffix: DiffPreviewLine[] = []
  while (originalEnd >= start && modifiedEnd >= start && original[originalEnd] === modified[modifiedEnd]) {
    suffix.unshift(toDiffLine(modified[modifiedEnd], 'context', `inline-suffix-${modifiedEnd}`, modifiedEnd + 1))
    originalEnd--
    modifiedEnd--
  }

  for (let index = start; index <= originalEnd; index++) {
    result.push(toDiffLine(original[index], 'removed', `inline-removed-source-${index}`, '', {
      preserveBlankKind: shouldPreserveSourceBlankDiffKind(original, index),
    }))
  }

  for (let index = start; index <= modifiedEnd; index++) {
    result.push(toDiffLine(modified[index], 'added', `inline-added-source-${index}`, index + 1, {
      preserveBlankKind: shouldPreserveSourceBlankDiffKind(modified, index),
    }))
  }

  return result.concat(suffix)
}

function buildDiffPanes(inline = false): DiffPreviewPane[] {
  const patchLines = splitLines(props.node?.code)
  const hasPatchDiffLines = hasPatchLines(patchLines)

  if (!hasPatchDiffLines && hasDiffSourcePair()) {
    if (inline) {
      const lines = buildInlineSourcePreviewLines(props.node?.originalCode, props.node?.updatedCode)
      return [{ key: 'inline', className: 'markstream-pre__diff-pane--inline', lines }]
    }

    const original = splitDiffSource(props.node?.originalCode)
    const modified = splitDiffSource(props.node?.updatedCode)
    return [
      {
        key: 'original',
        className: 'markstream-pre__diff-pane--original',
        lines: original.map((line, index) => {
          const kind = modified[index] === line ? 'context' : 'removed'
          return toDiffLine(line, kind, `original-${index}`, index + 1, {
            preserveBlankKind: shouldPreserveSourceBlankDiffKind(original, index),
          })
        }),
      },
      {
        key: 'modified',
        className: 'markstream-pre__diff-pane--modified',
        lines: modified.map((line, index) => {
          const kind = original[index] === line ? 'context' : 'added'
          return toDiffLine(line, kind, `modified-${index}`, index + 1, {
            preserveBlankKind: shouldPreserveSourceBlankDiffKind(modified, index),
          })
        }),
      },
    ]
  }

  if (inline) {
    const lines = buildInlinePatchPreviewLines(patchLines)
    return [{ key: 'inline', className: 'markstream-pre__diff-pane--inline', lines }]
  }

  const original: DiffPreviewLine[] = []
  const modified: DiffPreviewLine[] = []
  let originalLine = 1
  let modifiedLine = 1

  for (const [index, raw] of patchLines.entries()) {
    if (raw.startsWith('@@')) {
      original.push(toDiffLine(raw, 'hunk', `original-hunk-${index}`, ''))
      modified.push(toDiffLine(raw, 'hunk', `modified-hunk-${index}`, ''))
    }
    else if (isRemovedDiffLine(raw)) {
      original.push(toDiffLine(raw.slice(1), 'removed', `original-removed-${index}`, originalLine++, { preserveBlankKind: true }))
    }
    else if (isAddedDiffLine(raw)) {
      modified.push(toDiffLine(raw.slice(1), 'added', `modified-added-${index}`, modifiedLine++, { preserveBlankKind: true }))
    }
    else {
      const code = raw.startsWith(' ') ? raw.slice(1) : raw
      original.push(toDiffLine(code, 'context', `original-context-${index}`, originalLine++))
      modified.push(toDiffLine(code, 'context', `modified-context-${index}`, modifiedLine++))
    }
  }

  return [
    { key: 'original', className: 'markstream-pre__diff-pane--original', lines: original },
    { key: 'modified', className: 'markstream-pre__diff-pane--modified', lines: modified },
  ]
}

const diffPreviewPanes = computed(() => isDiffPreview.value ? buildDiffPanes(isInlineDiffPreview.value) : [])
</script>

<template>
  <pre
    :class="[
      languageClass,
      {
        'markstream-pre--line-numbers': props.showLineNumbers,
        'markstream-pre--diff-preview': isDiffPreview,
        'markstream-pre--diff-inline': isInlineDiffPreview,
      },
    ]"
    :aria-busy="node.loading === true"
    :aria-label="ariaLabel"
    :data-language="normalizedLanguage"
    :data-markstream-line-numbers="props.showLineNumbers ? '1' : undefined"
    data-markstream-pre="1"
    tabindex="0"
  ><code v-if="isDiffPreview" translate="no" class="markstream-pre__diff-code"><span v-for="pane in diffPreviewPanes" :key="pane.key" class="markstream-pre__diff-pane" :class="pane.className"><span v-for="line in pane.lines" :key="line.key" class="markstream-pre__diff-line" :class="[`markstream-pre__diff-line--${line.kind}`, { 'markstream-pre__diff-line--empty': line.empty }]"><span class="markstream-pre__diff-rail" aria-hidden="true" /><span class="markstream-pre__diff-number" aria-hidden="true">{{ line.number }}</span><span class="markstream-pre__diff-content"><span class="markstream-pre__diff-content-inner">{{ line.code }}</span></span></span></span></code><code v-else translate="no" v-text="displayCode" /></pre>
</template>

<style>
/* Minimal, safe defaults to reduce flicker during frequent text updates */
.markstream-vue2 pre[class^='language-'],
.markstream-vue2 pre[class*=' language-'] {
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
.markstream-vue2 pre[class^='language-'] > code,
.markstream-vue2 pre[class*=' language-'] > code {
  display: block;
}

.markstream-vue2 pre.markstream-pre--diff-preview {
  box-sizing: border-box;
  width: 100%;
  padding-left: 0;
  padding-right: 0;

  --markstream-pre-diff-gutter-marker-width: var(--stream-monaco-gutter-marker-width, 4px);
  --markstream-pre-diff-gutter-gap: var(--stream-monaco-gutter-gap, 8px);
  --markstream-pre-diff-line-number-width: var(--stream-monaco-line-number-width, 28px);
  --markstream-pre-diff-scrollable-left: var(
    --stream-monaco-original-scrollable-left,
    calc(
      var(--markstream-pre-diff-gutter-marker-width)
      + (var(--markstream-pre-diff-gutter-gap) * 2)
      + var(--markstream-pre-diff-line-number-width)
    )
  );
  --markstream-pre-diff-line-number-gap-to-code: var(
    --stream-monaco-original-line-number-gap-to-code,
    var(--stream-monaco-line-number-gap-to-code, var(--markstream-pre-diff-gutter-gap))
  );
  --markstream-pre-diff-line-number-left: calc(
    var(--markstream-pre-diff-scrollable-left)
    - var(--markstream-pre-diff-line-number-gap-to-code)
    - var(--markstream-pre-diff-line-number-width)
  );
  --markstream-pre-diff-line-number-align: var(--markstream-diff-line-number-align, right);
}

.markstream-vue2 pre.markstream-pre--diff-preview.markstream-pre--diff-inline {
  --markstream-pre-diff-scrollable-left: var(
    --stream-monaco-modified-scrollable-left,
    var(--stream-monaco-original-scrollable-left)
  );
  --markstream-pre-diff-line-number-gap-to-code: var(
    --stream-monaco-modified-line-number-gap-to-code,
    var(--stream-monaco-line-number-gap-to-code, var(--markstream-pre-diff-gutter-gap))
  );
  --markstream-pre-diff-line-number-left: calc(
    var(--markstream-pre-diff-scrollable-left)
    - var(--markstream-pre-diff-line-number-gap-to-code)
    - var(--markstream-pre-diff-line-number-width)
  );
}

.markstream-vue2 pre.markstream-pre--diff-preview > .markstream-pre__diff-code {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  width: 100%;
  min-width: 100%;
  font: inherit;
  line-height: inherit;
}

.markstream-vue2 pre.markstream-pre--diff-preview.markstream-pre--diff-inline > .markstream-pre__diff-code {
  grid-template-columns: max-content;
  width: max-content;
}

.markstream-vue2 pre.markstream-pre--diff-preview .markstream-pre__diff-pane {
  min-width: 0;
  overflow: hidden;
}

.markstream-vue2 pre.markstream-pre--diff-preview:not(.markstream-pre--diff-inline) .markstream-pre__diff-pane {
  overflow-x: auto;
  overflow-y: hidden;
}

.markstream-vue2 pre.markstream-pre--diff-preview.markstream-pre--diff-inline .markstream-pre__diff-pane {
  min-width: max-content;
  overflow: visible;
}

.markstream-vue2 pre.markstream-pre--diff-preview .markstream-pre__diff-pane--modified {
  --markstream-pre-diff-scrollable-left: var(
    --stream-monaco-modified-scrollable-left,
    var(--stream-monaco-original-scrollable-left)
  );
  --markstream-pre-diff-line-number-gap-to-code: var(
    --stream-monaco-modified-line-number-gap-to-code,
    var(--stream-monaco-line-number-gap-to-code, var(--markstream-pre-diff-gutter-gap))
  );
  --markstream-pre-diff-line-number-left: calc(
    var(--markstream-pre-diff-scrollable-left)
    - var(--markstream-pre-diff-line-number-gap-to-code)
    - var(--markstream-pre-diff-line-number-width)
  );
  box-shadow: inset 1px 0 var(--markstream-diff-pane-divider, rgb(148 163 184 / 0.18));
}

.markstream-vue2 pre.markstream-pre--diff-preview.markstream-pre--diff-inline .markstream-pre__diff-pane--modified {
  box-shadow: none;
}

.markstream-vue2 pre.markstream-pre--diff-preview .markstream-pre__diff-line {
  position: relative;
  display: block;
  box-sizing: border-box;
  min-height: var(--markstream-pre-diff-line-height, 18px);
  padding-left: var(--markstream-pre-diff-scrollable-left);
  line-height: var(--markstream-pre-diff-line-height, 18px);
}

.markstream-vue2 pre.markstream-pre--diff-preview .markstream-pre__diff-line::before {
  content: '';
  position: absolute;
  inset-inline: 0;
  top: 0;
  height: var(--markstream-pre-diff-line-height, 18px);
  z-index: 0;
  pointer-events: none;
  border-radius: 0;
  background: transparent;
}

.markstream-vue2 pre.markstream-pre--diff-preview.markstream-pre--diff-inline .markstream-pre__diff-line::after {
  content: '';
  position: absolute;
  top: 0;
  left: var(--markstream-pre-diff-scrollable-left);
  width: 1px;
  height: var(--markstream-pre-diff-line-height, 18px);
  z-index: 1;
  pointer-events: none;
  background: var(--stream-monaco-pane-divider, var(--markstream-diff-pane-divider, rgb(148 163 184 / 0.18)));
}

.markstream-vue2 pre.markstream-pre--diff-preview .markstream-pre__diff-rail {
  position: absolute;
  z-index: 2;
  top: 0;
  left: 0;
  width: var(--markstream-pre-diff-gutter-marker-width, 4px);
  min-width: var(--markstream-pre-diff-gutter-marker-width, 4px);
  height: var(--markstream-pre-diff-line-height, 18px);
}

.markstream-vue2 pre.markstream-pre--diff-preview .markstream-pre__diff-number {
  position: absolute;
  z-index: 1;
  top: 0;
  left: var(--markstream-pre-diff-line-number-left);
  width: var(--markstream-pre-diff-line-number-width);
  color: var(--stream-monaco-line-number, var(--markstream-diff-line-number, #6b7280));
  font-variant-numeric: tabular-nums;
  line-height: var(--markstream-pre-diff-line-height, 18px);
  text-align: var(--markstream-pre-diff-line-number-align, right);
  user-select: none;
}

.markstream-vue2 pre.markstream-pre--diff-preview .markstream-pre__diff-content {
  position: relative;
  z-index: 1;
  display: block;
  min-width: max-content;
  line-height: var(--markstream-pre-diff-line-height, 18px);
  white-space: inherit;
  overflow-wrap: normal;
  word-break: normal;
  line-break: auto;
}

.markstream-vue2 pre.markstream-pre--diff-preview .markstream-pre__diff-content-inner {
  white-space: inherit;
  overflow-wrap: inherit;
  word-break: inherit;
  line-break: inherit;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}

.markstream-vue2 pre.markstream-pre--diff-preview .markstream-pre__diff-line--added {
  color: var(--stream-monaco-added-fg, var(--markstream-diff-added-fg, inherit));
}

.markstream-vue2 pre.markstream-pre--diff-preview .markstream-pre__diff-line--removed {
  color: var(--stream-monaco-removed-fg, var(--markstream-diff-removed-fg, inherit));
}

.markstream-vue2 pre.markstream-pre--diff-preview .markstream-pre__diff-line--hunk {
  color: var(--stream-monaco-unchanged-fg, var(--markstream-diff-unchanged-fg, var(--markstream-diff-line-number, currentColor)));
}

.markstream-vue2 pre.markstream-pre--diff-preview .markstream-pre__diff-line--hunk::before {
  background: var(--stream-monaco-unchanged-bg, var(--markstream-diff-unchanged-bg, transparent));
}

.markstream-vue2 pre.markstream-pre--diff-preview .markstream-pre__diff-line--added::before {
  background: var(--stream-monaco-added-line-fill, var(--markstream-diff-added-line-fill, transparent));
}

.markstream-vue2 pre.markstream-pre--diff-preview .markstream-pre__diff-line--removed::before {
  background: var(--stream-monaco-removed-line-fill, var(--markstream-diff-removed-line-fill, transparent));
}

.markstream-vue2 pre.markstream-pre--diff-preview .markstream-pre__diff-line--added > .markstream-pre__diff-rail {
  background: var(--stream-monaco-added-gutter, var(--markstream-diff-added-gutter, currentColor));
}

.markstream-vue2 pre.markstream-pre--diff-preview .markstream-pre__diff-line--removed > .markstream-pre__diff-rail {
  background: var(--stream-monaco-removed-gutter, var(--markstream-diff-removed-gutter, currentColor));
}

/* Keyboard accessibility: visible focus when scroll container is focused */
.markstream-vue2 pre[class^='language-']:focus,
.markstream-vue2 pre[class*=' language-']:focus {
  outline: 2px solid var(--vmdr-focus, #3b82f6);
  outline-offset: 2px;
}
</style>
