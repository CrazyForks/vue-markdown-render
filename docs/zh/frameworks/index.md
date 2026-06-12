---
title: Markstream 框架选择
description: 为 Vue、React、Svelte、Angular、Nuxt 和 Next.js 选择合适的 Markstream 流式 Markdown 渲染器。
---

# Markstream 框架选择

Markstream 是一组面向 AI 应用的流式 Markdown 渲染器。它不是单个 Vue 组件仓库，而是覆盖 Vue、React、Svelte、Angular、Nuxt 和 Next.js 的 renderer family。各框架包共享同一套流式 Markdown 思路：直接传入 `content`，或在高频流式输出里外部解析成 `nodes`；重型块如 Mermaid、KaTeX、代码块和长文档虚拟化按需启用。

| 你的应用 | 推荐包 | 先看 |
| --- | --- | --- |
| Vue 3、Nuxt、VitePress | `markstream-vue` | [Vue](/zh/frameworks/vue) / [Nuxt](/zh/frameworks/nuxt) |
| React、Next.js、Remix | `markstream-react` | [React](/zh/frameworks/react) / [Next.js](/zh/frameworks/next) |
| Svelte 5 | `markstream-svelte` | [Svelte](/zh/frameworks/svelte) |
| Angular standalone | `markstream-angular` | [Angular](/zh/frameworks/angular) |

如果只是把短静态 Markdown 转成 HTML，`marked`、`markdown-it` 或框架生态里的普通 Markdown 组件通常更轻。Markstream 的价值在流式场景：LLM token 流、SSE/WebSocket、未闭合代码块、长回答、渐进 Mermaid 和需要稳定 DOM 的 AI 聊天界面。

```bash
pnpm add markstream-vue
pnpm add markstream-react
pnpm add markstream-svelte svelte@^5
pnpm add markstream-angular
```

需要最小可运行示例时看 [多框架快速开始](/zh/quick-start)。如果你已经确定框架，直接进入对应页面会更快。
