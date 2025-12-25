# markstream-vue — LLM/AI Context (`/llms`)

This file is an **AI-oriented map** of the project + docs so a model can answer questions quickly without re-reading the whole site.

If you are an assistant answering questions about this repo:

- Prefer **grounding** in `docs/guide/*` for user-facing behavior and `src/exports.ts` for “what is exported / supported”.
- When a question is ambiguous, ask **one** clarifying question and propose a default.
- If the user reports a bug, ask for a minimal repro (the repo has a shareable test page) and link them to the troubleshooting checklist.

---

## 0) One-paragraph summary

`markstream-vue` is a Vue 3 Markdown renderer designed for **streaming** (AI/SSE) and **large documents**: it uses a streaming-friendly parser (mid-state handling for unclosed fences/math/HTML) and a renderer with **virtualization** and **defer-until-visible** for heavy nodes (Monaco/Mermaid/KaTeX). Optional heavy features are enabled via **optional peer dependencies** + explicit `enable*()` calls.

If you only need the parser (no Vue), use the sibling package `stream-markdown-parser` in `packages/markdown-parser/`.

---

## 1) Repo layout (where things live)

- Library source: `src/`
  - Components: `src/components/*/`
  - Utilities: `src/utils/`
  - Composables: `src/composables/`
  - Workers: `src/workers/`
  - Public exports: `src/exports.ts`
- Parser-only package: `packages/markdown-parser/` (published as `stream-markdown-parser`)
- Docs site (VitePress): `docs/` (Chinese under `docs/zh/`)
- Demos: `playground/` (Vite), `playground-nuxt/` (Nuxt SSR)
- Tests: `test/` (Vitest)

---

## 2) The “core mental model”

There are two layers:

1) **Parser layer** (`stream-markdown-parser`)
   - `getMarkdown()` creates a configured `markdown-it-ts` instance
   - `parseMarkdownToStructure()` turns Markdown text into a node tree (`ParsedNode[]`)
   - Streaming mid-states reduce flicker (e.g. unclosed fences / `$$` / partial inline HTML)

2) **Renderer layer** (`markstream-vue`)
   - `MarkdownRender` (default export) renders either:
     - `content: string` (component parses internally), or
     - `nodes: ParsedNode[]` (you parse externally; recommended for streaming)
   - Performance tools:
     - **virtualization** (`maxLiveNodes`, `liveNodeBuffer`)
     - **batch rendering** (typewriter-like “steady stream”)
     - **defer until visible** for heavy nodes

---

## 3) Public API (what’s safe to suggest)

### From `markstream-vue` (Vue library)

- Default component: `MarkdownRender` (also referred to as `NodeRenderer`)
- Parser helpers (re-exported from the parser package): `getMarkdown()`, `parseMarkdownToStructure()`, `setDefaultMathOptions()`
- Custom node renderers:
  - `setCustomComponents(customId, mapping)`
  - `removeCustomComponents(customId)`
  - `clearGlobalCustomComponents()`
- Optional feature toggles:
  - Mermaid: `enableMermaid()`, `disableMermaid()`
  - KaTeX: `enableKatex()`, `disableKatex()`
- Worker injection (CDN or custom workers):
  - KaTeX: `createKaTeXWorkerFromCDN()`, `setKaTeXWorker()`
  - Mermaid: `createMermaidWorkerFromCDN()`, `setMermaidWorker()`

Source of truth: `src/exports.ts`

### From `stream-markdown-parser` (parser-only)

- `getMarkdown()`, `parseMarkdownToStructure()`, token/node transform hooks (`ParseOptions`)
- Streaming mid-state rules: inline HTML suppression + auto-close, `final: true` behavior, unclosed fences/math handling

Source of truth: `packages/markdown-parser/src/index.ts`, `docs/guide/parser-api.md`

---

## 4) Common user workflows (answer templates)

### A) Minimal render

Use when the user just wants “render a string”:

- Import CSS: `markstream-vue/index.css`
- Render: `<MarkdownRender :content="md" />`

Docs: `docs/guide/quick-start.md`, `docs/guide/installation.md`

