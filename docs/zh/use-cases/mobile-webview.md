---
title: 移动端 WebView AI Markdown 渲染
description: 在 iOS WKWebView 和 Android WebView 中使用 Markstream 渲染 AI Markdown、处理字体缩放、长回答、Mermaid 和代码块性能。
---

# 移动端 WebView AI Markdown 渲染

移动端 WebView 的核心问题不是“能不能渲染 Markdown”，而是字体缩放、CPU、内存和 worker 支持都比桌面浏览器更敏感。AI 输出又可能很长，包含代码块、表格、Mermaid 或 KaTeX。Markstream 提供 `px` CSS 变体、chat mode、live node 控制和延迟渲染选项，帮助 WebView 保持稳定。

## 推荐配置

| 问题 | 处理 |
| --- | --- |
| 根字号被 App 改写 | 使用 `index.px.css` |
| 长回答滚动卡顿 | 启用虚拟化和 live node 限制 |
| Monaco 太重 | 移动端优先 `<pre>` 或轻量高亮 |
| Mermaid / KaTeX 慢 | 只对可见区域或最终态启用 |

```ts
import 'markstream-vue/index.px.css'
// React: import 'markstream-react/index.px.css'
// Svelte: import 'markstream-svelte/index.px.css'
```

```vue
<MarkdownRender
  mode="chat"
  :content="content"
  :final="isDone"
  node-virtual="auto"
  :max-live-nodes="300"
  :live-node-buffer="60"
  :render-code-blocks-as-pre="true"
  :fade="false"
  smooth-streaming="auto"
/>
```

iOS WKWebView 中要特别关注 worker 配置和动态字体缩放；Android WebView 要测试系统字体放大、旧 WebView 内核和低端机性能。Angular 当前没有 `px` CSS 变体，需用默认 CSS 并做真实设备测试。

不适合的情况：移动端只展示短静态说明文本，或 Native 层已经把 Markdown 转成了稳定 HTML。
