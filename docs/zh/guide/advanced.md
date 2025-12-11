# 高级定制 — parseOptions & 自定义节点

本页介绍如何自定义解析流程和提供作用域自定义组件。

## parseOptions
`parseOptions` 可传递给 `MarkdownRender` 或直接用于 `parseMarkdownToStructure`。

- `preTransformTokens?: (tokens: MarkdownToken[]) => MarkdownToken[]` — 在 `markdown-it` 解析后立即变换 tokens
- `postTransformTokens?: (tokens: MarkdownToken[]) => MarkdownToken[]` — 进一步变换 tokens
- `postTransformNodes?: (nodes: ParsedNode[]) => ParsedNode[]` — 操作最终节点树

### 示例：token 变换
```ts
function pre(tokens) {
  // 将 <thinking> HTML 块转换为 thinking 节点
  return tokens.map(t => t.type === 'html_block' && /<thinking>/.test(t.content || '')
    ? { ...t, type: 'thinking_block', content: t.content.replace(/<\/?.{2,}?>/g, '') }
    : t
  )
}

const nodes = parseMarkdownToStructure(markdown, md, { preTransformTokens: pre })
```

## 自定义组件解析示例

处理 `<thinking>` 等自定义组件时，`markdown-it` 对内联 HTML 支持有限，建议让标签单独换行（如 `a\n<thinking></thinking>\nb`，不要写成 `a<thinking></thinking>b`）。可以在传入解析前用正则修正换行，再用钩子变换 token：

```ts
const normalizeCustomBlocks = (raw: string) =>
  raw.replace(/<thinking([\s\S]*?)>([\s\S]*?)<\/thinking>/g, (_m, attrs, body) =>
    `\n<thinking${attrs || ''}>\n${body.trim()}\n</thinking>\n`,
  )

const preTransformTokens = (tokens: MarkdownToken[]) =>
  tokens.map(t =>
    t.type === 'html_block' && t.content?.includes('<thinking')
      ? { ...t, type: 'thinking_block', content: t.content.replace(/<\/?thinking.*?>/g, '').trim() }
      : t,
  )

const nodes = parseMarkdownToStructure(
  normalizeCustomBlocks(content),
  md,
  { preTransformTokens },
)
```

其他可选方案（按复杂度递增）：
- 后端将 `thinking` 拆成单独字段/类型：前端用两次 `MarkdownRender`，一个渲染 `thinking`，另一个渲染剩余正文，互不干扰。
- 在进入解析前用正则占位：先 `replace` 掉 `<thinking>...</thinking>` 保存到数组；正文用 `MarkdownRender`；最后把占位符替换回自定义组件渲染结果。`thinking` 常在开头时可以直接截取头部做单独渲染。

## setCustomComponents(id, mapping)
- 使用 `setCustomComponents('docs', { thinking: ThinkingComponent })` 作用于带 `custom-id="docs"` 的 `MarkdownRender` 实例。
- 调用 `removeCustomComponents` 清理映射，避免单页应用内存泄漏。

## 作用域示例
```vue
<MarkdownRender content="..." custom-id="docs" />
// 在 setup 中
setCustomComponents('docs', { thinking: ThinkingNode })
```

高级钩子是为 Markdown 添加领域语法的强大方式，无需更改核心解析器。

### Typewriter 属性

`MarkdownRender` 支持 `typewriter` 布尔属性，控制非 `code_block` 节点是否包裹小型 enter 过渡。适用于演示 UI，但在 SSR 或打印/导出场景下可能不需要。

示例：

```vue
<MarkdownRender :content="markdown" :typewriter="false" />
```

CSS 变量：`--typewriter-fade-duration` 和 `--typewriter-fade-ease` 可用于主题调整。

## 国际化（i18n）

默认 `getMarkdown` 使用英文 UI 文案（如代码块复制按钮）。你可以通过 `i18n` 选项自定义这些文本：

**翻译映射用法：**

```ts
import { getMarkdown } from 'markstream-vue'

const md = getMarkdown('editor-1', {
  i18n: {
    'common.copy': '复制',
  }
})
```

**翻译函数用法：**

```ts
import { getMarkdown } from 'markstream-vue'
import { useI18n } from 'vue-i18n' // 或其他 i18n 库

const { t } = useI18n()

const md = getMarkdown('editor-1', {
  i18n: (key: string) => t(key)
})
```

**默认翻译键：**

- `common.copy`：代码块复制按钮文本

该设计保证 markdown 工具函数纯净，无全局副作用，可与任意 i18n 方案集成或直接传入静态翻译。
