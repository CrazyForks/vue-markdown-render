# MermaidBlockNode (component)

MermaidBlockNode is the component used internally to render mermaid `code_block` nodes. It supports progressive rendering, a small header toolbar (preview/source, copy, export, fullscreen) and emits interceptable events so consumers can substitute behaviors.

Quick example — use in Vue templates:

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '```mermaid\ngraph LR\nA-->B\n```'
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```

Override example — full page override / custom export (see docs):

- Docs: /guide/mermaid-block-node
- Override example: /guide/mermaid-block-node-override

This component emits `export` and `openModal` events which expose `ev.svgElement` and `ev.svgString` and support `ev.preventDefault()` so consumers can fully take over export behavior (upload/download). `svgString` is the serialized SVG (ready for upload or blob generation).

Example (use svgString directly):

```ts
function onExport(ev: any) {
  ev.preventDefault()
  const svg = ev.svgString || (ev.svgElement ? new XMLSerializer().serializeToString(ev.svgElement) : null)
  if (svg)
    customUploadSvg(svg)
}
```
