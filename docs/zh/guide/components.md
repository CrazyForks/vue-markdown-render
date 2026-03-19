---
description: 快速查阅 MarkdownRender、CodeBlockNode、MermaidBlockNode、ImageNode、LinkNode 等 markstream-vue 导出组件。
---

# 渲染器与节点组件

当你已经明确知道自己要找的是某个导出的组件，并且想快速确认它的 props、事件、CSS 要求，以及该去哪个页面继续往下看时，就从这页开始。

如果你还在判断应该改解析流程、作用域覆盖，还是组件替换，建议先看：

- 想查解析器工具、AST hooks 或 `setCustomComponents()` 的接入方式： [API 参考](/zh/guide/api)
- 想有作用域地替换内置渲染器： [覆盖内置组件](/zh/guide/component-overrides)
- 想支持 `thinking` 这类可信标签： [自定义标签与高级组件](/zh/guide/custom-components)
- 想调配置、性能或工具栏： [Props 与选项](/zh/guide/props)

## 快速参考

| 组件 | 推荐场景 | 关键 props / 事件 | 额外 CSS / 同伴依赖 | 排障提示 |
| ---- | -------- | ---------------- | ------------------- | -------- |
| `MarkdownRender` | 渲染完整 AST（默认导出） | Props：`content` / `nodes`、`custom-id`、`final`、`parse-options`、`custom-html-tags`、`is-dark`、`code-block-props`、`mermaid-props`、`d2-props`、`infographic-props`；事件：`copy`、`handleArtifactClick`、`click`、`mouseover`、`mouseout` | 在 reset 之后引入 `markstream-vue/index.css`（CSS 已被限定在内部 `.markstream-vue` 容器中），并放入受控 layer | 用 `setCustomComponents(customId, mapping)` + `custom-id` 限定覆盖范围；配合 [CSS 排查清单](/zh/guide/troubleshooting#css-looks-wrong-start-here) |
| `CodeBlockNode` | 基于 Monaco 的交互式代码块、流式 diff | `node`、`monacoOptions`、`stream`、`loading`；事件：`copy`、`previewCode`；插槽 `header-left` / `header-right`；diff 悬浮操作配置放在 `monacoOptions`（`diffHunkActionsOnHover`、`diffHunkHoverHideDelayMs`、`onDiffHunkAction`） | 安装 `stream-monaco`（peer）并打包 Monaco workers | 空白编辑器 → 优先检查 worker 打包与 SSR |
| `MarkdownCodeBlockNode` | 轻量级高亮（Shiki） | `node`、`stream`、`loading`；插槽 `header-left` / `header-right` | 同伴依赖 `shiki` + `stream-markdown` | SSR/低体积场景优先使用 |
| `MermaidBlockNode` | 渐进式 Mermaid 图 | `node`、`isDark`、`isStrict`、`maxHeight`；事件 `copy`、`export`、`openModal`、`toggleMode` | `mermaid` >= 11；无需额外 CSS | 详见 `/zh/guide/mermaid` |
| `D2BlockNode` | 渐进式 D2 图 | `node`、`isDark`、`maxHeight`、`progressiveRender`、`progressiveIntervalMs`；工具栏开关 | `@terrastruct/d2`；无需额外 CSS | 缺少依赖会回退到源码；详见 `/zh/guide/d2` |
| `MathBlockNode` / `MathInlineNode` | KaTeX 公式 | `node` | 安装 `katex` 并引入 `katex/dist/katex.min.css` | Nuxt SSR 中需 `<ClientOnly>` |
| `ImageNode` | 自定义图片预览 / 懒加载 | Props：`fallback-src`、`show-caption`、`lazy`、`svg-min-height`、`use-placeholder`；事件：`click` / `load` / `error` | 无额外 CSS | 通过 `setCustomComponents` 包装，实现 lightbox |
| `LinkNode` | 下划线动画、颜色自定义 | `color`、`underlineHeight`、`showTooltip` | 无 | 浏览器默认 `a` 样式可通过 reset 解决 |
| `VmrContainerNode` | 自定义 `:::` 容器 | `node`（`name`、`attrs`、`loading`、`children`） | 极简基础 CSS；通过 `setCustomComponents` 覆盖 | JSON attrs 会规范到 `node.attrs`（去掉 `data-` 前缀）；无效/不完整 JSON 存到 `attrs.attrs`；name 后面的 args 存到 `attrs.args` |

## TypeScript 类型导出

`markstream-vue` 同步导出渲染器与组件 props 类型：

```ts
import type {
  CodeBlockNodeProps,
  D2BlockNodeProps,
  InfographicBlockNodeProps,
  MermaidBlockNodeProps,
  NodeRendererProps,
  PreCodeNodeProps,
} from 'markstream-vue'
import type { CodeBlockNode } from 'stream-markdown-parser'
```

说明：

- `NodeRendererProps` 对应 `<MarkdownRender>` props。
- `CodeBlockNodeProps` / `MermaidBlockNodeProps` / `D2BlockNodeProps` / `InfographicBlockNodeProps` / `PreCodeNodeProps` 的 `node` 统一为 `CodeBlockNode`（用 `language: 'mermaid'` / `language: 'd2'` / `language: 'd2lang'` / `language: 'infographic'` 区分渲染器）。

## 先快速判断该用哪个组件

- 大多数业务接入都应该先用 `MarkdownRender`。
- 如果你要自己拼接底层节点渲染器，再考虑 `CodeBlockNode`、`MermaidBlockNode`、`D2BlockNode`、`MathBlockNode`。
- 如果你只是想替换单个内置节点，通常看 `ImageNode`、`LinkNode`、`VmrContainerNode` 这一层就够了。
- 如果你脱离 `MarkdownRender` 单独渲染节点组件，请记得包一层 `<div class="markstream-vue">...</div>`，否则库内变量和样式不会完整生效。

## MarkdownRender

> 主入口：接受 Markdown 字符串或解析后的 AST，然后使用内置节点渲染器输出。

### 快速要点

- **适用**：Vite/Nuxt/VitePress 中渲染整篇 Markdown。
- **关键 props**：`content` / `nodes`、`custom-id`、`final`、`parse-options`、`custom-html-tags`
- **CSS 顺序**：先引入 reset，再在 `@layer components` 中导入 `markstream-vue/index.css`。

### CSS 作用域

`markstream-vue` 已把打包后的 CSS 限定在内部 `.markstream-vue` 容器中，用于降低全局样式冲突。

- 使用 `MarkdownRender` 时一般无需处理：它默认渲染在容器内部。
- 如果你独立使用节点组件（例如 `CodeBlockNode`、`MathBlockNode`），请外层包一层 `<div class="markstream-vue">...</div>`，这样库内样式与变量才会生效。

### 使用阶梯

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '# 你好\n\n使用 custom-id 控制样式。'
</script>

<template>
  <MarkdownRender custom-id="docs" :content="md" />
</template>
```

```ts
// 注册自定义节点
import { setCustomComponents } from 'markstream-vue'
import CustomImageNode from './CustomImageNode.vue'

setCustomComponents('docs', {
  image: CustomImageNode,
})
```

```css
/* styles/main.css */
@import 'modern-css-reset';
@tailwind base;

@layer components {
  @import 'markstream-vue/index.css';
}

[data-custom-id='docs'] .prose {
  max-width: 720px;
}
```

### 性能相关 props

- **批量渲染** —— `batchRendering`、`initialRenderBatchSize`、`renderBatchSize`、`renderBatchDelay`、`renderBatchBudgetMs` 控制每一帧有多少节点从占位骨架切换为真实组件。仅在关闭虚拟化（`:max-live-nodes="0"`）时会启用增量骨架模式。
- **延迟可见节点** —— `deferNodesUntilVisible` 与 `viewportPriority` 默认开启，让 Mermaid、D2、Monaco、KaTeX 等重型节点只有在接近视口时才加载。
- **虚拟化窗口** —— `maxLiveNodes` 限制 DOM 中最多保留多少个已渲染节点，`liveNodeBuffer` 控制超前/超后范围。详见 [性能指南](/zh/guide/performance)。
- **代码块降级** —— 通过 `renderCodeBlocksAsPre` 与 `codeBlockStream` 可将普通代码块切换为 `<pre><code>` 或关闭流式更新。

### 常见问题

- **样式错乱**：先检查 [CSS 排查清单](/zh/guide/troubleshooting#css-looks-wrong-start-here)。
- **工具类覆盖**：传入 `custom-id` 并使用 `[data-custom-id="docs"]` 限定样式。
- **SSR 报错**：对只在浏览器可用的同伴依赖（Mermaid、D2、Monaco）使用 `<ClientOnly>` 或 `onMounted`。

### 什么时候优先用它

- 你想走“默认解析器 + 默认渲染器”的最短接入路径。
- 你希望把流式渲染、虚拟化、批量渲染、自定义标签、作用域覆盖都集中在一个入口处理。
- 你还不想自己拼装各个节点渲染器，只是要在 `content` 与 `nodes` 之间做选择。

### 最常见的组合方式

- `content` + `custom-id`：静态页面或轻量定制页面。
- `nodes` + `final`：流式输出、服务端预解析、增量渲染。
- `custom-html-tags` + `setCustomComponents(customId, mapping)`：像 `thinking` 这样的可信标签。
- `renderCodeBlocksAsPre`：SSR 或受限环境里，把重型代码块降级成普通 `<pre><code>`。

## CodeBlockNode

> 基于 Monaco 的代码块渲染器，支持流式 diff 和交互式工具栏。

- **适合**：代码审阅、diff 检查、补丁预览、悬浮操作
- **关键 props**：`node`、`monacoOptions`、`stream`、`loading`
- **事件**：`copy`、`previewCode`
- **插槽**：`header-left`、`header-right`
- **同伴依赖**：`stream-monaco`，以及 bundler 里的 Monaco worker 配置
- **常见问题**：编辑器空白时，优先检查 worker 打包和 SSR 边界

如果代码块本身就是产品体验的一部分，用它最合适；如果你只是想高亮代码，不需要 Monaco 的编辑能力，优先看 `MarkdownCodeBlockNode`。

深入页面： [CodeBlockNode](/zh/guide/code-block-node)、[Monaco](/zh/guide/monaco)

## MarkdownCodeBlockNode

> 基于 `shiki` 和 `stream-markdown` 的轻量代码块渲染器。

- **适合**：SSR 友好的文档站、博客页、更小的打包体积
- **关键 props**：`node`、`stream`、`loading`
- **插槽**：`header-left`、`header-right`
- **同伴依赖**：`shiki`、`stream-markdown`
- **常见问题**：一直没有高亮时，先确认两个 peers 都已安装，并在实际渲染环境里可用

如果你不需要 Monaco 的编辑面板和 diff 交互，这个通常是更轻的选择。

## MermaidBlockNode

> 渐进式 Mermaid 渲染器，带复制、导出、弹窗等交互能力。

- **适合**：大图、AI 生成图表、用户主动导出
- **关键 props**：`node`、`isDark`、`isStrict`、`maxHeight`
- **事件**：`copy`、`export`、`openModal`、`toggleMode`
- **同伴依赖**：`mermaid` >= 11
- **常见问题**：SSR 场景要把 Mermaid 初始化放到客户端边界之后

深入页面： [Mermaid](/zh/guide/mermaid)、[MermaidBlockNode](/zh/guide/mermaid-block-node)

## D2BlockNode

> 渐进式 D2 图表渲染器，适合结构化架构图和说明图。

- **适合**：D2 文档、自动生成的架构视图、渐进式渲染
- **关键 props**：`node`、`isDark`、`maxHeight`、`progressiveRender`、`progressiveIntervalMs`
- **同伴依赖**：`@terrastruct/d2`
- **常见问题**：缺少 peer 时会回退显示源码，而不是渲染好的图表

深入页面： [D2 图表](/zh/guide/d2)

## MathBlockNode / MathInlineNode

> 基于 KaTeX 的块级 / 行内公式渲染器。

- **适合**：技术文档、公式说明、AI 数学输出
- **关键 prop**：`node`
- **同伴依赖**：`katex`
- **必需 CSS**：`katex/dist/katex.min.css`
- **常见问题**：公式空白通常是 KaTeX CSS 缺失，而不是解析失败

## ImageNode

> 内置图片渲染器，提供 caption、fallback、lazy 等常用能力。

- **适合**：自定义预览、埋点、lightbox 集成
- **关键 props**：`fallback-src`、`show-caption`、`lazy`、`svg-min-height`、`use-placeholder`
- **事件**：`click`、`load`、`error`
- **常见接法**：先包一层自定义组件，再通过 `setCustomComponents(customId, { image: CustomImageNode })` 注册

深入页面： [ImageNode](/zh/guide/image-node)

## LinkNode

> 带下划线动画和 tooltip 选项的链接渲染器。

- **适合**：文档站、聊天界面、需要和设计系统统一交互样式的链接
- **关键 props**：`color`、`underlineHeight`、`showTooltip`
- **常见问题**：浏览器默认样式或 reset 顺序不对时，看起来会像“组件失效”，先检查 CSS 顺序

## VmrContainerNode

> 用来渲染 `:::` 容器以及解析器归一化后的结构化块。

- **适合**：提示框、Notice、AI 特殊块、容器型自定义组件
- **关键 prop**：`node`，其中包含 `name`、`attrs`、`loading`、`children`
- **归一化细节**：JSON attrs 会整理到 `node.attrs`；无效或不完整 JSON 会保留在 `attrs.attrs`；容器名后面的参数会落到 `attrs.args`
- **常见接法**：和 `custom-html-tags` 或 parser hooks 配合，处理可信的结构化块

## 单独渲染节点组件时的检查清单

如果你绕过 `MarkdownRender`，直接挂载节点组件：

- 外层包上 `.markstream-vue` 容器。
- 引入和完整渲染器一致的 CSS。
- 只安装并初始化当前节点真正需要的 peers。
- 所有替换样式都用父级选择器或 `data-custom-id` 一类的方式做局部作用域。

## 如果你现在找的是别的层级

- 查解析器工具、`setCustomComponents`、AST hooks：看 [API 参考](/zh/guide/api)
- 查完整渲染器配置：看 [Props 与选项](/zh/guide/props)
- 组件选对了但样式 / peers / SSR 还是不对：看 [故障排除](/zh/guide/troubleshooting)
