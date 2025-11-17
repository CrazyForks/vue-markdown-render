# Performance Features & Tips

The renderer is optimized for streaming and large docs. Key features:

- Incremental parsing for code blocks
- Efficient DOM updates and memory optimizations
- Monaco streaming updates
- Progressive Mermaid rendering

Performance tips:

- Stream long documents in chunks
- Use `MarkdownCodeBlockNode` or `renderCodeBlocksAsPre` for non-editable code
- Scope custom components to enable GC
- Use `setDefaultMathOptions` at bootstrap
