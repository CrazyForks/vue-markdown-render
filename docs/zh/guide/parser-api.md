# 解析器 — API 详解

此页从 `packages/markdown-parser` 提取常用函数、类型与便捷工具，便于构建更高级或自定义的解析流程。

## 主要函数

### `getMarkdown(msgId?, options?)`
创建配置好的 `markdown-it-ts` 实例。

参数：
- `msgId` (string，可选)：实例标识
- `options` (GetMarkdownOptions，可选)：配置选项

选项示例：
- `plugin`：插件数组
- `apply`：用于变更 `MarkdownIt` 实例的函数数组
- `i18n`：翻译映射或函数

### `parseMarkdownToStructure(content, md?, options?)`
将 Markdown 字符串解析为供渲染器使用的节点树（AST）。

返回：`ParsedNode[]`

### 其他有用函数
- `processTokens(tokens)` — 将原始 token 处理为可用于构建节点列表的结构
- `parseInlineTokens(tokens, md)` — 解析 inline tokens

## 配置与工具

### `setDefaultMathOptions(options)`
设置全局 KaTeX 配置示例：

```ts
setDefaultMathOptions({
  commands: ['infty', 'perp'],
  escapeExclamation: true
})
```

### 工具函数
- `isMathLike(content)` — 判断文本是否可能为公式
- `findMatchingClose(src, startIdx, open, close)` — 查找匹配的闭合符号
- `parseFenceToken(token)` — 将 code fence 转为 `CodeBlockNode`
- `normalizeStandaloneBackslashT(content, options?)` — 规范化数学内容中的特殊转义

## 解析钩子（高级）
传入 `ParseOptions` 可使用以下钩子：
- `preTransformTokens`、`postTransformTokens`、`postTransformNodes`。

这些钩子也可通过 `MarkdownRender` 组件传入 `parseOptions` prop（仅当使用 `content` prop 时生效）。

## 类型提示
导出的类型包含 `CodeBlockNode`、`ParsedNode` 等，可在 TS 中导入：
```ts
import type { CodeBlockNode, ParsedNode } from 'stream-markdown-parser'
```

## 插件与默认配置
默认启用一些常见插件（emoji、footnote、task checkbox 等），并支持通过 `getMarkdown` 的 `plugin` 选项自定义插件。

更多示例与完整 API 请参考仓库内的 `packages/markdown-parser/README.md`。
