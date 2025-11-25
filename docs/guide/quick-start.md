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

See `/nuxt-ssr.md` for Nuxt-specific instructions.
