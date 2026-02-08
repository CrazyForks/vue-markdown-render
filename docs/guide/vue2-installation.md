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
| Shiki code blocks (`MarkdownCodeBlockNode`) | `shiki`, `stream-markdown` | `pnpm add shiki stream-markdown` |
| Monaco Editor (full code block features) | `stream-monaco` | `pnpm add stream-monaco` |
| Mermaid Diagrams | `mermaid` | `pnpm add mermaid` |
| D2 Diagrams | `@terrastruct/d2` | `pnpm add @terrastruct/d2` |
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

## Feature loaders (Mermaid / KaTeX / D2)

After installing optional peers, the default loaders are already enabled. Only call these helpers if you disabled them earlier or need a custom loader (for example, a CDN build):

```ts
import { enableD2, enableKatex, enableMermaid } from 'markstream-vue2'

// optional: re-enable or override loaders
enableMermaid()
enableKatex()
enableD2()
```

Also remember required CSS (when the feature is used):

```ts
import 'markstream-vue2/index.css'
import 'katex/dist/katex.min.css'
```

Monaco (`stream-monaco`) does not require a separate CSS import.

Note: `markstream-vue2/index.css` is scoped under an internal `.markstream-vue2` container to reduce global style conflicts. `MarkdownRender` renders inside that container by default. If you render node components standalone, wrap them with `<div class="markstream-vue2">...</div>`.

## Vue CLI (Webpack 4) Notes

Vue CLI 4 uses **Webpack 4** by default, and Webpack 4 doesn't support `package.json#exports`. That commonly breaks:

- `import 'markstream-vue2/index.css'`
- `import('mermaid')`
- Vite-style worker imports: `?worker` / `?worker&inline`

Recommended setup (see `playground-vue2-cli`):

1) Import CSS via the real file path (no `exports` needed):

```ts
import 'markstream-vue2/dist/index.css'
```

2) For Mermaid, prefer the CDN global build (avoids Webpack 4 `exports` / ESM chains):

```html
<!-- public/index.html -->
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
```

3) For KaTeX / Mermaid workers, prefer CDN workers to avoid Webpack 4 worker limitations:

```ts
import { createKaTeXWorkerFromCDN, createMermaidWorkerFromCDN, setKaTeXWorker, setMermaidWorker } from 'markstream-vue2'

const { worker: katexWorker } = createKaTeXWorkerFromCDN({
  mode: 'classic',
  katexUrl: 'https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/katex.min.js',
  mhchemUrl: 'https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/contrib/mhchem.min.js',
})
if (katexWorker)
  setKaTeXWorker(katexWorker)

const { worker: mermaidWorker } = createMermaidWorkerFromCDN({
  mode: 'classic',
  mermaidUrl: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',
})
if (mermaidWorker)
  setMermaidWorker(mermaidWorker)
```

If you want to keep using subpath imports like `markstream-vue2/index.css`, add `resolve.alias` mappings in `vue.config.js` (see `playground-vue2-cli/vue.config.js`).

### Code blocks: prefer stream-markdown override

In Webpack 4, Monaco integration (`stream-monaco`) is prone to edge cases (worker resolution, ESM entrypoints, service registration, and Shiki/TextMate regex engine init issues). If your goal is “render code blocks with highlighting”, the most reliable approach is:

1) Install Shiki renderer deps:

```bash
pnpm add shiki stream-markdown
```

2) Override `code_block` to use `MarkdownCodeBlockNode` (or your own component):

```ts
import { MarkdownCodeBlockNode, setCustomComponents } from 'markstream-vue2'

setCustomComponents({ code_block: MarkdownCodeBlockNode })
```

3) Webpack config pitfalls:

- If you use `webpack.IgnorePlugin` for optional dependencies, ensure `stream-markdown` is **not** ignored.
- `stream-markdown` is ESM-only. In a CJS `vue.config.js`, `require.resolve('stream-markdown')` can fail even when installed. Use a filesystem fallback (check `node_modules/stream-markdown`) and alias it to `dist/index.js`. See `playground-vue2-cli/vue.config.js`.

If you're in a monorepo/workspace (common with pnpm), make sure your app uses a **single Vue 2 runtime instance**. Otherwise you may see runtime warnings like:
`provide() can only be used inside setup()` / `onMounted is called when there is no active component instance` (caused by duplicated Vue copies and mismatched Composition API context). Fix this by pinning `vue$` to your project's Vue 2 runtime in Webpack (see `playground-vue2-cli/vue.config.js`).

## Tailwind CSS Support

If your app uses Tailwind and you want to avoid duplicate utility CSS, import the Tailwind-ready output instead:

```ts
import 'markstream-vue2/index.tailwind.css'
```

And include the extracted class list in `tailwind.config.js`:

```js
module.exports = {
  content: [
    './src/**/*.{js,ts,vue}',
    require('markstream-vue2/tailwind'),
  ],
}
```

This approach ensures that Tailwind includes all the utility classes used by markstream-vue2 in its purge process, resulting in a smaller final bundle size.

### Quick Install: All Features

To enable all features at once:

```bash
pnpm add shiki stream-markdown stream-monaco mermaid @terrastruct/d2 katex
# or
npm install shiki stream-markdown stream-monaco mermaid @terrastruct/d2 katex
```

### Feature Details

#### Code Syntax Highlighting

Requires both `shiki` and `stream-markdown`:

```bash
pnpm add shiki stream-markdown
```

These packages power the Shiki-based `MarkdownCodeBlockNode`. To use Shiki inside `MarkdownRender`, override the `code_block` renderer (or render `MarkdownCodeBlockNode` directly).

```js
import MarkdownRender, { MarkdownCodeBlockNode, setCustomComponents } from 'markstream-vue2'

setCustomComponents({ code_block: MarkdownCodeBlockNode })
```

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

#### D2 Diagrams

For rendering D2 diagrams:

```bash
pnpm add @terrastruct/d2
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
