# Guide

## Choose Your Framework

This documentation covers multiple framework versions. Select your preferred framework:

### Vue 3 (markstream-vue) ⭐ Recommended

The latest and most feature-rich version.

| Page | Description |
|------|-------------|
| [Installation](/guide/installation) | Setup and peer dependencies |
| [Quick Start](/guide/quick-start) | Get started in minutes |
| [Features](/guide/features) | Streaming, Mermaid, Monaco, and more |
| [Components API](/guide/components) | Full component reference |
| [Usage & API](/guide/usage) | Advanced usage patterns |

### Vue 2 (markstream-vue2)

For Vue 2.6+ (with Composition API) and Vue 2.7+ projects.

| Page | Description |
|------|-------------|
| [Installation](/guide/vue2-installation) | Vue 2 specific setup |
| [Quick Start](/guide/vue2-quick-start) | Vue 2 examples |
| [Components & API](/guide/vue2-components) | Vue 2 component reference |

### React (markstream-react)

For React 18+ projects with hooks and TypeScript.

| Page | Description |
|------|-------------|
| [Installation](/guide/react-installation) | React specific setup |
| [Quick Start](/guide/react-quick-start) | React examples |
| [Components & API](/guide/react-components) | React component reference |

### Nuxt

For Nuxt 3 SSR applications.

- [Nuxt SSR Guide](/nuxt-ssr) - Server-side rendering configuration

---

## Quick Try

Render a short guide page directly in your app:

```vue
<script setup>
import MarkdownRender from 'markstream-vue'

const md = '# Welcome to the guide\n\nThis is a short demo.'
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```

Use the left sidebar navigation to explore all topics in detail.
