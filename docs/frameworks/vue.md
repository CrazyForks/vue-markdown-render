---
title: 'Vue and Nuxt streaming Markdown renderer for AI chat'
description: Use markstream-vue to render streamed Markdown in Vue 3, Nuxt, VitePress, SSE, WebSocket, AI chat UIs, mobile WebView, and long documents with optional Mermaid, KaTeX, Shiki, and Monaco.
softwareName: markstream-vue
softwarePackage: markstream-vue
npmPackage: markstream-vue
softwareFramework: Vue
softwareProgrammingLanguage:
  - TypeScript
  - Vue
softwareRuntimePlatform:
  - Vue 3
  - Nuxt
  - VitePress
---
# Vue and Nuxt streaming Markdown renderer for AI chat

`markstream-vue` renders Markdown that updates while an LLM response is streaming. Use it for Vue 3, Nuxt, VitePress, SSE, WebSocket, AI chat UIs, long Markdown answers, progressive Mermaid diagrams, KaTeX math, and streaming code blocks.

## When to use markstream-vue

Use `markstream-vue` when:

- Content streams from an LLM, SSE, or WebSocket
- Incomplete Markdown states must not flicker
- Long AI responses or long documents matter
- Mermaid/KaTeX/code blocks appear during streaming
- You need Vue/Nuxt/VitePress component rendering
- You want raw `content` and pre-parsed `nodes` both supported
- Mobile WebView `px` CSS for root-font scaling matters
- You need a safe HTML policy without `v-html`

Use a simpler alternative when:

- You only render short static Markdown in Vue
- You already have a sanitizer/plugin setup and don't need streaming UX

## Quick Start

```bash
pnpm add markstream-vue
```

```vue
<script setup>
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'
</script>

<template>
  <MarkdownRender
    mode="chat"
    :content="streamingContent"
    :final="isDone"
    smooth-streaming="auto"
    :fade="false"
  />
</template>
```

## Key capabilities

- **Two render modes**: `content` (raw Markdown strings) and `nodes` (pre-parsed AST)
- **Safe HTML policy**: `safe` by default, `escape` for literal text, `trusted` for trusted content only — no `v-html` required
- **Progressive Mermaid**: diagrams render incrementally during streaming
- **Streaming code blocks**: Monaco/Shiki with diff tracking
- **Virtualized long documents**: bounded live nodes for 1MB+ content
- **Optional peers**: Mermaid, KaTeX, Monaco, D2, Infographic — install only what you need
- **Mobile-ready**: `index.px.css` for apps that scale root font size
- **SSR-safe**: worker imports and client-only guards for Nuxt/VitePress

## Framework integration

| Integration | Guide |
| --- | --- |
| Vue 3 | [Installation](/guide/installation) |
| Nuxt | [Nuxt SSR](/nuxt-ssr) |
| VitePress | [Docs Site & VitePress](/guide/vitepress-docs-integration) |
| AI Chat / SSE | [AI Chat & Streaming](/guide/ai-chat-streaming) |

## Optional peers

```bash
pnpm add mermaid katex   # diagrams and math
pnpm add stream-monaco    # Monaco code blocks
pnpm add @antv/infographic @terrastruct/d2  # additional diagram types
```

## Try it

- [Live playground](https://markstream-vue.simonhe.me/)
- [Nuxt playground](https://markstream-nuxt.pages.dev/)
- [Full documentation](/guide/)
