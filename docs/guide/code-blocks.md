# Code Block Rendering

## Overview

Code blocks can be rendered in three ways depending on which optional dependencies you install and how you configure the library:

- Enhanced surface (recommended for large or interactive code blocks): install `stream-diffs` for File and FileDiff rendering, syntax highlighting, and diff interactions. `CodeBlockNode` loads the core runtime on demand after the code block has completed streaming and entered the viewport.
- Shiki (MarkdownCodeBlockNode): install `stream-markdown` and override the `code_block` node via `setCustomComponents` to use a lightweight Markdown-driven renderer.
- Fallback (no extra deps): if neither optional package is installed, code blocks render as plain `<pre><code>` blocks with basic styling.

## stream-diffs surface (recommended)

- Install:

```bash
pnpm add stream-diffs
# or
npm i stream-diffs
```

- Boundary: the `stream-diffs` root entry is framework-agnostic. Its controllers receive an `HTMLElement` and plain code/diff data; it has no Vue lifecycle. `stream-diffs/vue` is a separate optional convenience entry and is not used by `markstream-vue`.
- Behavior: this Vue adapter keeps the stable `PreCodeNode` representation while content is streaming. Once the block is complete and visible, `CodeBlockNode` mounts one `stream-diffs` File or FileDiff surface and applies language highlighting.
- `CodeBlockShell` owns the title and action bar. The inner `data-diffs-header` is disabled so File surfaces do not render a second header.
- No worker plugin or extra CSS import is required for this integration. See also: [/guide/monaco](/guide/monaco) for runtime and preload details.

## Shiki mode (MarkdownCodeBlockNode)

- Install:

```bash
pnpm add stream-markdown
# or
npm i stream-markdown
```

- Override the `code_block` node via `setCustomComponents` to register the Shiki-based renderer:

```ts twoslash
import { MarkdownCodeBlockNode, setCustomComponents } from 'markstream-vue'

setCustomComponents({ code_block: MarkdownCodeBlockNode })
```

Once set, `MarkdownCodeBlockNode` (powered by Shiki via `stream-markdown`) will be used for `code_block` nodes. You can also supply your own component that uses `stream-markdown` directly.

### Language icon lazy loading

To keep the main bundle smaller, infrequent language icons are split into an async chunk:

- Common languages (JS/TS/HTML/CSS/JSON/Python/etc.) stay in the main bundle.
- Rare languages load on demand and will update icon output automatically after the async chunk resolves.
- If you prefer to avoid first-hit fallback icons, preload once during app idle:

```ts twoslash
import { preloadExtendedLanguageIcons } from 'markstream-vue'

if (typeof window !== 'undefined')
  void preloadExtendedLanguageIcons()
```

### Vue CLI 4 (Webpack 4) notes

If you use Vue CLI 4 (Webpack 4), it’s recommended to use the Shiki mode for code blocks and **override** `code_block` to avoid Monaco + legacy-bundler edge cases.

Key pitfalls and fixes (see `playground-vue2-cli`):

- Webpack 4 doesn’t support `package.json#exports` → prefer `dist/*` paths via `resolve.alias`.
- ESM-only packages (like `stream-markdown`) may not be discoverable via `require.resolve()` inside `vue.config.js` (CJS) → use a filesystem fallback to find `node_modules/stream-markdown`, and alias it to `dist/index.js`.
- If you use `IgnorePlugin` to skip optional deps, don’t accidentally ignore `stream-markdown` (otherwise you’ll get `webpackMissingModule` at runtime).

## Fallback

If you don't install either optional package the renderer falls back to a simple `pre`/`code` representation.

## Links & further reading

- Worker / SSR guidance: [/nuxt-ssr](/nuxt-ssr)
- Installation notes: [/guide/installation](/guide/installation)

Try this — simple CodeBlock render:

```vue twoslash
<script setup lang="ts">
import type { CodeBlockNodeProps } from 'markstream-vue'
import { CodeBlockNode } from 'markstream-vue'

const node = {
  type: 'code_block',
  language: 'js',
  code: 'console.log(42)',
  raw: 'console.log(42)',
} satisfies CodeBlockNodeProps['node']
</script>

<template>
  <CodeBlockNode :node="node" />
</template>
```
