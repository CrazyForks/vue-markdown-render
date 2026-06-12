---
title: 'Next.js streaming Markdown renderer for AI chat'
description: Use markstream-react in Next.js App Router or Pages Router for AI chat streaming Markdown, SSE/WebSocket output, client-only peer guards, and SSR-safe rendering.
---
# Next.js streaming Markdown renderer for AI chat

`markstream-react` works with Next.js (App Router and Pages Router) for streaming Markdown in AI chat UIs, SSE/WebSocket output, and long documents. The key difference from pure React: browser-only optional peers (Mermaid, KaTeX, Monaco) must stay behind client boundaries.

## When to use markstream-react with Next.js

Use `markstream-react` in Next.js when:

- Your AI chat UI or streaming Markdown surface is in a Next.js app
- You need SSR/SSG for the page shell but client-only rendering for optional peers
- Web Workers (Mermaid/KaTeX) must work in the Next.js SSR context
- You need `'use client'` directives for the renderer component

## Quick Start

```bash
pnpm add markstream-react
```

```tsx
// app/components/ChatMessage.tsx
'use client'

import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

export function ChatMessage({ content, isDone }: { content: string, isDone: boolean }) {
  return (
    <MarkdownRender
      content={content}
      final={isDone}
      fade={false}
    />
  )
}
```

## Server Component pattern

For Next.js App Router, keep `MarkdownRender` in a client component and pass content from server components:

```tsx
// app/chat/page.tsx (Server Component)
import { ChatMessage } from './ChatMessage'

export default async function ChatPage() {
  // Fetch initial data server-side
  return <ChatMessage content={initialContent} isDone={false} />
}
```

## Worker setup in Next.js

```tsx
// app/components/MarkstreamProvider.tsx
'use client'

import { enableKatex, enableMermaid } from 'markstream-react'
import { useEffect } from 'react'

export function MarkstreamProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    import('markstream-react/workers/mermaidParser.worker?worker&inline').then(({ default: MermaidWorker }) => {
      enableMermaid({ worker: new MermaidWorker() })
    })
    import('markstream-react/workers/katexRenderer.worker?worker&inline').then(({ default: KatexWorker }) => {
      enableKatex({ worker: new KatexWorker() })
    })
  }, [])
  return <>{children}</>
}
```

## Key considerations

- **'use client'**: the renderer component must be a client component
- **CSS order**: import `markstream-react/index.css` in your client component or layout
- **Worker imports**: use dynamic `import()` or `?worker&inline` for worker setup
- **Optional peers**: Mermaid, KaTeX, Monaco are optional — only install what your AI output needs

## Full guides

- [React Quick Start](/guide/react-quick-start)
- [React Installation](/guide/react-installation)
- [Next.js SSR](/guide/react-next-ssr)
