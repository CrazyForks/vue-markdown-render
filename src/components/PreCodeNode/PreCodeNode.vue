<script setup lang="ts">
import type { PreCodeNodeProps } from '../../types/component-props'

import { computed } from 'vue'

const props = defineProps<PreCodeNodeProps>()

// Normalize language to a safe, lowercase token (fallback to 'plaintext')
const normalizedLanguage = computed(() => {
  const raw = String(props.node?.language ?? '')
  const head = String(String(raw).split(/\s+/g)[0] ?? '').toLowerCase()
  const safe = head.replace(/[^\w-]/g, '')
  return safe || 'plaintext'
})

const languageClass = computed(() => `language-${normalizedLanguage.value}`)
const codeLines = computed(() => {
  const code = String(props.node?.code ?? '')
  return code.split(/\r\n|\n|\r/)
})
const lineNumbers = computed(() => {
  return Array.from({ length: Math.max(1, codeLines.value.length) }, (_, index) => index + 1)
})
const isDiffPreview = computed(() => props.showLineNumbers === true && props.node?.diff === true)

type DiffPreviewLineKind = 'context' | 'removed' | 'added' | 'hunk'

function isBlankDiffPreviewLine(code: string) {
  return String(code ?? '').trim().length === 0
}

function toDiffPreviewLine(code: string, kind: DiffPreviewLineKind = 'context') {
  const empty = isBlankDiffPreviewLine(code)
  return {
    code,
    // Do not paint terminal blank lines / visual spacer rows as added/removed.
    // This keeps the pre fallback close to Monaco, where the empty continuation
    // surface should not flash red/green before highlighting is ready.
    kind: empty && kind !== 'hunk' ? 'context' : kind,
    empty,
  }
}

function splitDiffSource(source: unknown) {
  const code = String(source ?? '')
  return code.split(/\r\n|\n|\r/)
}

