# Guide

This guide breaks the core content into smaller pages:

- [Installation](/guide/installation)
- [Quick Start](/guide/quick-start)
- [Features](/guide/features)
- [Usage & API](/guide/usage)

Use the side navigation to explore more details and advanced usage.

Quick try — render a short guide page directly in your app or docs playground:

```vue
<script setup>
import MarkdownRender from 'markstream-vue'

const md = '# Welcome to the guide\n\nThis is a short demo.'
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```
