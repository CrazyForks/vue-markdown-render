# API Reference — Components

This page documents the most commonly used components and props.

## MarkdownRender
Props
- `content: string` — the Markdown string (required unless `nodes` provided)
- `nodes: BaseNode[]` — parse nodes (alternative to `content`)
- `renderCodeBlocksAsPre: boolean` — render `code_block` nodes as simple `<pre><code>` blocks
- `codeBlockStream: boolean` — controls streaming behavior for code blocks
- `viewportPriority: boolean` — defer heavy nodes offscreen
- `parseOptions: ParseOptions` — token and node hooks (see advanced page)
- `customId: string` — scope for `setCustomComponents`

### CodeBlockNode
Feature-rich code block with Monaco integration (optional peers: `stream-monaco`)
- `node` — CodeBlock node
- `darkTheme` / `lightTheme` — theme names
- `loading` — boolean, show placeholder
- `showHeader` / `showCopyButton` / etc — header customizations (see Code block header page)

### MarkdownCodeBlockNode
Lightweight syntax highlighting (requires `shiki`, `stream-markdown`)
- Props mirror `CodeBlockNode` but use `shiki` themes

### MermaidNode
- Renders progressive Mermaid diagrams when `mermaid` peer is available
- `node` — Mermaid codeblock node

### Utility functions
- `getMarkdown()` — create configured `markdown-it-ts` instance
- `parseMarkdownToStructure()` — parse and return AST nodes
- `setCustomComponents(id?, mapping)` — register node renderers

For full prop types, see the `types` export or the `packages/markdown-parser/README.md` which includes the public TypeScript interfaces.