const diffPreviewPanes = computed(() => {
  const hasPatchLines = codeLines.value.some(line =>
    (line.startsWith('-') && !line.startsWith('---'))
    || (line.startsWith('+') && !line.startsWith('+++')),
  )
  if (!hasPatchLines && (props.node?.originalCode != null || props.node?.updatedCode != null)) {
    return [
      {
        key: 'original',
        className: 'markstream-pre__diff-pane--original',
        lines: splitDiffSource(props.node?.originalCode).map((line, index) => ({
          ...toDiffPreviewLine(line, 'removed'),
          key: `original-${index}`,
          number: index + 1,
        })),
      },
      {
        key: 'modified',
        className: 'markstream-pre__diff-pane--modified',
        lines: splitDiffSource(props.node?.updatedCode).map((line, index) => ({
          ...toDiffPreviewLine(line, 'added'),
          key: `modified-${index}`,
          number: index + 1,
        })),
      },
    ]
  }

  const original = [] as Array<{ code: string, kind: DiffPreviewLineKind, empty: boolean }>
  const modified = [] as Array<{ code: string, kind: DiffPreviewLineKind, empty: boolean }>

  for (const raw of codeLines.value) {
    if (raw.startsWith('@@')) {
      original.push(toDiffPreviewLine(raw, 'hunk'))
      modified.push(toDiffPreviewLine(raw, 'hunk'))
    }
    else if (raw.startsWith('-') && !raw.startsWith('---')) {
      original.push(toDiffPreviewLine(raw.slice(1), 'removed'))
    }
    else if (raw.startsWith('+') && !raw.startsWith('+++')) {
      modified.push(toDiffPreviewLine(raw.slice(1), 'added'))
    }
    else {
      const code = raw.startsWith(' ') ? raw.slice(1) : raw
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
</script>

<template>
  <pre
    :class="[languageClass, { 'markstream-pre--line-numbers': props.showLineNumbers, 'markstream-pre--diff-preview': isDiffPreview }]"
    :aria-busy="node.loading === true"
    :aria-label="ariaLabel"
    :data-language="normalizedLanguage"
    :data-markstream-line-numbers="props.showLineNumbers ? '1' : undefined"
    data-markstream-pre="1"
    tabindex="0"
  ><code v-if="isDiffPreview" translate="no" class="markstream-pre__diff-code"><span v-for="pane in diffPreviewPanes" :key="pane.key" class="markstream-pre__diff-pane" :class="pane.className"><span v-for="line in pane.lines" :key="line.key" class="markstream-pre__diff-line" :class="[`markstream-pre__diff-line--${line.kind}`, { 'markstream-pre__diff-line--empty': line.empty }]"><span class="markstream-pre__diff-rail" aria-hidden="true" /><span class="markstream-pre__diff-number" aria-hidden="true">{{ line.number }}</span><span class="markstream-pre__diff-content"><span class="markstream-pre__diff-content-inner">{{ line.code }}</span></span></span></span></code><template v-else><span v-if="props.showLineNumbers" class="markstream-pre__line-numbers" aria-hidden="true"><span v-for="line in lineNumbers" :key="line" class="markstream-pre__line-number">{{ line }}</span></span><code translate="no" class="markstream-pre__code" v-text="node.code" /></template></pre>
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

.markstream-vue pre.markstream-pre--line-numbers > .markstream-pre__line-numbers {
  position: absolute;
  top: var(--markstream-pre-line-number-top, 0);
  left: 0;
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

.markstream-vue pre.markstream-pre--line-numbers > .markstream-pre__line-numbers > .markstream-pre__line-number {
  display: block;
  min-height: 1lh;
}

.markstream-vue pre.markstream-pre--diff-preview {
  padding-left: 0;
  padding-right: 0;

  --markstream-pre-diff-gutter-marker-width: var(--stream-monaco-gutter-marker-width, 3px);
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

.markstream-vue pre.markstream-pre--diff-preview > .markstream-pre__diff-code {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  font: inherit;
  line-height: inherit;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-pane {
  min-width: 0;
  overflow: hidden;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-pane--modified {
  --markstream-pre-diff-scrollable-left: var(
    --stream-monaco-modified-scrollable-left,
    var(--stream-monaco-original-scrollable-left)
  );
  --markstream-pre-diff-line-number-gap-to-code: var(
    --stream-monaco-modified-line-number-gap-to-code,
    var(--stream-monaco-line-number-gap-to-code, var(--markstream-pre-diff-gutter-gap))
  );
  box-shadow: inset 1px 0 var(--markstream-diff-pane-divider, hsl(var(--ms-border)));
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line {
  position: relative;
  display: block;
  box-sizing: border-box;
  min-height: var(--markstream-pre-diff-line-height, 18px);
  padding-left: var(--markstream-pre-diff-scrollable-left);
  line-height: var(--markstream-pre-diff-line-height, 18px);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: transparent;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-rail {
  position: absolute;
  z-index: 2;
  inset-block: 0;
  left: 0;
  width: var(--markstream-pre-diff-gutter-marker-width, 3px);
  min-width: var(--markstream-pre-diff-gutter-marker-width, 3px);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-number {
  position: absolute;
  z-index: 1;
  top: 0;
  left: var(--markstream-pre-diff-line-number-left);
  width: var(--markstream-pre-diff-line-number-width);
  color: var(--code-line-number);
  font-variant-numeric: tabular-nums;
  line-height: var(--markstream-pre-diff-line-height, 18px);
  text-align: var(--markstream-pre-diff-line-number-align, right);
  user-select: none;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-content {
  position: relative;
  z-index: 1;
  display: block;
  min-width: 0;
  line-height: var(--markstream-pre-diff-line-height, 18px);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: normal;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-content-inner {
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--added {
  color: var(--stream-monaco-added-fg, inherit);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--removed {
  color: var(--stream-monaco-removed-fg, inherit);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--hunk {
  color: var(--stream-monaco-unchanged-fg, var(--code-line-number));
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--hunk::before {
  background: var(--stream-monaco-unchanged-bg, transparent);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--added:not(.markstream-pre__diff-line--empty)::before {
  background: var(--stream-monaco-added-line-fill, transparent);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--removed:not(.markstream-pre__diff-line--empty)::before {
  background: var(--stream-monaco-removed-line-fill, transparent);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--added:not(.markstream-pre__diff-line--empty) > .markstream-pre__diff-rail {
  background: var(--stream-monaco-added-gutter, currentColor);
}

.markstream-vue pre.markstream-pre--diff-preview .markstream-pre__diff-line--removed:not(.markstream-pre__diff-line--empty) > .markstream-pre__diff-rail {
  background: var(--stream-monaco-removed-gutter, currentColor);
}

/* Keyboard accessibility: visible focus when scroll container is focused */
.markstream-vue pre[class^='language-']:focus,
.markstream-vue pre[class*=' language-']:focus {
  outline: var(--ms-focus-ring-width) solid var(--focus-ring);
  outline-offset: var(--ms-focus-ring-offset);
}
</style>
