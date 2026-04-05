<script setup lang="ts">
import { ref } from 'vue'
import { getUseMonaco } from '../../../src/components/CodeBlockNode/monaco'
import MarkdownRender from '../../../src/components/NodeRenderer'
import KatexWorker from '../../../src/workers/katexRenderer.worker?worker&inline'
import { setKaTeXWorker } from '../../../src/workers/katexWorkerClient'
import MermaidWorker from '../../../src/workers/mermaidParser.worker?worker&inline'
import { setMermaidWorker } from '../../../src/workers/mermaidWorkerClient'
import 'katex/dist/katex.min.css'

// Workers
setKaTeXWorker(() => new KatexWorker())
setMermaidWorker(() => new MermaidWorker())
getUseMonaco()

const isDark = ref(false)

function toggleDark() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
}

const presets = [
  { id: 'default', label: 'Default', desc: 'Technical Clean + breathing room — 65ch, 16px, 1.6 line-height' },
  { id: 'compact', label: 'Compact', desc: 'AI chat / dashboard — full width, 14px, tight spacing' },
] as const

const activePreset = ref<string>('default')

// Static markdown covering all component types
const content = `# Heading Level 1

## Heading Level 2

### Heading Level 3

#### Heading Level 4

##### Heading Level 5

###### Heading Level 6

---

## Paragraphs & Inline Elements

This is a regular paragraph with **bold text**, *italic text*, ~~strikethrough~~, ==highlighted text==, \`inline code\`, and a [link to GitHub](https://github.com). Here is a footnote reference[^1].

Text with <sub>subscript</sub> and <sup>superscript</sup> and <ins>inserted text</ins>.

Another paragraph to show the vertical rhythm between blocks. Good typography creates a sense of order and hierarchy. The spacing between paragraphs should feel intentional — neither too tight nor too loose. Line height matters just as much as font size.

---

## Blockquote

> This is a blockquote. It can contain **bold**, *italic*, and \`code\`.
>
> > Nested blockquotes are also supported.

---

## Lists

### Unordered List

- First item
- Second item with **bold**
  - Nested item A
  - Nested item B
    - Deep nested
- Third item

### Ordered List

1. First step
2. Second step
   1. Sub-step 2.1
   2. Sub-step 2.2
3. Third step

### Task List

- [x] Completed task
- [ ] Incomplete task
- [x] Another done task

---

## Code Blocks

### JavaScript

\`\`\`javascript
function fibonacci(n) {
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}

console.log(fibonacci(10)); // 55
\`\`\`

### TypeScript with Title

\`\`\`typescript title="utils/theme.ts"
interface ThemeConfig {
  primary: string;
  secondary: string;
  background: string;
  foreground: string;
}

export function createTheme(config: Partial<ThemeConfig>): ThemeConfig {
  return {
    primary: '#0366d6',
    secondary: '#586069',
    background: '#ffffff',
    foreground: '#24292e',
    ...config,
  };
}
\`\`\`

### Shell

\`\`\`bash
npm install markstream-vue
pnpm dev
\`\`\`

---

## Table

| Feature | Status | Notes |
|---------|--------|-------|
| Color tokens | Done | 25 components migrated |
| Dark mode | Done | Bridge tokens + .dark class |
| Spacing tokens | Planned | See token-expansion-draft |
| Shell extraction | Done | CodeBlockShell.vue |
| Visual redesign | Not started | Core #343 deliverable |

---

## Admonitions

::: note
This is a note admonition. Useful for additional information.
:::

::: tip
This is a tip. Helpful advice for the reader.
:::

::: warning
This is a warning. Pay attention to this.
:::

::: danger
This is a danger notice. Something could go wrong.
:::

---

## Math

### Inline Math

The quadratic formula is $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$ and Euler's identity: $e^{i\\pi} + 1 = 0$.

### Block Math

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

---

## Images

![Vue Logo](https://vuejs.org/images/logo.png)

---

## Mermaid Diagram

\`\`\`mermaid
graph LR
  A[Token System] --> B[Bridge Tokens]
  A --> C[Semantic Tokens]
  B --> D[shadcn compat]
  B --> E[Fallback defaults]
  C --> F[Component styles]
  F --> G[Light/Dark auto]
\`\`\`

---

## Definition List

Term 1
: Definition for term 1. This explains what term 1 means.

Term 2
: Definition for term 2. Can contain **formatting**.

---

## Footnotes

[^1]: This is the footnote content. It appears at the bottom.

---

*End of static example — compare typography presets using the buttons above.*
`
</script>

