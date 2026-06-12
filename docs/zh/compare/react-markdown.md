---
title: markstream-react 与 react-markdown 对比
description: 对比 markstream-react 和 react-markdown 在 React AI 聊天、流式 Markdown、静态文档、Mermaid、KaTeX、长回答和迁移成本中的取舍。
---

# markstream-react 与 react-markdown 对比

`react-markdown` 是成熟的 React Markdown 渲染器，适合短静态内容、博客、README 预览和依赖 remark/rehype 插件生态的项目。`markstream-react` 面向 AI 聊天和流式 Markdown，重点是处理不断变化的内容、未闭合语法、长回答和渐进式重型块。

| 场景 | 推荐 |
| --- | --- |
| 静态博客、短说明、README 预览 | `react-markdown` |
| LLM token 流、SSE、WebSocket | `markstream-react` |
| 已有 remark/rehype 插件链 | 继续评估 `react-markdown` |
| Mermaid、KaTeX、流式代码块、长回答 | `markstream-react` |

```tsx
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

export function ChatMessage({ content, isDone }: { content: string, isDone: boolean }) {
  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

迁移时最小步骤是：替换 import，添加 CSS，把 `<ReactMarkdown>{content}</ReactMarkdown>` 改成 `<MarkdownRender content={content} final={true} />`。流式场景再传入真实 `final`，并测试未闭合 code fence、表格、数学公式和长回答。

不适合迁移的情况：内容永远是短静态 Markdown、bundle 体积极敏感、或者项目已经深度依赖 `react-markdown` 的插件行为。
