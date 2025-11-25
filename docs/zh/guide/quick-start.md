# 快速开始

示例：

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'

const md = `# Hello World\n\n这是 **加粗** 的文本。`
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```

如果使用 Nuxt 或 SSR，请用 `<client-only>` 包裹。
