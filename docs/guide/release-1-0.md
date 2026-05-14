---
description: Define the markstream-vue 1.0 stable scope, API tiers, package validation, security commitments, and release checklist.
---

# 1.0 Release Readiness

`markstream-vue@1.0` means the Vue 3 package is safe to put in production and that 1.x will keep stable API, behavior, security defaults, and package exports unless a major version changes them.

## Stable in 1.0

- `MarkdownRender` for Vue 3.
- Raw `content` rendering and pre-parsed `nodes` rendering.
- Streaming mid-state rendering with `final`, `typewriter`, `smoothStreaming`, and `useSmoothMarkdownStream`.
- Safe HTML rendering with `htmlPolicy="safe"` as the default.
- Optional Mermaid, KaTeX, D2, Infographic, and Monaco integrations.
- SSR import and render-to-string support for Vue / Vite / Nuxt / VitePress.
- Published CSS exports: `index.css`, `index.tailwind.css`, and `index.px.css`.
- Documented worker client exports under `markstream-vue/workers/*WorkerClient`.

## Experimental or internal

- Cross-framework packages and playgrounds: Vue 2, React, Angular, Svelte, Next.
- CLI skills/prompts and bundled agent assets.
- Low-level worker implementation files such as `*.worker` subpaths.
- Height-estimation experiment APIs.
- Internal renderer props: `indexKey`, `renderAsFragment`, `debugPerformance`, `initialRenderBatchSize`, `renderBatchSize`, `renderBatchDelay`, `renderBatchBudgetMs`, `renderBatchIdleTimeoutMs`, and `viewportPriority`.

These may still exist in the package, but they are not part of the 1.x compatibility promise unless promoted in the API docs.

## Stable public API

```ts
import MarkdownRender, {
  clearGlobalCustomComponents,
  disableD2,
  disableKatex,
  disableMermaid,
  enableD2,
  enableKatex,
  enableMermaid,
  removeCustomComponents,
  setCustomComponents,
  useSmoothMarkdownStream,
  VueRendererMarkdown,
} from 'markstream-vue'
```

`VueRendererMarkdown` accepts app-scoped `components`, which is preferred for SSR:

```ts
app.use(VueRendererMarkdown, {
  components: {
    thinking: ThinkingNode,
  },
})
```

The legacy/global `setCustomComponents()` API remains supported, but SSR and multi-tenant apps should prefer app-scoped registration.

## Parser and core version policy

The Vue renderer exposes parser node types, parse options, and smooth-streaming behavior through its public API. For 1.0, release the three packages together:

```txt
markstream-vue@1.0.0
markstream-core@1.0.0
stream-markdown-parser@1.0.0
```

If the parser or core package stays below 1.0, `markstream-vue` must pin the exact compatible released versions and absorb breaking parser/core changes behind its own exported types before publishing a 1.x Vue release.

## Required package smoke

Run packed-package validation before publishing:

```bash
pnpm test:smoke:pack
pnpm test:smoke:pack:optional
```

The smoke packs the workspace packages, installs the tarball into a fresh Vite app, verifies root imports, CSS exports, Tailwind safelist export, worker client subpaths, SSR import/render, app-scoped custom components, and optional-peer absence. The optional variant installs Mermaid, KaTeX, D2, Infographic, Monaco, `stream-markdown`, and `vue-i18n`.

## Security release gate

Before 1.0, the security tests must cover:

- `javascript:` / encoded JavaScript URL attempts in links and HTML attrs.
- Unsafe image sources including SVG/data HTML/protocol-relative URLs.
- Event attributes such as `onerror` and inline style script URLs.
- Hard-blocked tags such as `script`, `style`, `form`, `iframe`, `object`, and `template`.
- Streaming mid-states for partially received HTML and links.
- Legacy fence renderer escaping for language labels, DOM ids, and translated copy labels.

Use `htmlPolicy="trusted"` only for content that is fully controlled by the application.

## Performance release gate

The public benchmark set should include:

- 10 KB normal docs.
- 100 KB AI streaming.
- 1 MB large document.
- 1000 code blocks.
- 100 Mermaid blocks.
- 10k pre-parsed nodes.
- Reverse-flex chat scroll.

Track initial render time, stream update cost, p95 frame cost, max long task, memory after unmount, scroll drift, and DOM node count.

## Go / No-Go checklist

- [ ] Stable and experimental public API documented.
- [ ] Parser/core release strategy decided.
- [ ] Legacy fence renderer escaping covered by tests.
- [ ] Safe HTML docs and XSS regression tests complete.
- [ ] App-scoped custom component registry covered by SSR test.
- [ ] `pnpm test:smoke:pack` passes.
- [ ] `pnpm test:smoke:pack:optional` passes.
- [ ] CSS, Tailwind, and worker subpath exports smoke-tested.
- [ ] Unit, SSR, public API, and package export checks are green.
- [ ] Migration notes and changelog describe beta-to-1.0 breaking changes.
