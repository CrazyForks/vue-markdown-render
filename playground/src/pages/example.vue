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
  { id: 'default', label: 'Default', desc: 'Current baseline' },
  { id: 'editorial', label: 'Editorial', desc: 'Classic publishing, generous spacing' },
  { id: 'technical', label: 'Technical', desc: 'Dev docs, Stripe/Vercel style' },
  { id: 'compact', label: 'Compact', desc: 'Dashboard/sidebar, high density' },
  { id: 'soft', label: 'Soft Modern', desc: 'Notion/Linear, rounded and airy' },
  { id: 'reading', label: 'Reading', desc: 'Long-form, Medium/Substack' },
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
 * 5 typography + layout presets.
 * Each applies to .markstream-vue.{preset} and overrides heading,
 * paragraph, list, blockquote, table, code, and HR styles.
 * "default" class = no overrides, current baseline.
 */

/* ================================================================
   1. EDITORIAL — Classic publishing, generous spacing
   Positioning: 学术、文档、正式内容。衬线比例，宽松呼吸感。
   ================================================================ */

.markstream-vue.editorial .example-content { max-width: 42rem; }

.markstream-vue.editorial .heading-node { letter-spacing: -0.02em; }
.markstream-vue.editorial .heading-1 { font-size: 2.75rem; font-weight: 700; margin-bottom: 1.2em; line-height: 1.15; }
.markstream-vue.editorial .heading-2 { font-size: 1.875rem; font-weight: 700; margin-top: 2.8em; margin-bottom: 0.8em; line-height: 1.25; }
.markstream-vue.editorial .heading-3 { font-size: 1.375rem; font-weight: 600; margin-top: 2.2em; margin-bottom: 0.6em; line-height: 1.35; }
.markstream-vue.editorial .heading-4 { font-size: 1.125rem; font-weight: 600; margin-top: 1.8em; margin-bottom: 0.4em; letter-spacing: 0; }
.markstream-vue.editorial .heading-5 { font-size: 0.95rem; font-weight: 600; margin-top: 1.5em; margin-bottom: 0.3em; text-transform: uppercase; letter-spacing: 0.05em; color: hsl(var(--ms-muted-foreground)); }
.markstream-vue.editorial .heading-6 { font-size: 0.875rem; font-weight: 600; margin-top: 1.2em; margin-bottom: 0.3em; text-transform: uppercase; letter-spacing: 0.08em; color: hsl(var(--ms-muted-foreground)); }

.markstream-vue.editorial .paragraph-node { font-size: 1.0625rem; line-height: 1.8; margin: 1.5em 0; }

.markstream-vue.editorial .blockquote {
  border-left-width: 3px;
  border-left-color: hsl(var(--ms-muted-foreground) / 0.3);
  padding-left: 1.5em;
  margin: 2em 0;
  font-style: italic;
  color: hsl(var(--ms-muted-foreground));
}

.markstream-vue.editorial .list-node { line-height: 1.8; }
.markstream-vue.editorial .list-item { margin: 0.4em 0; }

.markstream-vue.editorial .hr-node { margin: 3.5em 0; border-top-width: 2px; }

.markstream-vue.editorial .table-node { font-size: 0.9375rem; }
.markstream-vue.editorial .table-node th { font-weight: 700; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.06em; color: hsl(var(--ms-muted-foreground)); }

.markstream-vue.editorial .admonition { border-radius: 0; }

/* ================================================================
   2. TECHNICAL — Dev docs, Stripe/Vercel style
   Positioning: 开发者文档、API 参考。清晰层级，代码优先。
   ================================================================ */

.markstream-vue.technical .example-content { max-width: 50rem; }

.markstream-vue.technical .heading-1 { font-size: 2rem; font-weight: 800; margin-bottom: 0.5em; line-height: 1.2; letter-spacing: -0.03em; }
.markstream-vue.technical .heading-2 { font-size: 1.5rem; font-weight: 700; margin-top: 2.5em; margin-bottom: 0.5em; padding-bottom: 0.3em; border-bottom: 1px solid hsl(var(--ms-border)); line-height: 1.3; }
.markstream-vue.technical .heading-3 { font-size: 1.25rem; font-weight: 600; margin-top: 2em; margin-bottom: 0.4em; line-height: 1.35; }
.markstream-vue.technical .heading-4 { font-size: 1rem; font-weight: 600; margin-top: 1.5em; margin-bottom: 0.3em; color: hsl(var(--ms-foreground)); }
.markstream-vue.technical .heading-5 { font-size: 0.875rem; font-weight: 700; margin-top: 1.2em; margin-bottom: 0.2em; color: hsl(var(--ms-muted-foreground)); }
.markstream-vue.technical .heading-6 { font-size: 0.8125rem; font-weight: 700; margin-top: 1em; margin-bottom: 0.2em; color: hsl(var(--ms-muted-foreground)); }

.markstream-vue.technical .paragraph-node { font-size: 0.9375rem; line-height: 1.7; margin: 1.25em 0; }

