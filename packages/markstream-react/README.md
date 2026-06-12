# markstream-react

React/Next.js streaming Markdown renderer for AI chat, SSE/WebSocket output, long AI responses, Mermaid, KaTeX, and code blocks.

`markstream-react` is the React renderer in the Markstream family. It renders raw Markdown strings with `content`, and it can also accept pre-parsed `nodes` when a worker or store already owns parsing.

## Install

```bash
pnpm add markstream-react
```

Optional features are peer dependencies. Install only what your Markdown output needs.

## Quick Start

Import one Markstream CSS file explicitly. The JavaScript entry does not inject styles automatically.

```tsx
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

export default function ChatMessage({
  content,
  isDone,
}: {
  content: string
  isDone: boolean
}) {
  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

Use `markstream-react/index.px.css` instead when your app scales the root font size on mobile and you want renderer sizing to stay pixel-based.

## Streaming Example

For most SSE/WebSocket chat surfaces, accumulate the Markdown string and pass `content` plus `final`:

```tsx
import MarkdownRender from 'markstream-react'
import { useEffect, useState } from 'react'
import 'markstream-react/index.css'

export function ChatView() {
  const [content, setContent] = useState('')
  const [isDone, setIsDone] = useState(false)

  useEffect(() => {
    const eventSource = new EventSource('/api/chat/stream')
    eventSource.onmessage = (event) => {
      if (event.data === '[DONE]') {
        setIsDone(true)
        eventSource.close()
        return
      }

      const data = JSON.parse(event.data) as { content?: string }
      setContent(prev => prev + (data.content ?? ''))
    }

    return () => eventSource.close()
  }, [])

  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

If parsing is already external, pass `nodes`. Use a per-message parser id so generated code-block DOM ids stay unique across chat lists.

```tsx
import MarkdownRender from 'markstream-react'
import { useMemo } from 'react'
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'

export function ParsedChatMessage({
  messageId,
  content,
  isDone,
}: {
  messageId: string
  content: string
  isDone: boolean
}) {
  const md = useMemo(() => getMarkdown(`chat-${messageId}`), [messageId])
  const nodes = useMemo(
    () => parseMarkdownToStructure(content, md, { final: isDone }),
    [content, isDone, md],
  )

  return <MarkdownRender nodes={nodes} final={isDone} fade={false} />
}
```

## Next.js SSR

Import styles once from your app shell:

```tsx
// app/layout.tsx or pages/_app.tsx
import 'markstream-react/index.css'
```

Use the root package in client components for live SSE/WebSocket streams:

```tsx
'use client'

import MarkdownRender from 'markstream-react'

export function LiveMessage({ content, isDone }: { content: string, isDone: boolean }) {
  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

Use `markstream-react/next` for SSR-first Markdown with client enhancement, or `markstream-react/server` for server-only rendering:

```tsx
import MarkdownRender from 'markstream-react/next'

export default function Page() {
  return <MarkdownRender content="# Server HTML first" final />
}
```

## Optional Peers

| Feature | Package |
| --- | --- |
| Shiki code blocks | `stream-markdown` |
| Monaco editor code blocks | `stream-monaco` |
| Mermaid diagrams | `mermaid` |
| KaTeX math | `katex` |
| D2 diagrams | `@terrastruct/d2` |
| Infographic blocks | `@antv/infographic` |

KaTeX still needs its CSS in your app when math rendering is enabled:

```tsx
import 'katex/dist/katex.min.css'
```

## Tailwind

Non-Tailwind projects should import the precompiled CSS:

```tsx
import 'markstream-react/index.css'
```

Tailwind projects can import the Tailwind-ready CSS and include the extracted class list in `tailwind.config.js`:

```tsx
import 'markstream-react/index.tailwind.css'
```

```js
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    require('markstream-react/tailwind'),
  ],
}
```

## Custom Components

Register custom renderers with `setCustomComponents`. Custom tag-like blocks are exposed as nodes with `type` equal to the tag name when the parser is configured for that tag.

```tsx
import type { NodeComponentProps } from 'markstream-react'
import MarkdownRender, { setCustomComponents } from 'markstream-react'

function ThinkingNode(props: NodeComponentProps<{ type: 'thinking', content: string }>) {
  return <MarkdownRender content={props.node.content} fade={false} />
}

setCustomComponents('chat', { thinking: ThinkingNode })
```

## When Not to Use It

Use `react-markdown`, `marked`, or `markdown-it` when you only render short static Markdown, need the smallest possible Markdown stack, or already have a complete remark/rehype pipeline and do not need streaming mid-state handling.

## Type Exports

The package root exports the public component and renderer types, including `NodeRendererProps`, `NodeComponentProps`, `RenderContext`, `RenderNodeFn`, `CustomComponentMap`, and code-block option types.

## Development

```bash
pnpm --filter markstream-react dev
pnpm --filter markstream-react build
pnpm --filter markstream-react check:exports
pnpm --filter markstream-react size:check
```
