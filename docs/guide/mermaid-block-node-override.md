# Override MermaidBlockNode in MarkdownRender

If you want to completely replace the `mermaid` renderer used by `MarkdownRender` (for example in the `playground-demo`), you can use `setCustomComponents` and provide a programmatic renderer that mounts `MermaidBlockNode` with custom event handlers.

Example:

```ts
import { h } from 'vue'

setCustomComponents('playground-demo', {
  mermaid: (props: any) => h(MermaidBlockNode, {
    ...props,
    onExport: (ev: any) => {
      // read the rendered svg from ev.svgElement and upload or save
      const svgEl = ev.svgElement as SVGElement | null
      if (svgEl) {
        const svgString = new XMLSerializer().serializeToString(svgEl)
        uploadSvgToServer(svgString)
      }
      ev.preventDefault()
    },
  }),
})
```

Key points:
- Use `onExport` / `onCopy` (camelCase) when passing listeners via `h()`.
- Call `ev.preventDefault()` to prevent the default behavior inside `MermaidBlockNode`.
- `ev.svgElement` (if present) gives direct access to the rendered SVG DOM node.
