---
title: 'Svelte 5 streaming Markdown renderer for AI chat'
description: Use markstream-svelte to render streamed Markdown in Svelte 5 AI chat, SSE, WebSocket, long documents, custom components, Mermaid, KaTeX, Shiki, and Monaco.
---
# Svelte 5 streaming Markdown renderer for AI chat

`markstream-svelte` is the Svelte 5 renderer in the Markstream family. It provides the same component names, worker helpers, and streaming behavior as the Vue and React packages.

**Svelte 4 is not supported.**

## When to use markstream-svelte

Use `markstream-svelte` when:

- Content streams from an LLM, SSE, or WebSocket into a Svelte 5 app
- Incomplete Markdown states must not flicker
- Long AI responses or long documents matter
- Mermaid/KaTeX/code blocks appear during streaming
- You need Markstream's cross-framework parser behavior
- You need custom Svelte 5 components inside Markdown

## Quick Start

```bash
pnpm add markstream-svelte svelte@^5
```

```svelte
<script lang="ts">
  import MarkdownRender from 'markstream-svelte'
  import 'markstream-svelte/index.css'

  let { content = '# Hello from markstream-svelte' }: { content?: string } = $props()
</script>

<MarkdownRender {content} />
```

## Streaming SSE example

```svelte
<script lang="ts">
  import MarkdownRender from 'markstream-svelte'
  import 'markstream-svelte/index.css'

  let content = $state('')
  let final = $state(false)
</script>

<MarkdownRender {content} {final} fade={false} />
```

## Key capabilities

- **Svelte 5 runes**: uses `$props()`, `$state()`, `$derived()`
- **Two render modes**: `content` and `nodes`
- **Custom components**: slot Svelte components into Markdown
- **Optional peers**: Mermaid, KaTeX, Monaco, D2, Infographic
- **Worker parity**: same Katex/Mermaid worker setup as Vue/React

## Package maturity

`markstream-svelte` is at `0.0.1-beta.6`. Check the [Svelte guide](/guide/svelte) for current API maturity and known limitations.

## Try it

- [Live playground](https://markstream-svelte.pages.dev/)
- [Full documentation](/guide/svelte)
