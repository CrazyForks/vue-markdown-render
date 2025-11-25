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

### 自定义组件与标签型元素

标签形式的自定义组件（例如 `<MyWidget ...>...</MyWidget>`）在解析后会以复杂的 `html_block` 或 inline token 形式出现，直接从 AST 里用正则或字符串拼接恢复成组件通常容易出问题且难以维护。建议采用先行抽取（pre-extract）再渲染的策略：

- 在把 Markdown 字符串交给解析器之前，先扫描并把标签型自定义组件的原始字符串提取到一个小的映射表（以 id/占位符为 key）。
- 在原始 Markdown 中用稳定的占位符替换这些片段（例如 `[[CUSTOM:1]]`）。
- 对替换后的内容运行标准的 Markdown 解析流程并生成节点树。
- 在渲染阶段遇到占位符时，从映射表取回原始字符串并单独以 Vue 组件或你自己的渲染器渲染它们。

优点：
- 避免对复杂嵌套 HTML 做脆弱的 AST 二次加工。
- 让 Markdown 解析器只关注 Markdown 语义。
- 更容易控制自定义组件的 hydration、作用域和生命周期。

示例（简单伪代码）：

```ts
// 1) 提取自定义标签
const extracted = new Map<string,string>()
let id = 1
const contentWithPlaceholders = source.replace(/<MyWidget[\s\S]*?<\/MyWidget>/g, (m)=>{
	const key = `[[CUSTOM:${id++}]]`
	extracted.set(key, m)
	return key
})

// 2) 用占位符内容解析 Markdown
const nodes = parseMarkdownToStructure(contentWithPlaceholders)

// 3) 渲染阶段：遇到占位符节点时，挂载对应的自定义组件
// if (node.type === 'text' && extracted.has(node.content)) {
//   return h(CustomWrapper, { raw: extracted.get(node.content) })
// }
```

短小的 thinking 片段
-- 如果你的场景只是需要对短小的“thinking”片段进行轻量渲染（例如 AI 助手的思路记录），可以复用库中为流式渲染设计的 `MarkdownRenderer`（`MarkdownRender` 内部使用的渲染器）来渲染这些片段，它比自己把 AST 拼回组件树要轻量很多。你可以通过 `parseOptions` 或 `preTransform` 钩子识别 thinking 区域，使用轻量渲染器渲染思路文本，同时对复杂的标签型自定义组件仍然采用前置抽取并单独渲染的策略。

这种混合方案兼顾了可维护性与渲染灵活性，避免了对 Markdown AST 的脆弱字符串操作。

