# Math Rendering Options (KaTeX)

This project uses KaTeX for math rendering when available. KaTeX is a peer dependency and must be installed separately.

Install KaTeX:

```bash
pnpm add katex
```

Import KaTeX styles in your entry file (e.g., `main.ts`):

```ts
import 'katex/dist/katex.min.css'
```

Customize math parsing behaviour with `getMarkdown` options or `setDefaultMathOptions`:

```ts
import { getMarkdown, setDefaultMathOptions } from 'vue-renderer-markdown'

setDefaultMathOptions({
  commands: ['infty', 'perp'],
  escapeExclamation: true,
})

const md = getMarkdown()
```

If KaTeX is not installed, the renderer will leave math content as text and still be import-safe under SSR.
