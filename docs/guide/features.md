# Features

- Progressive Mermaid: diagrams render incrementally
- Streaming-first rendering: handle tokenized and partial markdown
- Monaco streaming integration: efficient updates for large code blocks
- Streaming diff code blocks: show diffs as they are generated
- Flexible code rendering: Monaco or Shiki
- Pluggable parse hooks: pre- and post-transform tokens and nodes
- Full Markdown support (tables, math, optional Emoji, task checkboxes, code blocks). Emoji is provided as an optional plugin and is not enabled by default — enable it via `getMarkdown` options or the component `customMarkdownIt` prop.
- Lubu features: math rendering via KaTeX, i18n support