<template>
  <div
    class="markstream-vue min-h-screen bg-[hsl(var(--ms-background))] text-[hsl(var(--ms-foreground))] transition-colors"
    :class="[activePreset, { dark: isDark }]"
  >
    <header class="sticky top-0 z-50 flex flex-wrap items-center gap-3 px-6 py-2.5 border-b border-[hsl(var(--ms-border))] bg-[hsl(var(--ms-background))] backdrop-blur-sm">
      <span class="text-sm font-semibold mr-2">Typography</span>
      <button
        v-for="preset in presets"
        :key="preset.id"
        class="px-2.5 py-1 text-xs rounded-md border cursor-pointer transition-colors"
        :class="activePreset === preset.id
          ? 'bg-[hsl(var(--ms-primary))] text-[hsl(var(--ms-primary-foreground))] border-transparent'
          : 'bg-transparent text-inherit border-[hsl(var(--ms-border))] hover:bg-[hsl(var(--ms-accent))]'"
        :title="preset.desc"
        @click="activePreset = preset.id"
      >
        {{ preset.label }}
      </button>
      <div class="ml-auto flex items-center gap-3">
        <button
          class="px-2.5 py-1 text-xs border border-[hsl(var(--ms-border))] rounded-md bg-transparent text-inherit cursor-pointer hover:bg-[hsl(var(--ms-accent))] transition-colors"
          @click="toggleDark"
        >
          {{ isDark ? 'Light' : 'Dark' }}
        </button>
        <router-link to="/" class="text-xs text-[var(--link-color)] no-underline hover:underline">&larr; Playground</router-link>
      </div>
    </header>

    <main class="example-content mx-auto px-6 py-8">
      <div class="mb-4 text-xs text-[hsl(var(--ms-muted-foreground))]">
        <strong>{{ presets.find(p => p.id === activePreset)?.label }}</strong> — {{ presets.find(p => p.id === activePreset)?.desc }}
      </div>
      <MarkdownRender
        :content="content"
        :is-dark="isDark"
        :loading="false"
        :stream="false"
        :code-block-props="{
          showHeader: true,
          showCopyButton: true,
          showCollapseButton: true,
          showExpandButton: true,
        }"
      />
    </main>
  </div>
</template>

<style>
/*
 * Two presets, pure token overrides.
 * No component selectors — just change token values and everything follows.
 *
 * "default" uses the library's built-in token defaults (no overrides needed).
 * "compact" overrides spacing/size tokens for high density.
 */

/* ================================================================
   COMPACT — AI chat / dashboard / sidebar
   Only override tokens. ~60% of default spacing.
   ================================================================ */
.markstream-vue.compact {
  /* Typography — smaller */
  --ms-text-body: 0.875rem;
  --ms-leading-body: 1.5;
  --ms-text-h1: 1.375rem;
  --ms-text-h2: 1.125rem;
  --ms-text-h3: 1rem;
  --ms-text-h4: 0.875rem;
  --ms-text-h5: 0.8125rem;
  --ms-text-h6: 0.8125rem;
  --ms-weight-h1: 700;
  --ms-weight-h2: 600;

  /* Heading rhythm — compressed */
  --ms-flow-heading-1-mt: 0;
  --ms-flow-heading-1-mb: 0.3em;
  --ms-flow-heading-2-mt: 1.25em;
  --ms-flow-heading-2-mb: 0.25em;
  --ms-flow-heading-3-mt: 1em;
  --ms-flow-heading-3-mb: 0.2em;
  --ms-flow-heading-4-mt: 0.8em;
  --ms-flow-heading-4-mb: 0.15em;
  --ms-flow-heading-5-mt: 0.6em;
  --ms-flow-heading-5-mb: 0.1em;
  --ms-flow-heading-6-mt: 0.5em;
  --ms-flow-heading-6-mb: 0.1em;

  /* Flow spacing — tighter */
  --ms-flow-paragraph-y: 0.625em;
  --ms-flow-list-y: 0.5em;
  --ms-flow-list-item-y: 0.125em;
  --ms-flow-list-indent: 1.25em;
  --ms-flow-table-y: 0.625em;
  --ms-flow-table-cell: 0.2em 0.4em;
  --ms-flow-blockquote-y: 0.625em;
  --ms-flow-blockquote-indent: 0.75em;
  --ms-flow-admonition-y: 0.5em;
  --ms-flow-footnote-y: 0.25em;
  --ms-flow-hr-y: 1.25em;
  --ms-flow-diagram-y: 0.625em;
  --ms-flow-codeblock-y: 0.625em;
  --ms-flow-definition-term-mt: 0.25em;
  --ms-flow-definition-desc-ml: 0.75em;
  --ms-flow-definition-desc-mb: 0.25em;

  /* Panel insets — smaller */
  --ms-inset-panel-x: 0.75rem;
  --ms-inset-panel-y: 0.375rem;
  --ms-inset-panel-body-sm: 0.25rem;
  --ms-inset-panel-body: 0.625rem;
  --ms-inset-admonition-body-top: 0.25rem;
  --ms-inset-admonition-body-bottom: 0.375rem;

  /* Gaps — tighter */
  --ms-gap-header: 0.5rem;
  --ms-gap-header-main: 0.375rem;
  --ms-gap-header-actions: 0.25rem;

  /* Sizes — smaller */
  --ms-size-diagram-min-height: 280px;
  --ms-size-code-max-height: 420px;
  --ms-size-skeleton-min-height: 80px;

  /* Animation — faster */
  --ms-duration-standard: 140ms;
  --ms-duration-overlay: 160ms;
}

/* Compact content width controlled by host (full width here for demo) */
.compact .example-content { max-width: 100%; padding: 1rem; }
</style>
