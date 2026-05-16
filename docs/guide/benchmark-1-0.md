---
description: Generate the 1.0 benchmark report for markstream-vue with environment disclosure and playground performance metrics.
---

# 1.0 Benchmark Report

Run the public benchmark report before publishing `markstream-vue@1.0`:

```bash
pnpm benchmark:1.0
```

The command builds the playground, serves it with `vite preview`, then runs the playground checks that are already used for performance regression coverage:

- Diagnostic Studio baseline, thinking, diff, and stress samples in MarkdownCodeBlock and Monaco modes using `/test?benchmark=1`, which disables the version sandbox iframe and annotation layer so frame metrics and renderer DOM metrics track the renderer surface.
- Main playground reverse-flex chat initial load, full-scroll pass, and streaming replay.

It writes:

```txt
benchmark/
  1.0.0.chrome-linux-x64.json
  1.0.0.chrome-linux-x64.md
  latest-summary.md
```

The Markdown summary includes package versions, Node, OS, CPU, browser, viewport, server mode, LCP, CLS, settle time, gate frame sample count, gate p95 `requestAnimationFrame` interval, full-scroll heavy-settle frame p95, max long task, page DOM node count, renderer DOM node count, visible fallback count, heavy-block readiness, scroll drift, and best-effort Chrome-only heap after component unmount plus GC when the browser exposes that value.

Initial rows report heavy-block readiness only for blocks visible in the phase viewport. Full-scroll rows report all heavy blocks after the scroll pass. Page DOM nodes are recorded for diagnostics; renderer DOM nodes are scoped to `.preview-surface` or `.chatbot-messages` and are the DOM budget used by the release gate. Gate frame p95 is recorded for every phase; on full-scroll rows, the hard gate uses only `scrollFrameP95Ms` from the active scroll loop. `heavySettleFrameP95Ms` records post-scroll heavy-block settle separately and is not a 1.0 hard frame gate. The release gate only enforces the 120 ms budget when the gate window has at least 30 frame samples.

For script debugging only, set `MARKSTREAM_BENCHMARK_SKIP_BUILD=1` to reuse an existing playground build. Do not use that shortcut for release evidence unless the build artifact was just produced. Set `MARKSTREAM_BENCHMARK_SAMPLES=baseline,diff` only when narrowing a local investigation.

## CI workflow

The `1.0 Benchmark` GitHub Actions workflow runs on a nightly schedule and can be started manually. It uploads the generated `benchmark/` directory as an artifact.

Use workflow artifacts for release notes. Local generated reports are snapshots for their disclosed OS/CPU/browser environment; `benchmark/latest-summary.md` is a convenience copy of the local report, not the canonical CI latest. Do not claim speedups that are not present in a generated report.

## Release gate

The 1.0 release gate runs:

```bash
pnpm run release:gate:1.0
```

That command executes `release:verify`, `docs:build:ci`, `size:check`, and the benchmark report. The release command uses `.tmp/benchmark` for the generated report so publishing does not depend on tracked benchmark artifacts.

Before publishing, run the full package dry run:

```bash
pnpm run release:dry-run:1.0
```

That repeats the release gate, then dry-runs the parser, core, and Vue package publish path.
