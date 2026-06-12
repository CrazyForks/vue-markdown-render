---
title: 'Svelte 5 streaming Markdown renderer for AI chat'
description: Use markstream-svelte to render streamed Markdown in Svelte 5 AI chat, SSE, WebSocket, long documents, custom components, Mermaid, KaTeX, and Monaco.
softwareName: markstream-svelte
softwarePackage: markstream-svelte
npmPackage: markstream-svelte
softwareFramework: Svelte
softwareProgrammingLanguage:
  - TypeScript
  - Svelte
softwareRuntimePlatform:
  - Svelte 5
faq:
  - question: Does markstream-svelte support Svelte 4?
    answer: No. markstream-svelte requires Svelte 5.
  - question: When should I use markstream-svelte?
    answer: Use it for Svelte 5 AI chat, SSE/WebSocket output, long responses, custom Svelte components, or progressive Mermaid and KaTeX.
  - question: Is markstream-svelte as mature as markstream-vue?
    answer: No. markstream-svelte is beta and newer than the Vue renderer.
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

## Optional peers and what they enable

| Peer | Enables |
| --- | --- |
| `mermaid` | Mermaid diagrams |
| `katex` | Inline and block math rendering |
| `stream-monaco` | Monaco-powered code blocks |
| `@terrastruct/d2` | D2 diagrams |
| `@antv/infographic` | Infographic blocks |

Shiki is not documented for `markstream-svelte` unless you add a supported integration path.

## When not to use this package

- You are on Svelte 4
- You only render short static Markdown and do not need streaming mid-state handling
- Your app already has a simpler static Markdown stack that covers all content types

## Known limitations / maturity

- **Svelte 5 runes**: uses `$props()`, `$state()`, `$derived()`
- **Two input paths**: raw `content` and pre-parsed `nodes`
- **Custom components**: slot Svelte components into Markdown
- **Optional peers**: Mermaid, KaTeX, Monaco, D2, Infographic
- **Worker parity**: same Katex/Mermaid worker setup as Vue/React
- **Beta status**: check npm and the [Svelte guide](/guide/svelte) for the latest API maturity

## Try it

- [Live playground](https://markstream-svelte.pages.dev/)
- [Full documentation](/guide/svelte)
