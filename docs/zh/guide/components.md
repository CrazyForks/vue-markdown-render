```markdown
### LinkNode：下划线动画与颜色自定义
`LinkNode`（用于渲染锚点的内部节点）支持在运行时通过 props 自定义下划线动画和颜色，无需覆盖全局 CSS。默认值保持向后兼容以保留先前外观。

可用 props（传给渲染 `LinkNode` 的组件）：
| 名称 | 类型 | 默认 | 说明 |
| ---- | ---- | ----- | ---- |
| `color` | `string` | `#0366d6` | 链接文字颜色（任意有效 CSS 颜色）。下划线使用 `currentColor`，因此会跟随此颜色。 |
| `underlineHeight` | `number` | `2` | 下划线厚度（像素）。 |
| `underlineBottom` | `number \| string` | `-3px` | 相对于文本基线的偏移；支持 `px` 或任意 CSS 长度（例如 `0.2rem`）。 |
| `animationDuration` | `number` | `0.8` | 动画总时长（秒）。 |
| `animationOpacity` | `number` | `0.9` | 下划线不透明度。 |
| `animationTiming` | `string` | `linear` | CSS timing function（例如 `linear`、`ease`、`ease-in-out`）。 |
| `animationIteration` | `string \| number` | `infinite` | 动画重复次数或 `'infinite'`。 |
| `showTooltip` | `boolean` | `true` | 是否在悬停/聚焦时显示库提供的单例 tooltip。为 `false` 时，会把链接 href/title/text 设置为 `title` 属性（使用浏览器原生提示）。 |

示例：
```vue
<template>
  <!-- 默认样式 -->
  <LinkNode :node="node" />
  <!-- 自定义颜色与下划线样式 -->
  <LinkNode
    :node="node"
    color="#e11d48"
    :underline-height="3"
    underline-bottom="-4px"
    :animation-duration="1.2"
    :animation-opacity="0.8"
    animation-timing="ease-in-out"
    :show-tooltip="false"
  />
</template>
```
说明：
- 下划线颜色使用 `currentColor`，因此默认情况下和 `color` prop 保持一致。如果需要独立的下划线颜色，可使用局部 CSS 覆盖或在 issue 中建议新增 `underlineColor` prop。
- 所有 props 都是可选的；省略时使用合理默认值以保持向后兼容。
- `showTooltip` 默认为 `true`，启用时悬停或聚焦链接会显示库的单例 tooltip（展示链接 href 或 title/text）。如需浏览器原生提示或基于 `title` 的无障碍行为，请设置 `:show-tooltip="false"`，组件会在该情况下把链接信息暴露到 `title` 属性。

# API 参考 — 组件

以下文档列出最常用的组件与 props 的中文说明（与英文 `/guide/components` 对应）。

## MarkdownRender
Props
- `content: string` — Markdown 字符串（若未提供 `nodes` 则必需）
- `nodes: BaseNode[]` — 解析后的节点数组（可替代 `content`）
- `renderCodeBlocksAsPre: boolean` — 将 `code_block` 节点渲染为简单的 `<pre><code>` 块
- `codeBlockStream: boolean` — 控制代码块的流式渲染行为
- `viewportPriority: boolean` — 延迟渲染不可见（屏幕外）的高开销节点
- `parseOptions: ParseOptions` — token/node 钩子（见高级页面）
- `customId: string` — `setCustomComponents` 的作用域标识

### CodeBlockNode
功能丰富的代码块，支持可选的 Monaco 集成（可选同伴依赖：`stream-monaco`）
- `node` — CodeBlock 节点
- `darkTheme` / `lightTheme` — 主题名称
- `loading` — 布尔，显示占位
- `showHeader` / `showCopyButton` / 等 — 头部自定义（参见“代码块头部”页面）

### MarkdownCodeBlockNode
轻量级语法高亮（需要 `shiki` 与 `stream-markdown` 等支持）
- Props 与 `CodeBlockNode` 类似，但使用 `shiki` 主题

### MermaidNode
- 在存在 `mermaid` 同伴依赖时，渐进式渲染 Mermaid 图表
- `node` — Mermaid 代码块节点

### Utility 函数
- `getMarkdown()` — 创建并返回已配置的 `markdown-it-ts` 实例
- `parseMarkdownToStructure()` — 解析并返回 AST 节点结构
- `setCustomComponents(id?, mapping)` — 注册节点渲染器映射

有关完整的 prop 类型，请参见 `types` 导出或 `packages/markdown-parser/README.md`（包含公共 TypeScript 接口）。

## ImageNode — 自定义预览处理

`ImageNode` 渲染图片并会触发 `click`、`load` 与 `error` 事件，便于实现自定义预览（lightbox / modal），无需替换渲染器。

示例与要点：
- `click` 负载：`[Event, string]` — 第二项为生效的图片 `src`（可能为回退 URL）。
- `load` / `error` 负载：图片 `src`。

常见做法：创建一个包装组件拦截 `click` 事件并打开预览，然后在客户端应用中通过 `setCustomComponents` 注册该包装组件。

```
