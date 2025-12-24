# Component props & options

Use this page when you need to fine-tune streaming behaviour, control heavy nodes, or understand how `MarkdownRender` interacts with Tailwind/UnoCSS projects.

## Core props on `MarkdownRender`

| Prop | Type | Default | Notes |
| ---- | ---- | ------- | ----- |
| `content` | `string` | – | Raw Markdown string (required unless `nodes` is provided). |
| `nodes` | `BaseNode[]` | – | Pre-parsed AST structure from `parseMarkdownToStructure`. Skip this when you want the component to parse internally. |
| `custom-id` | `string` | – | Scopes `setCustomComponents` mappings and lets you target CSS via `[data-custom-id="..."]`. |
| `final` | `boolean` | `false` | Marks the input as end-of-stream. Disables streaming mid-state (loading) parsing so trailing delimiters (like `$$` or an unclosed code fence) won’t get stuck in a perpetual loading state. |
| `parse-options` | `ParseOptions` | – | Token hooks (`preTransformTokens`, `postTransformTokens`, `postTransformNodes`). Applies only when `content` is provided. |
| `custom-html-tags` | `string[]` | – | Extra HTML-like tags treated as common during streaming mid‑states and emitted as custom nodes (`type: <tag>`) for `setCustomComponents` mapping (forwarded to `getMarkdown`, e.g. `['thinking']`). |
| `typewriter` | `boolean` | `true` | Enables the subtle enter animation. Disable if you need zero animation for SSR snapshots. |

## Streaming & heavy-node toggles

| Flag | Default | What it does |
| ---- | ------- | ------------ |
| `render-code-blocks-as-pre` | `false` | Render all `code_block` nodes as `<pre><code>` (uses `PreCodeNode`). Helpful when you want to avoid optional peers like Monaco or are debugging CSS collisions. |
| `code-block-stream` | `true` | Stream code blocks as content arrives. Disable to keep Monaco in a loading state until the final chunk lands—useful when incomplete code causes parser hiccups. |
| `viewport-priority` | `true` | Defers heavy work (Monaco, Mermaid) when elements are offscreen. Turn off if you need deterministic renders for PDF/print pipelines. |

## Code block header controls

Pass these props directly to `CodeBlockNode` / `MarkdownCodeBlockNode` or globally via slots:

- `show-header`
- `show-copy-button`
- `show-expand-button`
- `show-preview-button`
- `show-font-size-buttons`

See `/guide/codeblock-header` and the `CodeBlockNode` types for the exhaustive list.

## Quick example

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '# Title\n\nSome content here.'
</script>

<template>
  <MarkdownRender
    :content="md"
    custom-id="docs"
    :viewport-priority="true"
    :code-block-stream="true"
  />
</template>
```

## Styling & troubleshooting reminders

1. **Import a reset first** (`modern-css-reset`, `@tailwind base`, or `@unocss/reset`), then wrap `markstream-vue/index.css` inside `@layer components` so Tailwind/Uno utilities don’t override node styles. See the [Tailwind guide](/guide/tailwind) for concrete snippets.
2. **Scope overrides** with `custom-id` and `[data-custom-id="docs"]` selectors.
3. **Confirm peer CSS** (Mermaid, KaTeX, Monaco) is imported; missing styles produce blank renders.
4. **Check the [CSS checklist](/guide/troubleshooting#css-looks-wrong-start-here)** whenever visuals look off.
