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

### ParseOptions: `requireClosingStrong`

`requireClosingStrong` (boolean | optional) controls how the parser treats unmatched `**` strong delimiters inside inline content. Default: `true`.

- **true**: The parser requires a matching closing `**` to create a strong node. Unclosed `**` are left as plain text. This is the recommended, strict mode for non-interactive rendering and avoids incorrect strong parsing inside constructs like link text (for example, `[**cxx](xxx)`).
- **false**: The parser allows mid-state/unfinished `**` (useful for editor live-preview scenarios), which can produce a temporary strong node even when the closing `**` is missing.

Example — strict parsing (default):

```ts
import { parseMarkdownToStructure } from 'packages/markdown-parser'

const nodes = parseMarkdownToStructure('[**cxx](xxx)', undefined, { requireClosingStrong: true })
// the text `[**cxx](xxx)` will be preserved without creating a dangling strong node
```

Example — editor-friendly parsing:

```ts
const nodes = parseMarkdownToStructure('[**cxx](xxx)', undefined, { requireClosingStrong: false })
// allows creating a temporary/"mid-state" strong node for live-edit previews
```

## Types
A condensed list of exported types to reference in your code:

- `CodeBlockNode`, `GetMarkdownOptions`, `HeadingNode`, `ListItemNode`, `ListNode`, `MathOptions`, `ParagraphNode`, `ParsedNode`, `ParseOptions`, etc.

Use `import type { ParsedNode, CodeBlockNode } from 'stream-markdown-parser'` in your TypeScript code.

## Plugins & Defaults
This package includes a set of parsing helpers and convenience plugins for common flows (for example: footnotes, task checkboxes, sub/sup/mark). Note that emoji handling is no longer enabled by default — consumers who want emoji support should register the emoji plugin explicitly.

You can add custom plugins in several ways:
- Pass plugins to `getMarkdown` via the `plugin` option.
- Use `apply` functions in `getMarkdown` options to mutate the returned `MarkdownIt` instance.
- When using the `MarkdownRender` component, use the `customMarkdownIt` prop to receive and mutate the `MarkdownIt` instance used for that renderer.

Example — enable emoji via the component prop:

```vue
<script setup lang="ts">
import type { MarkdownIt } from 'markdown-it-ts'
import { full as markdownItEmoji } from 'markdown-it-emoji'
import MarkdownRender from 'vue-renderer-markdown'

function enableEmoji(md: MarkdownIt) {
  md.use(markdownItEmoji)
  return md
}
</script>

<template>
  <MarkdownRender :content="source" :custom-markdown-it="enableEmoji" />
</template>
```

## Examples
Use the playground to test your parse transforms quickly. For instance, use a `preTransformTokens` hook to transform custom `html_block` tokens into a `thinking_block` type, then register a custom component for the new node type via `setCustomComponents`.

For full details and more examples, see `packages/markdown-parser/README.md` in the repository.

### Custom components and tag-like elements

Tag-like custom elements (for example `<MyWidget ...>...</MyWidget>`) produce complex `html_block`/inline token shapes that are often difficult to reconstruct reliably from the parsed AST using simple regex or string splicing. To reduce maintenance cost and avoid brittle post-processing, we recommend extracting those raw component strings before feeding the remaining content to the Markdown parser and rendering the extracted parts separately as Vue components.

Recommended approach:
- Pre-scan the incoming Markdown content and extract custom-component blocks into a small map keyed by an id (or placeholder).
- Replace the original markup in the Markdown string with a stable placeholder token (for example `[[CUSTOM:1]]`).
- Let the Markdown parser run on the placeholder-bearing content and then render the AST as usual.
- In your rendering layer, render placeholders by looking up the extracted component string and mounting the corresponding Vue component (or compile it via a lightweight renderer).

Benefits:
- Avoids brittle AST post-processing for nested/tag-like HTML.
- Keeps the Markdown parsing focused on Markdown semantics.
- Allows you to control hydration and scope for custom components separately.

Example (simple sketch):

```ts
// 1) extract custom tags
const extracted = new Map<string,string>()
let id = 1
const contentWithPlaceholders = source.replace(/<MyWidget[\s\S]*?<\/MyWidget>/g, (m)=>{
  const key = `[[CUSTOM:${id++}]]`
  extracted.set(key, m)
  return key
})

// 2) parse the markdown with placeholders
const nodes = parseMarkdownToStructure(contentWithPlaceholders)

// 3) render: when you encounter a placeholder node, mount your extracted component
// Example pseudo-Vue render logic:
// if (node.type === 'text' && extracted.has(node.content)) {
//   return h(CustomWrapper, { raw: extracted.get(node.content) })
// }
```

Thinking blocks and small inline-rich fragments
-- If you only need a lightweight rendering for short "thinking" fragments (for example AI assistant thinking traces), the library's `MarkdownRenderer` (used internally by `MarkdownRender`) supports stream-friendly rendering hooks and is lighter to reuse than reassembling the AST into component trees yourself. Use `parseOptions` or preTransform hooks to identify thinking regions and render them with the lighter-weight renderer while keeping complex tag-like custom components extracted and rendered separately.

This hybrid approach minimizes fragile string-manipulation of the Markdown AST while giving you full control over custom component hydration and rendering scope.
