---
title: markstream-react 与 Streamdown 对比
description: 对比 markstream-react 和 Streamdown 在 React 流式 Markdown、AI 聊天、Mermaid、KaTeX、Shiki、长回答和跨框架一致性中的差异。
---

# markstream-react 与 Streamdown 对比

> 最后核验：2026-06-12。竞品能力可能变化；本页聚焦架构和公开文档行为，不把能力差异写成永久结论。

`markstream-react` 和 Streamdown 都面向 React 流式 Markdown。Streamdown 更像 `react-markdown` 的流式替代路径，并通过 `@streamdown/mermaid`、`@streamdown/math`、`@streamdown/code` 等插件覆盖 Mermaid、数学公式和 Shiki 代码能力。`markstream-react` 更强调 Markstream 家族共享解析行为、渐进式 heavy block、`content`/`nodes` 双输入和长回答 live node 控制。

| 需求 | 推荐 |
| --- | --- |
| 想从 `react-markdown` 平滑切换 | Streamdown |
| React-only 且喜欢插件模型 | Streamdown |
| 多框架产品线需要一致行为 | `markstream-react` |
| 长 AI 回答需要 renderer 层 live node 控制 | `markstream-react` |
| 想复用 Vue/React/Svelte/Angular 同一套 parser 心智 | `markstream-react` |

```tsx
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

export function Message({ content, isDone }: { content: string, isDone: boolean }) {
  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

如果你的项目只在 React 内部使用，且最看重 drop-in 迁移体验，Streamdown 值得评估。如果你的文档、聊天、移动 WebView 或多框架包需要一致的 Markstream 行为，优先看 `markstream-react`。

对比信息会随 Streamdown 插件生态变化而变化；做技术选型时应同时查看 Streamdown 官方文档和本项目当前版本说明。
