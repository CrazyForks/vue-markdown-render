---
title: AI chat streaming Markdown — use cases and patterns
description: Render streaming Markdown from LLMs in AI chat UIs using Markstream. Patterns for token-by-token output, SSE, WebSocket, and batched rendering across Vue, React, Svelte, and Angular.
---
# AI chat streaming Markdown

## The challenge

When an LLM generates Markdown token-by-token, the content is **incomplete most of the time**. A regular Markdown renderer will flicker, error, or render garbage during the streaming phase. Markstream is designed to handle these intermediate states gracefully.

## Key streaming patterns

### 1. Raw content mode (simplest)

Pass the accumulating Markdown string directly. Markstream handles the parsing and rendering.

```tsx
// React
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

function ChatMessage({ content, isDone }: { content: string, isDone: boolean }) {
  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

```vue
<!-- Vue -->
<template>
  <MarkdownRender mode="chat" :content="content" :final="isDone" :fade="false" />
</template>
```

### 2. Pre-parsed nodes mode (high-frequency)

Parse outside the renderer when you want explicit control over parse frequency, batching, and parser instance reuse.

```tsx
import MarkdownRender from 'markstream-react'
import { useMemo } from 'react'
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'

function ChatMessage({ content, isDone }: { content: string, isDone: boolean }) {
  const md = useMemo(() => getMarkdown('chat-message'), [])
  const nodes = useMemo(
    () => parseMarkdownToStructure(content, md, { final: isDone }),
    [content, isDone, md],
  )

  return <MarkdownRender nodes={nodes} final={isDone} fade={false} />
}
```

### 3. Smooth pacing (typewriter effect)

```tsx
<MarkdownRender
  content={content}
  final={isDone}
  typewriter
  smoothStreaming="auto"
  smoothStreamingOptions={{
    maxCommitFps: 30,
    minCharsPerSecond: 45,
    maxCharsPerSecond: 1200,
    targetLatencyMs: 900,
  }}
  fade={false}
/>
```

- `typewriter` shows a blinking cursor while streaming
- `smooth-streaming="auto"` paces content insertion for a natural reading experience
- `smoothStreamingOptions` controls pacing speed — adjust `maxCharsPerSecond` for faster/slower display
- `fade={false}` prevents opacity animation restarts on each update

## SSE integration

```tsx
// React SSE example
function ChatView() {
  const [content, setContent] = useState('')
  const [isDone, setIsDone] = useState(false)

  useEffect(() => {
    const eventSource = new EventSource('/api/chat/stream')
    eventSource.onmessage = (event) => {
      if (event.data === '[DONE]') {
        setIsDone(true)
        eventSource.close()
      }
      else {
        setContent(prev => prev + JSON.parse(event.data).content)
      }
    }
    return () => eventSource.close()
  }, [])

  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

## WebSocket integration

Same pattern as SSE — accumulate the content string or build a `nodes` array incrementally, then pass to the renderer.

## Mode selection

| Mode | Best for | Defaults |
| --- | --- | --- |
| `chat` | AI chat, SSE, token streams | Steady pacing, no fade, smaller batches |
| `docs` | Completed documents, VitePress | Fade enabled, tooltips, larger batches |
| `minimal` | Lightweight surfaces | Same as `chat` defaults, neutral name |

Keep the mode stable for a given surface. Switch pacing/animation props (`smooth-streaming`, `typewriter`, `fade`) instead of changing modes mid-stream.

## Framework-specific guides

- [Vue 3 AI Chat & Streaming](/guide/ai-chat-streaming)
- [React Quick Start](/guide/react-quick-start)
- [Svelte Quick Start](/guide/svelte)
- [Angular Quick Start](/guide/angular-quick-start)
