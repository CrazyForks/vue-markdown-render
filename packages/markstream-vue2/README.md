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

- This is a baseline Vue 2 port focused on correct rendering.
- Advanced Vue 3 optimizations (virtualization, streaming code blocks, Monaco, Mermaid, KaTeX renderers, tooltip singleton) are not included yet.
- Custom node components are supported via `setCustomComponents` from `markstream-vue2`.
