# Usage & API

This page provides short usage examples and points to advanced customization: parse hooks, rendering strategies and code block options.

- `getMarkdown()` — get a configured `markdown-it-ts` instance and options
- `parseMarkdownToStructure()` — transform tokens to the AST nodes used by the renderer
- Components: `MarkdownRender`, `CodeBlockNode`, `MarkdownCodeBlockNode`, `MermaidNode`.

### Streaming vs Basic modes

- Streaming Markdown: excellent for AI model responses and real-time previews. It updates in small tokens to avoid re-parsing entire documents
- Basic Usage: simply pass a static `content` string to `MarkdownRender` for regular pre-generated Markdown

### Props and options

(See README for a full props table; this page is a condensed version.)

- `content` (string) — required unless `nodes` provided
- `nodes` (BaseNode[]) — optional AST node input
- `renderCodeBlocksAsPre` — boolean
- `codeBlockStream` — boolean
- `viewportPriority` — boolean

### Advanced

Call `setCustomComponents` to override internal node rendering. For example, to use `MarkdownCodeBlockNode` instead of `CodeBlockNode` for `code_block` nodes.

For parse hooks, use `parseMarkdownToStructure` options: `preTransformTokens`, `postTransformTokens`, and `postTransformNodes`.

Try this — a minimal render snippet for the API page:

```vue
<script setup>
import MarkdownRender from 'markstream-vue'

const md = '# API quick test\n\nThis page shows a quick render example.'
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```
