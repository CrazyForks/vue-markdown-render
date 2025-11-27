# 在 MarkdownRender 中覆盖 MermaidBlockNode（示例）

如果你想在 `MarkdownRender` 中完全替换 `mermaid` 渲染器（例如在 `playground-demo`），可以使用 `setCustomComponents`，为 `mermaid` 提供一个 programmatic 的渲染函数，并传入自定义事件处理器来拦截组件的默认行为。

示例：

```ts
import { MermaidBlockNode, setCustomComponents } from 'markstream-vue'
import { h } from 'vue'

setCustomComponents('playground-demo', {
  mermaid: (props: any) => h(MermaidBlockNode, {
    ...props,
    // 使用 `h()` 时，通过驼峰的 on<EventName> 传入事件监听器
    onExport: (ev: any) => {
      // 如果组件在事件中暴露了 svgElement，可以直接使用
      const svgEl = ev.svgElement as SVGElement | null
      if (svgEl) {
        const svgString = new XMLSerializer().serializeToString(svgEl)
        // 将 svgString 上传或保存到后端
        uploadSvgToServer(svgString)
      }
      // 阻止组件默认的导出行为
      ev.preventDefault()
    },
    onCopy: (ev: any) => {
      ev.preventDefault()
      console.log('MermaidBlockNode copy event:', ev)
    },
  }),
})
```

要点：

- 在使用 `h()` programmatic 渲染组件时，事件监听器应使用 `on<EventName>` 的驼峰形式（例如 `onExport`、`onCopy`）。
- 在监听器中调用 `ev.preventDefault()` 可以阻止 `MermaidBlockNode` 的默认处理，完全由你接管行为（如上传、存储或自定义下载）。
- `MermaidBlockEvent` 可能会在 `ev.svgElement` 中提供渲染后的 `svg` DOM 节点，便于你直接序列化或修改它。

如果你希望我把这个示例内联到组件 README 中或把该页面加入 docs 侧栏，我可以继续帮你完成。
