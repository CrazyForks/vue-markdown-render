---
title: 'React streaming Markdown renderer for AI chat'
description: Use markstream-react to render token-by-token or chunked Markdown in React, Next.js, Remix, SSE, WebSocket, and AI chat UIs with optional Mermaid, KaTeX, Shiki, and Monaco.
---
# React streaming Markdown renderer for AI chat

`markstream-react` renders Markdown that updates while an LLM response is streaming. Use it for React, Next.js, Remix, SSE, WebSocket, AI chat UIs, long Markdown answers, progressive Mermaid diagrams, KaTeX math, and streaming code blocks.

It is **not** a generic replacement for every static Markdown page. For short static content, `react-markdown` may be enough. Use `markstream-react` when streaming UX, incomplete Markdown states, long outputs, or heavy blocks matter.

## When to use markstream-react

Use `markstream-react` when:

- Content streams from an LLM, SSE, or WebSocket
- Incomplete Markdown states must not flicker (unclosed fences, partial math)
- Long AI responses or long transcripts matter
- Mermaid/KaTeX/code blocks appear during streaming
- You want Markstream's cross-framework parser behavior
- You need virtualized long documents with bounded live nodes

Use `react-markdown` when:

- Content is static or short
- You already have sanitizer/plugin setup
- You do not need token-by-token UX
- You want the smallest familiar React Markdown stack

## Quick Start

```bash
pnpm add markstream-react
```

```tsx
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

export default function ChatMessage({ content, isDone }: { content: string, isDone: boolean }) {
  return (
    <MarkdownRender
      content={content}
      final={isDone}
      fade={false}
    />
  )
}
```

## Next.js setup

```tsx
// In Next.js App Router, mark the component with 'use client'
'use client'
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'
```

For SSR safety with optional peers, see the [React installation guide](/guide/react-installation).

## Key capabilities

- **Two render modes**: `content` (raw Markdown strings) and `nodes` (pre-parsed AST)
- **Streaming SSE/WebSocket**: parse outside and pass `nodes` for high-frequency token streams
- **Progressive Mermaid**: diagrams render incrementally
- **Streaming code blocks**: with diff tracking
- **Virtualized long documents**: for 1MB+ content
- **Optional peers**: Mermaid, KaTeX, Monaco — install only what you need
- **TypeScript-first**: full type coverage

## Framework integration

| Integration | Guide |
| --- | --- |
| React 18/19 | [React Quick Start](/guide/react-quick-start) |
| Next.js (App Router) | [React Installation](/guide/react-installation) |
| Next.js SSR safety | [Next.js SSR](/guide/react-next-ssr) |
| AI Chat / SSE | [AI Chat & Streaming](/guide/ai-chat-streaming) |
| Migrate from react-markdown | [Migration guide](/guide/react-markdown-migration) |

## vs react-markdown and Streamdown

| | markstream-react | react-markdown | Streamdown |
| --- | --- | --- | --- |
| Streaming-first | ✅ | ❌ | ✅ |
| Incomplete Markdown | ✅ handles unclosed fences | ❌ may error | ✅ |
| Progressive Mermaid | ✅ | ❌ | ❌ |
| Virtualized long docs | ✅ | ❌ | ❌ |
| Cross-framework parser | ✅ | ❌ | ❌ |
| Static Markdown | ✅ (overhead) | ✅ (best fit) | ✅ |

For a detailed comparison, see [markstream-react vs react-markdown](/compare/react-markdown) and [markstream-react vs Streamdown](/compare/streamdown).

## Try it

- [Live playground](https://markstream-react.pages.dev/)
- [Full documentation](/guide/react-quick-start)
