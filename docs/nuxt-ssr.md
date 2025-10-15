# Nuxt 3 SSR usage (example)

> 中文版请查看 [nuxt-ssr.zh-CN.md](./nuxt-ssr.zh-CN.md)。

This short recipe shows a minimal, safe way to use `vue-renderer-markdown` in Nuxt 3 so that client-only features (Monaco, Mermaid, Web Workers) are only initialized in the browser.

## Install peers (client-side)

Install the peers you need in your Nuxt app. For example, to enable Mermaid and Monaco editor previews (optional):

```bash
# pnpm (recommended)
pnpm add mermaid vue-use-monaco

# npm
npm install mermaid vue-use-monaco
```

Do NOT import these peers from server-only code paths during SSR.

## Example page (client-only wrapper)

Create a page or component that defers mounting the renderer to the client. Nuxt provides a `<client-only>` built-in wrapper which is perfect:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import MarkdownRender from 'vue-renderer-markdown'

const markdown = ref(`# Hello from Nuxt 3\n\nThis content is rendered only on the client.`)
</script>

<template>
  <client-only>
    <MarkdownRender :content="markdown" />
  </client-only>
</template>
```

This ensures the `MarkdownRender` component (and any optional peers it lazy-loads) are only imported/initialized in the browser.

## Server-rendered diagrams or math

If you need server-rendered HTML for diagrams or math (so crawlers or first paint include them), pre-render those outputs during your build step or via a small server-side task. Example approaches:

- Use a build script that runs `mermaid-cli` / `katex` to convert certain diagrams/formulas to HTML/SVG during content generation and embed the resulting HTML into the page.
- Use a server endpoint that returns pre-rendered diagram SVG/HTML and fetch it on the client as needed.

Then pass pre-rendered fragments into the renderer as trusted HTML or a server-side AST so the client avoids heavy initialization for those artifacts.

## Notes

- Prefer `client-only` when using Monaco Editor, Web Workers, or progressive Mermaid.
- The library is designed to be import-safe during SSR: heavy peers are lazy-loaded in the browser and many DOM/Worker usages are guarded. If you see an import-time ReferenceError, please provide the stack trace.

---

If you'd like, I can also add a ready-to-run Nuxt 3 playground example under `playground/` (small project + page) that shows this integration end-to-end.
