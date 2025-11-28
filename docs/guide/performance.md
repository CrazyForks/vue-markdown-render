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

## Keeping a Steady, Typewriter-Style Stream

Some AI or LLM sources send content in large bursts, which can feel like the preview is freezing and then dumping a whole block. To keep the UI feeling like a smooth, continuous typewriter:

- **Keep `typewriter` enabled** on `NodeRenderer` (default) so non-code nodes animate in character-by-character instead of appearing instantly.
- **Tune the batching props**: drop `initialRenderBatchSize`/`renderBatchSize` (for example `12`/`24`), and add a small `renderBatchDelay` (20–30 ms). Even if the model sends a huge chunk, the renderer then inserts tiny slices each frame, producing a stable flow.
- **Throttle upstream updates** if possible: instead of replacing `content` on every incoming hunk, debounce (50–100 ms) or split into smaller paragraphs so each render cycle operates on a “bite-sized” diff.
- **Defer heavy nodes** by keeping `deferNodesUntilVisible`/`viewportPriority` turned on; expensive blocks (Mermaid/Monaco) will wait until they are near the viewport so the stream of text is never blocked.
- **Fall back for code blocks** when a burst happens: disable `codeBlockStream` or temporarily use `renderCodeBlocksAsPre` during streaming so that syntax-highlighting work does not stall text updates.

These knobs keep DOM work under a predictable budget, so users perceive a calm, steady flow of characters even when the backend sends data in erratic bursts.

Try this — tune rendering performance by enabling `viewportPriority`:

```vue
<MarkdownRender :content="md" :viewport-priority="true" />
```
