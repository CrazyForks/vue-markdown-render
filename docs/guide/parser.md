# Parser & API

This library builds on top of `markdown-it-ts` and exposes a streaming-friendly parser. For the complete API, see `packages/markdown-parser/README.md`.

Highlights:

- `getMarkdown()` — create and configure a `markdown-it-ts` instance
- `parseMarkdownToStructure()` — turn a Markdown string into parsed nodes used by `MarkdownRender`
- `setDefaultMathOptions()` — global math options

For full function signatures and advanced config, refer to `packages/markdown-parser/README.md` which is included with the project and provides examples for custom rules and plugins.
