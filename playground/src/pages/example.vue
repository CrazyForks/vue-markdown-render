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

### CSS

\`\`\`css
.markstream-vue {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --border: 214.3 31.8% 91.4%;
}

.dark .markstream-vue {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
}
\`\`\`

### Diff

\`\`\`diff
- const old = 'hardcoded';
+ const new = 'tokenized';
  const unchanged = 'stays the same';
- background-color: #ffffff;
+ background-color: var(--code-bg);
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

### Aligned Table

| Left-aligned | Center-aligned | Right-aligned |
|:-------------|:--------------:|--------------:|
| Content | Content | Content |
| More content | More content | More content |

---

## Admonitions

> [!NOTE]
> This is a note admonition. Useful for additional information.

> [!TIP]
> This is a tip. Helpful advice for the reader.

> [!WARNING]
> This is a warning. Pay attention to this.

> [!CAUTION]
> This is a caution/danger notice. Something could go wrong.

---

## Math

### Inline Math

The quadratic formula is $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$ and Euler's identity: $e^{i\\pi} + 1 = 0$.

### Block Math

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

$$
\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}
$$

---

## Images

![Placeholder Image](https://via.placeholder.com/400x200/e2e8f0/64748b?text=Image+Placeholder)

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

## HTML Inline

This text contains <mark>inline HTML mark</mark> and <abbr title="HyperText Markup Language">HTML</abbr> abbreviation.

---

*End of static example. All component types should be visible above for design review.*
`
</script>

<template>
  <div class="markstream-vue example-page" :class="{ dark: isDark }">
    <header class="example-header">
      <h1>Static Component Example</h1>
      <p>For design review &mdash; all components rendered at once, no streaming.</p>
      <button class="toggle-btn" @click="toggleDark">
        {{ isDark ? 'Light Mode' : 'Dark Mode' }}
      </button>
      <router-link to="/" class="back-link">&larr; Back to Playground</router-link>
    </header>

    <main class="example-content">
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

<style scoped>
.example-page {
  min-height: 100vh;
  background: hsl(var(--ms-background));
  color: hsl(var(--ms-foreground));
  transition: background-color 0.2s ease, color 0.2s ease;
}

.example-header {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 2rem;
  border-bottom: 1px solid hsl(var(--ms-border));
  background: inherit;
  backdrop-filter: blur(8px);
}

.example-header h1 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.example-header p {
  font-size: 0.8rem;
  color: hsl(var(--ms-muted-foreground));
  margin: 0;
}

.toggle-btn {
  margin-left: auto;
  padding: 0.375rem 0.75rem;
  border: 1px solid hsl(var(--ms-border));
  border-radius: var(--ms-radius);
  background: transparent;
  color: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}

.toggle-btn:hover {
  background: hsl(var(--ms-accent));
}

.back-link {
  font-size: 0.8rem;
  color: var(--link-color);
  text-decoration: none;
}

.back-link:hover {
  text-decoration: underline;
}

.example-content {
  max-width: 48rem;
  margin: 0 auto;
  padding: 2rem;
}
</style>
