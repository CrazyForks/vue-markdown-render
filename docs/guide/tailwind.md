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
