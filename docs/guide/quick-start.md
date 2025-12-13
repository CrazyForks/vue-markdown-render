# Quick Start

A minimal example using the library:

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'

const md = `# Hello World\n\nThis is **bold** and this is *italic*.`
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```

Optional: wrap with `<client-only>` for Nuxt/SSR.

See `/nuxt-ssr` for Nuxt-specific instructions.

Try this quickly in your app:

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'

const md = `# Hello world\n\nTry a simple Mermaid:\n\n\`\`\`mermaid\ngraph LR\nA-->B\n\`\`\`\n`
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```
