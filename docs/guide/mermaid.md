# Mermaid: Progressive Rendering Example

Mermaid diagrams can be streamed progressively. The diagram renders as soon as the syntax becomes valid and refines as more content arrives.

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { ref } from 'vue'

const content = ref('')
const steps = [
  '```mermaid\n',
  'graph TD\n',
  'A[Start]-->B{Is valid?}\n',
  'B -- Yes --> C[Render]\n',
  'B -- No  --> D[Wait]\n',
  '```\n',
]

let i = 0
const id = setInterval(() => {
  content.value += steps[i] || ''
  i++
  if (i >= steps.length)
    clearInterval(id)
}, 120)
</script>

<template>
  <MarkdownRender :content="content" />
  <!-- Diagram progressively appears as content streams in -->
</template>
```

Notes:
- Mermaid must be installed as a peer dependency for diagrams to render.
- If Mermaid fails to render, the component will fall back to showing the source text.
- For heavy diagrams, consider pre-rendering server-side or caching the SVG output.

See also:

- `MermaidBlockNode` — advanced Mermaid component with header controls, export, and modal: [MermaidBlockNode guide](./mermaid-block-node.md)

Quick try — paste this Markdown into a page or component to test progressive Mermaid rendering:

```md
\`\`\`mermaid
graph LR
A[Start]-->B
B-->C[End]
\`\`\`
```

![Mermaid demo](/screenshots/mermaid-demo.svg)