### B) Streaming (SSE / AI chat) with end-of-stream

Use when the user is appending chunks:

- Keep a growing `buffer`
- Update nodes: `parseMarkdownToStructure(buffer, md, { final })`
- When stream ends: set `final: true` (or the component prop `final`) so mid-states don’t stick

Docs: `docs/guide/parser.md`, `docs/guide/parser-api.md`, `docs/guide/performance.md`

### C) Enable heavy features (optional peers)

Use when the user asks “why Mermaid/KaTeX/Monaco doesn’t work”:

- Install peer + import required peer CSS (if any)
- Call `enableMermaid()` / `enableKatex()` on the client

Docs: `docs/guide/installation.md`, `docs/guide/components.md`, `docs/guide/troubleshooting.md`

---

## 5) High-signal troubleshooting checklist

When something “renders blank” or “looks wrong”, check these in order:

1) **CSS order / reset**: reset first, then `markstream-vue/index.css` (often inside `@layer components` for Tailwind).
2) **Optional peer installed** (Mermaid/KaTeX/Monaco/Shiki).
3) **Feature enabled**: `enableMermaid()` / `enableKatex()` (where applicable).
4) **Peer CSS imported**: `katex/dist/katex.min.css`, `stream-monaco/esm/index.css`, Mermaid CSS (if needed).
5) **Standalone node component wrapper**: if rendering a node component alone, wrap with `&lt;div class="markstream-vue"&gt;...&lt;/div&gt;` so library styles apply.
6) **SSR**: in Nuxt, wrap in `&lt;client-only&gt;` when using browser-only peers/workers.

Docs: `docs/guide/troubleshooting.md`, `docs/nuxt-ssr.md`, `docs/guide/tailwind.md`

---

## 6) “If asked X, open Y” (fast routing)

- Install / optional peers / CSS: `docs/guide/installation.md`
- Minimal usage: `docs/guide/quick-start.md`, `docs/guide/usage.md`
- Component catalog + requirements: `docs/guide/components.md`
- Props reference: `docs/guide/props.md`
- Streaming parser overview: `docs/guide/parser.md`
- Parser deep-dive: `docs/guide/parser-api.md`
- Performance knobs: `docs/guide/performance.md`
- Tailwind/reset ordering: `docs/guide/tailwind.md`
- Mermaid: `docs/guide/mermaid.md`, `docs/guide/mermaid-block-node.md`
- Math/KaTeX: `docs/guide/math.md`
- Monaco: `docs/guide/monaco.md`, `docs/guide/monaco-internals.md`
- VitePress integration: `docs/guide/vitepress-docs.md`
- Nuxt SSR: `docs/nuxt-ssr.md`

---

## 6.1) Intent-based FAQ routing table (fast answers)

Use this table as a “router”: map the user’s question to the most relevant docs/source, then answer with the minimal steps + the exact file/API names.

