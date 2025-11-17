# Installation

Install with pnpm, npm or yarn.

```bash
pnpm add vue-renderer-markdown
# or
npm install vue-renderer-markdown
# or
yarn add vue-renderer-markdown
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
