---
title: React 流式 Markdown 渲染器
description: 使用 markstream-react 在 React、Next.js、Remix 和 AI 聊天界面中渲染流式 Markdown、SSE/WebSocket 输出、Mermaid、KaTeX 和长回答。
softwareName: markstream-react
softwarePackage: markstream-react
npmPackage: markstream-react
softwareFramework: React
softwareProgrammingLanguage:
  - TypeScript
  - React
softwareRuntimePlatform:
  - React
  - Next.js
  - Remix
---

# React 流式 Markdown 渲染器

`markstream-react` 面向 React 18/19、Next.js 和 Remix。它适合把 LLM token 流、SSE 或 WebSocket 输出实时渲染成 Markdown，同时处理未闭合代码块、部分数学公式、长回答和渐进式 Mermaid 图表。和 `react-markdown` 相比，它不是为了最小静态渲染而设计，而是优先解决流式体验和长内容稳定性。

| 场景 | 推荐 |
| --- | --- |
| 短静态 Markdown | 可以继续用 `react-markdown` |
| AI 聊天、SSE、WebSocket | 使用 `markstream-react` |
| Next.js SSR-first 页面 | 看 [Next.js](/zh/frameworks/next) |
| 高频 token 流 | 外部批处理并传 `nodes` |

```bash
pnpm add markstream-react
```

```tsx
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

export function Message({ content, isDone }: { content: string, isDone: boolean }) {
  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

Next.js 中实时流式区域应放在 `'use client'` 组件里。需要服务器先输出 HTML 或 server-only 渲染时，不要只看 React 页面，直接看 [Next.js 流式 Markdown 渲染器](/zh/frameworks/next)。

不适合的情况：只做博客或 README 预览、强依赖 remark/rehype 生态、或首要目标是最小 bundle。
