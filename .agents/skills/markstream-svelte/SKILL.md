---
name: markstream-svelte
description: Integrate markstream-svelte into a Svelte 5 app. Use when Codex needs to add the Svelte renderer, import CSS correctly, choose between `content` and `nodes`, wire worker helpers, add scoped custom components or trusted custom tags, or update a Svelte repository away from Svelte 4 assumptions.
---

# Markstream Svelte

Use this skill when the host app is Svelte 5. Do not use it for Svelte 4; `markstream-svelte` is Svelte 5-only.

## Workflow

1. Confirm the repo is Svelte 5.
   - Check `package.json`, `svelte.config.*`, and the app entry.
   - If the app is still Svelte 4, report that the current package requires Svelte 5 instead of adding compatibility shims.
2. Install `markstream-svelte` plus only the requested optional peers.
   - Add peers only for features the user actually needs: Monaco, Mermaid, D2, KaTeX, or lightweight highlighting via `stream-markdown`.
3. Import `markstream-svelte/index.css` from the app entry or root layout.
   - Add `katex/dist/katex.min.css` when math is enabled.
   - Keep reset styles before Markstream styles.
4. Start with `<MarkdownRender {content} />`.
   - Use `nodes` plus `final` only for streaming, worker-preparsed nodes, or high-frequency updates.
   - Keep `htmlPolicy="safe"` and Mermaid strict mode unless the user explicitly needs trusted legacy behavior.
5. Use Svelte 5 component patterns.
   - Write examples with `$props()` instead of `export let`.
   - Use callback props such as `onCopy` instead of legacy event dispatch patterns unless the host code already requires a wrapper.
6. Wire optional workers when requested.
   - Import `setKaTeXWorker` and `setMermaidWorker` from `markstream-svelte`.
   - Import workers from `markstream-svelte/workers/*` with the bundler's worker query.
7. Add custom components through scoped mappings.
   - Use `setCustomComponents(customId, mapping)` and pass the same `customId` to `MarkdownRender`.
   - For trusted custom tags, pass `customHtmlTags` and render nested Markdown with `MarkdownRender`.
8. Validate with the smallest useful Svelte command.
   - Prefer `svelte-check`, app build, or a local playground/e2e case.

## Default Decisions

- Prefer `content` for static pages and low-frequency updates.
- Prefer `nodes` plus `final` for SSE, token streaming, AI chat, and worker-preparsed content.
- Keep optional peers minimal and explicit.
- Keep custom components scoped with `customId` unless the whole app truly needs a global mapping.
- Treat Svelte 4 support as out of scope; upgrade the host app to Svelte 5 instead of adding compatibility wrappers.

## Useful Doc Targets

- `docs/guide/svelte.md`
- `docs/guide/installation.md`
- `docs/guide/usage.md`
- `docs/guide/custom-components.md`
- `docs/guide/troubleshooting.md`
