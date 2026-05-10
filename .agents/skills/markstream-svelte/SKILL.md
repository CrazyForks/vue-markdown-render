---
name: markstream-svelte
description: Integrate markstream-svelte in Svelte 5 apps. Svelte 4 unsupported.
---

# Markstream Svelte

- Confirm Svelte 5; ask Svelte 4 users to upgrade.
- Add package and only requested peers.
- Import CSS after resets; KaTeX CSS for math.
- Default to `<MarkdownRender {content} />`.
  - For streaming AI chat, keep `content` and use built-in smooth streaming first.
    - `smoothStreaming="auto"` is the default and activates when `typewriter={true}` or `maxLiveNodes <= 0`.
    - `typewriter` only controls the blinking cursor and defaults to `false`.
    - `fade` controls node enter and streamed-text fade animations and defaults to `true`.
  - Use `nodes` + `final` for worker-preparsed content, shared AST stores, or custom AST control.
- Use `$props()` and callbacks.
- Workers: `setKaTeXWorker`, `setMermaidWorker`, `workers/*?worker`.
- Custom UI: scoped `setCustomComponents`, `customId`, `customHtmlTags`.
- Verify with `svelte-check`, build, or e2e.
