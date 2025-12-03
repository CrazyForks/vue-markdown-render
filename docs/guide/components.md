# Components & Node renderers

This page explains how each renderer fits together, what peer dependencies or CSS are required, and the typical issues you should check before filing a bug. Pair it with the [VitePress docs playbook](/guide/vitepress-docs) when adding new sections.

## Quick reference

| Component | Best for | Key props/events | Extra CSS / peers | Troubleshooting hooks |
| --------- | -------- | ---------------- | ----------------- | --------------------- |
| `MarkdownRender` | Rendering full AST trees (default export) | `content`, `custom-id`, `setCustomComponents`, `beforeRender`, `afterRender` | Import `markstream-vue/index.css` inside a reset-aware layer | Add `custom-id="docs"` to scope overrides; see [CSS checklist](/guide/troubleshooting#css-looks-wrong-start-here) |
| `CodeBlockNode` | Monaco-powered code blocks, streaming diffs | `node`, `monacoOptions`, `autoExpand`, `viewportPriority` | Install `stream-monaco` + include Monaco CSS (`stream-monaco/esm/index.css`) | Missing CSS ⇒ blank editor; ensure Tailwind layers wrap the import |
| `MarkdownCodeBlockNode` | Lightweight highlighting via `shiki` | `node`, `theme`, `lang`, `wordWrap` | Requires `shiki` + `stream-markdown` | Use for SSR-friendly or low-bundle scenarios |
| `MermaidBlockNode` | Progressive Mermaid diagrams | `node`, `id`, `theme`, `onRender` | Peer `mermaid` ≥ 11; import `mermaid/dist/mermaid.css` for theme | For async errors see `/guide/mermaid` |
| `MathBlockNode` / `MathInlineNode` | KaTeX rendering | `node`, `displayMode`, `macros` | Install `katex` and import `katex/dist/katex.min.css` | SSR requires `client-only` in Nuxt |
| `ImageNode` | Custom previews/lightboxes | Emits `click`, `load`, `error`; accepts `lazy` props via `node.props` | None, but respects global CSS | Wrap in custom component + `setCustomComponents` to intercept events |
| `LinkNode` | Animated underline, tooltips | `color`, `underlineHeight`, `showTooltip` | No extra CSS | Browser defaults can override `a` styles; import reset |

## MarkdownRender

> Main entry point that takes Markdown AST content (string or parsed structure) and renders with built-in node components.

### Quick reference
- **Best for**: full markdown documents in Vite, Nuxt, VitePress.
- **Key props**: `content`, `custom-id`, `renderer`, lifecycle hooks.
- **CSS**: include a reset (`modern-css-reset`, `@unocss/reset`, or `@tailwind base`) before `markstream-vue/index.css`. Wrap import with `@layer components` when using Tailwind/UnoCSS.

### Usage ladder

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '# Hello docs\n\nUse `custom-id` to scope styles.'
</script>

<template>
  <MarkdownRender custom-id="docs" :content="md" />
</template>
```

```ts
// Register custom node renderers
import { setCustomComponents } from 'markstream-vue'
import CustomImageNode from './CustomImageNode.vue'

setCustomComponents('docs', {
  image: CustomImageNode,
})
```

```css
/* styles/main.css */
@import 'modern-css-reset';
@tailwind base;

@layer components {
  @import 'markstream-vue/index.css';
}

[data-custom-id='docs'] .prose {
  max-width: 720px;
}
```

### Common pitfalls
- **Blank styles**: missing reset or incorrect layer ordering → use the [CSS checklist](/guide/troubleshooting#css-looks-wrong-start-here).
- **Conflicting utility classes**: add `custom-id` and scope overrides to `[data-custom-id="..."]`.
- **SSR errors**: wrap in `<ClientOnly>` (Nuxt) or guard with `onMounted` when using browser-only peers.

## CodeBlockNode

> Feature-rich renderer that streams Monaco tokens, supports diff markers, and optional toolbar slots.

### Quick reference
- **Best for**: interactive editor-like blocks in docs/playgrounds.
- **Peers**: `stream-monaco` (core), Monaco worker bundling via Vite, optional `@shikijs/monaco` for highlighting.
- **CSS**: import `stream-monaco/esm/index.css` after your reset but before utility layers override it.

### Usage

```vue
<script setup lang="ts">
import { CodeBlockNode } from 'markstream-vue'
import 'stream-monaco/esm/index.css'

const node = {
  type: 'code_block',
  lang: 'ts',
  value: 'const a = 1',
}
</script>

<template>
  <CodeBlockNode :node="node" :monaco-options="{ fontSize: 14 }" />
</template>
```

```vue
<!-- Advanced: stream diff and custom toolbar -->
<template>
  <CodeBlockNode
    custom-id="docs"
    :node="node"
    :auto-expand="true"
    :viewport-priority="true"
  >
    <template #toolbar>
      <button class="copy-btn" @click="copy()">Copy</button>
    </template>
  </CodeBlockNode>
</template>
```

### Common pitfalls
- **Editor invisible**: missing Monaco CSS or worker registration.
- **Tailwind overriding fonts**: wrap imports in `@layer components`.
- **SSR**: Monaco requires browser APIs; use lazy mounts (`client-only`) or `visibility-wrapper`.

## MarkdownCodeBlockNode

> Lightweight code blocks using Shiki instead of Monaco — perfect for SSR/static docs or when bundle size matters.

### Quick reference
- **Peers**: `shiki` + `stream-markdown`.
- **Props**: mirrors `CodeBlockNode` (`theme`, `lang`, `wordWrap`, header slots) so you can drop it in with minimal changes.
- **When to choose it**: VitePress, Nuxt content sites, or anywhere Monaco would be overkill.

### Usage

```vue
<script setup lang="ts">
import { MarkdownCodeBlockNode } from 'markstream-vue'
import { getHighlighter } from 'shiki'

const node = {
  type: 'code_block',
  lang: 'vue',
  value: '<template><p>Hello</p></template>',
}
</script>

<template>
  <MarkdownCodeBlockNode :node="node" theme="vitesse-dark" />
</template>
```

Troubleshooting:
- Ensure `shiki` is installed and properly bundled; otherwise the component falls back to plain `<pre><code>`.
- Wrap CSS imports just like the main renderer to avoid Tailwind/Uno overrides.

## MermaidBlockNode

> Renders Mermaid diagrams progressively, streaming updates as soon as `mermaid` parses the graph.

### Quick reference
- **Peer**: `mermaid` ≥ 11 (tree-shakable ESM build recommended).
- **CSS**: import `mermaid/dist/mermaid.css` after your reset.
- **Props**: `node`, `theme`, `mermaidOptions`, `onRender`, `custom-id`.

### Usage

```ts
import { setCustomComponents } from 'markstream-vue'
import { MermaidBlockNode } from 'markstream-vue'
import 'mermaid/dist/mermaid.css'
```

```vue
<MermaidBlockNode
  custom-id="docs"
  :node="node"
  theme="forest"
  :mermaid-options="{ securityLevel: 'strict' }"
  @render="handleMermaidRender"
/>
```

Troubleshooting:
- Async errors usually stem from missing CSS or unsupported syntax. Check browser console for Mermaid logs.
- When diagrams are blank in SSR, guard rendering with `onMounted` or `<ClientOnly>` and ensure Mermaid is initialized on the client.

## MathBlockNode / MathInlineNode

> KaTeX-powered math display for block and inline formulas.

### Quick reference
- **Peer**: `katex`.
- **CSS**: `import 'katex/dist/katex.min.css'`.
- **Props**: `node`, `displayMode`, `macros`, `throwOnError`.

### Usage

```ts
import 'katex/dist/katex.min.css'
```

```vue
<MathBlockNode :node="node" :display-mode="true" :macros="{ '\\RR': '\\mathbb{R}' }" />
<MathInlineNode :node="inlineNode" />
```

Troubleshooting:
- Missing CSS → blank formulas or fallback text.
- Nuxt SSR needs `<ClientOnly>` or `client:only` since KaTeX touches DOM APIs.
- To override styling, scope selectors using `[data-custom-id]` rather than editing KaTeX globals directly.

## ImageNode — Custom preview handling

`ImageNode` emits `click`, `load`, `error` so you can build lightboxes or lazy loading wrappers.

```vue
<template>
  <ImageNode :node="node" @click="open(node.props.src)" />
</template>
```

```ts
import CustomImageNode from './ImagePreview.vue'
import { setCustomComponents } from 'markstream-vue'

setCustomComponents('docs', { image: CustomImageNode })
```

Common issues:
- Missing reset causes browser default borders—import a reset before `index.css`.
- Tailwind `img` utilities overriding widths—scope your overrides within `[data-custom-id]`.

## LinkNode: underline animation & color customization

`LinkNode` (internal anchor renderer) exposes runtime props (`color`, `underlineHeight`, `showTooltip`, etc.) so you can change the underline animation without CSS hacks.

```vue
<LinkNode
  :node="node"
  color="#e11d48"
  :underline-height="3"
  underline-bottom="-4px"
  :animation-duration="1.2"
  :show-tooltip="false"
/>
```

Notes:
- Underline uses `currentColor`; override via CSS if you need a different color.
- `showTooltip` toggles the singleton tooltip vs native browser `title`.
- Browser default anchor styles may conflict; follow the reset guidance above.

## Utility helpers

- `getMarkdown()` — configured `markdown-it-ts` instance with the parser plugins this package expects.
- `parseMarkdownToStructure()` — convert Markdown strings into the AST consumed by `MarkdownRender`.
- `setCustomComponents(id?, mapping)` — swap any node renderer for a specific `custom-id`.

Whenever you add new components or change behavior, update this page *and* the [VitePress docs playbook](/guide/vitepress-docs) so contributors know how to follow the same structure.
