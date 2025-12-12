# 使用示例与 API

本页聚焦三个问题：如何在 Vite/VitePress/Nuxt 中集成、解析器如何配合渲染器、样式出错时去哪查看 reset 与 Tailwind/UnoCSS 排障指南。

## 选择入口

- **VitePress** — 在 `enhanceApp` 中注册 `MarkdownRender` 与 `setCustomComponents`，并参考 [VitePress 文档指南](/zh/guide/vitepress-docs)。
- **Vite/Nuxt 应用** — 在组件中引入 `MarkdownRender`，记得在 reset 之后、`@layer components` 中导入 `markstream-vue/index.css`。
- **仅解析器** — 使用 `getMarkdown()` 与 `parseMarkdownToStructure()` 构建自定义渲染流程或在渲染前做 AST 处理。

如果需要在既有设计系统里覆盖样式，务必传入 `custom-id` 并阅读 [样式排查清单](/zh/guide/troubleshooting#css-looks-wrong-start-here)。

## 最小渲染示例

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const doc = '# 使用示例\n\n支持 **streaming** 渲染。'
</script>

<template>
  <MarkdownRender custom-id="docs" :content="doc" />
</template>
```

```css
@import 'modern-css-reset';

@layer components {
  @import 'markstream-vue/index.css';
}
```

## VitePress + 自定义标签

在 VitePress 中，你只需要在 `enhanceApp` 里注册一次自定义节点组件，然后在 `MarkdownRender` 上使用 `custom-html-tags`，解析器就会自动输出对应的自定义节点。

```ts
import MarkdownRender, { setCustomComponents } from 'markstream-vue'
// docs/.vitepress/theme/index.ts
import DefaultTheme from 'vitepress/theme'
import ThinkingNode from './components/ThinkingNode.vue'
import 'markstream-vue/index.css'

export default {
  extends: DefaultTheme,
  enhanceApp() {
    setCustomComponents('docs', { thinking: ThinkingNode })
  },
}
```

```md
<!-- 在 VitePress 页面里 -->
<MarkdownRender
  custom-id="docs"
  custom-html-tags="['thinking']"
  :content="source"
/>
```

## 解析流程

```ts
import { getMarkdown, parseMarkdownToStructure } from 'markstream-vue'

const md = getMarkdown({
  markdownIt: {
    html: true,
  },
})

const nodes = parseMarkdownToStructure('# 标题', md)
// 将 nodes 传入 <MarkdownRender :nodes="nodes" />
```

- `getMarkdown(options?)` 返回预设配置的 `markdown-it-ts`。
- `parseMarkdownToStructure()` 将 Markdown 字符串/Token 转为渲染器使用的 AST。
- 可搭配 `setCustomComponents(id?, mapping)` 为特定 `custom-id` 替换节点渲染器。

## 组件速览

完整说明参考 [组件与节点渲染器](/zh/guide/components)：

- `CodeBlockNode` — Monaco 代码块，记得引入 `stream-monaco/esm/index.css`。
- `MarkdownCodeBlockNode` — 基于 Shiki，适合轻量场景。
- `MermaidBlockNode` — 需要 `mermaid` ≥ 11 与 CSS。
- `ImageNode` — 通过 `click`/`load`/`error` 事件接管图片预览。

## 样式提醒

1. **先 reset** —— `modern-css-reset`、`@tailwind base` 或 `@unocss/reset`，之后再导入库的 CSS。
2. **使用 CSS layer** —— Tailwind/UnoCSS 项目请在 `@layer components { ... }` 中导入 `markstream-vue/index.css`。
3. **处理 Uno/Tailwind 冲突** —— 参见 [Tailwind 指南](/zh/guide/tailwind)（包含 UnoCSS 示例）。
4. **同伴 CSS** —— Monaco、KaTeX、Mermaid 各自需要对应的 CSS，缺失会导致空白渲染。

若仍无法解决，请运行 `pnpm play` 在 playground 中复现，并附带链接到 issue 中。
