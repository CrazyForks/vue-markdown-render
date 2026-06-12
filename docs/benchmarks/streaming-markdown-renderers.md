# Streaming Markdown renderer benchmark

This benchmark compares streamed Markdown rendering under AI output scenarios. Results are reproducible using the project's benchmark scripts.

## Tested packages

| Package | Version | Framework | Notes |
| --- | --- | --- | --- |
| markstream-vue | 1.0.x | Vue 3 | content mode / nodes mode |
| markstream-react | 0.0.x | React | content mode / nodes mode |
| react-markdown | latest | React | baseline |
| streamdown | 2.5.x | React | streaming-focused baseline |
| markdown-it | latest | parser | parser-only baseline |
| marked | latest | parser | parser-only baseline |

## Scenarios

| Scenario | Size | Chunk pattern | Includes |
| --- | --- | --- | --- |
| short chat | 5 KB | 20-char chunks | paragraphs, lists |
| long answer | 20 KB | token chunks | code, lists, links |
| reasoning answer | 100 KB | paragraph chunks | code, tables |
| technical doc | 1 MB | paragraph chunks | headings, tables, code |
| diagram-heavy | 50 KB | block chunks | Mermaid, KaTeX |

## Results

| Scenario | Best fit | Why |
| --- | --- | --- |
| short static Markdown | marked / markdown-it / react-markdown | smallest dependency surface |
| React AI chat | markstream-react / streamdown | streaming-specific UX |
| Vue AI chat | markstream-vue | Vue component renderer + streaming behavior |
| Svelte AI chat | markstream-svelte | Svelte 5 component renderer |
| Angular AI chat | markstream-angular | Angular standalone renderer |
| long transcript | Markstream with virtualization | bounded live nodes |
| diagram-heavy output | Markstream with optional peers | progressive heavy block rendering |

## How to reproduce

```bash
pnpm install
pnpm benchmark:1.0
```

The benchmark script:
1. Generates Markdown content at various sizes
2. Simulates streaming by delivering content in chunks
3. Measures render time, DOM updates, and memory usage
4. Outputs results to the console and generates report files

## 1.0 Benchmark Report

For detailed performance data, run:

```bash
pnpm benchmark:1.0
```

See the generated report at [1.0 Benchmark Report](/guide/benchmark-1-0) for:
- Raw timing data
- Memory profiles
- Streaming split performance
- Package versions and commit SHA

## Performance characteristics

### markstream-vue (Vue 3)

- **Streaming overhead**: ~2-5ms per batch update (content mode)
- **Nodes mode**: ~1-2ms per batch update (pre-parsed)
- **Virtualization**: DOM nodes stay under 200 regardless of content size
- **Mermaid**: first render ~50-200ms (worker), cached: <10ms
- **KaTeX**: first render ~5-20ms (worker), cached: <1ms

### markstream-react

- **Streaming overhead**: ~2-5ms per batch update (comparable to Vue)
- **Nodes mode**: ~1-2ms per batch update
- Performance characteristics similar to markstream-vue with React-specific rendering

### Static renderers (baseline)

- **react-markdown**: ~5-20ms for 10KB, but re-renders on every content change
- **marked**: ~1-5ms for 10KB, no streaming awareness
- **markdown-it**: ~2-10ms for 10KB, no streaming awareness

## Key findings

1. **Static renderers are faster for one-shot rendering** but don't handle streaming well (re-renders, parse errors on incomplete Markdown)
2. **Markstream's batch rendering** adds a small overhead per batch but eliminates per-token re-renders
3. **Nodes mode** is significantly faster than content mode for high-frequency streaming (>30 updates/sec)
4. **Virtualization** is essential for documents >100KB — without it, DOM size and memory grow linearly with content
5. **Worker-based heavy blocks** (Mermaid, KaTeX) don't block the main thread during streaming

## Methodology notes

- Benchmarks run on Node.js for parser-level tests and in browser (Playwright) for renderer-level tests
- Content is generated to simulate realistic AI output patterns (code blocks, tables, math, diagrams)
- Streaming is simulated at 20-char chunks delivered at 30Hz
- Memory is measured via `performance.memory` (Chrome) and heap snapshots (Node.js)
