# 高级定制 — parseOptions 与自定义节点

`parseOptions` 支持三类钩子：

- `preTransformTokens?: (tokens: MarkdownToken[]) => MarkdownToken[]`
- `postTransformTokens?: (tokens: MarkdownToken[]) => MarkdownToken[]`
- `postTransformNodes?: (nodes: ParsedNode[]) => ParsedNode[]`

示例：将 `html_block` 中的 `<thinking>` 标签映射为自定义 `thinking` 节点，然后使用 `setCustomComponents` 注册组件进行渲染。

### Typewriter 动画

`MarkdownRender` 支持 `typewriter` prop 来控制入场动画；在 SSR 或打印场景中建议禁用此动画以获得确定性的输出。

```vue
<MarkdownRender :content="markdown" :typewriter="false" />
```
