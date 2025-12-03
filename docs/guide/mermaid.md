# Mermaid quick start

Mermaid diagrams stream progressively in `markstream-vue`: as soon as the syntax becomes valid the chart renders, then refines as more tokens arrive. This page covers setup, a streaming example, and common fixes.

## 1. Install & import

```bash
pnpm add mermaid
```

```ts
// main.ts / entry
import 'mermaid/dist/mermaid.css'
```

Keep the CSS import after your reset and inside `@layer components` when using Tailwind/UnoCSS so utility layers do not override Mermaid styles.

```css
@import 'modern-css-reset';

@layer components {
  @import 'mermaid/dist/mermaid.css';
  @import 'markstream-vue/index.css';
}
```

## 2. Streaming example

Mermaid renders as soon as the snippet is syntactically valid. The snippet below shows a gradual update (ideal for AI responses or long-running tasks):

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { ref } from 'vue'

const content = ref('')
const steps = [
  '```mermaid\n',
  'graph TD\n',
  'A[Start]-->B{Is valid?}\n',
  'B -- Yes --> C[Render]\n',
  'B -- No  --> D[Wait]\n',
  '```\n',
]

let i = 0
const id = setInterval(() => {
  content.value += steps[i] || ''
  i++
  if (i >= steps.length)
    clearInterval(id)
}, 120)
</script>

<template>
  <MarkdownRender :content="content" />
  <!-- Diagram progressively appears as content streams in -->
</template>
```

Quick try — paste this Markdown into a page or component:

```md
\`\`\`mermaid
graph LR
A[Start]-->B
B-->C[End]
\`\`\`
```

![Mermaid demo](/screenshots/mermaid-demo.svg)

## 3. Advanced component: `MermaidBlockNode`

Need header controls, export buttons, or a pseudo-fullscreen modal? Use [`MermaidBlockNode`](/guide/mermaid-block-node) or override the default renderer via [setCustomComponents](/guide/mermaid-block-node-override). A runnable playground demo lives at `/mermaid-export-demo`.

## 4. Troubleshooting checklist

1. **Peer not installed** — run `pnpm add mermaid`. Without it the renderer falls back to showing source text.
2. **CSS missing** — import `mermaid/dist/mermaid.css` after your reset (and wrap it in `@layer components` when Tailwind/UnoCSS is present). Missing CSS manifests as invisible diagrams.
3. **Async errors** — check the browser console for Mermaid logs. Versions prior to 11 are unsupported; upgrade to ≥ 11.
4. **SSR guard** — Mermaid needs the DOM. Wrap the component in `<ClientOnly>` for Nuxt or check `typeof window !== 'undefined'` before mounting in SSR contexts.
5. **Heavy graphs** — consider pre-rendering server-side (mermaid CLI) or caching SVG output; the component exposes `svgString` when using `MermaidBlockNode` export events.

Still stuck? Reproduce the issue in the playground (`pnpm play`) with a minimal Markdown sample and link it when opening a bug report.
