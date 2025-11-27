# MermaidBlockNode (Component)

`MermaidBlockNode` is a lightweight, extensible renderer for Mermaid diagrams intended for embedding interactive Mermaid charts within documents. The component supports progressive rendering, source/preview toggling, copying source, exporting SVG, and a pseudo-fullscreen modal (with zoom and drag).

## Props (key)
- `node: any` — the Mermaid code node (required)
- `isDark?: boolean` — dark mode flag
- `loading?: boolean` — initial loading placeholder
- `maxHeight?: string | null` — maximum height
- Header / control props (all optional, default `true`):
  - `showHeader`, `showModeToggle`, `showCopyButton`, `showExportButton`, `showFullscreenButton`, `showCollapseButton`, `showZoomControls`

## Slots
- `header-left` — replace the left area (defaults to Mermaid icon + label)
- `header-center` — replace the center area (defaults to preview/source toggle)
- `header-right` — replace the right-side action buttons (take full control of the default controls)

## Emits
The component emits events using a unified `MermaidBlockEvent` object. Listeners can call `preventDefault()` on the event to stop the component's default behavior:

- `copy` — copy event (component retains default copy behavior unless prevented)
- `export` — export button clicked, signature: `(ev: MermaidBlockEvent<{ type: 'export' }>)`
- `openModal` — request to open the pseudo-fullscreen modal, signature: `(ev: MermaidBlockEvent<{ type: 'openModal' }>)`
- `toggleMode` — toggle between `source` and `preview`, signature: `(target: 'source' | 'preview', ev: MermaidBlockEvent<{ type: 'toggleMode'; target: 'source' | 'preview' }>)`

### Intercept example
Completely override the component's default export behavior:

```vue
<script setup lang="ts">
import type { MermaidBlockEvent } from '../../types/component-props'

function onExport(ev: any /* MermaidBlockEvent */) {
  ev.preventDefault()
  // The component exposes the rendered SVG element on the event as `svgElement`.
  const svgEl = ev.svgElement as SVGElement | null
  if (!svgEl) {
    console.warn('No svg element available')
    return
  }
  const svgString = new XMLSerializer().serializeToString(svgEl)
  uploadSvg(svgString)
}
</script>

<template>
  <MermaidBlockNode :node="node" @export="onExport" />
</template>
```

> Note: The event object currently includes `svgElement` (the DOM node). If you prefer the component to also provide a serialized `svgString` in the event payload, I can add that.

## Slot example — fully replace right-side controls

```vue
<MermaidBlockNode :node="node" :showExportButton="false">
  <template #header-right>
    <button @click="downloadSvg">Download</button>
    <button @click="openCustomModal">Open custom modal</button>
  </template>
</MermaidBlockNode>
```

## Recommended usage
- To implement custom export/upload behavior, call `preventDefault()` in the `export` listener and extract the SVG from the rendered DOM in your handler.
- To fully replace the header UI, use the `header-*` slots and set the corresponding `show*` props to `false` to hide the default controls.

---

If you'd like me to:
- A) add `svgString` to the `export` / `openModal` event payloads (I can implement and update docs);
- B) add this page to the docs sidebar/navigation (requires docs config changes);
- C) create a runnable demo/playground page for this example;
please choose one to continue.

## See also

- Override `MermaidBlockNode` (use `setCustomComponents` with `MarkdownRender`): [Override MermaidBlockNode in MarkdownRender](./mermaid-block-node-override.md)
