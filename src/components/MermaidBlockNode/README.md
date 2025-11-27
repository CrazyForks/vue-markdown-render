# MermaidBlockNode

`MermaidBlockNode` 是用于渲染 Mermaid 图的组件，支持渐进式渲染、源码/预览切换、导出 SVG、复制源码以及伪全屏（modal）查看并带缩放/拖拽控制。

主要特性
- Preview / Source 切换（可被隐藏或替换）
- 复制源码（支持 tooltip）
- 导出 SVG（组件提供默认行为，也可拦截）
- 伪全屏 modal：支持缩放与拖拽
- 可通过 props 控制头部按钮可见性
- 支持命名插槽接管头部左右/中区域
- Emits 事件对象支持 `preventDefault()`，以拦截组件默认行为

主要 Props（摘要）
- `node` — Mermaid code node（必需）
- `isDark?: boolean`
- `loading?: boolean`
- `maxHeight?: string | null`

头部/按钮控制（默认均为 true）
- `showHeader?: boolean`
- `showModeToggle?: boolean`
- `showCopyButton?: boolean`
- `showExportButton?: boolean`
- `showFullscreenButton?: boolean`
- `showCollapseButton?: boolean`
- `showZoomControls?: boolean`

```ts
function onExport(ev: any /* MermaidBlockEvent */) {
  ev.preventDefault()
  // Component exposes the rendered SVG element on the event as `svgElement`
  const svgEl = ev.svgElement as SVGElement | null
  if (!svgEl) return
  const svgString = new XMLSerializer().serializeToString(svgEl)
  // run custom export logic with `svgString`
  customExportSvg(svgString)
}
```
- `toggleMode` — 当用户切换 `source` / `preview` 时发出 `(target, ev)`，其中 `ev` 是 `MermaidBlockEvent`，可 `preventDefault()` 阻止默认切换

事件对象说明
`MermaidBlockEvent<T>` 的结构（组件导出于 `src/types/component-props.ts`）:
```ts
interface MermaidBlockEvent<TPayload = any> {
  payload?: TPayload
  defaultPrevented: boolean
  preventDefault(): void
  originalEvent?: Event | null
  // optional: direct access to the rendered SVG element
  svgElement?: SVGElement | null
  // optional: serialized SVG string (may be omitted to avoid extra work)
  svgString?: string | null
}
```

如果你需要完全接管导出行为（例如上传 SVG 到后端），请在监听 `export` 事件时调用 `preventDefault()`，并自行处理 SVG 提取和上传。例如：

```vue
<MermaidBlockNode
  :node="node"
  @export="(ev) => { ev.preventDefault(); customExport(); }"
/>
```

提取当前 SVG 的简便方法（在 consumer 端）：
```ts
function customExport() {
  // find the rendered svg inside the component DOM
  const root = document.querySelector('.mermaid-block-header')?.closest('.my-4')
  const svg = root?.querySelector('svg')
  if (svg) {
    const data = new XMLSerializer().serializeToString(svg)
    // upload or create blob etc.
  }
}
```

如需我把当前实现改为在 `export`/`openModal` 事件中直接携带 `svg` 字符串（作为 `payload`），我可以代为实现并更新文档。
