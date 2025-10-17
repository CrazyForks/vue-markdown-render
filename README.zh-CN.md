# vue-renderer-markdown

> Vue 3 的高速 Markdown 渲染器，针对大文档、流式内容和实时预览做了深度优化。

[![NPM version](https://img.shields.io/npm/v/vue-renderer-markdown?color=a1b858&label=)](https://www.npmjs.com/package/vue-renderer-markdown)
[![English Docs](https://img.shields.io/badge/docs-English-blue)](README.md)
[![NPM downloads](https://img.shields.io/npm/dm/vue-renderer-markdown)](https://www.npmjs.com/package/vue-renderer-markdown)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/vue-renderer-markdown)](https://bundlephobia.com/package/vue-renderer-markdown)
[![License](https://img.shields.io/npm/l/vue-renderer-markdown)](./LICENSE)

## 目录

- [特性亮点](#特性亮点)
- [安装](#安装)
- [快速开始](#快速开始)
- [代码块模式](#代码块模式)
- [TypeScript 使用](#typescript-使用)
- [SSR 指南](#ssr-指南)
- [故障排查](#故障排查)
- [性能优化建议](#性能优化建议)
- [相关链接](#相关链接)
- [许可协议](#许可协议)

## 特性亮点

- ⚡ **极致性能**：渲染和 DOM 更新针对流式内容做了优化
- 🌊 **流式优先**：支持不完整 Markdown、渐进式渲染
- 🧠 **Monaco 增量更新**：大体量代码块也能保持丝滑交互
- 🪄 **Mermaid 渐进式渲染**：语法一旦正确立即展示
- 🧩 **自定义节点组件**：可无缝接入自有 Vue 组件
- 📝 **完整 Markdown 支持**：表格、数学公式、Emoji、复选框等全覆盖
- 🔄 **实时更新**：局部变更不会破坏格式
- 📦 **TypeScript 优先**：提供完整类型提示
- 🔌 **零配置上手**：默认即可用于任意 Vue 3 项目

## 安装

```bash
pnpm add vue-renderer-markdown vue
# 或
npm install vue-renderer-markdown vue
# 或
yarn add vue-renderer-markdown vue
```

### 可选 peer 依赖

如需开启高级功能，可按需安装：

| 依赖 | 版本 | 作用 | 缺失时退化行为 |
|------|------|------|----------------|
| `mermaid` | >=11 | Mermaid 图表 | 展示源代码 |
| `vue-use-monaco` | >=0.0.33 | Monaco 编辑器 | 仅显示纯文本 |
| `shiki` | ^3.13.0 | MarkdownCodeBlockNode 语法高亮 | 仅显示纯文本 |
| `vue-i18n` | >=9 | 国际化 | 内置同步翻译器 |

- ⚠️ KaTeX 未随本库打包或自动注入。如需 LaTeX 数学公式渲染，请在宿主应用中安装 `katex` 并手动引入其样式表。示例：

```bash
pnpm add katex
# 或
npm install katex
```

然后在应用入口（例如 `main.ts`）中引入样式：

```ts
import 'katex/dist/katex.min.css'
```

- 🖼️ 工具栏图标改用本地 SVG，无需额外图标库

## 快速开始

```vue
<script setup lang="ts">
import MarkdownRender from 'vue-renderer-markdown'
import 'vue-renderer-markdown/index.css'

const content = `
# Hello Vue Markdown

- 支持列表
- 支持 **加粗** / *斜体*

\`\`\`ts
console.log('流式渲染!')
\`\`\`
`
</script>

<template>
  <MarkdownRender :content="content" />
</template>
```

### 代码块模式

| 模式 | 组件 | 适用场景 | 依赖 |
|------|------|----------|------|
| 默认 Monaco | `CodeBlockNode` | 交互、折叠、复制等完整功能 | `vue-use-monaco` |
| Shiki 高亮 | `MarkdownCodeBlockNode` | 轻量展示、SSR 友好 | `shiki` |
| 纯文本 | `PreCodeNode` | 最小依赖、AI "思考" 输出 | 无 |

切换示例：

```ts
import { MarkdownCodeBlockNode, setCustomComponents } from 'vue-renderer-markdown'

setCustomComponents({
  code_block: MarkdownCodeBlockNode,
})
```

或在实例级启用纯文本：

```vue
<MarkdownRender :content="content" :render-code-blocks-as-pre="true" />
```

## TypeScript 使用

### 渲染类型化 AST

```vue
<script setup lang="ts">
import type { BaseNode } from 'vue-renderer-markdown'
import { ref, watchEffect } from 'vue'
import MarkdownRender, { parseMarkdownToStructure } from 'vue-renderer-markdown'

const content = ref<string>('# Demo\n\n- 列表项\n')
const nodes = ref<BaseNode[]>([])

watchEffect(() => {
  nodes.value = parseMarkdownToStructure(content.value)
})
</script>

<template>
  <MarkdownRender :nodes="nodes" />
</template>
```

### 自定义组件时的类型提示

```vue
<!-- components/CustomCodeBlock.vue -->
<script setup lang="ts">
import type { CodeBlockNode } from 'vue-renderer-markdown'

const props = defineProps<{ node: CodeBlockNode }>()
</script>

<template>
  <pre class="custom-code">
    <code :data-lang="props.node.language">{{ props.node.code }}</code>
  </pre>
</template>
```

```ts
// main.ts
import { createApp } from 'vue'
import { setCustomComponents, VueRendererMarkdown } from 'vue-renderer-markdown'
import App from './App.vue'
import CustomCodeBlock from './components/CustomCodeBlock.vue'

const app = createApp(App)

setCustomComponents('docs', {
  code_block: CustomCodeBlock,
})

app.use(VueRendererMarkdown, {
  mathOptions: {
    commands: ['infty', 'perp', 'alpha'],
    escapeExclamation: true,
  },
  getLanguageIcon(lang) {
    return lang === 'shell' ? '<span>sh</span>' : undefined
  },
})

app.mount('#app')
```

## SSR 指南

- Nuxt 3：使用 `<client-only>` 包裹组件
- 自定义 Vite SSR：在 `onMounted` 后再渲染组件
- 运行 `pnpm run check:ssr` 可验证导入安全
- 需要服务器预渲染的图表或代码，可先生成静态 HTML 后传入

更多示例详见 [docs/nuxt-ssr.zh-CN.md](docs/nuxt-ssr.zh-CN.md)。

## 故障排查

### Monaco worker 加载失败

**现象**：生产环境或预览时控制台报错 `Could not load worker`、`Failed to load Monaco worker`。

**解决方案**：在 Vite 配置中启用 `vite-plugin-monaco-editor-esm` 并指定 worker 输出目录。

```ts
// vite.config.ts
import path from 'node:path'
import monacoEditorPlugin from 'vite-plugin-monaco-editor-esm'

export default {
  plugins: [
    monacoEditorPlugin({
      languageWorkers: ['editorWorkerService', 'typescript', 'css', 'html', 'json'],
      customDistPath(root, buildOutDir) {
        return path.resolve(buildOutDir, 'monacoeditorwork')
      },
    }),
  ],
}
```

### Mermaid 不渲染

**现象**：标记为 ` ```mermaid` 的代码块仍然显示原始文本。

**排查步骤**：

1. 确认已经安装依赖：
   ```bash
   pnpm add mermaid
   ```
2. 校验 Markdown 语法是否正确（配对的 `graph`、`flowchart` 等关键字）。
3. 打开控制台查看 Mermaid 抛出的错误，库会在渲染失败时自动回退到源码展示。

### 语法高亮无效

**现象**：使用 `MarkdownCodeBlockNode` 时代码块仅显示纯文本。

**解决方案**：安装 `shiki` 并确保在渲染器中启用了该组件。

```bash
pnpm add shiki
```

```ts
import { MarkdownCodeBlockNode, setCustomComponents } from 'vue-renderer-markdown'

setCustomComponents({
  code_block: MarkdownCodeBlockNode,
})
```

### TypeScript 提示缺失

**现象**：项目中报错 `Cannot find module 'vue-renderer-markdown'` 或类型提示缺失。

**排查步骤**：

1. 从包入口导入类型：
   ```ts
   import type { BaseNode, CodeBlockNode } from 'vue-renderer-markdown'
   ```
2. 如果需要更细的类型定义，可从构建产物中导入：
   ```ts
   import type { MarkdownPluginOptions } from 'vue-renderer-markdown/dist/types'
   ```
3. 在 `tsconfig.json` 中开启 `"moduleResolution": "bundler"`（或 `"node16"`）。

### SSR 报 `window is not defined`

**原因**：Monaco、Mermaid、Web Worker 等功能依赖浏览器环境，需要延迟到客户端执行。

- **Nuxt 3**：
  ```vue
  <template>
    <client-only>
      <MarkdownRender :content="markdown" />
    </client-only>
  </template>
  ```
- **自定义 Vite SSR**：
  ```vue
  <script setup lang="ts">
  import { onMounted, ref } from 'vue'
  import MarkdownRender from 'vue-renderer-markdown'

  const mounted = ref(false)
  onMounted(() => {
    mounted.value = true
  })
  </script>

  <template>
    <MarkdownRender v-if="mounted" :content="markdown" />
  </template>
  ```

### Tailwind 样式冲突

**现象**：库的样式被 Tailwind 或其他组件库覆盖。

**解决方案**：把库的样式放入 Tailwind 的 `components` 层，保证加载顺序可控。

```css
/* main.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  @import 'vue-renderer-markdown/index.css';
}
```

### 图标未显示

**现象**：复制、折叠等工具栏按钮显示为文本或占位符。

**解决方案**：

1. 确认已经引入库的样式文件（`import 'vue-renderer-markdown/index.css'`）。
2. 检查构建工具是否允许从依赖中导入静态资源（SVG）。
3. 如已自定义图标组件，请确保它们渲染了预期的 SVG 内容。

## 性能优化建议

- 将大型 Markdown 文档拆分为小块流式写入，避免一次性渲染阻塞主线程。
- 仅展示时使用 `MarkdownCodeBlockNode` 或 `render-code-blocks-as-pre`，可跳过 Monaco 初始化。
- 使用 `setCustomComponents('id', mapping)` 为不同渲染实例分别注册组件，并在不再需要时移除，减少内存占用。
- 在应用启动时调用 `setDefaultMathOptions`，统一数学公式配置，防止在渲染期间重复计算。
- 对复杂 Mermaid 图表可提前在服务端校验或预渲染，再将结果作为缓存内容传给组件。
  - Math 渲染错误时，可通过 `setDefaultMathOptions` 调整需要自动补全反斜杠的指令集合。若需在服务端生成或缓存 KaTeX 输出，请确保宿主应用已安装 `katex` 并将其包含在构建中。

## 国际化 / 备用翻译

如果你不想安装或使用 `vue-i18n`，本库内置了一个小型的同步备用翻译器，用于一些常见的 UI 文案（复制、预览、图片加载等）。你可以在应用启动时通过 `setDefaultI18nMap` 替换默认的英文翻译为你希望的语言：

```ts
import { setDefaultI18nMap } from 'vue-renderer-markdown'

setDefaultI18nMap({
  'common.copy': '复制',
  'common.copySuccess': '已复制',
  'common.decrease': '减少',
  'common.reset': '重置',
  'common.increase': '增加',
  'common.expand': '展开',
  'common.collapse': '折叠',
  'common.preview': '预览',
  'image.loadError': '图片加载失败',
  'image.loading': '正在加载图片...',
})
```

可选：如果你安装并配置了 `vue-i18n`，库会在运行时优先使用它提供的翻译。

## 相关链接

- Streaming Playground：https://vue-markdown-renderer.simonhe.me/
- 传统渲染对比示例：https://vue-markdown-renderer.simonhe.me/markdown
- 文档：[docs/](docs/)
- Issue 反馈：https://github.com/Simon-He95/vue-markdown-render/issues

## 许可协议

[MIT](./LICENSE)
