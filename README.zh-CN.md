# markstream-vue

> 针对 Vue 3 的高性能、流式友好型 Markdown 渲染组件 — 支持渐进式 Mermaid、流式 diff 代码块以及为大文档优化的实时预览。

[![NPM version](https://img.shields.io/npm/v/markstream-vue?color=a1b858&label=)](https://www.npmjs.com/package/markstream-vue)
[![Docs](https://img.shields.io/badge/docs-中文文档-blue)](https://markstream-vue-docs.simonhe.me/zh/guide/)
[![NPM downloads](https://img.shields.io/npm/dm/markstream-vue)](https://www.npmjs.com/package/markstream-vue)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/markstream-vue)](https://bundlephobia.com/package/markstream-vue)
[![License](https://img.shields.io/npm/l/markstream-vue)](./LICENSE)

> 📖 所有详细文档、API、示例和高级用法已迁移至 VitePress 中文文档站点：
> https://markstream-vue-docs.simonhe.me/zh/guide/

## 🚀 实时演示

- Playground（交互演示）： https://markstream-vue.simonhe.me/
- 交互测试页面： https://markstream-vue.simonhe.me/test

### 交互测试页面

- 试用交互式测试页面以便快速验证与调试： https://markstream-vue.simonhe.me/test

  此页面提供左侧编辑器与右侧实时预览（由本库驱动）。页面包含“生成并复制分享链接”功能，会将你的输入编码到 URL 中以便分享；当输入过长无法嵌入 URL 时，会提供直接打开或预填 GitHub Issue 的回退流程。

  你可以使用该页面复现渲染问题，验证数学公式 / Mermaid / 代码块的渲染行为，并快速生成可共享链接或带复现信息的 issue。

### 介绍视频

一段短视频介绍了 markstream-vue 的关键特性与使用方式。

[![在 Bilibili 查看介绍](https://i1.hdslb.com/bfs/archive/f073718bd0e51acaea436d7197880478213113c6.jpg)](https://www.bilibili.com/video/BV17Z4qzpE9c/)

在 Bilibili 上观看： [Open in Bilibili](https://www.bilibili.com/video/BV17Z4qzpE9c/)

## ⚡ 快速上手

```bash
pnpm add markstream-vue
# npm install markstream-vue
# yarn add markstream-vue
```

```ts
import MarkdownRender from 'markstream-vue'
// main.ts
import { createApp } from 'vue'
import 'markstream-vue/index.css'

createApp({
  components: { MarkdownRender },
  template: '<MarkdownRender custom-id="docs" :content="doc" />',
  setup() {
    const doc = '# Hello markstream-vue\\n\\n支持 **流式** 节点。'
    return { doc }
  },
}).mount('#app')
```

确保在 CSS reset（如 `@tailwind base` 或 `@unocss/reset`）之后导入 `markstream-vue/index.css`，最好放在 `@layer components` 中以避免 Tailwind/UnoCSS 覆盖组件样式。根据需求再按需安装可选 peer 依赖：`stream-monaco`（Monaco 代码块）、`shiki`（Shiki 高亮）、`mermaid`（Mermaid 图表）、`katex`（数学公式）。

## ⚙️ 性能模式

- **默认虚拟化窗口**：保持 `max-live-nodes` 默认值（`320`），渲染器会立即渲染当前窗口的节点，同时只保留有限数量的 DOM 节点，实现平滑滚动与可控内存，占位骨架极少。
- **增量流式模式**：当需要更明显的“打字机”体验时，将 `:max-live-nodes="0"`。这会关闭虚拟化并启用 `batchRendering` 系列参数控制的增量渲染，新的节点会以小批次加上占位骨架的形式进入视图。

可根据页面类型选择最合适的模式：虚拟化适合长文档/回溯需求，增量流式适合聊天或 AI 输出面板。

## 快速链接

- ⚡ 极致性能：为流式场景设计的最小化重渲染和高效 DOM 更新
- 🌊 流式优先：原生支持不完整或频繁更新的 token 化 Markdown 内容
- 🧠 Monaco 流式更新：高性能的 Monaco 集成，支持大代码块的平滑增量更新
- 🪄 渐进式 Mermaid：图表在语法可用时即时渲染，并在后续更新中完善
- 🧩 自定义组件：允许在 Markdown 内容中嵌入自定义 Vue 组件
- 📝 完整 Markdown 支持：表格、公式、Emoji、复选框、代码块等
- 🔄 实时更新：支持增量内容而不破坏格式
- 📦 TypeScript 优先：提供完善的类型定义与智能提示
- 🔌 零配置：开箱即可在 Vue 3 项目中使用
- 🎨 灵活的代码块渲染：可选 Monaco 编辑器 (`CodeBlockNode`) 或轻量的 Shiki 高亮 (`MarkdownCodeBlockNode`)
- 🧰 解析工具集：[`stream-markdown-parser`](./packages/markdown-parser) 文档现已覆盖如何在 Worker/SSE 流中复用解析器、直接向 `<MarkdownRender :nodes>` 输送 AST、以及注册全局插件/数学辅助函数的方式。

## 故障排查 & 常见问题

详细故障排查与常见问题已迁移至文档站点：
https://markstream-vue-docs.simonhe.me/zh/guide/troubleshooting

如需更多帮助，请到 GitHub Issues 创建问题：
https://github.com/Simon-He95/markstream-vue/issues

## 鸣谢

本项目使用并受益于：

- [stream-monaco](https://github.com/Simon-He95/stream-monaco)
- [stream-markdown](https://github.com/Simon-He95/stream-markdown)
- [mermaid](https://mermaid-js.github.io/mermaid)
- [shiki](https://github.com/shikijs/shiki)
- [markdown-it-ts](https://github.com/Simon-He95/markdown-it-ts)

感谢这些项目的作者与贡献者！

## Star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=Simon-He95/markstream-vue&type=Date)](https://www.star-history.com/#Simon-He95/markstream-vue&Date)

## 许可

[MIT](./LICENSE) © [Simon He](https://github.com/Simon-He95)
