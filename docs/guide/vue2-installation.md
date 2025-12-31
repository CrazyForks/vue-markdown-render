# Vue 2 Installation

Install markstream-vue2 with pnpm, npm or yarn.

```bash
pnpm add markstream-vue2
# or
npm install markstream-vue2
# or
yarn add markstream-vue2
```

## Requirements

markstream-vue2 requires:
- **Vue 2.6.14+** (Vue 2.7 is recommended for better TypeScript support)
- **@vue/composition-api** (if using Vue 2.6.x)

## Optional Peer Dependencies

markstream-vue2 supports various features through optional peer dependencies. Install only what you need:

| Feature | Required Packages | Install Command |
|---------|------------------|-----------------|
| Code Syntax Highlighting | `shiki`, `stream-markdown` | `pnpm add shiki stream-markdown` |
| Monaco Editor (full code block features) | `stream-monaco` | `pnpm add stream-monaco` |
| Mermaid Diagrams | `mermaid` | `pnpm add mermaid` |
| Math Rendering (KaTeX) | `katex` | `pnpm add katex` |

## Vue 2.6.x Setup

If you're using Vue 2.6.x, you need to install and configure `@vue/composition-api`:

```bash
pnpm add @vue/composition-api
```

Then in your app entry:

```ts
import VueCompositionAPI from '@vue/composition-api'
import Vue from 'vue'

Vue.use(VueCompositionAPI)
```

## Enable feature loaders (Mermaid / KaTeX)

After installing optional peers, opt-in loaders in your client entry:

```ts
import { enableKatex, enableMermaid } from 'markstream-vue2'

enableMermaid()
enableKatex()
```

Also remember required CSS:

```ts
import 'markstream-vue2/index.css'
import 'katex/dist/katex.min.css'
import 'mermaid/dist/mermaid.css'
```

Monaco (`stream-monaco`) does not require a separate CSS import.

Note: `markstream-vue2/index.css` is scoped under an internal `.markstream-vue` container to reduce global style conflicts. `MarkdownRender` renders inside that container by default. If you render node components standalone, wrap them with `<div class="markstream-vue">...</div>`.

### Quick Install: All Features

To enable all features at once:

```bash
pnpm add shiki stream-markdown stream-monaco mermaid katex
# or
npm install shiki stream-markdown stream-monaco mermaid katex
```

### Feature Details

#### Code Syntax Highlighting

Requires both `shiki` and `stream-markdown`:

```bash
pnpm add shiki stream-markdown
```

This enables syntax highlighting in code blocks using Shiki.

#### Monaco Editor

For full code block functionality (copy button, font size controls, expand/collapse):

```bash
pnpm add stream-monaco
```

Without `stream-monaco`, code blocks will render but interactive buttons may not work.

#### Mermaid Diagrams

For rendering Mermaid diagrams:

```bash
pnpm add mermaid
```

#### KaTeX Math Rendering

For math formula rendering:

```bash
pnpm add katex
```

Also import the KaTeX CSS in your app entry:

```ts
import 'katex/dist/katex.min.css'
```

## Quick Test

Import and render a simple markdown string:

```vue
<script>
import MarkdownRender from 'markstream-vue2'
import 'markstream-vue2/index.css'

export default {
  components: {
    MarkdownRender
  },
  data() {
    return {
      md: '# Hello from markstream-vue2!'
    }
  }
}
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```

## Using with Composition API (Vue 2.7+)

If you're using Vue 2.7 or have `@vue/composition-api` installed:

```vue
<script>
import { defineComponent, ref } from '@vue/composition-api' // or 'vue' for 2.7
import MarkdownRender from 'markstream-vue2'
import 'markstream-vue2/index.css'

export default defineComponent({
  components: {
    MarkdownRender
  },
  setup() {
    const md = ref('# Hello from markstream-vue2 with Composition API!')
    return { md }
  }
})
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```

## TypeScript Support

markstream-vue2 includes TypeScript definitions. For Vue 2.6.x, you may need to configure your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["@vue/composition-api"]
  }
}
```

For Vue 2.7+, types are included automatically.
