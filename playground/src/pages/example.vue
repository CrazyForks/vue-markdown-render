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
 * Two typography presets: Default + Compact.
 * "default" = the new designed baseline (Technical Clean + breathing room).
 * "compact" = high-density for AI chat / dashboards.
 *
 * Selectors use .markstream-vue.{preset} for specificity
 * to override library scoped styles.
 */


/* ================================================================
   DEFAULT — Technical Clean + Notion breathing room
   Positioning: AI 对话 + 开发文档 + 内容渲染的交叉场景。
   专业但不冷淡，代码和散文都舒适。

   Design intent:
   - 65ch content width (research-backed optimal line length)
   - 16px body, 1.6 line-height (accessibility + comfort sweet spot)
   - Major Third (1.25) heading scale
   - Weight > size for hierarchy (Apple/Linear approach)
   - Heading top margin > bottom margin (proximity principle)
   - Table has header bg + zebra + hover
   - Blockquote has subtle bg fill, not just a bare left border
   - HR as fading gradient, not a hard line
   - h5/h6 use muted color instead of size reduction
   ================================================================ */

.markstream-vue.default .example-content { max-width: 65ch; }

/* Headings: Major Third (1.25) scale from 16px base → 20 → 25 → 31.25 */
.markstream-vue.default .heading-node { letter-spacing: -0.015em; }
.markstream-vue.default .heading-1 { font-size: 2rem; font-weight: 700; margin-top: 0; margin-bottom: 0.75em; line-height: 1.2; }
.markstream-vue.default .heading-2 { font-size: 1.5rem; font-weight: 600; margin-top: 2.25em; margin-bottom: 0.6em; line-height: 1.25; }
.markstream-vue.default .heading-3 { font-size: 1.25rem; font-weight: 600; margin-top: 1.8em; margin-bottom: 0.5em; line-height: 1.3; }
.markstream-vue.default .heading-4 { font-size: 1rem; font-weight: 600; margin-top: 1.5em; margin-bottom: 0.4em; line-height: 1.4; }
.markstream-vue.default .heading-5 { font-size: 0.875rem; font-weight: 600; margin-top: 1.25em; margin-bottom: 0.3em; color: hsl(var(--ms-muted-foreground)); }
.markstream-vue.default .heading-6 { font-size: 0.875rem; font-weight: 500; margin-top: 1em; margin-bottom: 0.25em; color: hsl(var(--ms-muted-foreground)); font-style: italic; }

/* Body text */
.markstream-vue.default .paragraph-node { font-size: 1rem; line-height: 1.6; margin: 1.25em 0; }

/* Blockquote: subtle bg + left accent, not bare border */
.markstream-vue.default .blockquote {
  border-left-width: 3px;
  border-left-color: hsl(var(--ms-muted-foreground) / 0.25);
  padding: 0.5em 1em;
  margin: 1.5em 0;
  background: hsl(var(--ms-muted) / 0.35);
  border-radius: 0 calc(var(--ms-radius) - 2px) calc(var(--ms-radius) - 2px) 0;
  font-style: normal;
}

/* Lists */
.markstream-vue.default .list-node { line-height: 1.6; margin: 1em 0; }
.markstream-vue.default .list-item { margin: 0.25em 0; }

/* Code blocks: slight elevation to separate from page */
.markstream-vue.default .code-block-container {
  margin: 1.5em 0;
  border-radius: calc(var(--ms-radius) + 2px);
  box-shadow: 0 1px 3px hsl(var(--ms-foreground) / 0.06);
}

/* Tables: header bg + zebra stripes + hover */
.markstream-vue.default .table-node { font-size: 0.9375rem; margin: 1.75em 0; }
.markstream-vue.default .table-node th {
  background: hsl(var(--ms-muted) / 0.6);
  font-weight: 600;
  font-size: 0.8125rem;
  letter-spacing: 0.02em;
}
.markstream-vue.default .table-node tr:nth-child(even) td { background: hsl(var(--ms-muted) / 0.2); }
.markstream-vue.default .table-node tr:hover td { background: hsl(var(--ms-accent) / 0.4); }

