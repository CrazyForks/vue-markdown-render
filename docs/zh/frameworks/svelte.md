---
title: Svelte 5 流式 Markdown 渲染器
description: 使用 markstream-svelte 在 Svelte 5 AI 聊天、SSE/WebSocket、长文档和自定义组件场景中渲染流式 Markdown。
softwareName: markstream-svelte
softwarePackage: markstream-svelte
npmPackage: markstream-svelte
softwareFramework: Svelte
softwareProgrammingLanguage:
  - TypeScript
  - Svelte
softwareRuntimePlatform:
  - Svelte 5
---

# Svelte 5 流式 Markdown 渲染器

`markstream-svelte` 是 Markstream 家族的 Svelte 5 渲染器，使用 Svelte 5 runes，并复用 Markstream 的流式解析、节点渲染、worker 和重型块处理思路。它适合 AI 聊天、SSE/WebSocket 输出、长回答、自定义 Svelte 组件和需要渐进 Mermaid/KaTeX 的页面。

**Svelte 4 不支持。** 如果你的项目还在 Svelte 4，先升级到 Svelte 5 或选择其它 Markdown 方案。

```bash
pnpm add markstream-svelte svelte@^5
```

```svelte
<script lang="ts">
  import MarkdownRender from 'markstream-svelte'
  import 'markstream-svelte/index.css'

  let content = $state('')
  let final = $state(false)
</script>

<MarkdownRender {content} {final} fade={false} />
```

| 需求 | 说明 |
| --- | --- |
| AI 聊天输出 | 传 `content`、`final`，关闭 `fade` |
| 自定义组件 | 使用 Svelte 组件接管指定 Markdown 节点 |
| 移动端 WebView | 使用 `markstream-svelte/index.px.css` |
| Mermaid / KaTeX | 只在需要时安装 peer |

不适合的情况：Svelte 4、短静态 Markdown、或者你只需要构建时把 Markdown 转成 HTML。
