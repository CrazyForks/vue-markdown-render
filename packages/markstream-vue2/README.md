# markstream-vue2

Vue 2.6-compatible renderer for markstream-vue.

## Install

```bash
pnpm add markstream-vue2
# npm i markstream-vue2
# yarn add markstream-vue2
```

## Usage (Vue 2.6)

```ts
import MarkdownRender, { VueRendererMarkdown } from 'markstream-vue2'
import Vue from 'vue'
import 'markstream-vue2/index.css'

Vue.use(VueRendererMarkdown)

new Vue({
  render: h => h(MarkdownRender, {
    props: {
      content: '# Hello from Vue 2',
    },
  }),
}).$mount('#app')
```

## Tailwind

If your app uses Tailwind and you want to avoid shipping duplicated utility CSS, import the Tailwind-ready output instead:

```ts
import 'markstream-vue2/index.tailwind.css'
```

Then include the extracted class list in `tailwind.config.js`:

```js
module.exports = {
  content: [
    './src/**/*.{js,ts,vue}',
    require('markstream-vue2/tailwind'),
  ],
}
```

## Notes

- The Vue 2 package mirrors the Vue 3 renderer feature set where possible (virtualization, streaming code blocks, Monaco, Mermaid, KaTeX, tooltip singleton).
- Optional peers are still required for those features (`stream-monaco`, `stream-markdown`, `mermaid`, `katex`, etc.).
- Custom node components are supported via `setCustomComponents` from `markstream-vue2`.
