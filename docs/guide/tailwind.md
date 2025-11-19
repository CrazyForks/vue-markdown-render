# Tailwind Integration & Style Ordering

If your project uses a Tailwind component library like `shadcn`, you may run into style ordering or overriding issues when including `vue-renderer-markdown` CSS. The recommended approach is to import the library CSS inside a controlled Tailwind layer.

Example `styles/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  @import 'vue-renderer-markdown/index.css';
}
```

Alternatives:
- Place the library CSS inside `@layer base` if you want it to be more foundational and harder to override.
- Import the library CSS after your component or application CSS if you prefer the library styles to win.

Always re-run your dev server after changing the import order.

## Avoid duplicate CSS with Tailwind

To reduce duplicated utility CSS when using Tailwind, prefer the "tailwind-ready" output shipped by this package instead of the full, precompiled `index.css`.

- Tailwind v3 (recommended workflow):
  - Import `index.tailwind.css` in your app so consumers get only the framework+component styles without embedded Tailwind utilities.
  - Add the generated class list to your `tailwind.config.js` `content` so Tailwind can pick up the classes used by the renderer and not re-generate them.

Example (Tailwind v3 / `tailwind.config.js`):

```js
module.exports = {
  content: [
    './src/**/*.{js,ts,vue}',
    // include the helper produced by the package
    // installed packages can reference: require('vue-renderer-markdown/tailwind')
    require('vue-renderer-markdown/tailwind'),
  ],
}
```

Example CSS import (app entry):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import 'vue-renderer-markdown/index.tailwind.css';
```

- Tailwind v4: you can directly include `index.tailwind.css` and rely on the v4 scanner to discover classes without needing the extra `tailwind.ts` helper.

- Non-Tailwind projects: continue to import the precompiled `index.css`:

```css
@import 'vue-renderer-markdown/index.css';
```

Notes:
- The package exposes a `./tailwind` entry (`./dist/tailwind.ts`) which exports the extracted class list. When installing from npm, `require('vue-renderer-markdown/tailwind')` will load that helper for use in your Tailwind config.
- If you develop locally against the repo, you may reference the generated file directly (e.g. `./dist/tailwind.ts`).
