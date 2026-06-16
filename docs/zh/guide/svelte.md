---
title: Svelte 5 流式 Markdown 指南
description: 在 Svelte 5 / SvelteKit AI 聊天中安装和配置 markstream-svelte，覆盖 LLM token 流、content 流式输入、平滑节奏、workers、自定义组件、Mermaid、KaTeX 和 beta API 边界。
keywords:
  - Svelte 5 Markdown 指南
  - SvelteKit AI 聊天 Markdown
  - markstream-svelte 指南
  - Svelte 流式 Markdown 配置
  - Svelte LLM token 流
  - Svelte 平滑流式 Markdown
  - Svelte Mermaid worker
  - Svelte KaTeX worker
  - Svelte 自定义 Markdown 组件
  - Svelte 5 beta Markdown 渲染器
---

# Svelte

`markstream-svelte` 提供 Svelte 5-only 渲染器，组件名、worker helpers 和 playground fixtures 与 Vue / React / Angular 包保持一致。不支持 Svelte 4。

使用 Svelte 5 安装：

```bash
pnpm add markstream-svelte svelte@^5
```

```svelte
<script lang="ts">
  import MarkdownRender from 'markstream-svelte'
  import 'markstream-svelte/index.css'

  let { content = '# markstream-svelte' }: { content?: string } = $props()
</script>

<MarkdownRender
  {content}
  codeBlockDarkTheme="vitesse-dark"
  codeBlockLightTheme="vitesse-light"
/>
```

默认导出和命名导出 `MarkdownRender` / `NodeRenderer` 指向同一个 Svelte 组件。

KaTeX 和 Mermaid worker 入口与其它框架一致：

```svelte
<script lang="ts">
  import { setKaTeXWorker, setMermaidWorker } from 'markstream-svelte'
  import KatexWorker from 'markstream-svelte/workers/katexRenderer.worker?worker&inline'
  import MermaidWorker from 'markstream-svelte/workers/mermaidParser.worker?worker&inline'

  setKaTeXWorker(new KatexWorker())
  setMermaidWorker(new MermaidWorker())
</script>
```

自定义 HTML 标签使用同一套带作用域的组件注册：

```svelte
<script lang="ts">
  import MarkdownRender, { setCustomComponents } from 'markstream-svelte'
  import ThinkingNode from './ThinkingNode.svelte'

  const customId = 'demo'

  setCustomComponents(customId, {
    thinking: ThinkingNode,
  })
</script>

<MarkdownRender
  content="<thinking>nested **markdown**</thinking>"
  {customId}
  customHtmlTags={['thinking']}
/>
```

示例 `ThinkingNode.svelte`：

```svelte
<script lang="ts">
  import MarkdownRender from 'markstream-svelte'

  let {
    node,
    customId = undefined,
  }: {
    node: any
    customId?: string
  } = $props()
</script>

<section class="thinking-node">
  <MarkdownRender
    content={String(node?.content ?? '')}
    {customId}
    customHtmlTags={['thinking']}
  />
</section>
```

本地 playground：

```bash
pnpm play:svelte
```

## 平滑流式节奏

聊天类 token 流建议直接使用 `content` 输入路径，并让组件处理平滑节奏：

```svelte
<script lang="ts">
  import MarkdownRender from 'markstream-svelte'
  import 'markstream-svelte/index.css'

  let content = $state('')
  let final = $state(false)

  // 在这里接入 EventSource / WebSocket
  // eventSource.onmessage = (e) => { content += e.data }
  // eventSource.addEventListener('done', () => { final = true })
</script>

<MarkdownRender
  {content}
  {final}
  maxLiveNodes={0}
  batchRendering={true}
  typewriter={true}
/>
```

默认 `smoothStreaming="auto"` 会在 `typewriter` 开启或 `maxLiveNodes <= 0` 时启用节奏控制。只有你明确希望首屏内容也从空白开始时才使用 `smoothStreaming={true}`；它会绕过 mounted gate，SSR 场景可能出现 hydration mismatch 或空白闪烁。

可以用 `smoothStreamingOptions` 微调速度：

```svelte
<MarkdownRender
  {content}
  {final}
  smoothStreamingOptions={{
    minCharsPerSecond: 45,
    maxCharsPerSecond: 1200,
    targetLatencyMs: 900,
    catchUpLatencyMs: 350,
  }}
/>
```
