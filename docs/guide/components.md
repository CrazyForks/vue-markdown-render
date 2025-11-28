### LinkNode: Underline Animation & Color Customization
`LinkNode` (the internal node used to render anchors) supports runtime customization of underline animation and color via props—no need to override global CSS. Defaults preserve the previous appearance.

Available props (pass to the component that renders `LinkNode`):
| Name | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `color` | `string` | `#0366d6` | Link text color (any valid CSS color). The underline uses `currentColor`, so it follows this color. |
| `underlineHeight` | `number` | `2` | Underline thickness in pixels. |
| `underlineBottom` | `number \| string` | `-3px` | Offset from the text baseline; accepts px or any CSS length (e.g., `0.2rem`). |
| `animationDuration` | `number` | `0.8` | Total animation duration in seconds. |
| `animationOpacity` | `number` | `0.9` | Underline opacity. |
| `animationTiming` | `string` | `linear` | CSS timing function (e.g., `linear`, `ease`, `ease-in-out`). |
| `animationIteration` | `string \| number` | `infinite` | Animation iteration count or `'infinite'`. |
| `showTooltip` | `boolean` | `true` | Whether to show the custom singleton tooltip on hover/focus. When `false`, the link `title` attribute is set to the link href/title/text (for native browser tooltip). |

Example:
```vue
<template>
  <!-- Default styling -->
  <LinkNode :node="node" />
  <!-- Custom color and underline styling -->
  <LinkNode
    :node="node"
    color="#e11d48"
    :underline-height="3"
    underline-bottom="-4px"
    :animation-duration="1.2"
    :animation-opacity="0.8"
    animation-timing="ease-in-out"
    :show-tooltip="false"
  />
</template>
```
Notes:
- The underline color uses `currentColor`, so by default it matches the `color` prop. If you need an independent underline color, consider a small local CSS override or opening an issue to discuss exposing an `underlineColor` prop.
- All props are optional; when omitted, sensible defaults are used to preserve backward compatibility.
- `showTooltip` defaults to `true`. When enabled, hovering or focusing a link opens the library's singleton tooltip that shows the link href (or title/text). If you prefer the browser's native tooltip instead (or need accessibility behavior relying on `title`), set `:show-tooltip="false"` — the component will expose the link href/title/text via the `title` attribute in that case.
# API Reference — Components

This page documents the most commonly used components and props.

## MarkdownRender
Props

Try this (quick) — render with `MarkdownRender`:

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '# Component test\n\nThis is a paragraph.'
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```
### CodeBlockNode
Feature-rich code block with Monaco integration (optional peers: `stream-monaco`)

### MarkdownCodeBlockNode
Lightweight syntax highlighting (requires `shiki`, `stream-markdown`)
- Props mirror `CodeBlockNode` but use `shiki` themes

### MermaidNode
- Renders progressive Mermaid diagrams when `mermaid` peer is available
- `node` — Mermaid codeblock node

### Utility functions
- `getMarkdown()` — create configured `markdown-it-ts` instance
- `parseMarkdownToStructure()` — parse and return AST nodes
- `setCustomComponents(id?, mapping)` — register node renderers

For full prop types, see the `types` export or the `packages/markdown-parser/README.md` which includes the public TypeScript interfaces.

## ImageNode — Custom preview handling

`ImageNode` renders images and emits `click`, `load` and `error` events so you can implement custom preview behavior (lightbox/modal) without replacing the renderer.

For a full example (wrapper component + VitePress registration), see the dedicated guide: [ImageNode — Custom preview handling](/guide/image-node.md).

Quick summary:
- `click` payload: `[Event, string]` — the second value is the effective image `src` (may be a fallback).
- `load` / `error` payload: the image `src`.

Common approach: create a wrapper that intercepts `click`, opens a preview, then register it via `setCustomComponents` in the client app.
