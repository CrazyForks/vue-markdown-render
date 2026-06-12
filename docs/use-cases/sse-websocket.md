---
title: SSE and WebSocket Markdown streaming — use Markstream for real-time AI output
description: Render Markdown from SSE and WebSocket streams in Vue, React, Svelte, and Angular. Patterns for token-by-token rendering, batched updates, and graceful incomplete states.
---
# SSE and WebSocket Markdown streaming

## Why streaming Markdown is different

SSE (Server-Sent Events) and WebSocket deliver text incrementally. When that text is Markdown, you need a renderer that:

- Handles **unclosed syntax** (code fences, math blocks, HTML tags)
- **Minimizes DOM thrash** during high-frequency updates
- **Doesn't re-parse the entire document** on every chunk
- Supports **progressive heavy blocks** (Mermaid, KaTeX, code)

## SSE example (Vue 3)

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { ref } from 'vue'
import 'markstream-vue/index.css'

const content = ref('')
const isDone = ref(false)

const eventSource = new EventSource('/api/chat/stream')

eventSource.onmessage = (event) => {
  if (event.data === '[DONE]') {
    isDone.value = true
    eventSource.close()
  }
  else {
    content.value += JSON.parse(event.data).content
  }
}
</script>

<template>
  <MarkdownRender
    mode="chat"
    :content="content"
    :final="isDone"
    :fade="false"
  />
</template>
```

## SSE example (React)

```tsx
import MarkdownRender from 'markstream-react'
import { useEffect, useState } from 'react'
import 'markstream-react/index.css'

export function SSEStreamView() {
  const [content, setContent] = useState('')
  const [isDone, setIsDone] = useState(false)

  useEffect(() => {
    const es = new EventSource('/api/chat/stream')
    es.onmessage = (e) => {
      if (e.data === '[DONE]') {
        setIsDone(true)
        es.close()
      }
      else {
        setContent(prev => prev + JSON.parse(e.data).content)
      }
    }
    return () => es.close()
  }, [])

  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

## WebSocket example

```tsx
// WebSocket — same pattern as SSE, different transport
const ws = new WebSocket('wss://api.example.com/chat/stream')
ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  if (data.done)
    setIsDone(true)
  else setContent(prev => prev + data.content)
}
```

## Performance tips

### 1. Batch updates

Don't render on every single token. Buffer chunks and update at ~30-60fps.

```tsx
const bufferRef = useRef('')
const frameRef = useRef<number>()

ws.onmessage = (event) => {
  bufferRef.current += JSON.parse(event.data).content
  if (!frameRef.current) {
    frameRef.current = requestAnimationFrame(() => {
      setContent(prev => prev + bufferRef.current)
      bufferRef.current = ''
      frameRef.current = undefined
    })
  }
}
```

### 2. Use nodes mode for high-frequency streams

```tsx
// Parse once per batch, not per render
const parser = useMemo(() => createMarkdownParser(), [])
const nodes = useMemo(() => parseMarkdownToStructure(content, parser), [content])
return <MarkdownRender nodes={nodes} final={isDone} />
```

### 3. Control pacing

```tsx
<MarkdownRender
  content={content}
  final={isDone}
  smoothStreaming="auto" // smooth pacing
  fade={false} // no opacity flicker
  deferNodesUntilVisible // lazy render off-screen nodes
/>
```

## Handling incomplete states

Markstream renders these gracefully:

| Partial state | Behavior |
| --- | --- |
| `` ```js ` (unclosed fence) | Renders as plain text until fence completes |
| `$$ E = mc` (partial math) | Renders as plain text until `$$` closes |
| `| Header |` (partial table) | Renders as text until table syntax is valid |
| `<thinking>` (unclosed HTML) | Renders as text until tag closes (or according to safe HTML policy) |

## Security for streamed content

When streaming from an LLM, the content may include HTML. Use the safe HTML policy:

```tsx
<MarkdownRender
  content={content}
  htmlPolicy="escape" // escape all HTML (safest)
  // or htmlPolicy="allowlist" with a custom allowlist
/>
```

## Full guides

- [AI Chat & Streaming](/guide/ai-chat-streaming)
- [Performance](/guide/performance)
- [Security](/guide/security)
