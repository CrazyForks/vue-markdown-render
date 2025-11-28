# Installation

Install with pnpm, npm or yarn.

```bash
pnpm add markstream-vue
# or
npm install markstream-vue
# or
yarn add markstream-vue
```

Optional peer dependencies:

- mermaid (progressive diagrams)
- stream-monaco (Monaco editor streaming)
- shiki (syntax highlighting)
- katex (math rendering)

For KaTeX math rendering, also import the style in your app entry (e.g. `main.ts`):

```ts
import 'katex/dist/katex.min.css'
```

Quick test — import & render a simple markdown string:

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'

const md = '# Hello from markstream-vue!'
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```
