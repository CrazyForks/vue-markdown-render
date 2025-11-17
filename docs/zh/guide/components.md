# API 参考 — 组件

以下是经常使用的组件和常见 props 的中文说明（对应英文版 `/guide/components`）：

## MarkdownRender
主要渲染入口组件
- `content: string` — Markdown 原始字符串。如果没有提供 `nodes`，则必须给出 `content`。
- `nodes: BaseNode[]` — 直接传入解析后的节点树，绕过字符串解析（可选）。
- `renderCodeBlocksAsPre: boolean` — 将代码块以 `<pre><code>` 原始节点渲染，而不是高亮/编辑器组件。
- `codeBlockStream: boolean` — 控制代码块是否以流式方式渲染，从而在数据到达时连续更新。
- `viewportPriority: boolean` — 优先渲染可视区域内的高消耗节点以提升性能。
- `parseOptions: ParseOptions` — 提供解析钩子以自定义 token/node 转换（见解析器文档）。
- `customId: string` — 与 `setCustomComponents` 一起使用，以作用域化自定义组件注册。

### CodeBlockNode
功能丰富的代码块节点，支持 Monaco 编辑器（`stream-monaco` 为可选依赖）：
- `node` — CodeBlock 类型节点本身。
- `darkTheme` / `lightTheme` — 指定主题名以匹配 `monaco` 或 `shiki` 的主题。
- `loading` — 是否显示占位加载状态（布尔）。
- `showHeader` / `showCopyButton` / `showPreviewButton` — 控制头部工具栏显示项；可自定义头部（详见“代码块头部”文档）。

### MarkdownCodeBlockNode
基于 `shiki` 的轻量高亮实现（适用于不需要完整 Monaco 编辑器的场景）：
- Props 与 `CodeBlockNode` 类似，但使用 `shiki` 主题。

### MermaidNode
用于渲染 Mermaid 图表（当项目中安装并启用了 `mermaid` 时）：
- `node` — Mermaid 代码块节点。

## Utility 函数
- `getMarkdown()` — 返回配置好的 `markdown-it-ts` 实例，用于定制解析。
- `parseMarkdownToStructure()` — 将 Markdown 字符串解析为节点结构（AST）；适合需要预处理节点的场景。
- `setCustomComponents(id?, mapping)` — 注册自定义节点渲染器映射；可用 `customId` 限制作用域。

更多详细 TypeScript 类型请参考 `types` 导出或 `packages/markdown-parser/README.md`（含完整公开接口）。
本页为 `API Reference` 的中文实现；如需查看英文原文，请访问 `/guide/components`。
中文说明可参见：`packages/markdown-parser/README.zh-CN.md`（如需阅读解析器钩子与 API 的中文版本）。
