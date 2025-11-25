# Usage & API

This page provides short usage examples and points to advanced customization: parse hooks, rendering strategies and codeblock options.

- `getMarkdown()` — get a configured `markdown-it-ts` instance and options
- `parseMarkdownToStructure()` — transform tokens to the AST nodes used by the renderer
- Components: `MarkdownRender`, `CodeBlockNode`, `MarkdownCodeBlockNode`, `MermaidNode`.

```ts
import { getMarkdown, parseMarkdownToStructure } from 'markstream-vue'

const md = getMarkdown()
const nodes = parseMarkdownToStructure('# Title', md)
```

For more examples and deep dives, see README and playground.