| Intent (what user wants) | User says (signals) | Fast answer checklist | Answer skeleton (copy/paste) | Minimal repro questions | Open docs first | Open code if needed |
| --- | --- | --- | --- | --- | --- | --- |
| Install + first render | “how to use”, “minimal example” | Import `markstream-vue/index.css` → render `&lt;MarkdownRender :content="md" /&gt;` | “Install `markstream-vue`, import `markstream-vue/index.css`, then render `&lt;MarkdownRender :content="md" /&gt;`.” | “Vite/Nuxt? Which CSS reset? Any errors in console?” | `docs/guide/quick-start.md`, `docs/guide/installation.md` | `src/exports.ts` |
| Styles look wrong / missing | “CSS broken”, “unstyled”, “prose wrong” | Reset first → then `markstream-vue/index.css` (often `@layer components`) → if standalone node, wrap `.markstream-vue` | “This is almost always CSS order: load your reset first, then `markstream-vue/index.css` (Tailwind: inside `@layer components`). If you render node components standalone, wrap them in `.markstream-vue`.” | “Show your CSS imports order (and Tailwind layers). Are you using standalone nodes or `MarkdownRender`?” | `docs/guide/troubleshooting.md`, `docs/guide/tailwind.md` | `src/index.css` |
| Tailwind conflicts | “Tailwind overrides”, “utilities win” | Put library CSS in `@layer components` → scope overrides with `custom-id` + `[data-custom-id="..."]` | “Put `@import 'markstream-vue/index.css'` inside `@layer components` and scope your overrides with `custom-id` + `[data-custom-id=\"...\"]`.” | “Share the `main.css` (Tailwind layers) + the component usage with/without `custom-id`.” | `docs/guide/tailwind.md`, `docs/guide/props.md` | `src/index.css` |
| Streaming “stuck loading” at end | “final chunk”, “loading forever”, “unclosed fence/math” | On end-of-stream set `final: true` (ParseOptions or component prop) | “When your stream ends, set `final: true` (either `parseMarkdownToStructure(..., { final: true })` or `&lt;MarkdownRender final /&gt;`). This prevents mid-state ‘loading’ nodes from sticking.” | “Do you set `final` at end-of-stream? Provide the last ~40 chars of the markdown (often ends with ``` or $$).” | `docs/guide/parser-api.md`, `docs/guide/parser.md` | `packages/markdown-parser/src/index.ts` |
| Streaming feels jumpy / bursts | “typewriter”, “chunks dump”, “smooth stream” | Enable batching; tune `renderBatchSize`/`renderBatchDelay`; keep heavy nodes deferred | “Enable batching and tune `renderBatchSize`/`renderBatchDelay` for a steady flow; keep heavy nodes deferred (`viewportPriority`, `deferNodesUntilVisible`).” | “How often do you update `content/nodes` (per token? per chunk?) and what are your batch props?” | `docs/guide/performance.md`, `docs/guide/props.md` | `src/components/NodeRenderer/NodeRenderer.vue` |
| Long doc slow / memory high | “huge markdown”, “laggy scroll” | Use virtualization (`maxLiveNodes`, `liveNodeBuffer`) + defer heavy nodes | “Turn on/tune virtualization (`maxLiveNodes`, `liveNodeBuffer`) and keep heavy nodes deferred to avoid mounting everything.” | “Approx doc size? Are you passing `content` or `nodes`? Any huge code blocks/diagrams?” | `docs/guide/performance.md` | `src/components/NodeRenderer/NodeRenderer.vue` |
| Mermaid not rendering | “mermaid blank”, “diagram not shown” | Install `mermaid` peer → call `enableMermaid()` on client → check CSS/reset | “Install `mermaid`, call `enableMermaid()` on the client, then re-check CSS order/reset. Mermaid blocks won’t render if the peer isn’t installed/enabled.” | “Do you call `enableMermaid()` (where)? Any SSR? Does the markdown fence use ```mermaid?” | `docs/guide/mermaid.md`, `docs/guide/troubleshooting.md` | `src/components/MermaidBlockNode/mermaid.ts` |
| Mermaid in worker / via CDN | “no bundler”, “CDN worker”, “importScripts” | Use `createMermaidWorkerFromCDN()` + `setMermaidWorker()` | “Use `createMermaidWorkerFromCDN(...)` and pass the worker to `setMermaidWorker(worker)` so Mermaid parsing happens in a worker without bundling.” | “Which worker mode (module/classic) and which CDN URL are you using? Any CSP restrictions?” | `docs/guide/mermaid.md` | `src/workers/mermaidCdnWorker.ts`, `src/workers/mermaidWorkerClient.ts` |
| KaTeX not rendering | “math not shown”, “katex missing” | Install `katex` peer + import `katex/dist/katex.min.css` → call `enableKatex()` | “Install `katex`, import `katex/dist/katex.min.css`, then call `enableKatex()` on the client.” | “Do you import KaTeX CSS? Are you using `$$...$$` or `$...$`? Any SSR?” | `docs/guide/math.md`, `docs/guide/installation.md` | `src/components/MathInlineNode/katex.ts` |
| KaTeX in worker / via CDN | “katex worker”, “CDN worker” | Use `createKaTeXWorkerFromCDN()` + `setKaTeXWorker()` | “Use `createKaTeXWorkerFromCDN(...)` and `setKaTeXWorker(worker)` to render math in a worker via CDN.” | “Which CDN URLs (katex + mhchem)? Worker mode? Is the page blocked by CSP?” | `docs/guide/math.md` | `src/workers/katexCdnWorker.ts`, `src/workers/katexWorkerClient.ts` |
| Monaco code blocks missing features | “toolbar missing”, “copy button missing”, “blank editor” | Install `stream-monaco` + import `stream-monaco/esm/index.css` → verify CSS order | “Install `stream-monaco` and import `stream-monaco/esm/index.css`. If the editor is blank, it’s usually missing Monaco CSS or CSS ordering issues.” | “Do you import `stream-monaco/esm/index.css`? Any SSR? Any console errors about workers?” | `docs/guide/monaco.md`, `docs/guide/components.md` | `src/components/CodeBlockNode/` |
| Prefer lightweight code blocks | “SSR friendly”, “reduce bundle”, “no monaco” | Use `MarkdownCodeBlockNode` (Shiki) or `render-code-blocks-as-pre` | “Use `MarkdownCodeBlockNode` (Shiki) for lightweight highlighting, or set `render-code-blocks-as-pre` to force `&lt;pre&gt;&lt;code&gt;` rendering.” | “Do you need highlighting or just plain code? Are you OK installing `shiki` + `stream-markdown`?” | `docs/guide/code-blocks.md`, `docs/guide/components.md` | `src/components/MarkdownCodeBlockNode/`, `src/components/PreCodeNode/` |
| Custom components in Markdown | “embed Vue component”, “custom tag”, `&lt;thinking&gt;` | Use `custom-html-tags` / `customHtmlTags` so parser emits nodes; map via `setCustomComponents` | “Allow the tag via `custom-html-tags`/`customHtmlTags` so the parser emits a node type, then map it with `setCustomComponents(customId, { thinking: YourComp })`.” | “Do you control the markdown source? What tag name(s)? Do you want HTML passthrough or a custom node type?” | `docs/guide/advanced.md`, `docs/guide/parser-api.md` | `src/utils/nodeComponents.ts`, `packages/markdown-parser/src/index.ts` |
| SSR (Nuxt) issues | “window is not defined”, “SSR crash” | Wrap with `&lt;client-only&gt;`; keep heavy peers client-only; avoid server importing peers | “Wrap `&lt;MarkdownRender&gt;` with `&lt;client-only&gt;` in Nuxt, and ensure Mermaid/Monaco/worker setup runs only in the browser.” | “Nuxt version? Is the error during server build or runtime? Which peers are installed/enabled?” | `docs/nuxt-ssr.md` | `playground-nuxt/` (patterns) |
| “What does package export?” | “is X exported”, “how to import Y” | Check `src/exports.ts` and package `exports` field | “Check `src/exports.ts` (re-exports) and `package.json#exports` for the correct import path.” | “Which symbol are you trying to import, and from which path?” | `docs/guide/api.md`, `docs/guide/components.md` | `src/exports.ts`, `package.json` |

## 7) Commands (repo)

- Playground dev: `pnpm dev`
- Docs dev/build/serve: `pnpm docs:dev`, `pnpm docs:build`, `pnpm docs:serve`
- Tests: `pnpm test` (Vitest)
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`

---

## 8) Quick Q→A examples (what good answers look like)

**Q: Mermaid 为什么不显示？**

- Check peer installed (`mermaid`) + call `enableMermaid()` on client + verify CSS order/reset.
- Open `docs/guide/mermaid.md` + `docs/guide/troubleshooting.md`.

**Q: 流式渲染最后卡在 loading？**

- Use `final: true` / component prop `final` at end-of-stream.
- Open `docs/guide/parser-api.md` (section about `final`) + `docs/guide/parser.md`.

**Q: 代码块没有 Monaco 工具栏/按钮？**

- Ensure `stream-monaco` installed + `stream-monaco/esm/index.css` imported + check `docs/guide/monaco.md`.
