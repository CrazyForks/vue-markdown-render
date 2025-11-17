# Component props & options

This page summarizes important props and flags you will use when integrating `vue-renderer-markdown`.

## Primary props

- `content: string` — Provide a raw Markdown string (required unless `nodes` provided)
- `nodes: BaseNode[]` — Provide parsed nodes if you want to control parsing externally

## Code block rendering flags

### `renderCodeBlocksAsPre` — boolean
- Default: `false`
- When `true`, all `code_block` nodes render as simple `<pre><code>` blocks (`PreCodeNode`).
- Use it for read-only output or when you want to avoid optional peers like Monaco/mermaid.

### `codeBlockStream` — boolean
- Default: `true`
- When `true`, code blocks update progressively while content arrives (streaming updates).
- When `false`, code blocks remain in a lightweight loading state until they are complete. This avoids re-initializing heavy editors like Monaco while content is partially available.

### `viewportPriority` — boolean
- Default: `true`
- When enabled, heavy nodes (Mermaid, Monaco) prioritize rendering for elements in or near the viewport. Offscreen work is deferred for better interactivity with large documents.

## Code block header props (short list)
- `showHeader` (boolean) — toggle header rendering
- `showCopyButton` (boolean) — show/hide copy button
- `showExpandButton` (boolean) — show/hide expand button
- `showPreviewButton` (boolean) — show/hide preview button
- `showFontSizeButtons` (boolean) — show/hide font-size controls

If you need the full property table for `CodeBlockNode`, please check the `README` examples or see the source types in `packages/markdown-parser`.

## Other props
- `parseOptions` — pass token-level `preTransformTokens`, `postTransformTokens`, `postTransformNodes` hooks to the renderer (applies only when using `content` prop, not `nodes`).
- `customId` — scope custom component mappings from `setCustomComponents`.
- `typewriter` — show small enter animation; defaults to `true`.

These props let you tune streaming behaviour and heavy node rendering to match your app's performance requirements.
