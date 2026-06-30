---
title: SSE 与 WebSocket Markdown 流式渲染
description: 使用 Markstream 渲染来自 Server-Sent Events 和 WebSocket 的 Markdown 流，覆盖 AI 输出、批处理、未闭合语法和长内容性能。
keywords:
  - SSE Markdown 渲染器
  - WebSocket Markdown 渲染器
  - 实时 AI Markdown
  - token 流批处理
  - 未闭合 Markdown 渲染
faq:
  - question: SSE 或 WebSocket 应该每个 token 都触发一次 Markdown 渲染吗？
    answer: 不建议。先把小 chunk 缓冲到一帧或一小批，再提交给渲染器，可以减少解析和 DOM 更新次数。
  - question: Markstream 只支持 SSE 吗？
    answer: 不是。Markstream 接收 Markdown content 或 nodes，因此 SSE、WebSocket、fetch stream 或自定义传输都能走同一套渲染路径。
  - question: 服务端发送最终 chunk 时需要做什么？
    answer: 把消息标记为 final，让未闭合代码块、表格、数学公式等流式中间态稳定成最终渲染。
---

# SSE 与 WebSocket Markdown 流式渲染

SSE 和 WebSocket 都会持续推送文本。当这些文本是 Markdown 时，中间态经常不是合法完整文档：代码 fence 未闭合、表格还没写完、数学公式缺少结束符、Mermaid 图只到一半。Markstream 通过流式中间态处理、批量渲染和节点复用，减少闪烁和 DOM 抖动。

## 该怎么接

| 传输方式 | 推荐 |
| --- | --- |
| SSE | 用 `EventSource` 累积内容，遇到 `[DONE]` 后设置 `final` |
| WebSocket | 在 `onmessage` 里批量合并 chunk |
| 高频输出 | 用 `requestAnimationFrame` 或队列控制更新频率 |
| 超长回答 | 开启 `node-virtual="auto"` 或对应框架的 live node 控制 |

```tsx
import MarkdownRender from 'markstream-react'
import { useEffect, useState } from 'react'
import 'markstream-react/index.css'

export function StreamView() {
  const [content, setContent] = useState('')
  const [isDone, setIsDone] = useState(false)

  useEffect(() => {
    const source = new EventSource('/api/chat/stream')
    source.onmessage = (event) => {
      if (event.data === '[DONE]') {
        setIsDone(true)
        source.close()
        return
      }

      const data = JSON.parse(event.data) as { content?: string }
      setContent(prev => prev + (data.content ?? ''))
    }

    return () => source.close()
  }, [])

  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

WebSocket 只是在传输层不同，渲染层仍然是“累积内容，然后传给 renderer”。如果服务端一次推很多小 token，不要每个 token 都同步 setState；先缓冲到一帧或一小批，再提交给 UI。

不适合的情况：流里只有纯文本且没有 Markdown，或你只在服务端拼好完整文档后一次性展示。
