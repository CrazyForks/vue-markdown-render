# 安全

`MarkdownRender` 默认使用 `htmlPolicy="safe"`。这个默认值适合 AI 输出，以及需要保留少量安全 HTML 的内容面。

## HTML 策略

### `htmlPolicy="safe"`

允许常见结构化 HTML，例如链接、图片、列表、表格和 details。危险标签、事件属性、不安全 URL 协议和内联样式会在渲染前被移除或转义。

适合 AI 聊天、受控文档流水线，以及需要有限 HTML 能力的 Markdown 场景。

### `htmlPolicy="escape"`

所有 HTML 都按文本显示。

适合不可信用户内容、公开评论区、第三方内容源，或者任何不需要原始 HTML 的位置。

```vue
<MarkdownRender
  :content="content"
  html-policy="escape"
/>
```

### `htmlPolicy="trusted"`

保留更宽的 HTML 集合，但仍会移除 script 等硬阻断标签。只应用在你完全控制的内容上。
它可能保留内联样式和更宽的 HTML 集。不要用于模型输出或用户生成内容。

## 自定义组件

`customHtmlTags` 只是把标签声明为结构化 streaming 节点，并不代表模型输出可信。

自定义组件是受信任代码。Markstream 会清洗传给自定义组件的 HTML attrs，但无法控制组件内部行为。避免对模型原文使用 `v-html`，避免执行模型输出里的 URL，也不要把模型输出直接写入 `iframe srcdoc`。

更推荐在组件里使用文本插值：

```vue
<script setup lang="ts">
defineProps<{ node: { content?: string } }>()
</script>

<template>
  <div class="thinking-node">
    {{ node.content }}
  </div>
</template>
```

## 链接和图片

Markdown 链接和渲染出的 HTML attrs 会检查 `javascript:`、`vbscript:`、HTML `data:` 文档等不安全协议。bitmap 图片 data URL 只允许出现在图片源属性上。

URL 策略允许 `//cdn.example.com/a.png` 这类 protocol-relative URL。它们仍可能加载外部资源；如果公开用户内容或第三方内容不应该发起远程资源请求，请优先使用 `htmlPolicy="escape"`。

Mermaid SVG 输出在 strict 和 loose Mermaid 模式下都会在挂载前清理。`isStrict=false` 只控制 Mermaid 的解析/渲染配置，不代表原始 SVG 插入。