/* Admonition */
.markstream-vue.default .admonition { border-radius: calc(var(--ms-radius)); margin: 1.5em 0; }

/* HR: gradient fade instead of hard line */
.markstream-vue.default .hr-node {
  border: none;
  height: 1px;
  background: linear-gradient(90deg, transparent, hsl(var(--ms-border)), transparent);
  margin: 2.5em 0;
}

/* Definition list */
.markstream-vue.default .definition-term { font-weight: 600; color: hsl(var(--ms-foreground)); }
.markstream-vue.default .definition-desc {
  margin-left: 1em;
  padding-left: 0.75em;
  border-left: 2px solid hsl(var(--ms-border) / 0.5);
}

/* Math */
.markstream-vue.default .math-block { margin: 1.5em 0; }

/* ================================================================
   COMPACT — AI chat / dashboard / sidebar
   Positioning: 空间敏感场景。信息密度优先，但不牺牲可读性。

   Design intent:
   - Full width (host controls container)
   - 14px body, 1.5 line-height
   - ~60% of default spacing
   - Smaller headings, tighter margins
   - Tables and code blocks take minimum vertical space
   - Admonitions shrink padding
   ================================================================ */

.markstream-vue.compact .example-content { max-width: 100%; padding: 1rem; }

/* Headings: compressed scale */
.markstream-vue.compact .heading-1 { font-size: 1.375rem; font-weight: 700; margin-top: 0; margin-bottom: 0.3em; line-height: 1.2; }
.markstream-vue.compact .heading-2 { font-size: 1.125rem; font-weight: 600; margin-top: 1.25em; margin-bottom: 0.25em; line-height: 1.25; }
.markstream-vue.compact .heading-3 { font-size: 1rem; font-weight: 600; margin-top: 1em; margin-bottom: 0.2em; line-height: 1.3; }
.markstream-vue.compact .heading-4 { font-size: 0.875rem; font-weight: 600; margin-top: 0.8em; margin-bottom: 0.15em; }
.markstream-vue.compact .heading-5 { font-size: 0.8125rem; font-weight: 600; margin-top: 0.6em; margin-bottom: 0.1em; color: hsl(var(--ms-muted-foreground)); }
.markstream-vue.compact .heading-6 { font-size: 0.8125rem; font-weight: 500; margin-top: 0.5em; margin-bottom: 0.1em; color: hsl(var(--ms-muted-foreground)); }

/* Body text */
.markstream-vue.compact .paragraph-node { font-size: 0.875rem; line-height: 1.5; margin: 0.625em 0; }

/* Blockquote */
.markstream-vue.compact .blockquote {
  padding-left: 0.75em;
  margin: 0.625em 0;
  font-size: 0.875rem;
}

/* Lists */
.markstream-vue.compact .list-node { margin: 0.5em 0; font-size: 0.875rem; padding-left: 1.25em; }
.markstream-vue.compact .list-item { margin: 0.125em 0; }

/* Code blocks */
.markstream-vue.compact .code-block-container { margin: 0.625em 0; border-radius: calc(var(--ms-radius) - 2px); }

/* Tables */
.markstream-vue.compact .table-node { font-size: 0.8125rem; margin: 0.625em 0; }
.markstream-vue.compact .table-node th { font-weight: 600; font-size: 0.75rem; }
.markstream-vue.compact .table-node th,
.markstream-vue.compact .table-node td { padding: 0.2em 0.4em; }

/* Admonitions */
.markstream-vue.compact .admonition { margin: 0.5em 0; font-size: 0.875rem; }
.markstream-vue.compact .admonition-header { padding: 0.25rem 0.625rem; font-size: 0.8125rem; }
.markstream-vue.compact .admonition-content { padding: 0.25rem 0.625rem 0.375rem; }

/* HR */
.markstream-vue.compact .hr-node { margin: 1.25em 0; }

/* Math */
.markstream-vue.compact .math-block { margin: 0.625em 0; }

/* Definition list */
.markstream-vue.compact .definition-term { font-size: 0.875rem; }
.markstream-vue.compact .definition-desc { font-size: 0.875rem; margin-left: 0.75em; margin-bottom: 0.25em; }
</style>
