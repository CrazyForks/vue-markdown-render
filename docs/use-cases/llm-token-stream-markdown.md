---
title: LLM token stream Markdown renderer for SSE, WebSocket, and fetch streams
description: Render Markdown from LLM token streams without waiting for the final answer. Learn chunk batching, final states, incomplete Markdown handling, and renderer setup for SSE, WebSocket, and fetch streams.
lastUpdated: 2026-07-01
keywords:
  - LLM token stream Markdown renderer
  - token stream Markdown renderer
  - SSE token Markdown renderer
  - WebSocket token Markdown renderer
  - fetch stream Markdown renderer
  - incomplete LLM Markdown
faq:
  - question: Should every token from an LLM stream trigger a Markdown render?
    answer: No. Buffer small chunks and commit them at animation-frame or short interval cadence so parsing and layout stay predictable.
  - question: Does Markstream require a specific transport?
    answer: No. The renderer receives content or nodes, so the same rendering path works with SSE, WebSocket, fetch streams, or a custom transport.
  - question: What does final do in a token stream?
    answer: final marks the point where the answer is complete, allowing incomplete fences, tables, math, and heavy blocks to settle into their final rendering.
---
# LLM token stream Markdown renderer

An LLM token stream is not complete Markdown. For most of the response lifetime, the text may contain an open code fence, a partial table row, half of a link, or a KaTeX expression with no closing delimiter. A streaming renderer should show useful intermediate states without forcing the app to buffer the whole answer.

## Transport-agnostic rendering contract

Markstream only needs two pieces of state:

| State | Meaning |
| --- | --- |
| `content` | The Markdown accumulated so far |
| `final` | Whether the current answer is complete |

That contract works for SSE, WebSocket, `fetch()` streams, workers, or any custom token source.

```vue
<MarkdownRender
  mode="chat"
  :content="content"
  :final="isDone"
  :fade="false"
/>
```

## Batch tiny chunks before rendering

Fast streams can emit many tiny chunks. Batch them before committing to Vue state.

```ts
import { ref } from 'vue'

const content = ref('')
const pending = ref('')

let frameId = 0

export function appendTokenChunk(chunk: string) {
  pending.value += chunk

  if (frameId)
    return

  frameId = requestAnimationFrame(() => {
    content.value += pending.value
    pending.value = ''
    frameId = 0
  })
}
```

This keeps the renderer responsive without hiding the stream from users.

## Fetch stream example

```ts
async function streamMarkdownResponse(response: Response) {
  const reader = response.body?.getReader()
  const decoder = new TextDecoder()

  if (!reader)
    return

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break

    appendTokenChunk(decoder.decode(value, { stream: true }))
  }

  const tail = decoder.decode()
  if (tail)
    appendTokenChunk(tail)
}
```

Set `final` to `true` only after the loop finishes, the decoder has been flushed, and any pending buffered text has been committed.

## Chunking strategy

| Stream shape | Recommended approach |
| --- | --- |
| Large chunks every few hundred ms | Append directly to `content` |
| Tiny chunks many times per second | Batch with `requestAnimationFrame` |
| Very long response | Enable node virtualization and viewport priority |
| Existing parser worker | Pass pre-parsed `nodes` instead of raw `content` |

## Common mistakes

- Rendering every byte as a separate Vue state update.
- Setting `final=true` before the server sends the last chunk.
- Buffering the whole answer before showing anything to users.
- Enabling heavy optional peers globally when only a few answers need them.
- Treating WebSocket, SSE, and fetch as different renderer problems instead of different transports.

## Next steps

- Building a Vue chat UI? Read [Vue AI chat Markdown renderer](/use-cases/vue-ai-chat-markdown-renderer).
- Using SSE or WebSocket events? Read [SSE and WebSocket streaming](/use-cases/sse-websocket).
- Need stable open fences and tables? Read [Incomplete Markdown renderer](/use-cases/incomplete-markdown-renderer).
- Rendering long output? Read [Long AI responses](/use-cases/long-ai-responses).
