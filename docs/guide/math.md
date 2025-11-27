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
import { getMarkdown, setDefaultMathOptions } from 'markstream-vue'

setDefaultMathOptions({
  commands: ['infty', 'perp'],
  escapeExclamation: true,
})

const md = getMarkdown()
```

If KaTeX is not installed, the renderer will leave math content as text and still be import-safe under SSR.

Important: when writing source Markdown, always use literal (escaped) backslashes
for TeX parenthesis delimiters. Write `\\(...\\)` rather than `\(...\)` so
the parser can reliably detect inline TeX delimiters. Unescaped `\(...\)`
cannot be distinguished from ordinary parentheses and may not be parsed as math.
