---
hero:
  name: markstream
  text: Streaming-friendly Markdown renderer
  tagline: Vue 3 • Vue 2 • React • Nuxt
  actions:
    - theme: brand
      text: Get Started
      link: /guide/quick-start
    - theme: alt
      text: '⭐ Star on GitHub'
      link: https://github.com/Simon-He95/markstream-vue
---

# markstream-vue

A streaming-friendly, Vue 3 markdown renderer with progressive Mermaid support, streaming diff code blocks and high-performance handling of large documents.

<div class="star-reminder-inline">

If you find markstream-vue helpful, please consider <a href="https://github.com/Simon-He95/markstream-vue" target="_blank" rel="noopener noreferrer">giving us a star ⭐</a> on GitHub!

</div>

## Choose Your Framework

markstream is available for multiple frameworks. Select your preferred framework to view the specific documentation and examples:

::: tip Framework Support
All versions share the same core features with framework-optimized APIs.
:::

### Vue 3 (markstream-vue) ⭐ Recommended

The latest version with full Vue 3 Composition API support.

- **Documentation**: [/guide/](/guide/)
- **Installation**: [/guide/installation](/guide/installation)
- **Quick Start**: [/guide/quick-start](/guide/quick-start)
- **Components API**: [/guide/components](/guide/components)
- **Live Demo**: https://markstream-vue.simonhe.me/

```vue
<script setup>
import MarkdownRender from 'markstream-vue'

const md = '# Hello Vue 3!'
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```

### Vue 2 (markstream-vue2)

Full support for Vue 2.6+ (with Composition API) and Vue 2.7+.

- **Documentation**: [/guide/vue2-quick-start](/guide/vue2-quick-start)
- **Installation**: [/guide/vue2-installation](/guide/vue2-installation)
- **Quick Start**: [/guide/vue2-quick-start](/guide/vue2-quick-start)
- **Components API**: [/guide/vue2-components](/guide/vue2-components)
- **Live Demo**: https://markstream-vue2.pages.dev/

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  components: { MarkdownRender },
  data() {
    return { markdown: '# Hello Vue 2!' }
  }
}
</script>

<template>
  <MarkdownRender :content="markdown" />
</template>
```

### React (markstream-react)

React 18+ with hooks support and full TypeScript.

- **Documentation**: [/guide/react-quick-start](/guide/react-quick-start)
- **Installation**: [/guide/react-installation](/guide/react-installation)
- **Quick Start**: [/guide/react-quick-start](/guide/react-quick-start)
- **Components API**: [/guide/react-components](/guide/react-components)
- **Live Demo**: https://markstream-react.netlify.app/

```tsx
import MarkdownRender from 'markstream-react'

function App() {
  return <MarkdownRender content="# Hello React!" />
}
```

### Nuxt (markstream-vue)

Server-side rendering support for Nuxt 3.

- **Documentation**: [/nuxt-ssr](/nuxt-ssr)
- **Live Demo**: https://markstream-nuxt.simonhe.me/

## Quick Links

**Common Resources**
- [Troubleshooting](/guide/troubleshooting) - CSS/reset order, peers, and common issues
- [Parser API](/guide/parser-api) - Advanced parsing and AST manipulation
- [Features](/guide/features) - Streaming, Mermaid, Monaco, and more

**AI/LLM Integration**
- [AI/LLM Context](/llms) (English)
- [AI/LLM 上下文](/llms.zh-CN) (中文)

## Why move from README to a docs site

This docs site is intended to break the long README into smaller pages for discoverability and better navigation. Use the left sidebar to explore Quick Start, Installation, and advanced topics.

## Contents

- Guide: Installation, Quick start and examples
- Nuxt SSR: Nuxt specific SSR guide
- e2e and investigations: Performance, cache and tests
