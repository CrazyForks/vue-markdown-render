---
name: markstream-svelte
description: Integrate markstream-svelte in Svelte 5 apps. Svelte 4 unsupported.
---

# Markstream Svelte

- Confirm Svelte 5; ask Svelte 4 users to upgrade.
- Add package and only requested peers.
- Import CSS after resets; KaTeX CSS for math.
- Default to `<MarkdownRender {content} />`; use `nodes`+`final` for streaming/workers.
- Use `$props()` and callbacks.
- Workers: `setKaTeXWorker`, `setMermaidWorker`, `workers/*?worker`.
- Custom UI: scoped `setCustomComponents`, `customId`, `customHtmlTags`.
- Verify with `svelte-check`, build, or e2e.
