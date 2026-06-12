---
title: 'Nuxt streaming Markdown renderer for AI chat'
description: Use markstream-vue in Nuxt 3 for AI chat streaming Markdown, SSE/WebSocket output, client-only peer guards, worker setup, and SSR-safe rendering.
---
# Nuxt streaming Markdown renderer for AI chat

`markstream-vue` works with Nuxt 3 for streaming Markdown in AI chat UIs, SSE/WebSocket output, and long documents. The key difference from pure Vue: browser-only optional peers (Mermaid, KaTeX, Monaco) must stay behind client boundaries.

## When to use markstream-vue with Nuxt

Use `markstream-vue` in Nuxt when:

- Your AI chat UI or streaming Markdown surface is in a Nuxt 3 app
- You need SSR for the page shell but client-only rendering for optional peers
- Web Workers (Mermaid/KaTeX) must work in SSR context
- You need `ClientOnly` wrappers for heavy imports

## Quick Start

```bash
pnpm add markstream-vue
```

```vue
<!-- pages/index.vue -->
<script setup>
import 'markstream-vue/index.css'
</script>

<template>
  <ClientOnly>
    <MarkdownRender
      mode="chat"
      :content="streamingContent"
      :final="isDone"
    />
  </ClientOnly>
</template>
```

## Worker setup in Nuxt

Mermaid and KaTeX use Web Workers. In Nuxt, import them client-side:

```ts
// plugins/markstream.client.ts
import { enableKatex, enableMermaid } from 'markstream-vue'
import KatexWorker from 'markstream-vue/workers/katexRenderer.worker?worker&inline'
import MermaidWorker from 'markstream-vue/workers/mermaidParser.worker?worker&inline'

export default defineNuxtPlugin(() => {
  enableMermaid({ worker: new MermaidWorker() })
  enableKatex({ worker: new KatexWorker() })
})
```

## Key considerations

- **Client-only peers**: wrap `MarkdownRender` in `<ClientOnly>` or use `.client` plugins
- **CSS order**: import `markstream-vue/index.css` after your reset/tailwind
- **SSR rendering**: the component renders server-side but optional peers won't activate until hydration
- **Mobile px CSS**: use `markstream-vue/index.px.css` if your app scales root font size

## Full guide

See [Nuxt SSR](/nuxt-ssr) for the complete Nuxt integration guide with SSR gotchas, worker setup, and performance notes.
