# markstream-react vs react-markdown for streaming AI Markdown

## Summary

Use `react-markdown` when:
- content is static or short
- you already have sanitizer/plugin setup
- you do not need token-by-token UX
- you want the smallest familiar React Markdown stack

Use `markstream-react` when:
- content streams from an LLM, SSE, or WebSocket
- incomplete Markdown states must not flicker (unclosed fences, partial math)
- long responses or long transcripts matter
- Mermaid/KaTeX/code blocks appear during streaming
- you want Markstream's cross-framework parser behavior

## Quick comparison

| | markstream-react | react-markdown |
| --- | --- | --- |
| Streaming-first | ✅ | ❌ |
| Incomplete Markdown | ✅ handles unclosed fences | ❌ may error or flicker |
| Progressive Mermaid | ✅ | ❌ |
| Streaming code blocks | ✅ with diff tracking | ❌ |
| KaTeX math during stream | ✅ | ⚠️ needs manual handling |
| Virtualized long docs | ✅ bounded live nodes | ❌ |
| content prop | ✅ raw Markdown strings | ✅ |
| nodes prop | ✅ pre-parsed AST | ❌ |
| Cross-framework parser | ✅ shared with Vue/Svelte/Angular | ❌ |
| Bundle size | larger (streaming features) | smaller |
| Ecosystem maturity | newer | very mature |

## Why streaming changes everything

When `react-markdown` receives new content, it re-parses and re-renders the entire Markdown tree. For streaming AI output that updates 10-30 times per second, this causes:

- **Flicker**: complete re-renders break CSS transitions and cause visual jumps
- **Errors on incomplete syntax**: unclosed ` ``` ` fences, partial `$$` math, half-written tables can throw parse errors
- **Performance degradation**: per-token re-renders compound on long responses

`markstream-react` is designed around these problems:

- **Batch rendering**: updates are collected and rendered in controlled batches
- **Mid-state detection**: unclosed fences are detected and rendered as plain text until completed
- **Progressive heavy blocks**: Mermaid and KaTeX re-render incrementally as syntax stabilizes

## Streaming example

### react-markdown

```tsx
import ReactMarkdown from 'react-markdown'

function ChatMessage({ content }: { content: string }) {
  // Re-renders the entire tree on every content change
  return <ReactMarkdown>{content}</ReactMarkdown>
}
```

### markstream-react

```tsx
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

function ChatMessage({ content, isDone }: { content: string, isDone: boolean }) {
  return (
    <MarkdownRender
      content={content}
      final={isDone}
      fade={false}
    />
  )
}
```

## When react-markdown is a better fit

react-markdown is a great choice for:
- Blog posts, documentation pages, static README previews
- Short, complete Markdown that never changes after initial render
- Projects where bundle size is critical and streaming is not needed
- Teams already deeply invested in the remark/rehype plugin ecosystem

## Bundle size notes

`react-markdown` is lighter for static use cases. `markstream-react` includes streaming-specific code (batch scheduler, mid-state parser, progressive renderers) that adds bundle weight. If you never stream content, that weight is unnecessary.

However, for AI chat UIs and streaming surfaces, the streaming features replace what you would otherwise need to build yourself (debouncing, error boundaries for incomplete Markdown, progressive heavy block handling).

## Migration checklist

1. Replace `import ReactMarkdown from 'react-markdown'` with `import MarkdownRender from 'markstream-react'`
2. Add `import 'markstream-react/index.css'` to your entry file
3. Change `<ReactMarkdown>{content}</ReactMarkdown>` to `<MarkdownRender content={content} final={true} />`
4. For streaming: pass `final={isDone}` and consider `fade={false}`
5. Test with incomplete Markdown states (unclosed code fences, partial tables)
6. Install optional peers only if your AI output includes Mermaid, KaTeX, or Monaco blocks

For a full migration guide, see [Migrate from react-markdown](/guide/react-markdown-migration).
