# 使用示例与 API

此页概述最常用的 API 并给出一些高级自定义用法（解析钩子、渲染策略和代码块选项）。

## 最常用函数

- `getMarkdown()` — 获取经过配置的 `markdown-it-ts` 实例与相关选项（用于自定义插件、翻译或解析行为）。
- `parseMarkdownToStructure()` — 将 Markdown 字符串转换为渲染器可用的节点树（ParsedNode[]），适用于需要在渲染前对节点进行修改或检查的场景。

## 组件与示例

- 组件：`MarkdownRender`、`CodeBlockNode`、`MarkdownCodeBlockNode`、`MermaidNode`

### 流式与基本模式

- 流式 Markdown：适合 AI 模型响应和实时预览。文档会在增量 token 到达时更新，以避免重新解析整个 Markdown。
- 经典用法：将静态 `content` 字符串传给 `MarkdownRender` 即可进行预生成的渲染。

### 常用 Props 与选项

- `content`（string）— 必需（除非提供 `nodes`）。
- `nodes`（BaseNode[]）— 可选：直接传入 AST 节点，跳过字符串解析。适用于服务端或预解析场景。
- `renderCodeBlocksAsPre` — 将代码块渲染为 `<pre><code>` 而非富文本高亮/编辑器组件。适用于静态或导出场景。
- `codeBlockStream` — 控制代码块是否按流式方式渲染（可逐步显示内容）。
- `viewportPriority` — 优先渲染可视区域内的高开销节点以改善初次渲染性能。

## 高级

调用 `setCustomComponents` 可覆盖内部节点渲染。例如：将 `code_block` 渲染为 `MarkdownCodeBlockNode`，或将某些自定义 `html_block` token 转换为专用节点并由自定义组件渲染。

要使用解析器钩子，传入 `parseMarkdownToStructure` 的 `ParseOptions` 包含：`preTransformTokens`、`postTransformTokens`、`postTransformNodes`。这些钩子也可通过 `MarkdownRender` 的 `parseOptions` prop 传入（仅在 `content` 被使用时生效）。

如果需要更详细的 props 表或 TypeScript 类型参考，请查看仓库中 `packages/markdown-parser/README.md` 与 `types` 导出。
