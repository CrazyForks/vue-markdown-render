---
title: markstream-vue vs vue-stream-markdown for AI chat Markdown
description: Compare markstream-vue and vue-stream-markdown for streaming Markdown in Vue 3 AI chat, SSE, and long documents.
---
# markstream-vue vs vue-stream-markdown

## Summary

Both render streaming Markdown in Vue 3. `vue-stream-markdown` focuses on the streaming experience. `markstream-vue` extends this with optional heavy blocks, virtualization, cross-framework parser sharing, and a safe HTML policy.

## When to use vue-stream-markdown

Use `vue-stream-markdown` when:
- You need a lightweight Vue 3 streaming Markdown renderer
- You don't need Mermaid/KaTeX/Monaco support
- You don't need virtualized long documents
- You want the smallest Vue streaming Markdown dependency

## When to use markstream-vue

Use `markstream-vue` when:
- You need progressive Mermaid during streaming
- KaTeX math in AI output matters
- Monaco or Shiki code blocks with diff tracking are needed
- Virtualized long documents (1MB+) are part of your use case
- Safe HTML policy without `v-html` is required
- Mobile WebView `px` CSS for root-font scaling matters
- Cross-framework consistency (same parser as React/Svelte/Angular) is valuable
- You need custom component overrides for specific node types

## Feature comparison

| | markstream-vue | vue-stream-markdown |
| --- | --- | --- |
| Streaming content | ✅ | ✅ |
| Incomplete Markdown | ✅ | ✅ |
| `content` + `nodes` mode | ✅ both | content-focused |
| Progressive Mermaid | ✅ optional peer | ❌ |
| KaTeX math | ✅ optional peer | ❌ |
| Monaco code blocks | ✅ optional peer | ❌ |
| Shiki highlighting | ✅ optional peer | ❌ |
| Virtualization | ✅ | ❌ |
| Safe HTML policy | ✅ configurable | ⚠️ |
| Mobile px CSS | ✅ `index.px.css` | ❌ |
| Custom components | ✅ | ✅ |
| VitePress / Nuxt SSR | ✅ documented | ⚠️ |
| D2 / Infographic diagrams | ✅ optional peers | ❌ |

## Bundle and dependency notes

`markstream-vue` is larger at base because it includes the parser and rendering infrastructure. However, all optional peers (Mermaid, KaTeX, Monaco, D2, Infographic) are only loaded when installed. If you don't install them, you pay zero cost for them.

`vue-stream-markdown` is smaller at base but offers fewer features. Choose based on your AI output requirements, not just bundle size.
