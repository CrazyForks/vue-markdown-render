# vue-renderer-markdown

> Rendering Markdown is straightforward, but when you need to stream and render it in real-time, new challenges emerge. vue-renderer-markdown is built specifically to handle the unique requirements of streaming Markdown content from AI models and live updates, providing seamless formatting even with incomplete or rapidly changing Markdown blocks.

[![NPM version](https://img.shields.io/npm/v/vue-renderer-markdown?color=a1b858&label=)](https://www.npmjs.com/package/vue-renderer-markdown)

## 🚀 [Live Demo](https://vue-markdown-renderer.netlify.app/)

Experience the power of high-performance streaming Markdown rendering in action!

## Features

- ⚡ **Ultra-High Performance**: Optimized for real-time streaming with minimal re-renders and efficient DOM updates
- 🌊 **Streaming-First Design**: Built specifically to handle incomplete, rapidly updating, and tokenized Markdown content
- 🧠 **Monaco Streaming Updates**: High-performance Monaco integration with smooth, incremental updates for large code blocks
- 🪄 **Progressive Mermaid Rendering**: Diagrams render as they become valid and update incrementally without jank
- 🧩 **Custom Components**: Seamlessly integrate your Vue components within Markdown content
- 📝 **Complete Markdown Support**: Tables, math formulas, emoji, checkboxes, code blocks, and more
- 🔄 **Real-Time Updates**: Handles partial content and incremental updates without breaking formatting
- 📦 **TypeScript First**: Full type definitions with intelligent auto-completion
- 🔌 **Zero Configuration**: Drop-in component that works with any Vue 3 project out of the box

## Install

```bash
pnpm add vue-renderer-markdown
# or
npm install vue-renderer-markdown
# or
yarn add vue-renderer-markdown
```

### Install peer dependencies (important)

This package declares several peer dependencies. Some are required for core rendering and others are optional and enable extra features. Since the library now lazy-loads heavyweight optional peers at runtime, you can choose a minimal install for basic rendering or a full install to enable advanced features.

Minimal (core) peers — required for basic rendering:

pnpm (recommended):

```bash
pnpm add vue
```

Full install — enables diagrams, Monaco editor preview and icon UI (recommended if you want all features):

```bash
pnpm add vue @iconify/vue katex mermaid vue-use-monaco
```

npm equivalent:

```bash
npm install vue @iconify/vue katex mermaid vue-use-monaco
```

yarn equivalent:

```bash
yarn add vue @iconify/vue katex mermaid vue-use-monaco
```

Notes:

- The exact peer version ranges are declared in this package's `package.json` — consult it if you need specific versions.
- Optional peers and the features they enable:
  - `mermaid` — enables Mermaid diagram rendering (progressive rendering is supported). If absent, code blocks tagged `mermaid` fall back to showing the source text without runtime errors.
  - `vue-use-monaco` — enables Monaco Editor based previews/editing and advanced streaming updates for large code blocks. If absent, the component degrades to plain text rendering and no editor is created.
  - `@iconify/vue` — enables iconography in the UI (toolbar buttons). If absent, simple fallback elements are shown in place of icons so the UI remains functional.
- `vue-i18n` is optional: the library provides a synchronous fallback translator. If your app uses `vue-i18n`, the library will automatically wire into it at runtime when available.
- If you're installing this library inside a monorepo or using pnpm workspaces, install peers at the workspace root so they are available to consuming packages.

## Why vue-renderer-markdown?

Streaming Markdown content from AI models, live editors, or real-time updates presents unique challenges:

- **Incomplete syntax blocks** can break traditional parsers
- **Rapid content changes** cause excessive re-renders and performance issues
- **Cursor positioning** becomes complex with dynamic content
- **Partial tokens** need graceful handling without visual glitches

vue-renderer-markdown solves these challenges with a streaming-optimized architecture that maintains perfect formatting and performance, even with the most demanding real-time scenarios.

## Usage

### Streaming Markdown (Recommended)

Perfect for AI model responses, live content updates, or any scenario requiring real-time Markdown rendering:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import MarkdownRender from 'vue-renderer-markdown'

const content = ref('')
const fullContent = `# Streaming Content\n\nThis text appears character by character...`

// Simulate streaming content
let index = 0
const interval = setInterval(() => {
  if (index < fullContent.length) {
    content.value += fullContent[index]
    index++
  }
  else {
    clearInterval(interval)
  }
}, 50)
</script>

<template>
  <MarkdownRender :content="content" />
</template>
```

### Basic Usage

For static or pre-generated Markdown content:

```vue
<script setup lang="ts">
import MarkdownRender from 'vue-renderer-markdown'

const markdownContent = `
# Hello Vue Markdown

This is **markdown** rendered as HTML!

- Supports lists
- [x] Checkboxes
- :smile: Emoji
`
</script>

<template>
  <MarkdownRender :content="markdownContent" />
</template>
```

## Performance Features

The streaming-optimized engine delivers:

- **Incremental Parsing Code Blocks**: Only processes changed content, not the entire code block
- **Efficient DOM Updates**: Minimal re-renders
- **Monaco Streaming**: Fast, incremental updates for large code snippets without blocking the UI
- **Progressive Mermaid**: Diagrams render as soon as syntax is valid and refine as content streams in
- **Memory Optimized**: Intelligent cleanup prevents memory leaks during long streaming sessions
- **Animation Frame Based**: Smooth animations
- **Graceful Degradation**: Handles malformed or incomplete Markdown without breaking

### Props

| Name               | Type                  | Required | Description                                        |
| ------------------ | --------------------- | -------- | -------------------------------------------------- |
| `content`          | `string`              | ✓        | Markdown string to render                          |
| `nodes`            | `BaseNode[]`          |          | Parsed markdown AST nodes (alternative to content) |
| `customComponents` | `Record<string, any>` |          | Custom Vue components for rendering                |

> Either `content` or `nodes` must be provided.

Note: when using the component in a Vue template, camelCase prop names should be written in kebab-case. For example, `customComponents` becomes `custom-components` in templates.

## Advanced

- **Custom Components**:
  Pass your own components via `customComponents` prop to render custom tags inside markdown.

- **TypeScript**:
  Full type support. Import types as needed:
  ```ts
  import type { MyMarkdownProps } from 'vue-renderer-markdown/dist/types'
  ```

## Monaco Editor Integration

If you are using Monaco Editor in your project, configure `vite-plugin-monaco-editor-esm` to handle global injection of workers. Our renderer is optimized for streaming updates to large code blocks—when content changes incrementally, only the necessary parts are updated for smooth, responsive rendering. On Windows, you may encounter issues during the build process. To resolve this, configure `customDistPath` to ensure successful packaging.

> Note: If you only need to render a Monaco editor (for editing or previewing code) and don't require this library's full Markdown rendering pipeline, you can integrate Monaco directly using `vue-use-monaco` for a lighter, more direct integration.

### Example Configuration

```ts
import path from 'node:path'
import monacoEditorPlugin from 'vite-plugin-monaco-editor-esm'

export default {
  plugins: [
    monacoEditorPlugin({
      languageWorkers: [
        'editorWorkerService',
        'typescript',
        'css',
        'html',
        'json',
      ],
      customDistPath(root, buildOutDir, base) {
        return path.resolve(buildOutDir, 'monacoeditorwork')
      },
    }),
  ],
}
```

This configuration ensures that Monaco Editor workers are correctly packaged and accessible in your project.

## Mermaid: Progressive Rendering Example

Mermaid diagrams can be streamed progressively. The diagram renders as soon as the syntax becomes valid and refines as more content arrives.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import MarkdownRender from 'vue-renderer-markdown'

const content = ref('')
const steps = [
  '```mermaid\n',
  'graph TD\n',
  'A[Start]-->B{Is valid?}\n',
  'B -- Yes --> C[Render]\n',
  'B -- No  --> D[Wait]\n',
  '```\n',
]

let i = 0
const id = setInterval(() => {
  content.value += steps[i] || ''
  i++
  if (i >= steps.length)
    clearInterval(id)
}, 120)
</script>

<template>
  <MarkdownRender :content="content" />
  <!-- Diagram progressively appears as content streams in -->
  <!-- Mermaid must be installed as a peer dependency -->
</template>
```

## Tailwind (例如 shadcn) — 解决样式层级问题

如果你在项目中使用像 shadcn 这样的 Tailwind 组件库，可能会遇到样式层级/覆盖问题。推荐在你的全局样式文件中通过 Tailwind 的 layer 把库样式以受控顺序导入。例如，在你的主样式文件（例如 `src/styles/index.css` 或 `src/main.css`）中：

```css
/* main.css 或 index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* 推荐：将库样式放入 components 层，方便项目组件覆盖它们 */
@layer components {
  @import 'vue-renderer-markdown/index.css';
}

/* 备选：如需库样式优先于 Tailwind 的 components 覆盖，可放入 base 层：
@layer base {
  @import 'vue-renderer-markdown/index.css';
}
*/
```

选择放入 `components`（常用）或 `base`（当你希望库样式更“基础”且不易被覆盖时）取决于你希望的覆盖优先级。调整后运行你的构建/开发命令（例如 pnpm dev）以验证样式顺序是否符合预期。

## Thanks

This project is built with the help of these awesome libraries:

- [vue-use-monaco](https://github.com/vueuse/vue-use-monaco) — Monaco Editor integration for Vue
- [shiki](https://github.com/shikijs/shiki) — Syntax highlighter powered by TextMate grammars and VS Code themes

Thanks to the authors and contributors of these projects!

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Simon-He95/vue-markdown-render&type=Date)](https://www.star-history.com/#Simon-He95/vue-markdown-render&Date)

## License

[MIT](./LICENSE) © [Simon He](https://github.com/Simon-He95)