.markstream-vue.technical .blockquote {
  border-left-width: 3px;
  border-left-color: var(--link-color);
  padding: 0.75em 1em;
  margin: 1.5em 0;
  background: hsl(var(--ms-muted) / 0.4);
  border-radius: calc(var(--ms-radius) - 2px);
  font-style: normal;
}

.markstream-vue.technical .code-block-container { border-radius: calc(var(--ms-radius) + 2px); }

.markstream-vue.technical .table-node th {
  background: hsl(var(--ms-muted));
  font-weight: 600;
  font-size: 0.8125rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.markstream-vue.technical .table-node tr:nth-child(even) td { background: hsl(var(--ms-muted) / 0.3); }
.markstream-vue.technical .table-node tr:hover td { background: hsl(var(--ms-accent) / 0.5); }

.markstream-vue.technical .hr-node { margin: 2.5em 0; }

.markstream-vue.technical .definition-term { color: var(--link-color); }

/* ================================================================
   3. COMPACT — Dashboard/sidebar, high density
   Positioning: AI 对话渲染、嵌入式面板、空间敏感场景。
   ================================================================ */

.markstream-vue.compact .example-content { max-width: 100%; padding: 1rem; }

.markstream-vue.compact .heading-1 { font-size: 1.5rem; font-weight: 700; margin-top: 0; margin-bottom: 0.3em; line-height: 1.2; }
.markstream-vue.compact .heading-2 { font-size: 1.25rem; font-weight: 700; margin-top: 1.2em; margin-bottom: 0.25em; line-height: 1.25; }
.markstream-vue.compact .heading-3 { font-size: 1.0625rem; font-weight: 600; margin-top: 1em; margin-bottom: 0.2em; line-height: 1.3; }
.markstream-vue.compact .heading-4 { font-size: 0.9375rem; font-weight: 600; margin-top: 0.8em; margin-bottom: 0.15em; }
.markstream-vue.compact .heading-5 { font-size: 0.875rem; font-weight: 600; margin-top: 0.6em; margin-bottom: 0.1em; color: hsl(var(--ms-muted-foreground)); }
.markstream-vue.compact .heading-6 { font-size: 0.8125rem; font-weight: 600; margin-top: 0.5em; margin-bottom: 0.1em; color: hsl(var(--ms-muted-foreground)); }

.markstream-vue.compact .paragraph-node { font-size: 0.875rem; line-height: 1.6; margin: 0.75em 0; }

.markstream-vue.compact .blockquote {
  padding-left: 0.75em;
  margin: 0.75em 0;
  font-size: 0.875rem;
}

.markstream-vue.compact .list-node { margin: 0.5em 0; font-size: 0.875rem; padding-left: 1.25em; }
.markstream-vue.compact .list-item { margin: 0.15em 0; }

.markstream-vue.compact .code-block-container { margin: 0.75em 0; border-radius: calc(var(--ms-radius) - 2px); }

.markstream-vue.compact .table-node {
  font-size: 0.8125rem;
  margin: 0.75em 0;
}
.markstream-vue.compact .table-node th { font-weight: 600; font-size: 0.75rem; }
.markstream-vue.compact .table-node th,
.markstream-vue.compact .table-node td { padding: 0.25em 0.5em; }

.markstream-vue.compact .admonition { margin: 0.5em 0; font-size: 0.875rem; }
.markstream-vue.compact .admonition-header { padding: 0.3rem 0.75rem; }
.markstream-vue.compact .admonition-content { padding: 0.3rem 0.75rem 0.5rem; }

.markstream-vue.compact .hr-node { margin: 1.5em 0; }

.markstream-vue.compact .math-block { margin: 0.75em 0; }

/* ================================================================
   4. SOFT MODERN — Notion/Linear, rounded and airy
   Positioning: 现代 SaaS 产品、内部工具。柔和、圆润、高级感。
   ================================================================ */

.markstream-vue.soft .example-content { max-width: 46rem; }

.markstream-vue.soft .heading-node { letter-spacing: -0.015em; }
.markstream-vue.soft .heading-1 { font-size: 2.25rem; font-weight: 700; margin-bottom: 0.6em; line-height: 1.2; }
.markstream-vue.soft .heading-2 { font-size: 1.625rem; font-weight: 700; margin-top: 2.2em; margin-bottom: 0.5em; line-height: 1.3; }
.markstream-vue.soft .heading-3 { font-size: 1.25rem; font-weight: 600; margin-top: 1.8em; margin-bottom: 0.4em; line-height: 1.4; }
.markstream-vue.soft .heading-4 { font-size: 1.0625rem; font-weight: 600; margin-top: 1.4em; margin-bottom: 0.35em; }
.markstream-vue.soft .heading-5 { font-size: 0.9375rem; font-weight: 600; margin-top: 1.2em; margin-bottom: 0.25em; opacity: 0.7; }
.markstream-vue.soft .heading-6 { font-size: 0.875rem; font-weight: 600; margin-top: 1em; margin-bottom: 0.2em; opacity: 0.55; }

.markstream-vue.soft .paragraph-node { font-size: 1rem; line-height: 1.75; margin: 1.4em 0; }

.markstream-vue.soft .blockquote {
  border-left: none;
  background: hsl(var(--ms-muted) / 0.5);
  padding: 1em 1.25em;
  border-radius: calc(var(--ms-radius) + 4px);
  margin: 1.6em 0;
  font-style: normal;
}

.markstream-vue.soft .code-block-container {
  border-radius: calc(var(--ms-radius) + 4px);
  box-shadow: 0 2px 8px hsl(var(--ms-foreground) / 0.06);
  border-color: hsl(var(--ms-border) / 0.5);
}

.markstream-vue.soft .table-node {
  border-collapse: separate;
  border-spacing: 0;
  border-radius: calc(var(--ms-radius) + 2px);
  overflow: hidden;
  border: 1px solid hsl(var(--ms-border));
}
.markstream-vue.soft .table-node th {
  background: hsl(var(--ms-muted) / 0.6);
  font-weight: 600;
}
.markstream-vue.soft .table-node tr:nth-child(even) td { background: hsl(var(--ms-muted) / 0.2); }
.markstream-vue.soft .table-node tr:hover td { background: hsl(var(--ms-accent) / 0.4); }
.markstream-vue.soft .table-node th,
.markstream-vue.soft .table-node td { border-color: hsl(var(--ms-border) / 0.5); }

.markstream-vue.soft .admonition { border-radius: calc(var(--ms-radius) + 4px); border-left-width: 3px; }

.markstream-vue.soft .hr-node {
  border: none;
  height: 4px;
  background: linear-gradient(90deg, transparent, hsl(var(--ms-border)), transparent);
  margin: 2.5em 0;
}

.markstream-vue.soft .definition-term { font-size: 1.0625rem; }
.markstream-vue.soft .definition-desc {
  background: hsl(var(--ms-muted) / 0.3);
  padding: 0.5em 0.75em;
  border-radius: calc(var(--ms-radius));
  margin-bottom: 0.75em;
}

/* ================================================================
   5. READING — Long-form, Medium/Substack
   Positioning: 博客、新闻简报、长文阅读。窄栏、大字、沉浸感。
   ================================================================ */

.markstream-vue.reading .example-content { max-width: 38rem; }

.markstream-vue.reading .heading-node { letter-spacing: -0.02em; }
.markstream-vue.reading .heading-1 { font-size: 2.5rem; font-weight: 800; margin-bottom: 0.4em; line-height: 1.15; }
.markstream-vue.reading .heading-2 { font-size: 1.75rem; font-weight: 700; margin-top: 2.5em; margin-bottom: 0.6em; line-height: 1.3; }
.markstream-vue.reading .heading-3 { font-size: 1.375rem; font-weight: 600; margin-top: 2em; margin-bottom: 0.5em; line-height: 1.4; }
.markstream-vue.reading .heading-4 { font-size: 1.125rem; font-weight: 600; margin-top: 1.6em; margin-bottom: 0.4em; }
.markstream-vue.reading .heading-5 { font-size: 1rem; font-weight: 700; margin-top: 1.4em; margin-bottom: 0.3em; font-style: italic; }
.markstream-vue.reading .heading-6 { font-size: 1rem; font-weight: 400; margin-top: 1.2em; margin-bottom: 0.3em; font-style: italic; color: hsl(var(--ms-muted-foreground)); }

.markstream-vue.reading .paragraph-node { font-size: 1.125rem; line-height: 1.85; margin: 1.6em 0; }

.markstream-vue.reading .blockquote {
  border-left-width: 4px;
  border-left-color: var(--link-color);
  padding: 0.25em 0 0.25em 1.5em;
  margin: 2em 0;
  font-size: 1.1875rem;
  font-style: italic;
  line-height: 1.7;
  color: hsl(var(--ms-muted-foreground));
}

.markstream-vue.reading .list-node { font-size: 1.125rem; line-height: 1.8; margin: 1.4em 0; }
.markstream-vue.reading .list-item { margin: 0.35em 0; }

.markstream-vue.reading .code-block-container { margin: 2em 0; }

.markstream-vue.reading .table-node { font-size: 0.9375rem; margin: 2em 0; }
.markstream-vue.reading .table-node th { font-weight: 700; border-bottom-width: 2px; }

.markstream-vue.reading .admonition {
  margin: 2em 0;
  border-radius: calc(var(--ms-radius) + 2px);
}

.markstream-vue.reading .hr-node {
  border: none;
  text-align: center;
  margin: 3em 0;
}
.markstream-vue.reading .hr-node::after {
  content: '* * *';
  color: hsl(var(--ms-muted-foreground));
  letter-spacing: 0.5em;
  font-size: 0.875rem;
}

.markstream-vue.reading .math-block { margin: 2em 0; }

.markstream-vue.reading .definition-term { font-size: 1.0625rem; font-weight: 700; font-style: italic; }
</style>
