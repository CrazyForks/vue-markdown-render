# 组件 Props 与选项

此页汇总常用的组件 prop：

## 主要 props

- `content: string` — 提供原始 Markdown 字符串（除非传入 `nodes`，否则必填）
- `nodes: BaseNode[]` — 直接传入解析节点，跳过组件级解析

## 代码块渲染标记

### `renderCodeBlocksAsPre` — boolean
- 默认为 `false`
- 为 `true` 时，会把 `code_block` 节点渲染为简单的 `<pre><code>`，适合只读或不想增加 Monaco/mermaid 依赖的场景

### `codeBlockStream` — boolean
- 默认为 `true`
- 启用时，代码块会随内容流式更新；禁用时，代码块在未完成前保留加载占位以避免频繁初始化 Monaco

### `viewportPriority` — boolean
- 默认为 `true`
- 启用时，重节点（Mermaid、Monaco）会优先渲染可见区域内容，离屏内容延迟加载以提升交互性

## 代码块头部相关 props（简要）
- `showHeader` (boolean) — 控制头部显示
- `showCopyButton` (boolean) — 显示/隐藏复制按钮
- `showExpandButton` (boolean) — 显示/隐藏展开按钮
- `showPreviewButton` (boolean) — 显示/隐藏预览按钮

## 其他 props
- `parseOptions` — 支持 token 及节点级 hook（`preTransformTokens`、`postTransformTokens`、`postTransformNodes`）
- `customId` — 用于 `setCustomComponents` 的作用域键
- `typewriter` — 控制进入动画 (默认 `true`)

这些 props 用于调整流式行为与重度节点渲染，以匹配应用性能与 UX 要求。
