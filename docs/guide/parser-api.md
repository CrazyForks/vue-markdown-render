# Parser — API Deep Dive

This page extracts the most important functions, types and helpers from `packages/markdown-parser` for a focused API reference.

## Main functions

### `getMarkdown(msgId?, options?)`
Create a configured `markdown-it-ts` instance.

Parameters:
- `msgId` (string | optional): identifier for this instance
- `options` (GetMarkdownOptions | optional): configuration options

Options include:
- `plugin`: list of Markdown-it plugins
- `apply`: functions to mutate the `MarkdownIt` instance
- `i18n`: translator map or function

### `parseMarkdownToStructure(content, md?, options?)`
Parse a Markdown string into a streaming-friendly AST used by the renderer.

Parameters:
- `content` (string): markdown to parse
- `md` (MarkdownItCore, optional): a markdown-it-ts instance — created if not provided
- `options` (ParseOptions, optional): contains transform hooks described below

Returns: `ParsedNode[]`

### `processTokens(tokens)`
Converts raw markdown-it tokens into a processed token list ready for the AST phase.

### `parseInlineTokens(tokens, md)`
Parse inline tokens into inline nodes usable by the renderer.

## Configuration & helpers

### `setDefaultMathOptions(options)`
Set global math rendering options for KaTeX. Example:

```ts
setDefaultMathOptions({
  commands: ['infty', 'perp'],
  escapeExclamation: true
})
```

### Heuristics and utilities
- `isMathLike(content)` — heuristic to detect whether a string looks like math
- `findMatchingClose(src, startIdx, open, close)` — find matching delimiter
- `parseFenceToken(token)` — parse code fence into `CodeBlockNode`
- `normalizeStandaloneBackslashT(content, options?)` — normalize backslash-t sequences in math content

## Parse hooks (advanced)
When calling `parseMarkdownToStructure` you can pass `ParseOptions` with these hooks:
- `preTransformTokens?: (tokens: MarkdownToken[]) => MarkdownToken[]` — operate immediately after the `markdown-it` parser runs
- `postTransformTokens?: (tokens: MarkdownToken[]) => MarkdownToken[]` — transform tokens after internal fixes
- `postTransformNodes?: (nodes: ParsedNode[]) => ParsedNode[]` — operate on the node tree before rendering

These hooks are also available via `parseOptions` prop on the `MarkdownRender` component (applies only when using `content` instead of `nodes`).

## Types
A condensed list of exported types to reference in your code:

- `CodeBlockNode`, `GetMarkdownOptions`, `HeadingNode`, `ListItemNode`, `ListNode`, `MathOptions`, `ParagraphNode`, `ParsedNode`, `ParseOptions`, etc.

Use `import type { ParsedNode, CodeBlockNode } from 'stream-markdown-parser'` in your TypeScript code.

## Plugins & Defaults
This package ships with common plugin support (emoji, footnotes, task checkboxes) and includes pre-configured convenience plugins for typical flows. To add custom plugins, pass them via `getMarkdown`'s `plugin` option.

## Examples
Use the playground to test your parse transforms quickly. For instance, use a `preTransformTokens` hook to transform custom `html_block` tokens into a `thinking_block` type, then register a custom component for the new node type via `setCustomComponents`.

For full details and more examples, see `packages/markdown-parser/README.md` in the repository.
