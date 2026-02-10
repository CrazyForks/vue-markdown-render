# markstream-vue2

Vue 2.6-compatible renderer for markstream-vue.

## Install

```bash
pnpm add markstream-vue2
# npm i markstream-vue2
# yarn add markstream-vue2
```

## Requirements

- Vue 2.6.14+ (Vue 2.7 recommended for better TS support)
- @vue/composition-api (required for Vue 2.6.x)

## Composition API compatibility

| Vue version | Composition API availability | What to install | How to import |
|-------------|------------------------------|-----------------|---------------|
| **2.6.x** | Not built-in | `@vue/composition-api` | `import { ref, computed, defineComponent } from '@vue/composition-api'` |
| **2.7.x** | Built-in | None | `import { ref, computed, defineComponent } from 'vue'` |
| **3.x** | Built-in | None | `import { ref, computed, defineComponent } from 'vue'` |

Notes:
- **Vue 2.6.x** must install and **Vue.use(@vue/composition-api)**.
- **Vue 2.7.x** should **not** install `@vue/composition-api`.
- **Vue 3.x** should use **markstream-vue** (not markstream-vue2).

## Quick start by version

### Vue 2.6.x

```bash
pnpm add markstream-vue2 vue@2.6.14 vue-template-compiler@2.6.14 @vue/composition-api
```

```ts
import VueCompositionAPI from '@vue/composition-api'
import MarkdownRender, { VueRendererMarkdown } from 'markstream-vue2'
import Vue from 'vue'
import 'markstream-vue2/index.css'

Vue.use(VueCompositionAPI)
Vue.use(VueRendererMarkdown)
```

Repo example:
- `playground-vue2-cli` (Vue 2.6 + Vue CLI / Webpack 4)

Start:

```bash
pnpm -C playground-vue2-cli dev
```

From repo root:

```bash
pnpm play:vue2-cli
```

### Vue 2.7.x

```bash
pnpm add markstream-vue2 vue@2.7.16 vue-template-compiler@2.7.16
```

```ts
import MarkdownRender, { VueRendererMarkdown } from 'markstream-vue2'
import Vue from 'vue'
import 'markstream-vue2/index.css'

Vue.use(VueRendererMarkdown)
```

Repo example:
- `playground-vue2` (Vue 2.7 + Vite)

Start:

```bash
pnpm -C playground-vue2 dev
```

From repo root:

```bash
pnpm play:vue2
```

### Vue 3.x (use markstream-vue)

```bash
pnpm add markstream-vue vue@^3
```

If your workspace also installs Vue 3, ensure `vue-demi` targets Vue 2:

```bash
pnpm vue-demi-switch 2
```

If you cannot run `vue-demi-switch`, you can force the Vue 2 build via bundler alias (common in Vue CLI / Webpack 4):

```js
// vue.config.js / webpack config
module.exports = {
  configureWebpack: {
    resolve: {
      alias: {
        'vue-demi$': 'vue-demi/lib/v2/index.cjs',
      },
    },
  },
}
```

## Usage (Vue 2.6)

```ts
import VueCompositionAPI from '@vue/composition-api'
import MarkdownRender, { VueRendererMarkdown } from 'markstream-vue2'
import Vue from 'vue'
import 'markstream-vue2/index.css'

Vue.use(VueCompositionAPI)
Vue.use(VueRendererMarkdown)

new Vue({
  render: h => h(MarkdownRender, {
    props: {
      content: '# Hello from Vue 2',
    },
  }),
}).$mount('#app')
```

## Troubleshooting

### `defineComponent is not a function`
Cause: `vue-demi` is in Vue 3 mode while the app runs Vue 2.x.
Fix: run `pnpm vue-demi-switch 2` or alias `vue-demi$` to `vue-demi/lib/v2/index.cjs`.

### `Vue packages version mismatch`
Cause: `vue` and `vue-template-compiler` versions differ.
Fix: align both to the same version (e.g. `2.6.14` or `2.7.16`).

### `Cannot read properties of undefined (reading 'props')`
Cause: Vue 2.6 + Composition API missing `_setupProxy` patch, or plugin not installed.
Fix: ensure `@vue/composition-api` is installed + `Vue.use(...)`, and update to the latest markstream-vue2 build.

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
