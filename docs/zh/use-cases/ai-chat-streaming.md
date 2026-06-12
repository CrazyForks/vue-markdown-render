---
title: AI 聊天流式 Markdown 渲染
description: 在 AI 聊天 UI 中使用 Markstream 渲染 LLM token 流、SSE/WebSocket 输出、未闭合 Markdown、Mermaid、KaTeX 和长回答。
---

# AI 聊天流式 Markdown 渲染

AI 聊天里的 Markdown 与普通文章不同：模型会一段一段输出，代码块、表格、数学公式和 Mermaid 图经常处在未闭合状态。普通 Markdown 渲染器通常能处理最终文本，但在中间态容易闪烁、重排或让重型块反复销毁。Markstream 的目标就是让这些中间态稳定可读。

## 推荐模式

| 场景 | 接法 |
| --- | --- |
| 普通聊天消息 | 直接传 `content` 和 `final` |
| 高频 token 流 | 在外部 batch，再更新 `content` 或 `nodes` |
| 长回答 | 启用 live node 限制和虚拟化 |
| 模型输出不可信 HTML | 使用 `htmlPolicy="escape"` |

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

Vue、Svelte、Angular 的核心思路相同：累积内容、传入完成状态、避免每个 token 都触发昂贵渲染。不要为了“最终态更漂亮”在同一条消息里从 `chat` mode 切到 `docs` mode；保持 mode 稳定，只切换 pacing 和动画选项。

如果你的聊天只显示纯文本且永远没有 Markdown、代码块或长回答，普通文本节点更简单。Markstream 适合已经明确需要 Markdown 流式体验的聊天界面。
