# Examples

Short examples; see `playground` for interactive demos.

## Streaming Markdown
```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { ref } from 'vue'

const content = ref('')
const fullContent = `# Streaming Content\n\nThis text appears character by character...`
let i = 0
const interval = setInterval(() => {
  if (i < fullContent.length) {
    content.value += fullContent[i]
    i++
  }
  else {
    clearInterval(interval)
  }
}, 50)
</script>

<template>
  <MarkdownRender :content="content" />
</template>
```

## Typewriter + TypeScript example
- Use `typewriter` prop to enable enter transition

## Rendering with `nodes`
- Call `parseMarkdownToStructure` from `stream-markdown-parser` and pass `nodes` to `MarkdownRender` for custom rendering.
